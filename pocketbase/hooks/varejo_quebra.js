// QUEBRA POR LOJA — reprodução da query oficial do dashboard
// "Quebra TOP 50 - Ranking" do Sankhya Om.
//
// FÓRMULA OFICIAL (sem invenção)
//   QTDCMV     = EI + RECEBIDO - EF
//   QTDQUEBRA  = QTDCMV - VENDAS - CONSUMO
//   VLRQUEBRA  = QTDQUEBRA * CUSTO_UNIT
//   PERC       = VLRQUEBRA / VLRVENDA * 100
//
// ============================================================================
// LIÇÕES QUE ESTE ARQUIVO CARREGA (todas medidas, não supostas)
//
// 1) INVENTÁRIO É PARCIAL E RODA EM ONDAS NO MESMO DIA
//    03-CR-GVT tem 7 inventários em 08/09 (um com 35 itens, outro com 88).
//    Usar MAX(DTINVENTARIO) traz UM deles e perde o resto. A regra é
//    último inventário POR PRODUTO: MAX(CODINV) por CODPARC+CODPROD.
//
// 2) TETO DE 5.000 LINHAS DO DbExplorerSP
//    Um UNION ALL com vendas+recebido+EI+EF+consumo estoura o teto e as
//    vendas vêm primeiro: EI e EF nunca chegam. A agregação TEM de ser no
//    SQL. A composição é pedida ordenada por impacto em R$ e cortada.
//
// 3) REGRA DO DONO (18/11/2026): EI ou EF ausente/zero conta como ZERO.
//    Não descartar o produto. Consequência honesta: item sem nenhuma ponta
//    de inventário gera % sem sentido; ele fica na lista com `valor` real
//    mas `perc_quebra_qtd = null` e `sem_inventario = true`.
//
// 4) CUSTO: AD_ITEINVENTARIO.CUSTO (custo real), com preço médio de venda
//    apenas como reserva. Só o preço de venda zerava itens sem giro e os
//    punha no topo com R$ 0.
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

    // ==================================================================
    // 19/11/2026 — CACHE DA COMPOSIÇÃO POR LOJA.
    //
    // O dono relatou "carregando a composição da loja…". MEDIDO: a
    // composição de UMA loja leva ~6 s (≈1.200 itens, várias agregações no
    // ERP). É rápido o bastante para não falhar, mas não é instantâneo como
    // o usuário espera ao clicar na loja.
    //
    // A composição de uma loja em um mês FECHADO não muda. Cache de 6 h com
    // chave por loja+período: a segunda abertura é imediata. O mês corrente
    // continua com o mesmo TTL curto (6 h) para não servir número velho.
    // ==================================================================
    const chaveLojaCache = lojaFiltro ? 'quebra_loja_v1_' + ano + '_' + mm + '_' + lojaFiltro : ''
    if (chaveLojaCache && String(q.forcar || '') !== '1') {
      try {
        const recC = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', {
          c: chaveLojaCache,
        })
        const geC = recC.getString('gerado_em') || ''
        const idadeC = geC ? new Date().getTime() - new Date(geC).getTime() : 1e12
        let pC = {}
        try {
          pC = JSON.parse(recC.getString('payload') || '{}')
        } catch (_) {}
        if (pC && pC.schema_quebra_loja === 1 && idadeC >= 0 && idadeC < 6 * 60 * 60 * 1000) {
          return e.json(
            200,
            Object.assign({}, pC, {
              do_cache: true,
              cache_idade_min: Math.round(idadeC / 60000),
            }),
          )
        }
      } catch (_) {
        /* sem cache */
      }
    }
    // limite de itens na composição: o DbExplorer corta em 5.000 linhas,
    // então pedimos só o que move o ponteiro (ordenado por impacto em R$)
    const limite = Math.min(Math.max(Number(q.limite) || 4000, 100), 4500)

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
        return { rows: rb.rows || [] }
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

    // último inventário POR PRODUTO antes do mês (estoque inicial)
    const EI_SUB =
      '(SELECT CBIN.CODPARC, IIN.CODPROD, MAX(CBIN.CODINV) AS CODINV ' +
      ' FROM SANKHYA.AD_CABINVENTARIO CBIN ' +
      ' JOIN SANKHYA.AD_ITEINVENTARIO IIN ON IIN.CODINV=CBIN.CODINV ' +
      " WHERE CBIN.STATUS='F' AND CBIN.DTINVENTARIO < " +
      iniMes +
      ' GROUP BY CBIN.CODPARC, IIN.CODPROD)'
    // último inventário POR PRODUTO dentro do mês (estoque final)
    const EF_SUB =
      '(SELECT CBIN.CODPARC, IIN.CODPROD, MAX(CBIN.CODINV) AS CODINV ' +
      ' FROM SANKHYA.AD_CABINVENTARIO CBIN ' +
      ' JOIN SANKHYA.AD_ITEINVENTARIO IIN ON IIN.CODINV=CBIN.CODINV ' +
      " WHERE CBIN.STATUS='F' AND CBIN.DTINVENTARIO BETWEEN " +
      iniMes +
      ' AND ' +
      fimMes +
      ' GROUP BY CBIN.CODPARC, IIN.CODPROD)'

    // BASE: EI FULL OUTER JOIN EF (ausente = 0) + venda por produto
    const BASE =
      'SELECT COALESCE(EI.CODPARC, EF.CODPARC) CODPARC, ' +
      ' COALESCE(EI.CODPROD, EF.CODPROD) CODPROD, ' +
      ' NVL(EI.QEI,0) QEI, NVL(EF.QEF,0) QEF, ' +
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

    // RECEBIDO (transferência de entrada) por loja+produto
    const REC_SUB =
      '(SELECT C.CODPARC, I.CODPROD, ' +
      "  SUM(CASE WHEN T.TIPMOV='V' THEN I.QTDNEG ELSE -I.QTDNEG END) Q " +
      ' FROM SANKHYA.TGFCAB C ' +
      ' JOIN SANKHYA.TGFITE I ON C.NUNOTA=I.NUNOTA ' +
      ' JOIN SANKHYA.TGFTOP T ON C.CODTIPOPER=T.CODTIPOPER AND C.DHTIPOPER=T.DHALTER ' +
      ' WHERE C.DTNEG BETWEEN ' +
      iniMes +
      ' AND ' +
      fimMes +
      "   AND C.STATUSNOTA='L' AND T.TIPMOV IN ('V','D') " +
      ' GROUP BY C.CODPARC, I.CODPROD)'

    // CONSUMO / quebra declarada
    const CON_SUB =
      '(SELECT CC.CODPARC, IT.CODPROD, SUM(IT.QUANTIDADE) Q ' +
      ' FROM SANKHYA.AD_CABCONSUMO CC ' +
      ' JOIN SANKHYA.AD_ITECONSUMO IT ON CC.CODCON=IT.CODCON ' +
      " WHERE CC.STATUS='F' AND CC.DTCONSUMO BETWEEN " +
      iniMes +
      ' AND ' +
      fimMes +
      ' GROUP BY CC.CODPARC, IT.CODPROD)'

    const CUSTO_EXPR = 'COALESCE(NULLIF(X.CUSTOINV,0), NVL(X.VLR,0) / NULLIF(X.QV,0))'
    const QB_EXPR = 'X.QEI + NVL(REC.Q,0) - X.QEF - NVL(X.QV,0) - NVL(CON.Q,0)'

    // ---- GRADE: uma linha por loja ----
    const sqlLoja =
      'SELECT X.CODPARC, ' +
      ' ROUND(SUM(NVL(X.VLR,0)),2) VENDA, ' +
      ' ROUND(SUM(X.QEI + NVL(REC.Q,0) - X.QEF),3) QTDCMV, ' +
      ' ROUND(SUM(' +
      CUSTO_EXPR +
      ' * NULLIF(' +
      QB_EXPR +
      ',0)),2) VLRQUEBRA, ' +
      ' COUNT(*) ITENS ' +
      'FROM (' +
      BASE +
      (lojaFiltro ? ' WHERE COALESCE(EI.CODPARC,EF.CODPARC) = ' + Number(lojaFiltro) + ' ' : '') +
      ') X ' +
      'LEFT JOIN ' +
      REC_SUB +
      ' REC ON REC.CODPARC=X.CODPARC AND REC.CODPROD=X.CODPROD ' +
      'LEFT JOIN ' +
      CON_SUB +
      ' CON ON CON.CODPARC=X.CODPARC AND CON.CODPROD=X.CODPROD ' +
      'GROUP BY X.CODPARC ORDER BY 4 DESC'

    // ---- COMPOSIÇÃO: uma linha por loja+produto, ordenada por impacto ----
    // `filtroLoja`: id único (opcional) | `lote`: array de CODPARC do lote
    const sqlProduto = function (filtroLoja, lote) {
      const filtroIn = lote && lote.length ? ' AND X.CODPARC IN (' + lote.join(',') + ') ' : ''
      return (
        'SELECT X.CODPARC, X.CODPROD, PR.DESCRPROD, ' +
        ' ROUND(NVL(X.QV,0),3) QVEND, ROUND(NVL(X.VLR,0),2) VENDA, ' +
        ' ROUND(X.QEI,3) QEI, ROUND(NVL(REC.Q,0),3) QREC, ROUND(X.QEF,3) QEF, ' +
        ' ROUND(NVL(CON.Q,0),3) QCONS, ' +
        ' ROUND(' +
        QB_EXPR +
        ',3) QTDCMV, ' +
        ' ROUND(' +
        QB_EXPR +
        ',3) QTDQUEBRA, ' +
        ' ROUND(' +
        CUSTO_EXPR +
        ',4) CUSTO, ' +
        ' ROUND(' +
        CUSTO_EXPR +
        ' * NULLIF(' +
        QB_EXPR +
        ',0),2) VLRQUEBRA ' +
        'FROM (' +
        BASE +
        (filtroLoja
          ? ' WHERE COALESCE(EI.CODPARC,EF.CODPARC) = ' + Number(filtroLoja) + ' '
          : lote && lote.length
            ? ' WHERE COALESCE(EI.CODPARC,EF.CODPARC) IN (' + lote.join(',') + ') '
            : '') +
        ') X ' +
        'LEFT JOIN SANKHYA.TGFPRO PR ON PR.CODPROD=X.CODPROD ' +
        'LEFT JOIN ' +
        REC_SUB +
        ' REC ON REC.CODPARC=X.CODPARC AND REC.CODPROD=X.CODPROD ' +
        'LEFT JOIN ' +
        CON_SUB +
        ' CON ON CON.CODPARC=X.CODPARC AND CON.CODPROD=X.CODPROD ' +
        (filtroLoja ? 'WHERE X.CODPARC = ' + Number(filtroLoja) + ' ' : '') +
        'ORDER BY ABS(' +
        CUSTO_EXPR +
        ' * NULLIF(' +
        QB_EXPR +
        ',0)) DESC NULLS LAST'
      )
    }

    const grade = rodar(sqlLoja)
    const falhas = {}
    if (grade.erro) falhas.grade = grade.erro

    const lojas = []
    for (const r of grade.rows || []) {
      const codparc = n(v(r, 0))
      const venda = n(v(r, 1)) || 0
      const qtdCmv = n(v(r, 2)) || 0
      const vlrQuebra = n(v(r, 3)) || 0
      const qtdQuebra = qtdCmv - venda
      lojas.push({
        codparc: codparc,
        vlr_venda: Number(venda.toFixed(2)),
        vlr_quebra: Number(vlrQuebra.toFixed(2)),
        qtd_quebra: Number(qtdQuebra.toFixed(0)),
        qtd_venda_possivel: Number(qtdCmv.toFixed(0)),
        itens: n(v(r, 4)) || 0,
        perc_quebra_venda: venda > 0 ? Number(((vlrQuebra / venda) * 100).toFixed(2)) : null,
        perc_quebra_qtd: qtdCmv > 0 ? Number(((qtdQuebra / qtdCmv) * 100).toFixed(2)) : null,
        produtos: [],
      })
    }

    // ==================================================================
    // COMPOSIÇÃO — mapa por loja, que é o formato que a tela lê
    // (`dados.quebra_produtos[codparc]`). Se `?loja=` vier, filtra uma só.
    // ==================================================================
    const itensPorLoja = {}
    let qtdProdutos = 0
    let qtdSemInv = 0

    // ==================================================================
    // CARGA SOB DEMANDA POR LOJA (18/11/2026)
    //
    // MEDIDO: buscar a composição de TODAS as 77 lojas (47.647 itens) levava
    // 67 segundos — a tela desistia antes de pintar. Não é limitação de SQL:
    // é volume. Compor 77 lojas de uma vez nunca será rápido neste gateway.
    //
    // SOLUÇÃO: a grade (77 linhas, ~6s) vem sempre; a composição vem só da
    // loja que o usuário ABRIU (`?loja=<codparc>`). É exatamente o que o
    // drilldown Rede → Bandeira → Loja → Produto já faz na tela: o dado só
    // é necessário quando alguém clica na loja.
    // ==================================================================
    let linhasComposicao = []
    if (lojaFiltro) {
      const d1 = rodar(sqlProduto(lojaFiltro, null))
      if (d1.erro) falhas.composicao = d1.erro
      linhasComposicao = d1.rows || []
    }

    for (const r of linhasComposicao) {
      const cpDet = String(n(v(r, 0)) || '')
      const qtdCmv = n(v(r, 9)) || 0
      const qtdQuebra = n(v(r, 10)) || 0
      const eiV = n(v(r, 5)) || 0
      const efV = n(v(r, 7)) || 0
      const semInv = eiV === 0 && efV === 0
      const vlrQb = n(v(r, 12)) || 0
      if (!itensPorLoja[cpDet]) itensPorLoja[cpDet] = []
      itensPorLoja[cpDet].push({
        codprod: n(v(r, 1)),
        produto: v(r, 2) || 'Produto ' + String(v(r, 1)),
        // 19/11/2026 — a coluna "Vendas" do popup aparecia VAZIA ("—") porque
        // o front lê `it.vendas` e o endpoint mandava `qtd_vendas`.
        // Mantenho os dois nomes: `vendas` para a tela e `qtd_vendas` para
        // quem já consome a API.
        qtd_vendas: n(v(r, 3)) || 0,
        vendas: n(v(r, 3)) || 0,
        vlr_venda: n(v(r, 4)) || 0,
        // % Quebra pela fórmula pedida pelo dono:
        //   % quebra = QTD QUEBRA / (EI + RECEBIDO - EF)
        //
        // 19/11/2026 — GUARDA DE HONESTIDADE (medida no dado real).
        // Sem a guarda, item SEM inventário gerava percentual absurdo:
        // BANANA PRATA VERDE com EI=0, EF=0, recebido≈106 e vendas 12.886
        // dava **-12.172%**. A base (EI+REC-EF) só existe quando o produto
        // FOI CONTADO; sem contagem, o recebimento por transferência não é
        // capturado e a conta não representa nada.
        // Regra: percentual só quando o produto tem ao menos uma ponta de
        // inventário E a base é positiva. Fora disso: null (a tela mostra —)
        // e o item continua na lista com o R$ real.
        perc_quebra_estoque: (function () {
          if (semInv) return null
          const base = eiV + (n(v(r, 6)) || 0) - efV
          if (!(base > 0)) return null
          const p = (qtdQuebra / base) * 100
          // variação acima de 100% da base indica estoque não capturado
          // (transferência ausente), não uma quebra real
          if (Math.abs(p) > 100) return null
          return Number(p.toFixed(2))
        })(),
        ei: eiV,
        recebido: n(v(r, 6)) || 0,
        ef: efV,
        consumo: n(v(r, 8)) || 0,
        qtd_cmv: Number(qtdCmv.toFixed(3)),
        qtd_quebra: Number(qtdQuebra.toFixed(3)),
        custo_unit: n(v(r, 11)) || 0,
        vlr_quebra: vlrQb,
        // o front usa `valor` para somar o total por loja
        valor: vlrQb,
        sem_inventario: semInv,
        perc_quebra_qtd:
          !semInv && qtdCmv > 0 ? Number(((qtdQuebra / qtdCmv) * 100).toFixed(2)) : null,
      })
      qtdProdutos++
      if (semInv) qtdSemInv++
    }
    for (const L of lojas) {
      L.produtos = itensPorLoja[String(L.codparc)] || []
    }

    const resp = {
      ok: true,
      periodo: 'Mês ' + mm + '/' + ano,
      cobertura: { lojas_com_quebra: lojas.length },
      // formato consumido pela tela: mapa codparc -> itens
      quebra_produtos: itensPorLoja,
      lojas: lojas,
    }
    if (qtdProdutos) {
      resp.cobertura_produtos = {
        total: qtdProdutos,
        com_inventario: qtdProdutos - qtdSemInv,
        sem_inventario: qtdSemInv,
        // aviso para o rodapé: a lista é cortada por impacto em R$
        limite_aplicado: limite,
        truncado: qtdProdutos >= limite,
      }
    }
    if (Object.keys(falhas).length) {
      resp.falhas = Object.keys(falhas).map(function (k) {
        return k + ': ' + falhas[k]
      })
    }

    // grava o cache da composição por loja (a próxima abertura é imediata)
    if (chaveLojaCache) {
      try {
        resp.schema_quebra_loja = 1
        const colQ = $app.findCollectionByNameOrId('sankhya_cache')
        let recQ = null
        try {
          recQ = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', {
            c: chaveLojaCache,
          })
        } catch (_) {
          recQ = null
        }
        if (!recQ) {
          recQ = new Record(colQ)
          recQ.set('chave', chaveLojaCache)
        }
        recQ.set('payload', JSON.stringify(resp))
        recQ.set('gerado_em', new Date().toISOString())
        $app.save(recQ)
      } catch (errQ) {
        console.log('[varejo/quebra] cache loja: ' + String(errQ).slice(0, 120))
      }
    }

    try {
      console.log(
        '[varejo/quebra] ' +
          mm +
          '/' +
          ano +
          ' lojas=' +
          lojas.length +
          ' itens=' +
          qtdProdutos +
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
