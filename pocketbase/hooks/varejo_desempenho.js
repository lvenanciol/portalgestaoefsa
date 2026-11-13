// TAREFA VAREJO v2 (13/11/2026) — Hook de dados do "Desempenho Unidades".
//
// GET /backend/v1/varejo/desempenho
//   &aba=distribuicao|atacado|carone|extrabom|varejo
//   &ano=2026 &mes=11            (default: mês corrente)
//   &tipoloja=1|2 &tipogrupo=atacarejo|varejo
//   &rede=carone|extrabom &tipovenda=loja|ecommerce
//   &loja=<CODPARC> &supervisor=<CODPARC do supervisor>
//   &forcar=1 &debug=1
//
// ---------------------------------------------------------------------------
// REGRAS APRENDIDAS (não repetir os erros):
//
// 1) O DbExplorerSP devolve ARRAYS POSICIONAIS, não objetos com nome de coluna:
//    SELECT FAT, CUPONS -> [["1234.56","10"]]. TODA leitura é por índice, com o
//    mapa comentado em cada SELECT. (Foi a causa dos cards zerados.)
//
// 2) SUBQUERY ESCALAR no SELECT faz o descritor devolver 0 linhas em silêncio.
//    Por isso as metas vêm de uma consulta separada e são somadas no JS.
//
// 3) JOIN com EF_VIEW_METAS_LOJAS MULTIPLICA linhas (a view tem uma linha por
//    loja/mês e o join por CODPARC casa com todas as notas). Nunca fazer join
//    de meta com TGFCAB; somar metas em consulta própria.
//
// 4) CACHE-FIRST em sankhya_cache, chave por combinação de filtros. O cron das
//    22h aquece as 5 abas padrão. `?forcar=1` ignora.
// ---------------------------------------------------------------------------

