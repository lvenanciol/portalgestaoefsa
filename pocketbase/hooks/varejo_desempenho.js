// TAREFA VAREJO (13/11/2026) — Desempenho Unidades: KPIs por bandeira.
// GET /backend/v1/varejo/desempenho?aba=...&forcar=1&debug=1
//
// ARQUITETURA (v3 — 13/11 10:20):
//
// 1) CACHE-FIRST em `sankhya_cache` (chave `varejo_desempenho_<aba>`).
//    Antes: a tela fazia 7 consultas EM SÉRIE no Sankhya e levava 11-15 s por
//    aba (medido nos logs: execTime 10648, 11533, 11816, 12712, 14862 ms).
//    Navegar entre 5 abas = mais de um minuto. Agora a leitura sai do
//    PocketBase em milissegundos e o cálculo roda no máximo a cada 15 min.
//    `?forcar=1` ignora o cache (botão Atualizar).
//
// 2) SEM JOIN NO CAMINHO QUENTE. O filtro de bandeira passou de
//    `JOIN TGFPAR` para `IN (SELECT CODPARC FROM TGFPAR WHERE AD_CODCENCUS...)`.
//    O subselect é resolvido uma vez e não multiplica linhas: a mesma consulta
//    caiu de ~11 s para a faixa de milissegundos no teste direto.
//
// 3) ISOLAMENTO POR BLOCO. Cada consulta tem try/catch próprio; uma falha não
//    zera as outras (era a causa das abas vazias) e o erro aparece em `falhas`.
//
// 4) DIAGNÓSTICO. `console.log` alimenta o log de hooks do Skip Cloud e
//    `?debug=1` devolve o estado de cada bloco na resposta.
//
// MAPA DAS BANDEIRAS — por CENTRO DE CUSTO (TSICUS), não por nome de loja:
//   10105000 LOJAS EXTRABOM → 55 lojas (inclui "EXTRABOM ATACADO VEM")
//   10106000 LOJAS CARONE   → 22 lojas (Carone + bandeira "Sempre Tem")
//   Ligação: TGFPAR.AD_CODCENCUS

routerAdd(
  'GET',
  '/backend/v1/varejo/desempenho',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    // TTL dentro do callback: o JSVM do PocketBase roda cada callback em VM
    // separado e não enxerga declaração de topo ("Hook scoping error").
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
        // sem cache — calcula
      }
    }

    // ---------- 2) CÁLCULO ----------
    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
    }

    // Subselect de bandeira (uma vez, sem multiplicar linhas)
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

    const bloco = function (nome, sql) {
      const r = rodar(sql)
      if (r.erro) {
        falhas[nome] = r.erro
        diag[nome] = 'ERRO: ' + r.erro
        return {}
      }
      diag[nome] = 'ok ' + r.rows.length
      return r.rows[0] || {}
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

    // KPIs do mês
    const k = bloco(
      'kpi',
      'SELECT COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FATURAMENTO, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
        ' FROM SANKHYA.TGFCAB C WHERE ' +
        MED +
        filtro,
    )

    // Volume (itens) — usa a mesma lista de parceiros via subselect
    const qd = bloco(
      'qtd',
      'SELECT ROUND(SUM(I.QTDNEG),2) QTD, ROUND(SUM(I.VLRTOT),2) VENDA_ITENS ' +
        ' FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
        ' WHERE ' +
        MED +
        filtro,
    )

    // Série 12m
    const serie = lista(
      'serie',
      "SELECT TO_CHAR(C.DTNEG,'YYYY-MM') MES, ROUND(SUM(C.VLRNOTA),2) FAT, " +
        'COUNT(DISTINCT C.NUMNOTA) CUPONS ' +
        ' FROM SANKHYA.TGFCAB C ' +
        "WHERE C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) " +
        " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L' " +
        filtro +
        " GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM') ORDER BY 1",
    )

    // Ranking de lojas
    const lojas = lista(
      'lojas',
      'SELECT * FROM (SELECT P.NOMEPARC LOJA, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE ' +
        MED +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' GROUP BY P.NOMEPARC ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 30',
    )

    // Faturamento por cidade
    const cidades = lista(
      'cidades',
      'SELECT * FROM (SELECT CI.NOMECID CIDADE, ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
        ' WHERE ' +
        MED +
        ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
        ' GROUP BY CI.NOMECID ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 15',
    )

    // Participação por bandeira
    let participacao = []
    if (aba === 'varejo' || aba === 'distribuicao') {
      participacao = lista(
        'participacao',
        "SELECT CASE WHEN P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' ELSE 'CARONE' END BANDEIRA, " +
          ' ROUND(SUM(C.VLRNOTA),2) FAT ' +
          ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
          ' WHERE ' +
          MED +
          ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000 ' +
          ' GROUP BY CASE WHEN P.AD_CODCENCUS < 10106000 THEN ' +
          "'EXTRABOM' ELSE 'CARONE' END ORDER BY 2 DESC",
      )
    }

    // CMV — tela "Resumo Lojas" (AD_RESUMOLOJAS), por bandeira
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND (CODCENCUS >= 10105000 AND CODCENCUS < 10106000) '
        : aba === 'carone'
          ? ' AND (CODCENCUS >= 10106000 AND CODCENCUS < 10107000) '
          : ' AND ((CODCENCUS >= 10105000 AND CODCENCUS < 10106000) OR ' +
            '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)) '
    const cmvRow = bloco(
      'cmv',
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
      'SELECT ' +
        " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
        ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
        ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
        " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'",
    )

    const vtRow = bloco(
      'venda_total',
      'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
        "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
    )

    // Quebra varejo — tela "Resumo Lojas" (AD_BIDRCQUEBRA)
    const quebraRow = bloco(
      'quebra_varejo',
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

    try {
      console.log(
        '[varejo] aba=' +
          aba +
          ' fat=' +
          (fat === null ? 'NULL' : fat) +
          ' cupons=' +
          (k.CUPONS === undefined ? 'undef' : k.CUPONS) +
          ' qtd=' +
          (qtd === null ? 'NULL' : qtd) +
          ' lojas=' +
          lojas.length +
          ' serie=' +
          serie.length +
          ' cidades=' +
          cidades.length +
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
        console.log('[varejo] falha ao gravar cache: ' + String(errCache).slice(0, 200))
      } catch (_) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
