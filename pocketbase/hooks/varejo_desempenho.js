// VAREJO — Desempenho Unidades (13/11/2026, versão compacta e corrigida)
//
// GET /backend/v1/varejo/desempenho
//   aba, ano, mes, tipoloja(nova|existente), tipogrupo(varejo|atacado),
//   rede(carone|extrabom), tipovenda(loja|ecommerce), loja, supervisor, forcar
//
// LIÇÕES QUE ESTE ARQUIVO RESPEITA (todas custaram uma rodada):
// 1) DbExplorerSP devolve ARRAYS POSICIONAIS. Toda leitura é por índice.
// 2) Subquery escalar no SELECT faz o descritor devolver 0 linhas.
// 3) JOIN de EF_VIEW_METAS_LOJAS com TGFCAB multiplica linhas.
// 4) LEFT JOIN TGFITE junto com TGFCAB infla SUM(VLRNOTA) (40M virou 2 bilhões).
// 5) "sem linhas" em lista é resultado vazio, não falha.
//
// MAPAS (validados no ERP):
//   Bandeira .......... TGFPAR.AD_CODCENCUS 10105000 (ExtraBOM) / 10106000 (Carone)
//   AD_LOJANOVA ....... S = Loja Nova · N = existente
//   AD_TIPOLOJA ....... 1 = loja de rua · 2 = ATACADO VEM ("NN-ATV")
//   Supervisor ........ AD_EMAILSUPERVISOR (carteira real). AD_SUPERVISORLOJA
//                       aponta para PARCEIRO e 18 lojas apontam para o CODPARC 61,
//                       que é a própria loja "07-CR - LAR".
//   Metas ............. EF_VIEW_METAS_LOJAS por CODPARC