routerAdd(
  'GET',
  '/backend/v1/varejo/desempenho',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const CACHE_TTL_MS = 6 * 60 * 60 * 1000
    const q = e.requestInfo().query || {}

    const aba = String(q.aba || 'varejo').toLowerCase()
    const debug = String(q.debug || '') === '1'
    const forcar = String(q.forcar || '') === '1'

    // ---- filtros ----
    const hoje = new Date()
    const anoAtual = hoje.getUTCFullYear()
    const mesAtual = hoje.getUTCMonth() + 1
    const ano = Number(q.ano || anoAtual)
    const mes = Number(q.mes || mesAtual)
    const tipoLoja = String(q.tipoloja || '') // '1' | '2' | ''
    const tipoGrupo = String(q.tipogrupo || '').toLowerCase() // atacarejo | varejo
    const rede = String(q.rede || '').toLowerCase() // carone | extrabom
    const tipoVenda = String(q.tipovenda || '').toLowerCase() // loja | ecommerce
    const lojaFiltro = String(q.loja || '').trim()
    const supervisor = String(q.supervisor || '').trim()

    // Chave de cache considera a combinação de filtros (sem forcar/debug)
    const chaveCache =
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
      (supervisor || 's')

    if (!forcar) {
      try {
        const rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chaveCache })
        const geradoEm = rec.getString('gerado_em') || ''
        const idade = geradoEm ? new Date().getTime() - new Date(geradoEm).getTime() : 1e12
        let payload = {}
        try {
          payload = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {
          payload = {}
        }
        if (payload && payload.schema_v === 3 && idade >= 0 && idade < CACHE_TTL_MS) {
          return e.json(
            200,
            Object.assign({}, payload, {
              do_cache: true,
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
        if (!rows.length) {
          return { erro: (d.data && d.data.statusMessage) || 'sem linhas', rows: [] }
        }
        return { rows: rows }
      } catch (err) {
        return { erro: 'excecao: ' + String(err).slice(0, 160) }
      }
    }

    const falhas = {}
    const diag = {}
    const val = function (row, idx, nome) {
      if (!row) return undefined
      if (row[idx] !== undefined) return row[idx]
      if (nome && row[nome] !== undefined) return row[nome]
      return undefined
    }
    const num = function (v) {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return isNaN(n) ? null : n
    }
    const bloco = function (nome, sql) {
      const r = rodar(sql)
      if (r.erro) {
        falhas[nome] = r.erro
        diag[nome] = 'ERRO: ' + r.erro
        return null
      }
      diag[nome] = 'ok ' + r.rows.length
      return r.rows[0]
    }
    const lista = function (nome, sql) {
      const r = rodar(sql)
      if (r.erro) {
        falhas[nome] = r.erro
        diag[nome] = 'ERRO: ' + r.erro
        return []
      }
      diag[nome] = 'ok ' + r.rows.length
      return r.rows
    }

    // ---------- predicados de bandeira ----------
    const SUB_EB =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10106000)'
    const SUB_CR =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10106000 AND AD_CODCENCUS < 10107000)'
    const SUB_VAREJO =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10107000)'

    const FILTRO_ABA = {
      extrabom: ' AND C.CODPARC IN ' + SUB_EB + ' ',
      carone: ' AND C.CODPARC IN ' + SUB_CR + ' ',
      varejo: ' AND C.CODPARC IN ' + SUB_VAREJO + ' ',
      atacado:
        ' AND C.CODPARC NOT IN ' +
        SUB_VAREJO +
        ' ' +
        ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 ',
      distribuicao:
        ' AND C.CODPARC NOT IN ' +
        SUB_VAREJO +
        ' ' +
        ' AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 ',
    }

    // ---------- filtros do usuário (aplicados a TUDO) ----------
    let extra = ''
    // rede: restringe à bandeira quando a aba é consolidada
    if (rede === 'extrabom' && (aba === 'varejo' || aba === 'distribuicao')) {
      extra += ' AND C.CODPARC IN ' + SUB_EB + ' '
    } else if (rede === 'carone' && aba === 'varejo') {
      extra += ' AND C.CODPARC IN ' + SUB_CR + ' '
    }
    if (tipoLoja === '1' || tipoLoja === '2') {
      extra +=
        ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA = ' +
        tipoLoja +
        ') '
    }
    // tipo grupo: AD_TIPOLOJA 1 = varejo/atacarejo conforme cadastro.
    // A convenção observada: 1 = loja de rua (Varejo), 2 = Atacarejo.
    if (tipoGrupo === 'varejo') {
      extra += ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA = 1) '
    } else if (tipoGrupo === 'atacarejo') {
      extra += ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA = 2) '
    }
    // tipo venda: Ecommerce = Natureza/TOP de venda online. Sem marcação no
    // cadastro, usamos o TOP 1023/1000 como proxy quando existir; caso
    // contrário, "loja" = tudo (padrão).
    if (tipoVenda === 'ecommerce') {
      extra +=
        ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA = 2' +
        " AND NVL(AD_LOJANOVA, 'N') = 'S') "
    }
    if (lojaFiltro) {
      extra += ' AND C.CODPARC = ' + Number(lojaFiltro).toString() + ' '
    }
    if (supervisor) {
      extra +=
        ' AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_SUPERVISORLOJA = ' +
        Number(supervisor).toString() +
        ') '
    }

    // janela do mês escolhido
    const INI = "TO_DATE('01/" + String(mes).padStart(2, '0') + '/' + ano + "','DD/MM/YYYY')"
    const FIM_MES = mes === 12 ? 1 : mes + 1
    const FIM_ANO = mes === 12 ? ano + 1 : ano
    const FIM =
      "TO_DATE('01/" + String(FIM_MES).padStart(2, '0') + '/' + FIM_ANO + "','DD/MM/YYYY')"

    const filtroAba = FILTRO_ABA[aba] || FILTRO_ABA.varejo
    const MED =
      ' C.DTNEG >= ' +
      INI +
      ' AND C.DTNEG < ' +
      FIM +
      " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"
    const WHERE = MED + filtroAba + extra

    // janela de comparação: mês anterior e mesmo mês do ano anterior
    const MES_ANT = mes === 1 ? 12 : mes - 1
    const ANO_ANT = mes === 1 ? ano - 1 : ano
    const INI_MA =
      "TO_DATE('01/" + String(MES_ANT).padStart(2, '0') + '/' + ANO_ANT + "','DD/MM/YYYY')"
    const FIM_MA_MES = mes === 1 ? 1 : mes
    const FIM_MA_ANO = mes === 1 ? ano : ano
    const FIM_MA =
      "TO_DATE('01/" + String(FIM_MA_MES).padStart(2, '0') + '/' + FIM_MA_ANO + "','DD/MM/YYYY')"
    const WHERE_MA =
      ' C.DTNEG >= ' +
      INI_MA +
      ' AND C.DTNEG < ' +
      FIM_MA +
      " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'" +
      filtroAba +
      extra

    const INI_AA =
      "TO_DATE('01/" + String(mes).padStart(2, '0') + '/' + (ano - 1) + "','DD/MM/YYYY')"
    const FIM_AA =
      "TO_DATE('01/" + String(FIM_MES).padStart(2, '0') + '/' + (FIM_ANO - 1) + "','DD/MM/YYYY')"
    const WHERE_AA =
      ' C.DTNEG >= ' +
      INI_AA +
      ' AND C.DTNEG < ' +
      FIM_AA +
      " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'" +
      filtroAba +
      extra

    // ---------- KPIs do período (4 janelas de uma vez via UNION ALL) ----------
    // [0]=Q (0=atual 1=mês anterior 2=ano anterior) [1]=CUPONS [2]=NOTAS [3]=FAT [4]=TICKET
    const kRows = lista(
      'kpi',
      'SELECT 0 Q, COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
        ' FROM SANKHYA.TGFCAB C WHERE ' +
        WHERE +
        ' UNION ALL ' +
        'SELECT 1 Q, COUNT(DISTINCT C.NUMNOTA), COUNT(*), ROUND(SUM(C.VLRNOTA),2), ROUND(AVG(C.VLRNOTA),2) ' +
        ' FROM SANKHYA.TGFCAB C WHERE ' +
        WHERE_MA +
        ' UNION ALL ' +
        'SELECT 2 Q, COUNT(DISTINCT C.NUMNOTA), COUNT(*), ROUND(SUM(C.VLRNOTA),2), ROUND(AVG(C.VLRNOTA),2) ' +
        ' FROM SANKHYA.TGFCAB C WHERE ' +
        WHERE_AA,
    )
    const K = {}
    for (const row of kRows) {
      K[String(val(row, 0, 'Q'))] = {
        CUPONS: num(val(row, 1, 'CUPONS')),
        NOTAS: num(val(row, 2, 'NOTAS')),
        FAT: num(val(row, 3, 'FAT')),
        TICKET: num(val(row, 4, 'TICKET')),
      }
    }
    const kAtual = K['0'] || {}
    const kMA = K['1'] || {}
    const kAA = K['2'] || {}

    // ---------- VOLUME (4 janelas) [0]=Q [1]=QTD ----------
    const qRows = lista(
      'volume',
      'SELECT 0 Q, ROUND(SUM(I.QTDNEG),2) QTD FROM SANKHYA.TGFITE I ' +
        ' JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        WHERE +
        ' UNION ALL ' +
        'SELECT 1 Q, ROUND(SUM(I.QTDNEG),2) FROM SANKHYA.TGFITE I ' +
        ' JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        WHERE_MA +
        ' UNION ALL ' +
        'SELECT 2 Q, ROUND(SUM(I.QTDNEG),2) FROM SANKHYA.TGFITE I ' +
        ' JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA WHERE ' +
        WHERE_AA,
    )
    const Q = {}
    for (const row of qRows) Q[String(val(row, 0, 'Q'))] = num(val(row, 1, 'QTD'))
    const qtdAtual = Q['0']
    const qtdMA = Q['1']
    const qtdAA = Q['2']

    // ---------- METAS (consulta separada: NUNCA join com TGFCAB) ----------
    // [0]=META_MES [1]=META_ACUM [2]=CMV_META_MEDIA [3]=LIMITE_PERDA_MEDIO
    const metaRow = bloco(
      'meta',
      'SELECT ROUND(SUM(METAVENDA),2) META_MES, ROUND(SUM(METAVENDACUM),2) META_ACUM, ' +
        'ROUND(AVG(METACMV),2) CMV_META, ROUND(AVG(PERCLIMITEPERDA),2) LIMITE_PERDA ' +
        ' FROM SANKHYA.EF_VIEW_METAS_LOJAS WHERE 1=1 ' +
        (aba === 'extrabom'
          ? ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 '
          : aba === 'carone'
            ? ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 '
            : aba === 'varejo' || aba === 'distribuicao'
              ? ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 '
              : ''),
    )
    const metaMes = num(val(metaRow, 0, 'META_MES'))
    const metaCmv = num(val(metaRow, 2, 'CMV_META'))
    const limitePerda = num(val(metaRow, 3, 'LIMITE_PERDA'))

    // ---------- SÉRIE 3 ANOS (2024, 2025, 2026) por mês ----------
    // [0]=MES [1]=ANO [2]=FAT
    const serieRows = lista(
      'serie_3anos',
      "SELECT TO_CHAR(C.DTNEG,'MM') MES, TO_CHAR(C.DTNEG,'YYYY') ANO, " +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C ' +
        " WHERE C.DTNEG >= TO_DATE('01/01/" +
        (ano - 2) +
        "','DD/MM/YYYY') " +
        ' AND C.DTNEG < ' +
        FIM +
        " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'" +
        filtroAba +
        extra +
        " GROUP BY TO_CHAR(C.DTNEG,'MM'), TO_CHAR(C.DTNEG,'YYYY') ORDER BY 1,2",
    )
    const serie = serieRows.map(function (r) {
      return { MES: val(r, 0, 'MES'), ANO: val(r, 1, 'ANO'), FAT: num(val(r, 2, 'FAT')) }
    })

    // ---------- GRADE POR LOJA (todas as colunas do print) ----------
    // ATENÇÃO: NÃO fazer LEFT JOIN TGFITE junto com TGFCAB. O join por NUNOTA
    // multiplica as linhas do cabeçalho (uma nota vira N itens) e o
    // SUM(C.VLRNOTA) sai inflado — medido: R$ 40,1M virou R$ 2,03 BILHÕES.
    // Solução: duas agregações separadas por CODPARC, unidas por UNION ALL
    // com um marcador TIPO, e a junção é feita no JS.
    //   TIPO 1 -> [0]=CODPARC [1]=LOJA [2]=REDE [3]=CUPONS [4]=FAT [5]=SUP [6]=TP [7]=NOVA [8]=LIMITE
    //   TIPO 2 -> [0]=CODPARC [9]=QTD
    const lojaRows = lista(
      'lojas_grade',
      'SELECT * FROM (' +
        'SELECT 1 TIPO, P.CODPARC, P.NOMEPARC LOJA, ' +
        " CASE WHEN P.AD_CODCENCUS < 10106000 THEN 'ExtraBOM' ELSE 'Carone' END REDE, " +
        ' COUNT(DISTINCT C.NUMNOTA) CUPONS, ROUND(SUM(C.VLRNOTA),2) FAT, ' +
        " P.AD_SUPERVISORLOJA SUP, P.AD_TIPOLOJA TP, NVL(P.AD_LOJANOVA,'N') NOVA, " +
        ' P.AD_PERCTETOQUEBRA LIMITE, 0 QTD ' +
        ' FROM SANKHYA.TGFCAB C ' +
        ' JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'" +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        ' GROUP BY P.CODPARC, P.NOMEPARC, P.AD_CODCENCUS, P.AD_SUPERVISORLOJA, ' +
        ' P.AD_TIPOLOJA, P.AD_LOJANOVA, P.AD_PERCTETOQUEBRA ' +
        ' UNION ALL ' +
        'SELECT 2 TIPO, P.CODPARC, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ' +
        ' ROUND(SUM(I.QTDNEG),2) QTD ' +
        ' FROM SANKHYA.TGFITE I ' +
        ' JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        ' JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'" +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        ' GROUP BY P.CODPARC' +
        ') ORDER BY TIPO, FAT DESC',
    )
    // junta quantidade por loja (TIPO 2) no registro da loja (TIPO 1)
    const qtdPorLoja = {}
    for (const r of lojaRows) {
      if (Number(val(r, 0, 'TIPO')) === 2) {
        qtdPorLoja[String(val(r, 1, 'CODPARC'))] = num(val(r, 10, 'QTD'))
      }
    }

    // nomes de supervisor (uma consulta pequena)
    const supRows = lista(
      'supervisores',
      'SELECT DISTINCT P.AD_SUPERVISORLOJA CODPARC, S.NOMEPARC NOME ' +
        ' FROM SANKHYA.TGFPAR P ' +
        ' JOIN SANKHYA.TGFPAR S ON S.CODPARC=P.AD_SUPERVISORLOJA ' +
        ' WHERE P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' AND P.AD_SUPERVISORLOJA IS NOT NULL ORDER BY 2',
    )
    const supervisores = supRows.map(function (r) {
      return { codparc: val(r, 0, 'CODPARC'), nome: val(r, 1, 'NOME') }
    })

    // ---------- CMV e Quebra (por bandeira) ----------
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 '
        : aba === 'carone'
          ? ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 '
          : ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10107000 '
    // [0]=MES [1]=ANO [2]=CMV_PCT
    const cmvRow = bloco(
      'cmv',
      'SELECT * FROM (SELECT MES, ANO, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
        ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= ' +
        (ano - 1) +
        CC_CMV +
        ' AND TO_NUMBER(MES) <= ' +
        mes +
        ' GROUP BY MES, ANO ORDER BY ANO DESC, TO_NUMBER(MES) DESC) WHERE ROWNUM <= 1',
    )

    // [0]=REF [1]=QUEBRA [2]=QUEBRAACUM
    const qvRow = bloco(
      'quebra_varejo',
      "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
        'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
        ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
        ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
        ' WHERE Q.REFERENCIA <= ' +
        INI +
        ' ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
    )

    // [0]=VLR_MES [1]=VLR_12M [2]=NOTAS_12M
    const qgRow = bloco(
      'quebra_geral',
      'SELECT ROUND(SUM(CASE WHEN C.DTNEG >= ' +
        INI +
        ' THEN C.VLRNOTA ELSE 0 END),2) VLR_MES, ' +
        'ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
        ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
        ' AND C.DTNEG >= ADD_MONTHS(' +
        INI +
        ',-12) AND C.DTNEG < ' +
        FIM +
        " AND C.STATUSNOTA='L'",
    )

    // venda total do grupo (denominador da quebra geral)
    const vtRow = bloco(
      'venda_total',
      'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
        'WHERE DTNEG >= ' +
        INI +
        ' AND DTNEG < ' +
        FIM +
        " AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
    )

    // ---------- monta KPIs com variações ----------
    const fat = kAtual.FAT
    const cupons = kAtual.CUPONS
    const ticket = kAtual.TICKET
    const qtd = qtdAtual
    const preco = fat && qtd ? Number((fat / qtd).toFixed(2)) : null

    const varPct = function (atual, base) {
      if (atual === null || atual === undefined || base === null || base === undefined) return null
      if (Number(base) === 0) return null
      return Number((((Number(atual) - Number(base)) / Number(base)) * 100).toFixed(1))
    }
    const atingPct = function (atual, meta) {
      if (meta === null || meta === undefined || Number(meta) === 0) return null
      if (atual === null || atual === undefined) return null
      return Number(((Number(atual) / Number(meta)) * 100).toFixed(1))
    }

    const qtdMA = Q['1']
    const qtdAA = Q['2']
    const precoMA = kMA.FAT && qtdMA ? kMA.FAT / qtdMA : null
    const precoAA = kAA.FAT && qtdAA ? kAA.FAT / qtdAA : null

    const cmvPct = num(val(cmvRow, 2, 'CMV_PCT'))
    const cmvMes = val(cmvRow, 0, 'MES')
    const cmvAno = val(cmvRow, 1, 'ANO')
    const quebraPct = num(val(qvRow, 1, 'QUEBRA'))
    const quebraRef = val(qvRow, 0, 'REF')
    const quebraAcum = num(val(qvRow, 2, 'QUEBRAACUM'))
    const quebraGeralValor = num(val(qgRow, 0, 'VLR_MES'))
    const quebraGeral12m = num(val(qgRow, 1, 'VLR_12M'))
    const quebraGeralNotas = num(val(qgRow, 2, 'NOTAS_12M'))
    const vendaTotal = Number(val(vtRow, 0, 'VENDA_MES') || 0)
    const quebraGeralPct =
      quebraGeralValor !== null && vendaTotal > 0
        ? Number(((quebraGeralValor / vendaTotal) * 100).toFixed(2))
        : null

    // ---------- grade: enriquece cada loja ----------
    const lojas = []
    for (const r of lojaRows) {
      if (Number(val(r, 0, 'TIPO')) !== 1) continue
      const fatL = num(val(r, 5, 'FAT'))
      const cupL = num(val(r, 4, 'CUPONS'))
      const codp = num(val(r, 1, 'CODPARC'))
      const qtdL = qtdPorLoja[String(codp)] || null
      lojas.push({
        codparc: codp,
        loja: val(r, 2, 'LOJA'),
        rede: val(r, 3, 'REDE'),
        cupons: cupL,
        faturamento: fatL,
        quantidade: qtdL,
        preco_medio: fatL && qtdL ? Number((fatL / qtdL).toFixed(2)) : null,
        ticket_medio: fatL && cupL ? Number((fatL / cupL).toFixed(2)) : null,
        supervisor_id: num(val(r, 6, 'SUP')),
        tipoloja: val(r, 7, 'TP'),
        loja_nova: val(r, 8, 'NOVA') === 'S',
        limite_quebra: num(val(r, 9, 'LIMITE')),
      })
    }
    const fatTotalLojas = lojas.reduce(function (a, l) {
      return a + (l.faturamento || 0)
    }, 0)
    for (const l of lojas) {
      l.participacao =
        fatTotalLojas > 0 ? Number(((l.faturamento / fatTotalLojas) * 100).toFixed(2)) : null
    }

    const out = {
      schema_v: 3,
      ok: true,
      aba: aba,
      periodo: 'Mês ' + String(mes).padStart(2, '0') + '/' + ano,
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
        faturamento: fat,
        quantidade_kg: qtd,
        preco_medio: preco,
        cupons: cupons,
        ticket_medio: ticket,
        cmv_pct: cmvPct,
        quebra_pct: quebraPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: quebraGeralValor,
        quebra_geral_valor_12m: quebraGeral12m,
        quebra_geral_notas_12m: quebraGeralNotas,
        // variações
        faturamento_ma: varPct(kAtual.FAT, kMA.FAT),
        faturamento_aa: varPct(kAtual.FAT, kAA.FAT),
        quantidade_ma: varPct(qtdAtual, qtdMA),
        quantidade_aa: varPct(qtdAtual, qtdAA),
        preco_ma: varPct(preco, precoMA),
        preco_aa: varPct(preco, precoAA),
        cupons_ma: varPct(cupons, kMA.CUPONS),
        cupons_aa: varPct(cupons, kAA.CUPONS),
        ticket_ma: varPct(ticket, kMA.TICKET),
        ticket_aa: varPct(ticket, kAA.TICKET),
        // metas
        meta_venda: metaMes,
        meta_cmv: metaCmv,
        limite_perda: limitePerda,
        faturamento_ating: atingPct(fat, metaMes),
        cmv_ating:
          cmvPct !== null && metaCmv !== null && metaCmv !== 0
            ? Number(((metaCmv / cmvPct) * 100).toFixed(1))
            : null,
        quebra_ating:
          quebraPct !== null && limitePerda !== null && limitePerda !== 0
            ? Number(((quebraPct / limitePerda) * 100).toFixed(1))
            : null,
        cmv_aa: null,
        quebra_ma: null,
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
              (cmvMes || '?') +
              '/' +
              (cmvAno || '?'),
        quebra_pct:
          quebraPct === null
            ? 'sem dado na tela Resumo Lojas'
            : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
              (quebraRef || '?') +
              ' · acumulado R$ ' +
              ((quebraAcum || 0) / 1000000).toFixed(1) +
              'M · total da rede',
        meta: 'EF_VIEW_METAS_LOJAS · METAVENDA / METACMV / PERCLIMITEPERDA do mês',
      },
      serie: serie,
      lojas: lojas,
      supervisores: supervisores,
    }

    const chavesFalha = Object.keys(falhas)
    if (chavesFalha.length) out.falhas = chavesFalha.map((c) => c + ': ' + falhas[c])
    if (debug) out.debug = diag

    try {
      console.log(
        '[varejo] aba=' +
          aba +
          ' ' +
          mes +
          '/' +
          ano +
          ' fat=' +
          (fat === null ? 'NULL' : fat) +
          ' cupons=' +
          (cupons === null ? 'NULL' : cupons) +
          ' lojas=' +
          lojas.length +
          ' fatMA=' +
          (out.kpis.faturamento_ma === null ? '-' : out.kpis.faturamento_ma) +
          ' fatAA=' +
          (out.kpis.faturamento_aa === null ? '-' : out.kpis.faturamento_aa) +
          ' falhas=' +
          (chavesFalha.join('|') || 'nenhuma'),
      )
    } catch (_) {}

    try {
      const col = $app.findCollectionByNameOrId('sankhya_cache')
      let rec = null
      try {
        rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chaveCache })
      } catch (_) {
        rec = new Record(col)
        rec.set('chave', chaveCache)
      }
      rec.set('payload', JSON.stringify(out))
      rec.set('gerado_em', new DateTime().string())
      rec.set('status', chavesFalha.length ? 'parcial' : 'ok')
      rec.set('falhas', chavesFalha)
      $app.save(rec)
    } catch (errCache) {
      try {
        console.log('[varejo] cache: ' + String(errCache).slice(0, 200))
      } catch (_) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
