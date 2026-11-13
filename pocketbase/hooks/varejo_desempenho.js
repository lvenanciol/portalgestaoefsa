// TAREFA VAREJO (13/11/2026) — Desempenho Unidades: KPIs por bandeira.
// GET /backend/v1/varejo/desempenho?aba=...&debug=1
//
// ARQUITETURA (v2 — 13/11 10:30):
//  1. CACHE-FIRST na coleção `sankhya_cache` (chave `varejo_desempenho_<aba>`).
//     A tela fazia 7 consultas em série no Sankhya e levava 11-15 s por aba.
//     Agora a leitura vem do PocketBase (ms) e o cálculo roda no máximo a cada
//     CACHE_TTL_MS. Com `?forcar=1` o cache é ignorado (botão Atualizar).
//  2. ISOLAMENTO POR BLOCO: cada consulta tem try/catch próprio. Uma falha não
//     zera as outras — antes, um erro em qualquer SQL deixava a aba inteira
//     vazia sem explicação.
//  3. DIAGNÓSTICO visível: o retorno traz `debug` com o estado de cada bloco e
//     `console.log` alimenta o log de hooks do Skip Cloud. Foi assim que se
//     descobriu que as requisições levavam 11-15 s.
//
// MAPA DAS BANDEIRAS — por CENTRO DE CUSTO (TSICUS), não por nome de loja:
//   10105000 LOJAS EXTRABOM → 55 lojas (inclui as "EXTRABOM ATACADO VEM")
//   10106000 LOJAS CARONE   → 22 lojas (Carone + bandeira "Sempre Tem")
//   Ligação: TGFPAR.AD_CODCENCUS