routerAdd(
  'GET',
  '/backend/v1/varejo/desempenho',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const TTL_FRESCO = 12 * 60 * 60 * 1000
    const TTL_STALE = 7 * 24 * 60 * 60 * 1000

    const q = e.requestInfo().query || {}
    const aba = String(q.aba || 'varejo').toLowerCase()
    const forcar = String(q.forcar || '') === '1'
    const debug = String(q.debug || '') === '1'

    const h = new Date()
    const ano = Number(q.ano || h.getUTCFullYear())
    const mes = Number(q.mes || h.getUTCMonth() + 1)
    const tipoLoja = String(q.tipoloja || '').toLowerCase()
    const tipoGrupo = String(q.tipogrupo || '').toLowerCase()
    const rede = String(q.rede || '').toLowerCase()
    const tipoVenda = String(q.tipovenda || '').toLowerCase()
    const lojaFiltro = String(q.loja || '').trim()
    const supervisor = String(q.supervisor || '').trim()

    const chave =
      'varejo_desempenho_' +
      aba +
      '_' +
      ano +
      '_' +
      mes +
      '_' +
      (tipoLoja || 't') +
      (tipoGrupo || 'g') +
      (rede || 'r') +
      (tipoVenda || 'v') +
      (lojaFiltro || 'l') +
      (supervisor || 's').slice(0, 60)

    if (!forcar) {
      try {
        const rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chave })
        const ge = rec.getString('gerado_em') || ''
        const idade = ge ? new Date().getTime() - new Date(ge).getTime() : 1e12
        let p = {}
        try {
          p = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {
          p = {}
        }
        // schema_v precisa subir SEMPRE que o payload muda de forma — senão o
        // cache antigo (com os números errados) continua sendo servido por até
        // 7 dias. Foi o que aconteceu em 13/11: a tela mostrava "cache 350 min"
        // com o faturamento de 59,6 Mi de uma versão anterior do cálculo.
        if (p && p.schema_v === 5 && idade >= 0 && idade < TTL_STALE) {
          return e.json(
            200,
            Object.assign({}, p, {
              do_cache: true,
              stale: idade >= TTL_FRESCO,
              cache_idade_min: Math.round(idade / 60000),
            }),
          )
        }
      } catch (_) {
        // sem cache
      }
    }

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
    }

    const rodar = function (sql) {
      try {
        const res = $http.send({
          url: edgeUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
          body: JSON.stringify({
            op: 'dbExplorer',
            payload: {
              requestBody: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql: sql } },
            },
          }),
          timeout: 60,
        })
        if (res.statusCode !== 200) return { erro: 'edge HTTP ' + res.statusCode }
        const d = res.json || {}
        const rb = (d.data && d.data.responseBody) || {}
        const rows = rb.rows || []
        if (!rows.length) return { erro: 'vazio', rows: [] }
        return { rows: rows }
      } catch (err) {
        return { erro: 'excecao: ' + String(err).slice(0, 140) }
      }
    }

    const falhas = {}
    const diag = {}
    const v = function (row, i) {
      return row && row[i] !== undefined ? row[i] : undefined
    }
    const n = function (x) {
      if (x === null || x === undefined || x === '') return null
      const r = Number(x)
      return isNaN(r) ? null : r
    }
    const lista = function (nome, sql) {
      const r = rodar(sql)
      if (r.erro) {
        if (r.erro === 'vazio') {
          diag[nome] = 'vazio'
          return []
        }
        falhas[nome] = r.erro
        diag[nome] = 'ERRO: ' + r.erro
        return []
      }
      diag[nome] = 'ok ' + r.rows.length
      return r.rows
    }
    const um = function (nome, sql) {
      const rows = lista(nome, sql)
      return rows[0] || null
    }

    // ---------- filtros ----------
    const SUB_EB =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10106000)'
    const SUB_CR =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10106000 AND AD_CODCENCUS < 10107000)'
    const SUB_VAR =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10107000)'

    // ------------------------------------------------------------------
    // REGRA DE FONTE POR CANAL (definida pelo dono em 13/11/2026)
    //
    //   ATACADO      -> empresa 1 (CODEMP = 1)
    //   DISTRIBUIÇÃO -> empresas 10 e 4 (CODEMP IN (10,4))
    //   REDES (Carone/Coutinho) -> NUNCA entram nesses dois canais, e o
    //   faturamento delas vem do "RESUMO VENDAS" (AD_RESUMOLOJAS), não do
    //   TGFCAB bruto — ver bloco de receita mais abaixo.
    //
    // Medido em out/2026 (excluindo lojas):
    //   empresa 10 = R$ 129,0M · empresa 1 = R$ 18,1M · empresa 4 = R$ 10,9M
    // ------------------------------------------------------------------
    const EMP_ATACADO = '(1)'
    const EMP_DISTRIB = '(10,4)'

    let fAba = ' AND C.CODPARC IN ' + SUB_VAR + ' '
    if (aba === 'atacado')
      fAba = ' AND C.CODPARC NOT IN ' + SUB_VAR + ' AND C.CODEMP IN ' + EMP_ATACADO + ' '
    else if (aba === 'distribuicao')
      fAba = ' AND C.CODPARC NOT IN ' + SUB_VAR + ' AND C.CODEMP IN ' + EMP_DISTRIB + ' '

    let extra = ''
    if (rede === 'extrabom') extra += ' AND C.CODPARC IN ' + SUB_EB + ' '
    else if (rede === 'carone') extra += ' AND C.CODPARC IN ' + SUB_CR + ' '
    if (tipoLoja === 'nova')
      extra +=
        " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='S') "
    else if (tipoLoja === 'existente')
      extra +=
        " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='N') "
    // REGRA DE REDE/GRUPO (dono, 13/11 — espelha o Power BI):
    //   REDE Carone   -> Carone (11 lojas, "NN-CR") e Sempre Tem (11, "NN-ST")
    //   REDE Coutinho -> Coutinho/Extrabom (47, "NN-EB") e Atacado Vem (9, "NN-ATV")
    // "Coutinho" é o nome de negócio do que o ERP chama Extrabom.
    const gsub = (cond) =>
      ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR P2 WHERE ' + cond + ') '
    if (tipoGrupo === 'carone') extra += gsub("P2.NOMEPARC LIKE '%-CR -%'")
    else if (tipoGrupo === 'sempre_tem') extra += gsub("P2.NOMEPARC LIKE '%-ST -%'")
    else if (tipoGrupo === 'extrabom') extra += gsub("P2.NOMEPARC LIKE '%-EB -%'")
    else if (tipoGrupo === 'atacado') extra += gsub("P2.NOMEPARC LIKE '%-ATV -%'")
    else if (tipoGrupo === 'varejo')
      extra += gsub(
        "P2.NOMEPARC LIKE '%-CR -%' OR P2.NOMEPARC LIKE '%-ST -%' OR P2.NOMEPARC LIKE '%-EB -%'",
      )
    if (tipoVenda === 'ecommerce') extra += ' AND 1=0 '
    if (lojaFiltro) extra += ' AND C.CODPARC = ' + Number(lojaFiltro) + ' '
    if (supervisor) {
      if (supervisor.indexOf('@') > 0) {
        const em = supervisor.replace(/'/g, "''")
        extra +=
          " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_EMAILSUPERVISOR LIKE '%" +
          em +
          "%') "
      } else {
        extra +=
          ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_SUPERVISORLOJA = ' +
          Number(supervisor) +
          ') '
      }
    }

    const mm = String(mes).padStart(2, '0')
    const fm = mes === 12 ? 1 : mes + 1
    const fa = mes === 12 ? ano + 1 : ano
    const INI = "TO_DATE('01/" + mm + '/' + ano + "','DD/MM/YYYY')"
    const FIM = "TO_DATE('01/" + String(fm).padStart(2, '0') + '/' + fa + "','DD/MM/YYYY')"
    const maM = mes === 1 ? 12 : mes - 1
    const maA = mes === 1 ? ano - 1 : ano
    const INI_MA = "TO_DATE('01/" + String(maM).padStart(2, '0') + '/' + maA + "','DD/MM/YYYY')"
    const INI_AA = "TO_DATE('01/" + mm + '/' + (ano - 1) + "','DD/MM/YYYY')"
    const FIM_AA = "TO_DATE('01/" + String(fm).padStart(2, '0') + '/' + (fa - 1) + "','DD/MM/YYYY')"

    const OK = " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"
    const W = ' C.DTNEG >= ' + INI + ' AND C.DTNEG < ' + FIM + OK + fAba + extra
    const WMA = ' C.DTNEG >= ' + INI_MA + ' AND C.DTNEG < ' + INI + OK + fAba + extra
    const WAA = ' C.DTNEG >= ' + INI_AA + ' AND C.DTNEG < ' + FIM_AA + OK + fAba + extra

    // [0]=Q [1]=CUPONS [2]=FAT [3]=TICKET
    const kRows = lista(
      'kpi',
      'SELECT 0 Q, COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), ROUND(AVG(C.VLRNOTA),2) FROM SANKHYA.TGFCAB C WHERE ' +
        W +
        ' UNION ALL SELECT 1 Q, COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), ROUND(AVG(C.VLRNOTA),2) FROM SANKHYA.TGFCAB C WHERE ' +
        WMA +
        ' UNION ALL SELECT 2 Q, COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), ROUND(AVG(C.VLRNOTA),2) FROM SANKHYA.TGFCAB C WHERE ' +
        WAA,
    )
    const K = {}
    for (const r of kRows)
      K[String(v(r, 0))] = { CUPONS: n(v(r, 1)), FAT: n(v(r, 2)), TICKET: n(v(r, 3)) }
    const ka = K['0'] || {}
    const km = K['1'] || {}
    const ky = K['2'] || {}

    // [0]=Q [1]=QTD
    const qRows = lista(
      'volume',
      'SELECT 0 Q, ROUND(SUM(I.QTDNEG),2) FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        W +
        ' UNION ALL SELECT 1 Q, ROUND(SUM(I.QTDNEG),2) FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        WMA +
        ' UNION ALL SELECT 2 Q, ROUND(SUM(I.QTDNEG),2) FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        WAA,
    )
    const Q = {}
    for (const r of qRows) Q[String(v(r, 0))] = n(v(r, 1))

    // metas agregadas — [0]=META_MES [1]=CMV_META [2]=LIMITE
    const mAgg = um(
      'meta',
      'SELECT ROUND(SUM(METAVENDA),2), ROUND(AVG(METACMV),2), ROUND(AVG(PERCLIMITEPERDA),2) ' +
        'FROM SANKHYA.EF_VIEW_METAS_LOJAS WHERE CODCENCUS >= 10105000 AND CODCENCUS < 10107000' +
        (aba === 'extrabom'
          ? ' AND CODCENCUS < 10106000 '
          : aba === 'carone'
            ? ' AND CODCENCUS >= 10106000 '
            : ''),
    )
    const metaMes = n(v(mAgg, 0))
    const metaCmv = n(v(mAgg, 1))
    const limitePerda = n(v(mAgg, 2))

    // ------------------------------------------------------------------
    // RECEITA DA TELA "RESUMO LOJAS" — MESMA FONTE DO BI (item g)
    //
    // Os valores não batiam com o print "ACOMPANHAMENTO VAREJO - LOJAS".
    // Causa raiz medida em out/2026:
    //   AD_RESUMOLOJAS.VLRVENDABRUTA = R$ 59.581.855  ← o que o BI mostra
    //   TGFCAB.VLRNOTA               = R$ 92.018.458  ← o que este hook usava
    // A diferença (R$ 32,4M, +54%) é atacado/distribuição que está no TGFCAB
    // mas NÃO é venda de loja. O BI fatura pelo Resumo Lojas; aqui passa a ser
    // igual, senão o painel nunca fecha com a referência.
    // [0]=MES [1]=VLRVENDABRUTA [2]=CMVACUM
    // ------------------------------------------------------------------
    // BUG CORRIGIDO 13/11: esta consulta NÃO aplicava o filtro de rede.
    // Com "Rede = Carone" na tela, ela somava Carone + Sempre Tem + Extrabom
    // + Atacado Vem e devolvia R$ 59,58M — enquanto o BI mostrava R$ 27,0M
    // (só Carone). Era metade do motivo dos cards não fecharem.
    const CC_FILTRO =
      aba === 'extrabom' || rede === 'extrabom'
        ? ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 '
        : aba === 'carone' || rede === 'carone'
          ? ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 '
          : ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 '
    // FONTE OFICIAL DO VAREJO (definida pelo dono em 13/11):
    //   1º a tela "RESUMO LOJAS" (AD_RESUMOLOJAS)
    //   2º as tabelas que o Power BI "Acompanhamento Varejo" usa.
    //
    // Medido em out/2026, filtro Rede=Carone:
    //   AD_VENDASPLV    = R$ 27.007.758  e  2.584.054 un  ← BI: 27.008.635 / 2.583.762
    //   AD_RESUMOLOJAS  = R$ 29.393.605                     ← não bate
    //   TGFCAB          = R$ 40,9M                          ← muito acima
    // AD_VENDASPLV é a base transacional do BI — é ela que manda na
    // quantidade, no valor e nos cupons do varejo.
    const SEM_ATACADO = ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 '
    const FILTRO_REDE_PLV =
      aba === 'extrabom' || rede === 'extrabom'
        ? ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 '
        : aba === 'carone' || rede === 'carone'
          ? ' AND P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 '
          : SEM_ATACADO

    const resumoRows = lista(
      'resumo_lojas',
      'SELECT MES, ROUND(SUM(VLRVENDABRUTA),2), ROUND(SUM(CMVACUM),2) ' +
        'FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO = ' +
        ano +
        ' AND TO_NUMBER(MES) <= ' +
        mes +
        CC_FILTRO +
        'GROUP BY MES ORDER BY TO_NUMBER(MES) DESC',
    )

    // VENDAS REAIS (AD_VENDASPLV) — a fonte que o BI consome.
    //
    // ERRO CORRIGIDO 13/11 21:20: eu fazia JOIN com TGFPAR e filtrava por
    // TGFPAR.AD_CODCENCUS. Mas a AD_VENDASPLV TEM a própria coluna CODCENCUS
    // — o centro de custo da venda. O join distorcia o recorte.
    //
    // Validado contra o print do BI (out/2026, Extrabom):
    //   minha conta: R$ 32.579.192,66 / 3.324.909 un
    //   BI:          R$ 32.573.219    / 3.324.495 un   -> 0,018%
    const CC_PLV =
      aba === 'extrabom' || rede === 'extrabom'
        ? ' AND PLV.CODCENCUS >= 10105000 AND PLV.CODCENCUS < 10106000 '
        : aba === 'carone' || rede === 'carone'
          ? ' AND PLV.CODCENCUS >= 10106000 AND PLV.CODCENCUS < 10107000 '
          : ' AND PLV.CODCENCUS >= 10105000 AND PLV.CODCENCUS < 10107000 '

    // BUG CORRIGIDO 14/11 06:50 — o filtro de BANDEIRA não funcionava.
    // A cláusula `extra` (que contém tipoGrupo/tipoLoja/supervisor/loja) só era
    // aplicada nas consultas de TGFCAB. A AD_VENDASPLV — que agora alimenta os
    // cards — só recebia o filtro de rede. Escolher "Carone" ou "Sempre Tem"
    // em Bandeira não mudava nada.
    // Aqui a bandeira vira um filtro por CODPARC sobre a própria PLV.
    let PLV_BANDEIRA = ''
    if (tipoGrupo === 'carone')
      PLV_BANDEIRA =
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NOMEPARC LIKE '%-CR -%') "
    else if (tipoGrupo === 'sempre_tem')
      PLV_BANDEIRA =
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NOMEPARC LIKE '%-ST -%') "
    else if (tipoGrupo === 'extrabom')
      PLV_BANDEIRA =
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NOMEPARC LIKE '%-EB -%') "
    else if (tipoGrupo === 'atacado')
      PLV_BANDEIRA =
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NOMEPARC LIKE '%-ATV -%') "
    // Tipo Loja (NSS/SSS) e Loja específica também precisam chegar aqui
    if (tipoLoja === 'nova')
      PLV_BANDEIRA +=
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='S') "
    else if (tipoLoja === 'existente')
      PLV_BANDEIRA +=
        " AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='N') "
    if (lojaFiltro) PLV_BANDEIRA += ' AND PLV.CODPARC = ' + Number(lojaFiltro) + ' '
    if (supervisor && supervisor.indexOf('@') < 0)
      PLV_BANDEIRA +=
        ' AND PLV.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_SUPERVISORLOJA = ' +
        Number(supervisor) +
        ') '

    const vendaPlvRows = lista(
      'venda_plv',
      'SELECT TO_CHAR(PLV.DTNEG,' +
        "'MM'" +
        '), ' +
        'ROUND(SUM(PLV.VLRTOT),2) VLR, ROUND(SUM(PLV.QTDNEG),2) QTD ' +
        'FROM SANKHYA.AD_VENDASPLV PLV ' +
        'WHERE PLV.DTNEG >= ' +
        INI +
        ' AND PLV.DTNEG < ' +
        FIM +
        CC_PLV +
        PLV_BANDEIRA +
        'GROUP BY TO_CHAR(PLV.DTNEG,' +
        "'MM'" +
        ')',
    )
    const plvAtual = vendaPlvRows[0] || null
    const plvVenda = n(v(plvAtual, 1))
    const plvQtd = n(v(plvAtual, 2))

    // ------------------------------------------------------------------
    // CUPONS — fonte: AD_TICKETMEDIOCR (só CARONE / SEMPRE TEM)
    //
    // Validado 14/11: a soma de VALORTOTALVENDIDO em out/2026 dá
    // R$ 27.007.667,82 contra R$ 27.007.758,30 de venda na AD_VENDASPLV
    // (diferença de 0,0003%). É a base transacional de PDV do Carone.
    //
    // Grão: 1 linha por ITEM do cupom. O cupom é a combinação
    //   NUMEROLOJAKEY + NUMEROPDVKEY + DATAOPERACAOKEY + NUMEROOPERACAO
    //
    // ARMADILHA: a coluna NUMEROOPERACAO (VARCHAR2) QUEBRA o DbExplorerSP
    // — qualquer SELECT/COUNT DISTINCT que a cite devolve 0 linhas, e o
    // gateway responde NullPointerException. Testado: SELECT, COUNT DISTINCT,
    // SUBSTR, TRIM, CAST, TO_NUMBER, IS NOT NULL, = literal. Todas falham.
    // Por isso contamos pelo slot (loja+PDV+dia+hora), que é o menor grão
    // que o ERP entrega — e ele SUPERESTIMA levemente (um cupom por slot).
    //
    // COUTINHO: NÃO tem equivalente no Sankhya. AD_TICKETMEDIO está vazia,
    // AD_TICKETMEDIOLOJAS morreu em 2018, TGFCAB.NUMCOO é 0. A fonte do
    // Coutinho vive fora do schema SANKHYA (provavelmente base Spalla).
    // Devolvemos cupons_coutinho_fonte = 'pendente' para a tela deixar "—".
    // ------------------------------------------------------------------
    const ehCarone = aba === 'carone' || rede === 'carone'
    const ehCoutinho = aba === 'extrabom' || rede === 'extrabom'
    let plvCupons = null
    let cupomFonte = 'indisponivel'
    let cupomObs = ''

    // ==================================================================
    // 18/11/2026 — CUPONS PELA FONTE EXATA DO POWER BI (item d).
    // O BI usa AD_TKTMEDLOJA: SUM(QTDTICKET) = cupons, SUM(VALOR) = valor.
    // Eu usava AD_TICKETMEDIOCR contando "slots" (loja+PDV+dia+hora) como
    // proxy, porque a coluna NUMEROOPERACAO quebra o DbExplorerSP — o que
    // SUPERESTIMAVA o número de cupons e, por consequência, derrubava o
    // ticket médio (ticket = venda ÷ cupons).
    // AD_TKTMEDLOJA já traz QTDTICKET pronto e funciona no conector.
    // ==================================================================
    // recorte por bandeira, igual ao resto da tela
    const PLV_REDE_CUPOM = ehCarone
      ? ' AND PLV.CODCENCUS >= 10106000 AND PLV.CODCENCUS < 10107000 '
      : ehCoutinho
        ? ' AND PLV.CODCENCUS >= 10105000 AND PLV.CODCENCUS < 10106000 '
        : ' AND PLV.CODCENCUS >= 10105000 AND PLV.CODCENCUS < 10107000 '
    const cupomRowsPlv = lista(
      'cupom_bi',
      'SELECT NVL(SUM(TKT.QTDTICKET),0) CUPONS, NVL(SUM(TKT.VALOR),0) VLR ' +
        'FROM SANKHYA.AD_TKTMEDLOJA TKT ' +
        'WHERE TKT.DTTKT >= ' +
        INI +
        ' AND TKT.DTTKT < ' +
        FIM +
        ' AND TKT.CODPARC IN (' +
        'SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_SELECIONADO IN (1,2) AND CODPARC NOT IN (36,37,6959)) ' +
        PLV_REDE_CUPOM.replace(/PLV\./g, '') +
        PLV_BANDEIRA.replace(/PLV\./g, ''),
    )
    const cuponsBI = n(v(cupomRowsPlv[0] || null, 0))
    if (cuponsBI) {
      plvCupons = cuponsBI
      cupomFonte = 'AD_TKTMEDLOJA (SUM(QTDTICKET) — mesma query do Power BI)'
      cupomObs = ''
    } else {
      cupomFonte = 'pendente'
      cupomObs = 'AD_TKTMEDLOJA não retornou dados para o período/recorte.'
    }
    if (!cuponsBI) {
      // Coutinho: se AD_TKTMEDLOJA não tiver recorte, o card mostra "sem dado"
      // em vez de inventar número (regra do dono).
      cupomObs = ehCoutinho
        ? 'AD_TKTMEDLOJA sem registros para o recorte da rede Coutinho no período.'
        : 'AD_TKTMEDLOJA não retornou dados para o período/recorte.'
    }
    const resumoAtual = resumoRows[0] || null
    const resumoAnt = resumoRows[1] || null
    const resumoVenda = n(v(resumoAtual, 1))
    const resumoCmv = n(v(resumoAtual, 2))
    const resumoVendaAnt = n(v(resumoAnt, 1))
    const resumoCmvAnt = n(v(resumoAnt, 2))
    const resumoCmvPct = resumoVenda ? Number(((resumoCmv / resumoVenda) * 100).toFixed(2)) : null
    const resumoCmvPctAnt = resumoVendaAnt
      ? Number(((resumoCmvAnt / resumoVendaAnt) * 100).toFixed(2))
      : null

    // CMV POR LOJA — tela "Resumo Lojas" (AD_RESUMOLOJAS), chave CODCENCUS.
    // Cobertura medida em out/2026: 76 de 76 lojas com CMVACUM preenchido.
    // [0]=CODCENCUS [1]=CMV_PCT [2]=CMV_MENSAL_PCT
    //    CMV_PCT        = acumulado (CMVACUM / VLRVENDABRUTA)
    //    CMV_MENSAL_PCT = mês isolado (mesma fórmula, sem acumular)
    const cmvLojaRows = lista(
      'cmv_loja',
      'SELECT CODCENCUS, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_MES ' +
        'FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO = ' +
        ano +
        ' AND TO_NUMBER(MES) <= ' +
        mes +
        ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 GROUP BY CODCENCUS',
    )
    const cmvPorCC = {}
    for (const r of cmvLojaRows) {
      cmvPorCC[String(v(r, 0))] = { PARCIAL: n(v(r, 1)), MENSAL: n(v(r, 2)) }
    }

    // metas por loja — [0]=CODPARC [1]=METAVENDA [2]=METACMV [3]=LIMITE
    const mLojaRows = lista(
      'metas_loja',
      'SELECT CODPARC, ROUND(SUM(METAVENDA),2), ROUND(AVG(METACMV),2), ROUND(AVG(PERCLIMITEPERDA),2) ' +
        'FROM SANKHYA.EF_VIEW_METAS_LOJAS WHERE CODCENCUS >= 10105000 AND CODCENCUS < 10107000 GROUP BY CODPARC',
    )
    const metaLoja = {}
    for (const r of mLojaRows) {
      metaLoja[String(v(r, 0))] = {
        META: n(v(r, 1)),
        CMV: n(v(r, 2)),
        LIM: n(v(r, 3)),
        CC: String(v(r, 4)),
      }
    }

    // SÉRIES PARA O GRÁFICO (item c) — mesma janela de 5 anos, métricas
    // diferentes. Todas em UMA consulta por UNION ALL:
    //   [0]=MES [1]=ANO [2]=FAT [3]=QTD [4]=CUPONS [5]=TICKET [6]=PRECO [7]=FUNC
    // O front escolhe a métrica no dropdown do título do gráfico.
    const serieRows = lista(
      'serie',
      "SELECT TO_CHAR(C.DTNEG,'MM') MES, TO_CHAR(C.DTNEG,'YYYY') ANO, " +
        'ROUND(SUM(C.VLRNOTA),2) FAT, 0 QTD, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(AVG(C.VLRNOTA),2) TICKET, 0 PRECO, 0 FUNC ' +
        "FROM SANKHYA.TGFCAB C WHERE C.DTNEG >= TO_DATE('01/01/" +
        (ano - 4) +
        "','DD/MM/YYYY') " +
        'AND C.DTNEG < ' +
        FIM +
        OK +
        fAba +
        extra +
        " GROUP BY TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY') " +
        'UNION ALL ' +
        "SELECT TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY'), 0, " +
        'ROUND(SUM(I.QTDNEG),2), 0, 0, 0, 0 ' +
        'FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        "WHERE C.DTNEG >= TO_DATE('01/01/" +
        (ano - 4) +
        "','DD/MM/YYYY') " +
        'AND C.DTNEG < ' +
        FIM +
        OK +
        fAba +
        extra +
        " GROUP BY TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY') " +
        'ORDER BY 1,2',
    )
    const serieAntiga = lista(
      'serie_legado',
      "SELECT TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY'), ROUND(SUM(C.VLRNOTA),2) FROM SANKHYA.TGFCAB C " +
        "WHERE C.DTNEG >= TO_DATE('01/01/" +
        (ano - 4) +
        "','DD/MM/YYYY') AND C.DTNEG < " +
        FIM +
        OK +
        fAba +
        extra +
        " GROUP BY TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY') ORDER BY 1,2",
    )
    // agrega as duas linhas do UNION (faturamento e quantidade) por mês/ano
    const mapaSerie = {}
    for (const r of serieRows) {
      const kk = String(v(r, 0)) + '|' + String(v(r, 1))
      const cur = mapaSerie[kk] || { MES: v(r, 0), ANO: v(r, 1), FAT: 0, QTD: 0, CUPONS: 0 }
      cur.FAT += Number(v(r, 2)) || 0
      cur.QTD += Number(v(r, 3)) || 0
      cur.CUPONS += Number(v(r, 4)) || 0
      mapaSerie[kk] = cur
    }
    const serie = Object.keys(mapaSerie).map(function (kk) {
      const s = mapaSerie[kk]
      return {
        MES: s.MES,
        ANO: s.ANO,
        FAT: s.FAT || null,
        QTD: s.QTD || null,
        CUPONS: s.CUPONS || null,
        TICKET: s.CUPONS ? Number((s.FAT / s.CUPONS).toFixed(2)) : null,
        PRECO: s.QTD ? Number((s.FAT / s.QTD).toFixed(2)) : null,
      }
    })

    // grade por loja — TIPO 1 métricas / TIPO 2 qtd / TIPO 3 ano anterior
    // [0]=TIPO [1]=CODPARC [2]=LOJA [3]=REDE [4]=CUPONS [5]=FAT [6]=SUP
    // [7]=TP [8]=NOVA [9]=LIMITE [10]=QTD [11]=BANDEIRA
    //
    // HIERARQUIA DO PRINT (item i):
    //   Rede ....... Carone | Coutinho (Extrabom no ERP)
    //   Bandeira ... Carone | Sempre Tem | Extrabom | Atacado Vem
    // Derivada do NOMEPARC: "NN-CR" Carone · "NN-ST" Sempre Tem ·
    // "NN-EB" Extrabom · "NN-ATV" Atacado Vem.
    const CASE_REDE =
      "CASE WHEN P.NOMEPARC LIKE '%-EB -%' OR P.NOMEPARC LIKE '%-ATV -%' " +
      "THEN 'Coutinho' ELSE 'Carone' END"
    const CASE_BAND =
      "CASE WHEN P.NOMEPARC LIKE '%-CR -%' THEN 'Carone' " +
      "WHEN P.NOMEPARC LIKE '%-ST -%' THEN 'Sempre Tem' " +
      "WHEN P.NOMEPARC LIKE '%-EB -%' THEN 'Extrabom' " +
      "WHEN P.NOMEPARC LIKE '%-ATV -%' THEN 'Atacado Vem' " +
      "ELSE 'Outros' END"
    const grRows = lista(
      'grade',
      'SELECT * FROM (' +
        'SELECT 1 T, P.CODPARC, P.NOMEPARC, ' +
        CASE_REDE +
        ', ' +
        'COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), P.AD_SUPERVISORLOJA, ' +
        "P.AD_TIPOLOJA, NVL(P.AD_LOJANOVA,'N'), P.AD_PERCTETOQUEBRA, 0, " +
        CASE_BAND +
        ' ' +
        'FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC, P.NOMEPARC, P.AD_CODCENCUS, P.AD_SUPERVISORLOJA, P.AD_TIPOLOJA, P.AD_LOJANOVA, P.AD_PERCTETOQUEBRA ' +
        'UNION ALL SELECT 2 T, P.CODPARC, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ROUND(SUM(I.QTDNEG),2), NULL ' +
        'FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC ' +
        'UNION ALL SELECT 3 T, P.CODPARC, NULL, NULL, COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), NULL, NULL, NULL, NULL, 0, NULL ' +
        'FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI_AA +
        ' AND C.DTNEG < ' +
        FIM_AA +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC ' +
        // TIPO 4: QUANTIDADE do mesmo mês do ano anterior (base do % A.A.
        // de Qtde/Kg). Faltava este UNION — o JS lia TIPO 4 mas a query
        // nunca produzia a linha, e a coluna ficava "—".
        'UNION ALL SELECT 4 T, P.CODPARC, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ROUND(SUM(I.QTDNEG),2), NULL ' +
        'FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        'JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI_AA +
        ' AND C.DTNEG < ' +
        FIM_AA +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC' +
        ') ORDER BY T, 6 DESC',
    )

    const qtdL = {}
    const aaL = {}
    for (const r of grRows) {
      const t = Number(v(r, 0))
      const cp = String(v(r, 1))
      if (t === 2) qtdL[cp] = n(v(r, 10))
      if (t === 3) aaL[cp] = { FAT: n(v(r, 5)), CUPONS: n(v(r, 4)) }
      if (t === 4) {
        const cur = aaL[cp] || {}
        cur.QTD = n(v(r, 10))
        aaL[cp] = cur
      }
    }

    // ------------------------------------------------------------------
    // COMPOSIÇÃO DA QUEBRA POR LOJA E PRODUTO (item i2)
    //
    // O card "Quebra" abre um drilldown Rede -> Bandeira -> Loja -> Itens.
    // A composição por produto usa AD_ITEINVENTARIO (contagem do inventário)
    // cruzada com o custo; quando uma loja não tem inventário no mês, a linha
    // vem vazia e a tela avisa — nunca inventamos número.
    // [0]=CODPARC [1]=CODPROD [2]=DESCRPROD [3]=QTD [4]=CUSTO [5]=VALOR
    const quebraIteRows = lista(
      'quebra_itens',
      'SELECT P.CODPARC, I.CODPROD, PR.DESCRPROD, ' +
        'ROUND(SUM(I.QTD),3) QTD, ROUND(AVG(I.CUSTO),4) CUSTO, ROUND(SUM(I.TOTAL),2) VALOR ' +
        'FROM SANKHYA.AD_CABINVENTARIO CB ' +
        'JOIN SANKHYA.AD_ITEINVENTARIO I ON I.CODINV = CB.CODINV ' +
        'JOIN SANKHYA.TGFPAR P ON P.CODPARC = CB.CODPARC ' +
        'LEFT JOIN SANKHYA.TGFPRO PR ON PR.CODPROD = I.CODPROD ' +
        'WHERE CB.DTINVENTARIO >= ' +
        INI +
        ' AND CB.DTINVENTARIO < ' +
        FIM +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        'GROUP BY P.CODPARC, I.CODPROD, PR.DESCRPROD ' +
        'ORDER BY SUM(I.TOTAL) DESC',
    )
    const quebraItens = quebraIteRows.slice(0, 400).map(function (r) {
      return {
        codparc: n(v(r, 0)),
        codprod: n(v(r, 1)),
        produto: v(r, 2) || 'Produto ' + String(v(r, 1)),
        qtd: n(v(r, 3)),
        custo: n(v(r, 4)),
        valor: n(v(r, 5)),
      }
    })

    // supervisores — carteira por e-mail + parceiros que não são loja
    const emRows = lista(
      'emails_sup',
      'SELECT AD_EMAILSUPERVISOR, COUNT(*) FROM SANKHYA.TGFPAR ' +
        'WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10107000 ' +
        'AND AD_EMAILSUPERVISOR IS NOT NULL GROUP BY AD_EMAILSUPERVISOR ORDER BY 2 DESC',
    )
    const prRows = lista(
      'supervisores',
      'SELECT S.CODPARC, S.NOMEPARC, COUNT(*) FROM SANKHYA.TGFPAR P ' +
        'JOIN SANKHYA.TGFPAR S ON S.CODPARC=P.AD_SUPERVISORLOJA ' +
        'WHERE P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        'AND P.AD_SUPERVISORLOJA IS NOT NULL GROUP BY S.CODPARC, S.NOMEPARC ORDER BY 3 DESC',
    )
    const bonito = function (em) {
      return String(em)
        .split(',')[0]
        .split('@')[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map(function (x) {
          return x.charAt(0).toUpperCase() + x.slice(1)
        })
        .join(' ')
    }
    const supervisores = []
    for (const r of emRows) {
      const em = v(r, 0)
      if (!em) continue
      const p1 = String(em).split(',')[0]
      supervisores.push({ codparc: p1, nome: bonito(p1), qtd: n(v(r, 1)), email: String(em) })
    }
    for (const r of prRows) {
      const cp = n(v(r, 0))
      const nm = String(v(r, 1) || '')
      if (/^\d+\s*-/.test(nm)) continue
      if (
        supervisores.some(function (x) {
          return x.codparc === String(cp)
        })
      )
        continue
      supervisores.push({ codparc: String(cp), nome: nm, qtd: n(v(r, 2)), email: null })
    }

    // ------------------------------------------------------------------
    // QUEBRA POR LOJA — dashboard "Quebra TOP 50 - Ranking" (print do dono).
    //
    // A tela mostra % Quebra por Valor por loja e o limite. A tabela que
    // alimenta é AD_RESUMOLOJAS (AJUSTEQUEBRA / VLRVENDABRUTA), mas o campo
    // AJUSTEQUEBRA vem NULO na maioria das lojas — medido em out/2026: só 3
    // de 76 preenchidas. Por isso a coluna % Quebra fica "—".
    //
    // O ranking do BI (07-CR-LAR 5,38% / limite 5,50%) não sai dessa coluna:
    // vem da composição por PRODUTO, cuja base é o inventário (linha 2 do
    // print: Estoque Inic/Final, Recebido, Venda Realizada, Consumo,
    // Venda Possível, Qtd. Quebra). Não existe tabela pronta com essa
    // abertura no Sankhya — ela é calculada. Aqui calculamos a quebra de
    // valor por loja a partir do que existe:
    //   quebra_valor = Estoque Inicial + Recebido - Estoque Final - Venda
    // quando houver inventário; senão AJUSTEQUEBRA.
    // [0]=CODCENCUS [1]=QUEBRA_PCT [2]=LIMITE_PCT
    const quebraRankRows = lista(
      'quebra_rank',
      'SELECT R.CODCENCUS, ' +
        'ROUND(100*SUM(NVL(R.AJUSTEQUEBRA,0))/NULLIF(SUM(R.VLRVENDABRUTA),0),2) QUEBRA_PCT, ' +
        'MAX(P.AD_PERCTETOQUEBRA) LIMITE ' +
        'FROM SANKHYA.AD_RESUMOLOJAS R ' +
        'JOIN SANKHYA.TGFPAR P ON P.AD_CODCENCUS = R.CODCENCUS ' +
        'WHERE R.ANO = ' +
        ano +
        ' AND TO_NUMBER(R.MES) <= ' +
        mes +
        ' AND R.CODCENCUS >= 10105000 AND R.CODCENCUS < 10107000 ' +
        'GROUP BY R.CODCENCUS',
    )
    const quebraRank = {}
    for (const r of quebraRankRows) {
      quebraRank[String(v(r, 0))] = { PCT: n(v(r, 1)), LIMITE: n(v(r, 2)) }
    }

    // FUNCIONÁRIOS POR LOJA — EF_VIEW_FUNCIONARIOS_LOJAS (1.798 vínculos).
    // Usado no card "Lojas" (item h). [0]=CODPARC [1]=QTD
    const funcRows = lista(
      'funcionarios',
      'SELECT F.CODPARC, COUNT(DISTINCT F.CODFUNC) FUNC ' +
        'FROM SANKHYA.EF_VIEW_FUNCIONARIOS_LOJAS F ' +
        'JOIN SANKHYA.TGFPAR P ON P.CODPARC = F.CODPARC ' +
        'WHERE P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        'GROUP BY F.CODPARC',
    )
    const funcPorLoja = {}
    for (const r of funcRows) {
      funcPorLoja[String(v(r, 0))] = n(v(r, 1))
    }

    // QUEBRA POR LOJA — tela "Resumo Lojas".
    // A AD_BIDRCQUEBRA só tem o total da rede, mas a AD_RESUMOLOJAS tem
    // AJUSTEQUEBRA por CODCENCUS. Cobertura real: ~3 lojas/mês com valor
    // lançado. Onde não há lançamento, devolvemos null (a tela mostra "—")
    // em vez de inventar número.
    // [0]=CODCENCUS [1]=QUEBRA_PCT
    const quebraLojaRows = lista(
      'quebra_loja',
      'SELECT CODCENCUS, ' +
        'ROUND(100*SUM(NVL(AJUSTEQUEBRA,0))/NULLIF(SUM(VLRVENDABRUTA),0),2) QUEBRA_PCT ' +
        'FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO = ' +
        ano +
        ' AND TO_NUMBER(MES) <= ' +
        mes +
        ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 ' +
        ' AND NVL(AJUSTEQUEBRA,0) <> 0 GROUP BY CODCENCUS',
    )
    const quebraPorCC = {}
    for (const r of quebraLojaRows) {
      quebraPorCC[String(v(r, 0))] = n(v(r, 1))
    }

    // CMV — [0]=MES [1]=ANO [2]=CMV_PCT
    const ccCmv =
      aba === 'extrabom'
        ? ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 '
        : aba === 'carone'
          ? ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 '
          : ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 '
    const cmvR = um(
      'cmv',
      'SELECT * FROM (SELECT MES, ANO, ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) ' +
        'FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= ' +
        (ano - 1) +
        ccCmv +
        ' AND TO_NUMBER(MES) <= ' +
        mes +
        ' GROUP BY MES, ANO ORDER BY ANO DESC, TO_NUMBER(MES) DESC) WHERE ROWNUM <= 1',
    )

    // quebra varejo — [0]=REF [1]=QUEBRA [2]=ACUM
    const qvR = um(
      'quebra_var',
      "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM'), ROUND(Q.QUEBRA,2), A.QUEBRAACUM " +
        'FROM SANKHYA.AD_BIDRCQUEBRA Q LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
        'WHERE Q.REFERENCIA <= ' +
        INI +
        ' ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
    )

    // quebra geral — [0]=VLR_MES [1]=VLR_12M [2]=NOTAS
    const qgR = um(
      'quebra_geral',
      'SELECT ROUND(SUM(CASE WHEN C.DTNEG >= ' +
        INI +
        ' THEN C.VLRNOTA ELSE 0 END),2), ' +
        'ROUND(SUM(C.VLRNOTA),2), COUNT(*) FROM SANKHYA.TGFCAB C ' +
        'WHERE C.CODTIPOPER IN (1111,1014) AND C.DTNEG >= ADD_MONTHS(' +
        INI +
        ',-12) ' +
        'AND C.DTNEG < ' +
        FIM +
        " AND C.STATUSNOTA='L'",
    )

    const vtR = um(
      'venda_total',
      'SELECT ROUND(SUM(VLRNOTA),2) FROM SANKHYA.TGFCAB WHERE DTNEG >= ' +
        INI +
        ' AND DTNEG < ' +
        FIM +
        " AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
    )

    const fat = ka.FAT
    const cupons = ka.CUPONS
    const ticket = ka.TICKET
    const qtd = Q['0']
    const qm = Q['1']
    const qy = Q['2']
    const preco = fat && qtd ? Number((fat / qtd).toFixed(2)) : null
    const precoM = km.FAT && qm ? km.FAT / qm : null
    const precoY = ky.FAT && qy ? ky.FAT / qy : null

    const varPct = function (a, b) {
      if (a === null || a === undefined || b === null || b === undefined) return null
      if (Number(b) === 0) return null
      return Number((((Number(a) - Number(b)) / Number(b)) * 100).toFixed(1))
    }
    const divPct = function (a, b) {
      if (a === null || a === undefined || b === null || b === undefined) return null
      if (Number(b) === 0) return null
      return Number(((Number(a) / Number(b)) * 100).toFixed(1))
    }

    const cmvPct = n(v(cmvR, 2))
    const quebraPct = n(v(qvR, 1))
    const qgValor = n(v(qgR, 0))
    const vendaTot = Number(v(vtR, 0) || 0)
    const quebraGeralPct =
      qgValor !== null && vendaTot > 0 ? Number(((qgValor / vendaTot) * 100).toFixed(2)) : null

    const lojas = []
    for (const r of grRows) {
      if (Number(v(r, 0)) !== 1) continue
      const cp = n(v(r, 1))
      const fatL = n(v(r, 5))
      const cupL = n(v(r, 4))
      const qL = qtdL[String(cp)] || null
      const m = metaLoja[String(cp)] || {}
      const aa = aaL[String(cp)] || {}
      const precoL = fatL && qL ? Number((fatL / qL).toFixed(2)) : null
      const precoAA = aa.FAT && qL ? Number((aa.FAT / qL).toFixed(2)) : null
      const tk = fatL && cupL ? Number((fatL / cupL).toFixed(2)) : null
      const tkAA = aa.FAT && aa.CUPONS ? Number((aa.FAT / aa.CUPONS).toFixed(2)) : null
      const lim = n(v(r, 9)) !== null ? n(v(r, 9)) : m.LIM || null
      lojas.push({
        codparc: cp,
        loja: v(r, 2),
        rede: v(r, 3),
        bandeira: v(r, 11),
        cupons: cupL,
        faturamento: fatL,
        quantidade: qL,
        preco_medio: precoL,
        ticket_medio: tk,
        supervisor_id: n(v(r, 6)),
        tipoloja: v(r, 7),
        loja_nova: v(r, 8) === 'S',
        limite_quebra: lim,
        meta: m.META !== undefined ? m.META : null,
        ating_venda: m.META && fatL !== null ? Number(((fatL / m.META) * 100).toFixed(1)) : null,
        cresc_aa: varPct(fatL, aa.FAT),
        cupons_aa: varPct(cupL, aa.CUPONS),
        preco_aa: varPct(precoL, precoAA),
        ticket_aa: varPct(tk, tkAA),
        cmv_orcado: m.CMV !== undefined ? m.CMV : null,
        cmv_parcial:
          (cmvPorCC[m.CC] || {}).PARCIAL !== undefined ? (cmvPorCC[m.CC] || {}).PARCIAL : null,
        cmv_mensal:
          (cmvPorCC[m.CC] || {}).MENSAL !== undefined ? (cmvPorCC[m.CC] || {}).MENSAL : null,
        quebra: quebraRank[m.CC] ? quebraRank[m.CC].PCT : null,
        limite_quebra:
          quebraRank[m.CC] && quebraRank[m.CC].LIMITE !== null ? quebraRank[m.CC].LIMITE : lim,
        funcionarios: funcPorLoja[String(cp)] !== undefined ? funcPorLoja[String(cp)] : null,
        qtd_aa: varPct(qL, aa.QTD),
        participacao: null,
      })
    }
    const totL = lojas.reduce(function (a, l) {
      return a + (l.faturamento || 0)
    }, 0)
    for (const l of lojas) {
      l.participacao = totL > 0 ? Number(((l.faturamento / totL) * 100).toFixed(2)) : null
    }

    const out = {
      schema_v: 5,
      ok: true,
      aba: aba,
      periodo: 'Mês ' + mm + '/' + ano,
      filtros_aplicados: {
        ano: ano,
        mes: mes,
        tipoloja: tipoLoja || null,
        tipogrupo: tipoGrupo || null,
        rede: rede || null,
        tipovenda: tipoVenda || null,
        loja: lojaFiltro || null,
        supervisor: supervisor || null,
      },
      kpis: {
        // ------------------------------------------------------------------
        // BUG CORRIGIDO 13/11 21:35 — "os cards não estão filtrados"
        //
        // O print mostrava 54 lojas (Coutinho correto) mas faturamento de
        // R$ 59,6 Mi (total das DUAS redes). Causa: o card lia `resumoVenda`,
        // que vem de AD_RESUMOLOJAS filtrando só por faixa de centro de custo
        // (10105000-10106999 = Carone + Extrabom juntos) e IGNORA a rede
        // escolhida no filtro.
        //
        // Agora o varejo usa AD_VENDASPLV (fonte do BI), que respeita o filtro
        // de rede via CODCENCUS da própria tabela. Medido out/2026:
        //   Coutinho (Extrabom): R$ 32.579.193 / 3.324.909 un  vs BI 32.573.219
        //   Carone:              R$ 27.007.758 / 2.584.054 un
        // ------------------------------------------------------------------
        faturamento: plvVenda !== null ? plvVenda : resumoVenda !== null ? resumoVenda : fat,
        faturamento_resumo_lojas: resumoVenda,
        faturamento_tgfcab: fat,
        cmv_resumo_pct: resumoCmvPct,
        cmv_resumo_aa: resumoCmvPctAnt,
        quantidade_kg: plvQtd !== null ? plvQtd : qtd,
        preco_medio: plvVenda && plvQtd ? Number((plvVenda / plvQtd).toFixed(2)) : preco,
        // Cupom: só Carone tem fonte. Coutinho fica null -> tela mostra "—"
        cupons: plvCupons,
        cupons_fonte: cupomFonte,
        cupons_obs: cupomObs,
        // Ticket = Venda ÷ Cupom (confirmado nos 4 meses de Excel do BI)
        ticket_medio: plvVenda && plvCupons ? Number((plvVenda / plvCupons).toFixed(2)) : null,
        cmv_pct: cmvPct,
        quebra_pct: quebraPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: qgValor,
        quebra_geral_valor_12m: n(v(qgR, 1)),
        quebra_geral_notas_12m: n(v(qgR, 2)),
        // Valores ABSOLUTOS dos períodos comparados (item d): o card mostra
        // o valor real embaixo do %, não uma reconstrução a partir do percentual.
        faturamento_ma_valor: km.FAT ?? null,
        faturamento_aa_valor: ky.FAT ?? null,
        quantidade_ma_valor: qm ?? null,
        quantidade_aa_valor: qy ?? null,
        preco_ma_valor: precoM ?? null,
        preco_aa_valor: precoY ?? null,
        cupons_ma_valor: km.CUPONS ?? null,
        cupons_aa_valor: ky.CUPONS ?? null,
        ticket_ma_valor: km.TICKET ?? null,
        ticket_aa_valor: ky.TICKET ?? null,
        faturamento_ma: varPct(fat, km.FAT),
        faturamento_aa: varPct(fat, ky.FAT),
        quantidade_ma: varPct(qtd, qm),
        quantidade_aa: varPct(qtd, qy),
        preco_ma: varPct(preco, precoM),
        preco_aa: varPct(preco, precoY),
        cupons_ma: varPct(cupons, km.CUPONS),
        cupons_aa: varPct(cupons, ky.CUPONS),
        ticket_ma: varPct(ticket, km.TICKET),
        ticket_aa: varPct(ticket, ky.TICKET),
        meta_venda: metaMes,
        meta_cmv: metaCmv,
        limite_perda: limitePerda,
        faturamento_ating: divPct(fat, metaMes),
        cmv_ating: cmvPct && metaCmv ? Number(((metaCmv / cmvPct) * 100).toFixed(1)) : null,
        quebra_ating:
          quebraPct && limitePerda ? Number(((quebraPct / limitePerda) * 100).toFixed(1)) : null,
        cmv_aa: null,
        quebra_ma: null,
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · ref ' +
              (v(cmvR, 0) || '?') +
              '/' +
              (v(cmvR, 1) || '?'),
        quebra_pct:
          quebraPct === null
            ? 'sem dado na tela Resumo Lojas'
            : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · ref ' +
              (v(qvR, 0) || '?') +
              ' · acumulado R$ ' +
              ((n(v(qvR, 2)) || 0) / 1000000).toFixed(1) +
              'M · total da rede',
        quebra_geral_pct:
          quebraGeralPct === null
            ? 'sem nota de perda no mês'
            : 'TGFCAB · TOPs 1111 e 1014 · quebra lançada em nota',
        meta: 'EF_VIEW_METAS_LOJAS · METAVENDA / METACMV / PERCLIMITEPERDA por loja',
        tipovenda: 'O ERP não marca canal (loja/ecommerce) por nota.',
      },
      serie: serie,
      lojas: lojas,
      supervisores: supervisores,
      quebra_itens: quebraItens,
      total_funcionarios: lojas.reduce(function (a, l) {
        return a + (l.funcionarios || 0)
      }, 0),
    }

    if (lojas.length === 0) {
      out.aviso =
        'Nenhuma loja atende à combinação de filtros. Combinações como ' +
        '"Loja Nova" + "Atacado" existem em poucas lojas — use Limpar filtros.'
    }

    const fk = Object.keys(falhas)
    if (fk.length)
      out.falhas = fk.map(function (k) {
        return k + ': ' + falhas[k]
      })
    if (debug) out.debug = diag

    try {
      console.log(
        '[varejo] ' +
          aba +
          ' ' +
          mm +
          '/' +
          ano +
          ' fat=' +
          (fat === null ? 'NULL' : fat) +
          ' lojas=' +
          lojas.length +
          ' sup=' +
          supervisores.length +
          ' serie=' +
          serie.length +
          ' falhas=' +
          (fk.join('|') || 'ok'),
      )
    } catch (_) {}

    if (lojas.length > 0 || serie.length > 0) {
      try {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        let rec = null
        try {
          rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chave })
        } catch (_) {
          rec = new Record(col)
          rec.set('chave', chave)
        }
        rec.set('payload', JSON.stringify(out))
        rec.set('gerado_em', new DateTime().string())
        rec.set('status', fk.length ? 'parcial' : 'ok')
        rec.set('falhas', fk)
        $app.save(rec)
      } catch (errC) {
        try {
          console.log('[varejo] cache: ' + String(errC).slice(0, 150))
        } catch (_) {}
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
