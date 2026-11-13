// TAREFA VAREJO (13/11/2026) — Desempenho Unidades: KPIs por bandeira.
// GET /backend/v1/varejo/desempenho?aba=distribuicao|atacado|carone|extrabom|varejo
//
// FONTE DA VERDADE: Sankhya (TGFCAB/TGFITE/TGFPAR), via edge proxy — o MESMO
// caminho do financeiro_real. Nada é inventado: quando a métrica não existe na
// base, o campo volta null e a tela mostra "—" com a origem esperada.
//
// MAPA DAS BANDEIRAS (descoberto no ERP em 13/11):
//   - Extrabom .... parceiros com NOMEPARC no padrão "NN-EB - XXX" (54 lojas)
//   - Carone ...... parceiros "CR - ..." (Central Padaria)
//   - Varejo ...... Extrabom + Carone consolidado
//   - Atacado ..... Extrafruti (CODEMP 1,2,3,4,5,6,10,11,12,13,14) — parceiros
//                   que NÃO são loja de varejo
//   - Distribuição  Casafruti + demais empresas do grupo
//
// Os KPIs seguem o print de referência: Faturamento, Quantidade/KG, Preço Médio,
// Cupons, Ticket Médio, CMV Parcial e Quebra. Os que o Sankhya não fornece
// (CMV por lote, quebra de estoque) voltam null com aviso explícito — melhor
// "sem dado" do que número inventado (regra do dono).

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

    // Predicado SQL por bandeira. Sempre com espaço nas pontas para concatenação.
    //
    // ---------------------------------------------------------------
    // REGRA OFICIAL (13/11/2026) — CENTRO DE CUSTO, não nome de loja.
    //
    // A v0.0.358 saiu com classificação por NOMEPARC ("NN-EB"/"CR -") e isso
    // estava ERRADO: as lojas Carone seguem o padrão "NN-CR - XXX" (começam
    // com número), então só "CR - CENTRAL PADARIA" casava e R$ 13,8M da rede
    // Carone apareciam como Extrabom.
    //
    // A fonte correta é o plano de contas do ERP (TSICUS), hierarquia real:
    //   10105000 LOJAS EXTRABOM  → 55 lojas (inclui as "EXTRABOM ATACADO VEM")
    //   10106000 LOJAS CARONE    → 22 lojas (Carone + bandeira "Sempre Tem")
    // Ligação: TGFPAR.AD_CODCENCUS (campo corretivo por parceiro).
    //
    // PROVA (out/2026 fechado): Extrabom 51.083.804,96 (55,5%) e Carone
    // 40.934.653,01 (44,5%) — contra 54,1%/45,9% no print de referência.
    // A diferença é de janela de apuração, não de classificação.
    const CC_EB = '(P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000)'
    const CC_CR = '(P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000)'
    const FILTRO = {
      extrabom: ' AND ' + CC_EB + ' ',
      carone: ' AND ' + CC_CR + ' ',
      varejo: ' AND (' + CC_EB + ' OR ' + CC_CR + ') ',
      // atacado/distribuicao: o complemento do varejo, separado por empresa
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
    // Helper declarado ANTES de qualquer uso (TDZ: const usada antes da
    // declaração derruba o handler com ReferenceError).
    const num0 = (row) => Number((row && row.VENDA_MES) || 0)

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

    // --- Série mensal (12m) para os gráficos de evolução ---
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

    // --- Ranking de lojas / parceiros ---
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

    // --- Faturamento por cidade (o print mostra exatamente isto) ---
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

    // --- Participação por bandeira (só nas abas consolidadas) ---
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

    // --- CMV Parcial: AD_RESUMOLOJAS.CMVACUM / VLRVENDABRUTA ---
    // Fonte usada pela controladoria (mesma do painel de referência).
    // Cobertura medida em 13/11: 100% das linhas de loja em todos os meses de
    // 2026 (70 a 76 linhas/mês). Valores conferidos: ago 51,85% · set 52,80%
    // · out 53,33% — faixa coerente para varejo de alimentos.
    // ATENÇÃO: se o mês corrente ainda não tiver fechamento na tabela, o valor
    // vem do último mês fechado e o campo `cmv_referencia` diz qual é.
    // O CMV tem a MESMA chave de bandeira (CODCENCUS), então dá para separar
    // Extrabom × Carone em vez de mostrar a rede consolidada.
    const CC_CMV_EB = '(CODCENCUS >= 10105000 AND CODCENCUS < 10106000)'
    const CC_CMV_CR = '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)'
    const CC_CMV =
      aba === 'extrabom'
        ? ' AND ' + CC_CMV_EB + ' '
        : aba === 'carone'
          ? ' AND ' + CC_CMV_CR + ' '
          : aba === 'varejo' || aba === 'distribuicao'
            ? ' AND (' + CC_CMV_EB + ' OR ' + CC_CMV_CR + ') '
            : ''
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

    // --- QUEBRA (duas fontes, conforme decisão do dono em 13/11) ---
    //
    // (1) QUEBRA GERAL DA EMPRESA → TGFCAB, tipos de operação de perda.
    //     1111 = NF PERDA/DESCARTE · 1014 = PEDIDO DE PERDA/DESCARTE
    //     (confirmados em TGFTOP.DESCROPER). É a quebra LANÇADA em nota.
    //     Medido: 1535 notas / R$ 7.729.091,78 nos últimos 12 meses.
    //
    // (2) QUEBRA DO VAREJO (o 7,89% do painel de referência) → tela
    //     "Resumo Lojas", cuja tabela é AD_BIDRCQUEBRA (série viva até
    //     out/2026). NÃO é decomponível por bandeira: a tabela só tem
    //     REFERENCIA + QUEBRA. O valor absoluto está na irmã
    //     AD_BIDRCQUEBRACUM.QUEBRAACUM.
    //
    //     ATENÇÃO — as duas NÃO são a mesma coisa e não devem ser somadas:
    //     a geral (nota) dá algo como R$ 64 mil/mês; a do Resumo Lojas dá
    //     R$ 4,8 milhões acumulados. A diferença é o que não passa por nota
    //     de perda (apurado em inventário). Por isso aparecem em cards
    //     separados, cada um com a origem no tooltip.
    // Subquery escalar no SELECT faz o descritor do Sankhya devolver 0 linhas —
    // por isso o percentual é calculado aqui, com uma segunda consulta simples.
    const TOP_PERDA = '(1111,1014)'
    const sqlQuebraGeral =
      'SELECT ' +
      " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
      ' ROUND(SUM(C.VLRNOTA),2) VLR_12M,' +
      ' COUNT(*) NOTAS_12M ' +
      ' FROM SANKHYA.TGFCAB C ' +
      'WHERE C.CODTIPOPER IN ' +
      TOP_PERDA +
      " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'"
    const rQgeral = rodar(sqlQuebraGeral)
    const qGeral = (rQgeral.rows && rQgeral.rows[0]) || {}
    if (rQgeral.erro) falhas.push('quebra_geral: ' + rQgeral.erro)

    // Denominador: faturamento total do grupo no mês corrente
    const sqlVendaTotal =
      'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
      "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'"
    const rVendaTotal = rodar(sqlVendaTotal)
    const vendaTotalMes = num0((rVendaTotal.rows && rVendaTotal.rows[0]) || {})
    if (rVendaTotal.erro) falhas.push('venda_total: ' + rVendaTotal.erro)

    // (2) Resumo Lojas
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
    const cupons = num(k.CUPONS)
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
        // kg e unidades somados: o ERP mistura UN e KG no QTDNEG
        quantidade_kg: qtd,
        preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
        cupons: cupons,
        ticket_medio: num(k.TICKET),
        cmv_pct: cmvPct,
        // Quebra do VAREJO — tela "Resumo Lojas" (AD_BIDRCQUEBRA)
        quebra_pct: quebraVarPct,
        // Quebra GERAL da empresa — TGFCAB, TOPs 1111/1014
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: num(qGeral.VLR_MES),
        quebra_geral_valor_12m: num(qGeral.VLR_12M),
        quebra_geral_notas_12m: num(qGeral.NOTAS_12M),
      },
      // De onde veio cada número que NÃO é do mês corrente ou não é específico
      // da bandeira — a tela mostra isso no tooltip do card.
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS para esta bandeira'
            : 'AD_RESUMOLOJAS · referência ' +
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
            : 'TGFCAB · TOPs 1111 (NF PERDA/DESCARTE) e 1014 · quebra LANÇADA em nota · ' +
              'R$ ' +
              (Number(qGeral.VLR_MES || 0) / 1000).toFixed(0) +
              ' mil no mês · ' +
              (qGeral.NOTAS_12M || 0) +
              ' notas em 12 meses. Não deve ser somada à do Resumo Lojas — ' +
              'a diferença é a quebra apurada em inventário.',
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