routerAdd(
  'GET',
  '/backend/v1/varejo/desempenho',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    // TTL do cache. Declarado DENTRO do callback: o JSVM do PocketBase executa
    // cada callback em um VM separado e não enxerga declarações de topo
    // (o pipeline reprova com "Hook scoping error").
    const CACHE_TTL_MS = 15 * 60 * 1000

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
        if (idade >= 0 && idade < CACHE_TTL_MS) {
          let payload = {}
          try {
            payload = JSON.parse(rec.getString('payload') || '{}')
          } catch (_) {
            payload = {}
          }
          return e.json(
            200,
            Object.assign({}, payload, {
              do_cache: true,
              cache_idade_min: Math.round(idade / 60000),
            }),
          )
        }
      } catch (_) {
        // sem cache ainda — segue para o cálculo
      }
    }

    // ---------- 2) CÁLCULO ----------
    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
    }

    const CC_EB = '(P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000)'
    const CC_CR = '(P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000)'
    const FILTRO = {
      extrabom: ' AND ' + CC_EB + ' ',
      carone: ' AND ' + CC_CR + ' ',
      varejo: ' AND (' + CC_EB + ' OR ' + CC_CR + ') ',
      atacado:
        ' AND NOT (' +
        CC_EB +
        ' OR ' +
        CC_CR +
        ') ' +
        ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 ',
      distribuicao:
        ' AND NOT (' +
        CC_EB +
        ' OR ' +
        CC_CR +
        ') ' +
        ' AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 ',
    }
    const filtro = FILTRO[aba] || FILTRO.varejo

    const BASE =
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
      " AND C.STATUSNOTA='L' " +
      filtro

    // Nunca deixa o handler cair por exceção de rede: devolve o erro no bloco.
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
        return { erro: 'exceção: ' + String(err).slice(0, 160) }
      }
    }

    const falhas = {}
    const diag = {}

    const bloco = function (nome, sqlFn) {
      const sql = sqlFn()
      const r = rodar(sql)
      if (r.erro) {
        falhas[nome] = r.erro
        diag[nome] = 'ERRO'
        return {}
      }
      diag[nome] = 'ok ' + r.rows.length + ' linha(s)'
      return r.rows[0] || {}
    }

    const k = bloco(
      'kpi',
      () =>
        'SELECT COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FATURAMENTO, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
        BASE,
    )

    const qd = bloco(
      'qtd',
      () =>
        'SELECT ROUND(SUM(I.QTDNEG),2) QTD, ROUND(SUM(I.VLRTOT),2) VENDA_ITENS ' +
        ' FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        ' JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
        " AND C.STATUSNOTA='L' " +
        filtro,
    )

    // Série 12m — array, não primeira linha
    let serie = []
    try {
      const r = rodar(
        "SELECT TO_CHAR(C.DTNEG,'YYYY-MM') MES, ROUND(SUM(C.VLRNOTA),2) FAT, " +
          'COUNT(DISTINCT C.NUMNOTA) CUPONS ' +
          ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
          "WHERE C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) " +
          " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L' " +
          filtro +
          " GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM') ORDER BY 1",
      )
      if (r.erro) {
        falhas.serie = r.erro
        diag.serie = 'ERRO'
      } else {
        serie = r.rows
        diag.serie = 'ok ' + r.rows.length + ' mes(es)'
      }
    } catch (err) {
      falhas.serie = String(err).slice(0, 120)
    }

    let lojas = []
    try {
      const r = rodar(
        'SELECT * FROM (SELECT P.NOMEPARC LOJA, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
          'ROUND(SUM(C.VLRNOTA),2) FAT ' +
          ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
          "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
          " AND C.STATUSNOTA='L' " +
          filtro +
          ' GROUP BY P.NOMEPARC ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 30',
      )
      if (r.erro) {
        falhas.lojas = r.erro
        diag.lojas = 'ERRO'
      } else {
        lojas = r.rows
        diag.lojas = 'ok ' + r.rows.length + ' loja(s)'
      }
    } catch (err) {
      falhas.lojas = String(err).slice(0, 120)
    }

    let cidades = []
    try {
      const r = rodar(
        'SELECT * FROM (SELECT CI.NOMECID CIDADE, ROUND(SUM(C.VLRNOTA),2) FAT ' +
          ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
          ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
          "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
          " AND C.STATUSNOTA='L' " +
          filtro +
          ' GROUP BY CI.NOMECID ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 15',
      )
      if (r.erro) {
        falhas.cidades = r.erro
        diag.cidades = 'ERRO'
      } else {
        cidades = r.rows
        diag.cidades = 'ok ' + r.rows.length + ' cidade(s)'
      }
    } catch (err) {
      falhas.cidades = String(err).slice(0, 120)
    }

    let participacao = []
    if (aba === 'varejo' || aba === 'distribuicao') {
      try {
        const r = rodar(
          "SELECT CASE WHEN P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' ELSE 'CARONE' END BANDEIRA, " +
            ' ROUND(SUM(C.VLRNOTA),2) FAT ' +
            ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
            "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
            " AND C.STATUSNOTA='L' AND (" +
            CC_EB +
            ' OR ' +
            CC_CR +
            ') ' +
            ' GROUP BY CASE WHEN P.AD_CODCENCUS < 10106000 THEN ' +
            "'EXTRABOM' ELSE 'CARONE' END ORDER BY 2 DESC",
        )
        if (r.erro) {
          falhas.participacao = r.erro
          diag.participacao = 'ERRO'
        } else {
          participacao = r.rows
          diag.participacao = 'ok ' + r.rows.length + ' banda(s)'
        }
      } catch (err) {
        falhas.participacao = String(err).slice(0, 120)
      }
    }

    // CMV — tela "Resumo Lojas" (AD_RESUMOLOJAS), filtrado pela bandeira
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND (CODCENCUS >= 10105000 AND CODCENCUS < 10106000) '
        : aba === 'carone'
          ? ' AND (CODCENCUS >= 10106000 AND CODCENCUS < 10107000) '
          : ' AND ((CODCENCUS >= 10105000 AND CODCENCUS < 10106000) OR ' +
            '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)) '
    const cmvRow = bloco(
      'cmv',
      () =>
        'SELECT * FROM (SELECT MES, ANO, ROUND(SUM(VLRVENDABRUTA),2) VENDA, ' +
        'ROUND(SUM(CMVACUM),2) CMV, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
        ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= 2026 ' +
        CC_CMV +
        'GROUP BY MES, ANO ORDER BY ANO DESC, MES DESC) WHERE ROWNUM <= 1',
    )

    // Quebra geral — TGFCAB TOPs 1111/1014
    const qGeral = bloco(
      'quebra_geral',
      () =>
        'SELECT ' +
        " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
        ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
        ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
        " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'",
    )

    const vtRow = bloco(
      'venda_total',
      () =>
        'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
        "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
    )

    // Quebra varejo — tela "Resumo Lojas" (AD_BIDRCQUEBRA)
    const quebraRow = bloco(
      'quebra_varejo',
      () =>
        "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
        'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
        ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
        ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
        'ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
    )

    const num = (v) => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return isNaN(n) ? null : n
    }
    const fat = num(k.FATURAMENTO)
    const qtd = num(qd.QTD)
    const vendaTotalMes = Number(vtRow.VENDA_MES || 0)
    const quebraGeralValorMes = num(qGeral.VLR_MES)
    const quebraGeralPct =
      quebraGeralValorMes !== null && vendaTotalMes > 0
        ? Number(((quebraGeralValorMes / vendaTotalMes) * 100).toFixed(2))
        : null
    const cmvPct = num(cmvRow.CMV_PCT)
    const quebraVarPct = num(quebraRow.QUEBRA)

    const out = {
      ok: true,
      aba: aba,
      gerado_em: new DateTime().string(),
      periodo: 'Mês corrente',
      kpis: {
        faturamento: fat,
        quantidade_kg: qtd,
        preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
        cupons: num(k.CUPONS),
        ticket_medio: num(k.TICKET),
        cmv_pct: cmvPct,
        quebra_pct: quebraVarPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: quebraGeralValorMes,
        quebra_geral_valor_12m: num(qGeral.VLR_12M),
        quebra_geral_notas_12m: num(qGeral.NOTAS_12M),
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS para esta bandeira'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
              (cmvRow.MES || '?') +
              '/' +
              (cmvRow.ANO || '?') +
              (aba === 'extrabom' || aba === 'carone'
                ? ' · filtrado pela bandeira'
                : ' · Extrabom + Carone'),
        quebra_pct:
          quebraVarPct === null
            ? 'sem dado na tela Resumo Lojas'
            : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
              (quebraRow.REF || '?') +
              ' · acumulado R$ ' +
              (Number(quebraRow.QUEBRAACUM || 0) / 1000000).toFixed(1) +
              'M · a fonte só publica o total da rede',
        quebra_geral_pct:
          quebraGeralPct === null
            ? 'sem nota de perda no mês'
            : 'TGFCAB · TOPs 1111 e 1014 · quebra lançada em nota · R$ ' +
              (Number(qGeral.VLR_MES || 0) / 1000).toFixed(0) +
              ' mil no mês · ' +
              (qGeral.NOTAS_12M || 0) +
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

    // Diagnóstico no log de hooks do Skip Cloud (visível em list_logs source=hooks)
    try {
      console.log(
        '[varejo/desempenho] aba=' +
          aba +
          ' kpi.fat=' +
          (fat === null ? 'NULL' : fat) +
          ' kpi.cupons=' +
          (k.CUPONS === undefined ? 'undef' : k.CUPONS) +
          ' qtd=' +
          (qtd === null ? 'NULL' : qtd) +
          ' lojas=' +
          lojas.length +
          ' serie=' +
          serie.length +
          ' falhas=' +
          (chavesFalha.join('|') || 'nenhuma') +
          ' diag=' +
          JSON.stringify(diag),
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
        console.log('[varejo/desempenho] falha ao gravar cache: ' + String(errCache).slice(0, 200))
      } catch (_) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
