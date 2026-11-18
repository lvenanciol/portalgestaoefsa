// QUEBRA POR LOJA — reprodução da query oficial do dashboard
// "Quebra TOP 50 - Ranking" do Sankhya Om.
//
// FÓRMULA OFICIAL (sem invenção)
//   QTDCMV     = EI + RECEBIDO - EF        (venda possível em quantidade)
//   QTDQUEBRA  = QTDCMV - VENDAS - CONSUMO
//   VLRQUEBRA  = QTDQUEBRA * CUSTO_UNIT    (custo = preço médio de venda, decisão do dono)
//   PERC       = VLRQUEBRA / VLRVENDA * 100
//
// Fontes: AD_VENDASPLV (vendas), TGFCAB+TGFITE+TGFTOP (recebido),
// AD_CABINVENTARIO+AD_ITEINVENTARIO (EI e EF), AD_CABCONSUMO+AD_ITECONSUMO.
//
// ============================================================================
// REESCRITA 18/11/2026 — DOIS DEFEITOS QUE ZERAVAM A QUEBRA
//
// 1) INVENTÁRIO PARCIAL NO MESMO DIA
//    Antes eu pegava `MAX(DTINVENTARIO)`, ou seja, o último DIA de contagem.
//    Mas a loja roda VÁRIAS contagens no mesmo dia (medido na 03-CR-GVT: 7
//    inventários em 08/09, um com 35 itens e outro com 88). Pegar por data
//    trazia UM deles e perdia o resto → "produtos_sem_estoque_inicial: 4739".
//    REGRA CERTA: último inventário **POR PRODUTO** (MAX(CODINV) por
//    CODPARC+CODPROD, já que CODINV é sequencial).
//
// 2) TETO DE 5.000 LINHAS DO DbExplorerSP
//    Eu montava UM `UNION ALL` com vendas + recebido + EI + EF + consumo.
//    O gateway devolve no máximo 5.000 linhas e as vendas vinham primeiro:
//    EI e EF NUNCA chegavam ao JavaScript, e todo produto era descartado.
//    REGRA: a agregação tem de acontecer NO SQL, devolvendo poucas linhas.
//    Aqui: 76 lojas (grade) ou ~1.200 produtos (composição de UMA loja).
// ============================================================================

