// TAREFA VAREJO (13/11/2026) — Desempenho Unidades: KPIs por bandeira.
// GET /backend/v1/varejo/desempenho?aba=...&forcar=1&debug=1
//
// ============ CORREÇÃO CRÍTICA 13/11 10:50 ============
// O DbExplorerSP NÃO devolve linhas como objetos com nome de coluna.
// Ele devolve ARRAYS POSICIONAIS na ordem do SELECT:
//   SELECT FAT, CUPONS  ->  [ ["1234.56", "10"], ... ]
// Todo o código anterior lia `row.FATURAMENTO` (undefined) e por isso os
// cards apareciam vazios/zerados SEM erro — não havia falha de consulta,
// apenas leitura pelo nome errado. Confirmado em sankhya_sync_cron.js, que
// funciona há meses justamente porque lê r[0], r[1], r[2].
// Daqui em diante: SEMPRE ler por índice, com o mapa de colunas comentado
// em cada SELECT.
//
// Outras decisões que se mantêm:
//  - CACHE-FIRST em sankhya_cache (6 h). O cron das 22h aquece as 5 abas.
//  - Filtro de bandeira por SUBQUERY (não JOIN): não multiplica linhas.
//  - Isolamento por bloco: uma falha não zera as outras.
//  - ?forcar=1 ignora o cache; ?debug=1 devolve o estado de cada bloco.
//
// MAPA DAS BANDEIRAS — centro de custo (TSICUS), ligação TGFPAR.AD_CODCENCUS:
//   10105000 LOJAS EXTRABOM (55) · 10106000 LOJAS CARONE (22)

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

    // ---------- 1) CACHE ----------
    const chaveCache = 'varejo_desempenho_' + aba
    if (!forcar) {
      try {
        const rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chaveCache })
        const geradoEm = rec.getString('gerado_em') || ''
        const idade = geradoEm ? new Date().getTime() - new Date(geradoEm).getTime() : 1e12
        // Só serve cache gravado pela v2 (que lê por índice): os anteriores
        // tinham os valores nulos e não devem ser reaproveitados.
        let payload = {}
        try {
          payload = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {
          payload = {}
        }
        const versionado = payload && payload.schema_v === 2
        if (versionado && idade >= 0 && idade < CACHE_TTL_MS) {
          return e.json(
            200,
            Object.assign({}, payload, {
              do_cache: true,
              cache_idade_min: Math.round(idade / 60000),
            }),
          )
        }
      } catch (_) {
        // sem cache — calcula
      }
    }

    // ---------- 2) CÁLCULO ----------
    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
    }

    const SUB_EB =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10106000)'
    const SUB_CR =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10106000 AND AD_CODCENCUS < 10107000)'
    const SUB_VAREJO =
      '(SELECT CODPARC FROM SANKHYA.TGFPAR WHERE AD_CODCENCUS >= 10105000 AND AD_CODCENCUS < 10107000)'

    const FILTRO = {
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
    const filtro = FILTRO[aba] || FILTRO.varejo

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

    // Leitura por ÍNDICE (o proxy devolve array posicional). O fallback por
    // nome existe só para o caso de o proxy mudar para objeto no futuro.
    const val = function (row, idx, nome) {
      if (!row) return undefined
      if (row[idx] !== undefined) return row[idx]
      if (nome && row[nome] !== undefined) return row[nome]
      return undefined
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

    const MED = "C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"

    // [0]=CUPONS [1]=NOTAS [2]=FATURAMENTO [3]=TICKET
    const kRow = bloco(
      'kpi',
      'SELECT COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FATURAMENTO, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
        ' FROM SANKHYA.TGFCAB C WHERE ' +
        MED +
        filtro,
    )

    // [0]=QTD [1]=VENDA_ITENS
    const qRow = bloco(
      'qtd',
      'SELECT ROUND(SUM(I.QTDNEG),2) QTD, ROUND(SUM(I.VLRTOT),2) VENDA_ITENS ' +
        ' FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        ' WHERE ' +
        MED +
        filtro,
    )

    // [0]=MES [1]=FAT [2]=CUPONS
    const serieRows = lista(
      'serie',
      "SELECT TO_CHAR(C.DTNEG,'YYYY-MM') MES, ROUND(SUM(C.VLRNOTA),2) FAT, " +
        'COUNT(DISTINCT C.NUMNOTA) CUPONS ' +
        ' FROM SANKHYA.TGFCAB C ' +
        "WHERE C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) " +
        " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L' " +
        filtro +
        " GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM') ORDER BY 1",
    )
    const serie = serieRows.map(function (r) {
      return { MES: val(r, 0, 'MES'), FAT: val(r, 1, 'FAT'), CUPONS: val(r, 2, 'CUPONS') }
    })

    // UNION: [0]=TIPO [1]=NOME [2]=CUPONS [3]=FAT
    let lojas = []
    let cidades = []
    let participacao = []
    const dimRows = lista(
      'dimensoes',
      'SELECT * FROM (' +
        'SELECT 1 TIPO, P.NOMEPARC NOME, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE ' +
        MED +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' GROUP BY P.NOMEPARC ' +
        ' UNION ALL ' +
        'SELECT 2 TIPO, CI.NOMECID NOME, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
        ' WHERE ' +
        MED +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' GROUP BY CI.NOMECID ' +
        ' UNION ALL ' +
        'SELECT 3 TIPO, CASE WHEN P.AD_CODCENCUS < 10106000 THEN ' +
        "'EXTRABOM' ELSE 'CARONE' END NOME, " +
        'COUNT(DISTINCT C.NUMNOTA) CUPONS, ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE ' +
        MED +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' GROUP BY CASE WHEN P.AD_CODCENCUS < 10106000 THEN ' +
        "'EXTRABOM' ELSE 'CARONE' END" +
        ') ORDER BY TIPO, FAT DESC',
    )
    for (const row of dimRows) {
      const tipo = Number(val(row, 0, 'TIPO'))
      const nome = val(row, 1, 'NOME')
      const cupons = val(row, 2, 'CUPONS')
      const fat = val(row, 3, 'FAT')
      if (tipo === 1 && lojas.length < 30) lojas.push({ LOJA: nome, CUPONS: cupons, FAT: fat })
      else if (tipo === 2 && cidades.length < 15) cidades.push({ CIDADE: nome, FAT: fat })
      else if (tipo === 3) participacao.push({ BANDEIRA: nome, FAT: fat })
    }

    // [0]=MES [1]=ANO [2]=CMV_PCT
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND (CODCENCUS >= 10105000 AND CODCENCUS < 10106000) '
        : aba === 'carone'
          ? ' AND (CODCENCUS >= 10106000 AND CODCENCUS < 10107000) '
          : ' AND ((CODCENCUS >= 10105000 AND CODCENCUS < 10106000) OR ' +
            '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)) '
    const cmvRow = bloco(
      'cmv',
      'SELECT * FROM (SELECT MES, ANO, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
        ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= 2026 ' +
        CC_CMV +
        'GROUP BY MES, ANO ORDER BY ANO DESC, MES DESC) WHERE ROWNUM <= 1',
    )

    // [0]=VLR_MES [1]=VLR_12M [2]=NOTAS_12M
    const qgRow = bloco(
      'quebra_geral',
      'SELECT ' +
        " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
        ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
        ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
        " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'",
    )

    // [0]=VENDA_MES
    const vtRow = bloco(
      'venda_total',
      'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
        "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
    )

    // [0]=REF [1]=QUEBRA [2]=QUEBRAACUM
    const qvRow = bloco(
      'quebra_varejo',
      "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
        'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
        ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
        ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
        'ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
    )

    const num = function (v) {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return isNaN(n) ? null : n
    }

    const fat = num(val(kRow, 2, 'FATURAMENTO'))
    const qtd = num(val(qRow, 0, 'QTD'))
    const cupons = num(val(kRow, 0, 'CUPONS'))
    const ticket = num(val(kRow, 3, 'TICKET'))
    const cmvPct = num(val(cmvRow, 2, 'CMV_PCT'))
    const cmvMes = val(cmvRow, 0, 'MES')
    const cmvAno = val(cmvRow, 1, 'ANO')
    const vendaTotalMes = Number(val(vtRow, 0, 'VENDA_MES') || 0)
    const quebraGeralValorMes = num(val(qgRow, 0, 'VLR_MES'))
    const quebraGeralValor12m = num(val(qgRow, 1, 'VLR_12M'))
    const quebraGeralNotas = num(val(qgRow, 2, 'NOTAS_12M'))
    const quebraVarPct = num(val(qvRow, 1, 'QUEBRA'))
    const quebraVarRef = val(qvRow, 0, 'REF')
    const quebraVarAcum = num(val(qvRow, 2, 'QUEBRAACUM'))
    const quebraGeralPct =
      quebraGeralValorMes !== null && vendaTotalMes > 0
        ? Number(((quebraGeralValorMes / vendaTotalMes) * 100).toFixed(2))
        : null

    const out = {
      schema_v: 2,
      ok: true,
      aba: aba,
      gerado_em: new DateTime().string(),
      periodo: 'Mês corrente',
      kpis: {
        faturamento: fat,
        quantidade_kg: qtd,
        preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
        cupons: cupons,
        ticket_medio: ticket,
        cmv_pct: cmvPct,
        quebra_pct: quebraVarPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: quebraGeralValorMes,
        quebra_geral_valor_12m: quebraGeralValor12m,
        quebra_geral_notas_12m: quebraGeralNotas,
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS para esta bandeira'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
              (cmvMes || '?') +
              '/' +
              (cmvAno || '?') +
              (aba === 'extrabom' || aba === 'carone'
                ? ' · filtrado pela bandeira'
                : ' · Extrabom + Carone'),
        quebra_pct:
          quebraVarPct === null
            ? 'sem dado na tela Resumo Lojas'
            : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
              (quebraVarRef || '?') +
              ' · acumulado R$ ' +
              ((quebraVarAcum || 0) / 1000000).toFixed(1) +
              'M · a fonte só publica o total da rede',
        quebra_geral_pct:
          quebraGeralPct === null
            ? 'sem nota de perda no mês'
            : 'TGFCAB · TOPs 1111 e 1014 · quebra lançada em nota · R$ ' +
              ((quebraGeralValorMes || 0) / 1000).toFixed(0) +
              ' mil no mês · ' +
              (quebraGeralNotas || 0) +
              ' notas em 12 meses',
      },
      serie: serie,
      lojas: lojas,
      cidades: cidades,
      participacao: participacao,
    }

    const chavesFalha = Object.keys(falhas)
    if (chavesFalha.length) out.falhas = chavesFalha.map((c) => c + ': ' + falhas[c])
    if (debug) out.debug = diag

    try {
      console.log(
        '[varejo] aba=' +
          aba +
          ' fat=' +
          (fat === null ? 'NULL' : fat) +
          ' cupons=' +
          (cupons === null ? 'NULL' : cupons) +
          ' qtd=' +
          (qtd === null ? 'NULL' : qtd) +
          ' lojas=' +
          lojas.length +
          ' serie=' +
          serie.length +
          ' falhas=' +
          (chavesFalha.join('|') || 'nenhuma'),
      )
    } catch (_) {}

    // ---------- 3) GRAVA CACHE ----------
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
        console.log('[varejo] falha ao gravar cache: ' + String(errCache).slice(0, 200))
      } catch (_) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
