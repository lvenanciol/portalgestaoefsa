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
        if (p && p.schema_v === 4 && idade >= 0 && idade < TTL_STALE) {
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

    let fAba = ' AND C.CODPARC IN ' + SUB_VAR + ' '
    if (aba === 'extrabom') fAba = ' AND C.CODPARC IN ' + SUB_EB + ' '
    else if (aba === 'carone') fAba = ' AND C.CODPARC IN ' + SUB_CR + ' '
    else if (aba === 'atacado')
      fAba =
        ' AND C.CODPARC NOT IN ' +
        SUB_VAR +
        ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 '
    else if (aba === 'distribuicao')
      fAba =
        ' AND C.CODPARC NOT IN ' +
        SUB_VAR +
        ' AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 '

    let extra = ''
    if (rede === 'extrabom') extra += ' AND C.CODPARC IN ' + SUB_EB + ' '
    else if (rede === 'carone') extra += ' AND C.CODPARC IN ' + SUB_CR + ' '
    if (tipoLoja === 'nova')
      extra +=
        " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='S') "
    else if (tipoLoja === 'existente')
      extra +=
        " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE NVL(AD_LOJANOVA,'N')='N') "
    if (tipoGrupo === 'varejo')
      extra += " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA='1') "
    else if (tipoGrupo === 'atacado')
      extra += " AND C.CODPARC IN (SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_TIPOLOJA='2') "
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

    // série 5 anos — [0]=MES [1]=ANO [2]=FAT
    const serieRows = lista(
      'serie',
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
    const serie = serieRows.map(function (r) {
      return { MES: v(r, 0), ANO: v(r, 1), FAT: n(v(r, 2)) }
    })

    // grade por loja — TIPO 1 métricas / TIPO 2 qtd / TIPO 3 ano anterior
    // [0]=TIPO [1]=CODPARC [2]=LOJA [3]=REDE [4]=CUPONS [5]=FAT [6]=SUP [7]=TP [8]=NOVA [9]=LIMITE [10]=QTD
    const grRows = lista(
      'grade',
      'SELECT * FROM (' +
        'SELECT 1 T, P.CODPARC, P.NOMEPARC, ' +
        "CASE WHEN P.AD_CODCENCUS < 10106000 THEN 'ExtraBOM' ELSE 'Carone' END, " +
        'COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), P.AD_SUPERVISORLOJA, ' +
        "P.AD_TIPOLOJA, NVL(P.AD_LOJANOVA,'N'), P.AD_PERCTETOQUEBRA, 0 " +
        'FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC, P.NOMEPARC, P.AD_CODCENCUS, P.AD_SUPERVISORLOJA, P.AD_TIPOLOJA, P.AD_LOJANOVA, P.AD_PERCTETOQUEBRA ' +
        'UNION ALL SELECT 2 T, P.CODPARC, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ROUND(SUM(I.QTDNEG),2) ' +
        'FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        INI +
        ' AND C.DTNEG < ' +
        FIM +
        OK +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        extra +
        'GROUP BY P.CODPARC ' +
        'UNION ALL SELECT 3 T, P.CODPARC, NULL, NULL, COUNT(DISTINCT C.NUMNOTA), ROUND(SUM(C.VLRNOTA),2), NULL, NULL, NULL, NULL, 0 ' +
        'FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
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
        quebra: null,
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
      schema_v: 4,
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
        faturamento: fat,
        quantidade_kg: qtd,
        preco_medio: preco,
        cupons: cupons,
        ticket_medio: ticket,
        cmv_pct: cmvPct,
        quebra_pct: quebraPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: qgValor,
        quebra_geral_valor_12m: n(v(qgR, 1)),
        quebra_geral_notas_12m: n(v(qgR, 2)),
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
