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
    // ATENÇÃO (13/11/2026) — mapeamento descoberto no ERP, validado contra os
    // dados do mês. Nomes de loja no TGFPAR:
    //   "NN-EB - XXX"  → Extrabom (49 lojas)
    //   "NN-ATV - XXX" → ATV, grupo de preço "GRUPO VEM" (9 lojas)
    //   "CR - XXX"     → Central Padaria / CD Limoeiro (Carone)
    // O painel Power BI de referência agrupa ATV dentro de Carone; o total
    // (EB + ATV + CR) fecha com o faturamento do print. A divisão percentual
    // do print NÃO é reproduzível com o ERP atual — visto como pendência.
    const EB = "UPPER(P.NOMEPARC) LIKE '%-EB -%'"
    const ATV = "UPPER(P.NOMEPARC) LIKE '%-ATV -%'"
    const CR = "UPPER(P.NOMEPARC) LIKE 'CR - %'"
    const FILTRO = {
      extrabom: ' AND (' + EB + ') ',
      carone: ' AND (' + CR + ' OR ' + ATV + ') ',
      varejo: ' AND (' + EB + ' OR ' + CR + ' OR ' + ATV + ') ',
      // atacado/distribuicao: o complemento do varejo, separado por empresa
      atacado:
        ' AND NOT (' +
        EB +
        ' OR ' +
        CR +
        ' OR ' +
        ATV +
        ') ' +
        ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) AND C.CODEMP < 100 ',
      distribuicao:
        ' AND NOT (' +
        EB +
        ' OR ' +
        CR +
        ' OR ' +
        ATV +
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
        'SELECT BANDEIRA, ROUND(SUM(FAT),2) FAT FROM (' +
        "SELECT CASE WHEN UPPER(P.NOMEPARC) LIKE '%-EB -%' THEN 'EXTRABOM' " +
        " WHEN UPPER(P.NOMEPARC) LIKE '%-ATV -%' THEN 'CARONE' " +
        " WHEN UPPER(P.NOMEPARC) LIKE 'CR - %' THEN 'CARONE' ELSE 'OUTROS' END BANDEIRA, " +
        ' C.VLRNOTA FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        "WHERE C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' " +
        " AND C.STATUSNOTA='L' AND (" +
        EB +
        ' OR ' +
        CR +
        ' OR ' +
        ATV +
        ')' +
        ') GROUP BY BANDEIRA ORDER BY 2 DESC'
      const rPart = rodar(sqlPart)
      participacao = rPart.rows || []
      if (rPart.erro) falhas.push('participacao: ' + rPart.erro)
    }

    const num = (v) => (v === null || v === undefined ? null : Number(v))
    const fat = num(k.FATURAMENTO)
    const qtd = num(q.QTD)
    const cupons = num(k.CUPONS)

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
        // CMV real exige custo por lote (TGFEST/TGFCUS) — não calculado aqui
        cmv_pct: null,
        // Quebra exige inventário/balanço — não existe no TGFCAB
        quebra_pct: null,
      },
      sem_dado: {
        cmv_pct: 'custo por lote (TGFEST / TGFCUS médio) — a calcular com o Controlador',
        quebra_pct: 'quebra de estoque exige inventário (AD_INVLOJAS) — a definir escopo',
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
