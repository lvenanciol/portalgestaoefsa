// TAREFA VAREJO (13/11/2026) — Desempenho Unidades: KPIs por bandeira.
// GET /backend/v1/varejo/desempenho?aba=distribuicao|atacado|carone|extrabom|varejo
//
// FONTE DA VERDADE: Sankhya (TGFCAB/TGFITE/TGFPAR), via edge proxy — o mesmo
// caminho do financeiro_real. Nada é inventado: métrica sem fonte volta null e
// a tela mostra "—" com a origem no tooltip.
//
// MAPA DAS BANDEIRAS — por CENTRO DE CUSTO (TSICUS), não por nome de loja:
//   10105000 LOJAS EXTRABOM → 55 lojas (inclui as "EXTRABOM ATACADO VEM")
//   10106000 LOJAS CARONE   → 22 lojas (Carone + bandeira "Sempre Tem")
//   Ligação: TGFPAR.AD_CODCENCUS
// A tentativa anterior de classificar por NOMEPARC estava errada: as lojas
// Carone seguem "NN-CR - XXX" (começam com número) e escapavam do padrão
// "CR - %", jogando R$ 13,8M de Carone dentro da Extrabom.

routerAdd(
  'GET',
  '/backend/v1/varejo/desempenho',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
    }

    const aba = String(e.requestInfo().query.aba || 'varejo').toLowerCase()

    // Predicados SQL por bandeira (sempre com espaço nas pontas)
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

    const rodar = function (sql) {
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
        timeout: 45,
      })
      if (res.statusCode !== 200) return { erro: 'edge ' + res.statusCode }
      const d = res.json || {}
      const rb = (d.data && d.data.responseBody) || {}
      if (!rb.rows) return { erro: (d.data && d.data.statusMessage) || 'sem rows' }
      return { rows: rb.rows }
    }

    const falhas = []

    // --- KPIs do mês corrente ---
    const sqlKpi =
      'SELECT COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
      'ROUND(SUM(C.VLRNOTA),2) FATURAMENTO, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
      BASE
    const rKpi = rodar(sqlKpi)
    const k = (rKpi.rows && rKpi.rows[0]) || {}
    if (rKpi.erro) falhas.push('kpi: ' + rKpi.erro)

    // Quantidade/KG vem dos itens
    const sqlQtd =
      'SELECT ROUND(SUM(I.QTDNEG),2) QTD, ROUND(SUM(I.VLRTOT),2) VENDA_ITENS ' +
      ' FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
      ' JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
      " AND C.STATUSNOTA='L' " +
      filtro
    const rQtd = rodar(sqlQtd)
    const q = (rQtd.rows && rQtd.rows[0]) || {}
    if (rQtd.erro) falhas.push('qtd: ' + rQtd.erro)

    // --- Série mensal (12m) ---
    const sqlSerie =
      "SELECT TO_CHAR(C.DTNEG,'YYYY-MM') MES, ROUND(SUM(C.VLRNOTA),2) FAT, " +
      'COUNT(DISTINCT C.NUMNOTA) CUPONS ' +
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      "WHERE C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) " +
      " AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L' " +
      filtro +
      " GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM') ORDER BY 1"
    const rSerie = rodar(sqlSerie)
    const serie = rSerie.rows || []
    if (rSerie.erro) falhas.push('serie: ' + rSerie.erro)

    // --- Ranking de lojas ---
    const sqlLojas =
      'SELECT * FROM (SELECT P.NOMEPARC LOJA, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
      'ROUND(SUM(C.VLRNOTA),2) FAT ' +
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
      " AND C.STATUSNOTA='L' " +
      filtro +
      ' GROUP BY P.NOMEPARC ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 30'
    const rLojas = rodar(sqlLojas)
    const lojas = rLojas.rows || []
    if (rLojas.erro) falhas.push('lojas: ' + rLojas.erro)

    // --- Faturamento por cidade ---
    const sqlCidade =
      'SELECT * FROM (SELECT CI.NOMECID CIDADE, ROUND(SUM(C.VLRNOTA),2) FAT ' +
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
      "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
      " AND C.STATUSNOTA='L' " +
      filtro +
      ' GROUP BY CI.NOMECID ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 15'
    const rCidade = rodar(sqlCidade)
    const cidades = rCidade.rows || []
    if (rCidade.erro) falhas.push('cidade: ' + rCidade.erro)

    // --- Participação por bandeira (abas consolidadas) ---
    let participacao = []
    if (aba === 'varejo' || aba === 'distribuicao') {
      const sqlPart =
        "SELECT CASE WHEN P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' ELSE 'CARONE' END BANDEIRA, " +
        ' ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
        " AND C.STATUSNOTA='L' AND (" +
        CC_EB +
        ' OR ' +
        CC_CR +
        ') GROUP BY CASE WHEN P.AD_CODCENCUS < 10106000 THEN ' +
        "'EXTRABOM' ELSE 'CARONE' END ORDER BY 2 DESC"
      const rPart = rodar(sqlPart)
      participacao = rPart.rows || []
      if (rPart.erro) falhas.push('participacao: ' + rPart.erro)
    }

    // --- CMV Parcial: tela "Resumo Lojas" (AD_RESUMOLOJAS) ---
    // CMVACUM / VLRVENDABRUTA, chave CODCENCUS — permite abrir por bandeira.
    // Cobertura medida em 13/11: 100% das linhas de loja em 2026.
    // Conferido: ago 51,85% · set 52,80% · out 53,33% (rede).
    const CC_CMV_EB = '(CODCENCUS >= 10105000 AND CODCENCUS < 10106000)'
    const CC_CMV_CR = '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)'
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND ' + CC_CMV_EB + ' '
        : aba === 'carone'
          ? ' AND ' + CC_CMV_CR + ' '
          : ' AND (' + CC_CMV_EB + ' OR ' + CC_CMV_CR + ') '
    const sqlCmv =
      'SELECT * FROM (SELECT MES, ANO, ROUND(SUM(VLRVENDABRUTA),2) VENDA, ' +
      'ROUND(SUM(CMVACUM),2) CMV, ' +
      'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
      ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= 2026 ' +
      CC_CMV +
      'GROUP BY MES, ANO ORDER BY ANO DESC, MES DESC) WHERE ROWNUM <= 1'
    const rCmv = rodar(sqlCmv)
    const cmvRow = (rCmv.rows && rCmv.rows[0]) || {}
    if (rCmv.erro) falhas.push('cmv: ' + rCmv.erro)

    // --- QUEBRA GERAL DA EMPRESA → TGFCAB, TOPs de perda ---
    // 1111 = NF PERDA/DESCARTE · 1014 = PEDIDO DE PERDA/DESCARTE
    // (confirmados em TGFTOP.DESCROPER). É a quebra LANÇADA em nota.
    // Subquery escalar no SELECT faz o descritor devolver 0 linhas, então o
    // denominador vem de uma segunda consulta.
    const sqlQuebraGeral =
      'SELECT ' +
      " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
      ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
      ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
      " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'"
    const rQgeral = rodar(sqlQuebraGeral)
    const qGeral = (rQgeral.rows && rQgeral.rows[0]) || {}
    if (rQgeral.erro) falhas.push('quebra_geral: ' + rQgeral.erro)

    const sqlVendaTotal =
      'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
      "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'"
    const rVendaTotal = rodar(sqlVendaTotal)
    const vtRow = (rVendaTotal.rows && rVendaTotal.rows[0]) || {}
    const vendaTotalMes = Number(vtRow.VENDA_MES || 0)
    if (rVendaTotal.erro) falhas.push('venda_total: ' + rVendaTotal.erro)

    // --- QUEBRA DO VAREJO → tela "Resumo Lojas" (AD_BIDRCQUEBRA) ---
    // Série viva até out/2026. A tabela só tem REFERENCIA + QUEBRA: NÃO abre
    // por bandeira. O valor absoluto está na irmã AD_BIDRCQUEBRACUM.
    // NÃO somar com a quebra geral: a diferença é o que não passa por nota de
    // perda (apurado em inventário).
    const sqlQuebraVar =
      "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
      'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
      ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
      ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
      'ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1'
    const rQuebraVar = rodar(sqlQuebraVar)
    const quebraRow = (rQuebraVar.rows && rQuebraVar.rows[0]) || {}
    if (rQuebraVar.erro) falhas.push('quebra_varejo: ' + rQuebraVar.erro)

    const num = (v) => (v === null || v === undefined ? null : Number(v))
    const fat = num(k.FATURAMENTO)
    const qtd = num(q.QTD)
    const cmvPct = num(cmvRow.CMV_PCT)
    const quebraVarPct = num(quebraRow.QUEBRA)
    const quebraGeralValorMes = num(qGeral.VLR_MES)
    const quebraGeralPct =
      quebraGeralValorMes !== null && vendaTotalMes > 0
        ? Number(((quebraGeralValorMes / vendaTotalMes) * 100).toFixed(2))
        : null

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
              ' · valor acumulado R$ ' +
              (Number(quebraRow.QUEBRAACUM || 0) / 1000000).toFixed(1) +
              'M · a fonte só publica o total da rede, não abre por bandeira',
        quebra_geral_pct:
          quebraGeralPct === null
            ? 'sem nota de perda no mês'
            : 'TGFCAB · TOPs 1111 (NF PERDA/DESCARTE) e 1014 · quebra lançada em nota · R$ ' +
              (Number(qGeral.VLR_MES || 0) / 1000).toFixed(0) +
              ' mil no mês · ' +
              (qGeral.NOTAS_12M || 0) +
              ' notas em 12 meses. Não somar com a do Resumo Lojas — a diferença é apurada em inventário.',
      },
      serie: serie,
      lojas: lojas,
      cidades: cidades,
      participacao: participacao,
    }
    if (falhas.length) out.falhas = falhas
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