routerAdd(
  'GET',
  '/backend/v1/varejo/quebra',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const h = new Date()
    const ano = Number(q.ano || h.getUTCFullYear())
    const mes = Number(q.mes || h.getUTCMonth() + 1)
    const lojaFiltro = String(q.loja || '').trim()

    const mm = String(mes).padStart(2, '0')
    const iniMes = "TO_DATE('01/" + mm + '/' + ano + "','DD/MM/YYYY')"
    const fimMesNum = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    const fimMes =
      "TO_DATE('" + String(fimMesNum).padStart(2, '0') + '/' + mm + '/' + ano + "','DD/MM/YYYY')"

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
          timeout: 120,
        })
        if (res.statusCode !== 200) return { erro: 'edge HTTP ' + res.statusCode }
        const d = res.json || {}
        const rb = (d.data && d.data.responseBody) || {}
        const rows = rb.rows || []
        return { rows: rows }
      } catch (err) {
        return { erro: 'excecao: ' + String(err).slice(0, 150) }
      }
    }

    const n = function (v) {
      if (v === null || v === undefined || v === '') return null
      const x = Number(v)
      return isNaN(x) ? null : x
    }
    const v = function (row, i) {
      return row && row[i] !== undefined ? row[i] : undefined
    }

    // ----------------------------------------------------------------
    // BLOCOS REUTILIZÁVEIS (inline views — WITH não é confiável aqui)
    // ----------------------------------------------------------------
    // último inventário POR PRODUTO antes do mês
    const EI_SUB =
      '(SELECT CBIN.CODPARC, IIN.CODPROD, MAX(CBIN.CODINV) AS CODINV ' +
      ' FROM SANKHYA.AD_CABINVENTARIO CBIN ' +
      ' JOIN SANKHYA.AD_ITEINVENTARIO IIN ON IIN.CODINV=CBIN.CODINV ' +
      " WHERE CBIN.STATUS='F' AND CBIN.DTINVENTARIO < " +
      iniMes +
      ' GROUP BY CBIN.CODPARC, IIN.CODPROD)'
    // último inventário POR PRODUTO dentro do mês
    const EF_SUB =
      '(SELECT CBIN.CODPARC, IIN.CODPROD, MAX(CBIN.CODINV) AS CODINV ' +
      ' FROM SANKHYA.AD_CABINVENTARIO CBIN ' +
      ' JOIN SANKHYA.AD_ITEINVENTARIO IIN ON IIN.CODINV=CBIN.CODINV ' +
      " WHERE CBIN.STATUS='F' AND CBIN.DTINVENTARIO BETWEEN " +
      iniMes +
      ' AND ' +
      fimMes +
      ' GROUP BY CBIN.CODPARC, IIN.CODPROD)'

    const filtroLojaSql = lojaFiltro ? ' AND X.CODPARC = ' + Number(lojaFiltro) + ' ' : ''

    // ----------------------------------------------------------------
    // CONSULTA ÚNICA, AGREGADA NO SQL
    //   BASE = produto com inventário nas DUAS pontas (EI>0 e EF>0).
    //   A venda por produto entra por LEFT JOIN; o custo unitário é o
    //   preço médio de venda daquele produto no mês (proxy do dono).
    // ----------------------------------------------------------------
    // ==================================================================
    // 18/11/2026 — REGRA DO DONO: AUSENTE = ZERO.
    //
    // "pode ser que um item tenha EI = 0 ou não tenha EI e deve ser assumido
    //  como = 0, de igual forma pode ter EF = 0, ou não tenha EF e deve-se
    //  assumir como igual a 0."
    //
    // Antes eu EXCLUÍA o produto quando faltava uma das pontas (regra de
    // 13/11, criada para evitar % absurdo). Agora o produto ENTRA com 0 na
    // ponta ausente. Consequências, que ficam registradas para quem ler:
    //   · produto sem EI e com EF  → QTDCMV = 0 + REC - EF (pode ficar
    //     NEGATIVO quando EF > REC, e a quebra acompanha o sinal);
    //   · produto com EI e sem EF  → QTDCMV = EI + REC (quebra máxima).
    // Isso só é problema se o inventário da loja for PARCIAL (ondas). Com
    // inventário completo a conta fecha; com parcial, o número infla.
    //
    // Implementação: FULL OUTER JOIN entre EI e EF + NVL(...,0). O JOIN
    // interno anterior era o que descartava o produto.
    // ==================================================================
    const BASE =
      'SELECT COALESCE(EI.CODPARC, EF.CODPARC) CODPARC, ' +
      ' COALESCE(EI.CODPROD, EF.CODPROD) CODPROD, ' +
      ' NVL(EI.QEI,0) QEI, NVL(EF.QEF,0) QEF, ' +
      // custo: EF (inventário do mês) e, se vazio, o do EI (inventário anterior)
      ' COALESCE(NULLIF(NVL(EF.CUSTOINV,0),0), NVL(EI.CUSTOINV,0)) CUSTOINV, ' +
      ' NVL(V.QV,0) QV, NVL(V.VLR,0) VLR ' +
      'FROM (SELECT K.CODPARC, K.CODPROD, SUM(VV.QTD) QEI, ' +
      '        MAX(CASE WHEN NVL(VV.CUSTO,0) > 0 THEN VV.CUSTO END) CUSTOINV ' +
      '      FROM ' +
      EI_SUB +
      ' K JOIN SANKHYA.AD_ITEINVENTARIO VV ON VV.CODINV=K.CODINV AND VV.CODPROD=K.CODPROD ' +
      '      GROUP BY K.CODPARC, K.CODPROD) EI ' +
      'FULL OUTER JOIN (SELECT K.CODPARC, K.CODPROD, SUM(VV.QTD) QEF, ' +
      '        MAX(CASE WHEN NVL(VV.CUSTO,0) > 0 THEN VV.CUSTO END) CUSTOINV ' +
      '      FROM ' +
      EF_SUB +
      ' K JOIN SANKHYA.AD_ITEINVENTARIO VV ON VV.CODINV=K.CODINV AND VV.CODPROD=K.CODPROD ' +
      '      GROUP BY K.CODPARC, K.CODPROD) EF ON EF.CODPARC=EI.CODPARC AND EF.CODPROD=EI.CODPROD ' +
      'LEFT JOIN (SELECT PLV.CODPARC, PLV.CODPROD, SUM(PLV.QTDNEG) QV, SUM(PLV.VLRTOT) VLR ' +
      '      FROM SANKHYA.AD_VENDASPLV PLV ' +
      '      WHERE PLV.DTNEG BETWEEN ' +
      iniMes +
      ' AND ' +
      fimMes +
      '      GROUP BY PLV.CODPARC, PLV.CODPROD) V ' +
      ' ON V.CODPARC=COALESCE(EI.CODPARC,EF.CODPARC) AND V.CODPROD=COALESCE(EI.CODPROD,EF.CODPROD) '

    // ---- 1) GRADE: uma linha por LOJA (76 linhas) ----
    const sqlLoja =
      'SELECT X.CODPARC, ' +
      ' ROUND(SUM(NVL(X.VLR,0)),2) VENDA, ' +
      ' ROUND(SUM(X.QEI + NVL(REC.Q,0) - X.QEF),3) QTDCMV, ' +
      // mesmo critério de custo da composição: inventário primeiro, venda como reserva
      ' ROUND(SUM(COALESCE(NULLIF(X.CUSTOINV,0), NVL(X.VLR,0) / NULLIF(X.QV,0)) * ' +
      '   NULLIF(X.QEI + NVL(REC.Q,0) - X.QEF - NVL(X.QV,0) - NVL(CON.Q,0),0)),2) VLRQUEBRA ' +
      'FROM (' +
      BASE +
      ') X ' +
      "LEFT JOIN (SELECT C.CODPARC, I.CODPROD, SUM(CASE WHEN T.TIPMOV='V' THEN I.QTDNEG ELSE -I.QTDNEG END) Q " +
      '      FROM SANKHYA.TGFCAB C ' +
      '      JOIN SANKHYA.TGFITE I ON C.NUNOTA=I.NUNOTA ' +
      '      JOIN SANKHYA.TGFTOP T ON C.CODTIPOPER=T.CODTIPOPER AND C.DHTIPOPER=T.DHALTER ' +
      '      WHERE C.DTNEG BETWEEN ' +
      iniMes +
      ' AND ' +
      fimMes +
      "        AND C.STATUSNOTA='L' AND T.TIPMOV IN ('V','D') " +
      '      GROUP BY C.CODPARC, I.CODPROD) REC ON REC.CODPARC=X.CODPARC AND REC.CODPROD=X.CODPROD ' +
      'LEFT JOIN (SELECT CC.CODPARC, IT.CODPROD, SUM(IT.QUANTIDADE) Q ' +
      '      FROM SANKHYA.AD_CABCONSUMO CC ' +
      '      JOIN SANKHYA.AD_ITECONSUMO IT ON CC.CODCON=IT.CODCON ' +
      "      WHERE CC.STATUS='F' AND CC.DTCONSUMO BETWEEN " +
      iniMes +
      ' AND ' +
      fimMes +
      '      GROUP BY CC.CODPARC, IT.CODPROD) CON ON CON.CODPARC=X.CODPARC AND CON.CODPROD=X.CODPROD ' +
      'WHERE 1=1' +
      filtroLojaSql.replace('X.CODPARC', 'X.CODPARC') +
      'GROUP BY X.CODPARC ORDER BY 3 DESC'

    // ---- 2) COMPOSIÇÃO: uma linha por PRODUTO de UMA loja ----
    const sqlProduto = lojaFiltro
      ? 'SELECT X.CODPARC, X.CODPROD, PR.DESCRPROD, ' +
        ' ROUND(NVL(X.QV,0),3) QVEND, ROUND(NVL(X.VLR,0),2) VENDA, ' +
        ' ROUND(X.QEI,3) QEI, ROUND(NVL(REC.Q,0),3) QREC, ROUND(X.QEF,3) QEF, ' +
        ' ROUND(NVL(CON.Q,0),3) QCONS, ' +
        ' ROUND(X.QEI + NVL(REC.Q,0) - X.QEF,3) QTDCMV, ' +
        ' ROUND(X.QEI + NVL(REC.Q,0) - X.QEF - NVL(X.QV,0) - NVL(CON.Q,0),3) QTDQUEBRA, ' +
        // 18/11/2026 — CUSTO REAL DO INVENTÁRIO.
        // Antes o custo era só "preço médio de venda" (proxy do dono), e
        // produto SEM venda no mês ficava com custo 0 → vlr_quebra 0 e, pior,
        // aparecia no TOPO da composição com 100% de quebra e R$ 0.
        // Agora: custo do último inventário (AD_ITEINVENTARIO.CUSTO) e, só
        // quando ele é nulo/zero, o preço médio de venda como reserva.
        ' ROUND(COALESCE(NULLIF(X.CUSTOINV,0), NVL(X.VLR,0) / NULLIF(X.QV,0)),4) CUSTO, ' +
        ' ROUND(COALESCE(NULLIF(X.CUSTOINV,0), NVL(X.VLR,0) / NULLIF(X.QV,0)) * NULLIF(X.QEI + NVL(REC.Q,0) - X.QEF - NVL(X.QV,0) - NVL(CON.Q,0),0),2) VLRQUEBRA ' +
        'FROM (' +
        BASE +
        ') X ' +
        'LEFT JOIN SANKHYA.TGFPRO PR ON PR.CODPROD=X.CODPROD ' +
        "LEFT JOIN (SELECT C.CODPARC, I.CODPROD, SUM(CASE WHEN T.TIPMOV='V' THEN I.QTDNEG ELSE -I.QTDNEG END) Q " +
        '      FROM SANKHYA.TGFCAB C ' +
        '      JOIN SANKHYA.TGFITE I ON C.NUNOTA=I.NUNOTA ' +
        '      JOIN SANKHYA.TGFTOP T ON C.CODTIPOPER=T.CODTIPOPER AND C.DHTIPOPER=T.DHALTER ' +
        '      WHERE C.DTNEG BETWEEN ' +
        iniMes +
        ' AND ' +
        fimMes +
        "        AND C.STATUSNOTA='L' AND T.TIPMOV IN ('V','D') AND C.CODPARC = " +
        Number(lojaFiltro) +
        '      GROUP BY C.CODPARC, I.CODPROD) REC ON REC.CODPARC=X.CODPARC AND REC.CODPROD=X.CODPROD ' +
        'LEFT JOIN (SELECT CC.CODPARC, IT.CODPROD, SUM(IT.QUANTIDADE) Q ' +
        '      FROM SANKHYA.AD_CABCONSUMO CC ' +
        '      JOIN SANKHYA.AD_ITECONSUMO IT ON CC.CODCON=IT.CODCON ' +
        "      WHERE CC.STATUS='F' AND CC.DTCONSUMO BETWEEN " +
        iniMes +
        ' AND ' +
        fimMes +
        '      GROUP BY CC.CODPARC, IT.CODPROD) CON ON CON.CODPARC=X.CODPARC AND CON.CODPROD=X.CODPROD ' +
        'WHERE X.CODPARC = ' +
        Number(lojaFiltro) +
        // 18/11/2026 — ordenar pelo VALOR ABSOLUTO da quebra.
        // Antes o card abria com produtos de quantidade alta, custo zero e
        // R$ 0 no topo (100% de quebra e nenhum impacto). Quem manda no topo
        // é o impacto em reais.
        ' ORDER BY ABS(COALESCE(NULLIF(X.CUSTOINV,0), NVL(X.VLR,0) / NULLIF(X.QV,0)) * ' +
        ' (X.QEI + NVL(REC.Q,0) - X.QEF - NVL(X.QV,0) - NVL(CON.Q,0))) DESC NULLS LAST'
      : ''

    const grade = rodar(sqlLoja)
    const falhas = {}
    if (grade.erro) falhas.grade = grade.erro

    const lojas = []
    for (const r of grade.rows || []) {
      const codparc = n(v(r, 0))
      const venda = n(v(r, 1)) || 0
      const qtdCmv = n(v(r, 2)) || 0
      const vlrQuebra = n(v(r, 3)) || 0
      const qtdQuebra = qtdCmv - venda // aproximação; o detalhe por produto prevalece
      lojas.push({
        codparc: codparc,
        vlr_venda: Number(venda.toFixed(2)),
        vlr_quebra: Number(vlrQuebra.toFixed(2)),
        qtd_quebra: Number(qtdQuebra.toFixed(0)),
        qtd_venda_possivel: Number(qtdCmv.toFixed(0)),
        perc_quebra_venda: venda > 0 ? Number(((vlrQuebra / venda) * 100).toFixed(2)) : null,
        perc_quebra_qtd: qtdCmv > 0 ? Number(((qtdQuebra / qtdCmv) * 100).toFixed(2)) : null,
        produtos: [],
      })
    }

    // composição (só quando a loja é informada — mantém a resposta pequena)
    if (lojaFiltro) {
      const det = rodar(sqlProduto)
      if (det.erro) falhas.composicao = det.erro
      const produtos = []
      for (const r of det.rows || []) {
        const qtdCmv = n(v(r, 9)) || 0
        const qtdQuebra = n(v(r, 10)) || 0
        // 18/11/2026 — HONESTIDADE DO PERCENTUAL.
        // Com a regra "ausente = 0", produtos que NÃO foram contados no
        // inventário (nem EI nem EF) ficam com QTDCMV igual só ao recebido e
        // produzem percentuais sem sentido (-1741%, por exemplo).
        // Aqui eles continuam na lista (o valor em R$ é real), mas marcados
        // com `sem_inventario` e com percentual NULO em vez de um número
        // absurdo — a tela consegue avisar em vez de exibir ficção.
        const eiV = n(v(r, 5)) || 0
        const efV = n(v(r, 7)) || 0
        const semInv = eiV === 0 && efV === 0
        produtos.push({
          codprod: n(v(r, 1)),
          produto: v(r, 2) || 'Produto ' + String(v(r, 1)),
          qtd_vendas: n(v(r, 3)) || 0,
          vlr_venda: n(v(r, 4)) || 0,
          ei: eiV,
          recebido: n(v(r, 6)) || 0,
          ef: efV,
          consumo: n(v(r, 8)) || 0,
          qtd_cmv: Number(qtdCmv.toFixed(3)),
          qtd_quebra: Number(qtdQuebra.toFixed(3)),
          custo_unit: n(v(r, 11)) || 0,
          vlr_quebra: n(v(r, 12)) || 0,
          sem_inventario: semInv,
          // percentual só quando a base (QTDCMV) é positiva E o produto tem
          // pelo menos uma ponta de inventário
          perc_quebra_qtd:
            !semInv && qtdCmv > 0 ? Number(((qtdQuebra / qtdCmv) * 100).toFixed(2)) : null,
        })
      }
      for (const L of lojas) L.produtos = produtos
      // transparência: quantos itens do detalhe não têm nenhuma ponta de
      // inventário (contribuem em R$, mas o % deles não é confiável)
      const semInv = produtos.filter((p) => p.sem_inventario).length
      resp.cobertura_produtos = {
        total: produtos.length,
        com_inventario: produtos.length - semInv,
        sem_inventario: semInv,
      }
    }

    const resp = {
      ok: true,
      periodo: 'Mês ' + mm + '/' + ano,
      cobertura: { lojas_com_quebra: lojas.length },
      lojas: lojas,
    }
    if (Object.keys(falhas).length) {
      resp.falhas = Object.keys(falhas).map(function (k) {
        return k + ': ' + falhas[k]
      })
    }

    try {
      console.log(
        '[varejo/quebra] ' +
          mm +
          '/' +
          ano +
          ' lojas=' +
          lojas.length +
          ' lojaFiltro=' +
          (lojaFiltro || '-') +
          ' falhas=' +
          (Object.keys(falhas).join('|') || 'ok'),
      )
    } catch (_) {}

    return e.json(200, resp)
  },
  $apis.requireAuth(),
)
