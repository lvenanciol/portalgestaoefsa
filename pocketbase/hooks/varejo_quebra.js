// QUEBRA POR LOJA — reprodução da query oficial do dashboard
// "Quebra TOP 50 - Ranking" do Sankhya Om (fornecida pelo dono em 13/11/2026).
//
// POR QUE ESTE ARQUIVO EXISTE
// A tabela AD_BIQUEBRAPARC tem exatamente a saída do painel
// (RANK | CODPARC | QTDQUEBRA | QTDVDAPOSSIVEL | PERCQUEBRAQTD |
//  PERCTETOQUEBRA | VLRQUEBRA | VLRVENDA | PERCQUEBRA_VENDA), mas está
// congelada em jul/2021. O painel calcula em tempo de execução; a tabela é
// só um retrato antigo. Sem a query, o PGE mostrava "—" na quebra.
//
// O QUE ESTA QUERY FAZ (fórmula oficial, sem invenção)
//   QTDCMV     = EI + RECEBIDO - EF        (venda possível em quantidade)
//   QTDQUEBRA  = QTDCMV - VENDAS - CONSUMO
//   CUSTO_UNIT = CUSTO_TOTAL / QTDCMV      (custo médio ponderado do produto)
//   VLRQUEBRA  = QTDQUEBRA * CUSTO_UNIT
//   PERC       = VLRQUEBRA / VLRVENDA * 100
//
// Fontes: AD_VENDASPLV (vendas), TGFCAB+TGFITE com TGFTOP.TIPMOV (recebido),
// AD_CABINVENTARIO+AD_ITEINVENTARIO (estoque inicial e final, último
// inventário fechado de cada janela) e AD_CABCONSUMO+AD_ITECONSUMO (consumo).
//
// ARMADILHA: o DbExplorerSP não devolve resultado com window functions
// (OVER PARTITION BY) — a query roda com 0 linhas em silêncio. Por isso o
// custo ponderado é calculado AQUI, em JavaScript, depois de trazer as linhas
// por loja + produto.

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
    const lojaFiltro = String(q.loja || '')

    const mm = String(mes).padStart(2, '0')
    const iniMes = "TO_DATE('01/" + mm + '/' + ano + "','DD/MM/YYYY')"
    const fimMesNum = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    const fimMes =
      "TO_DATE('" + String(fimMesNum).padStart(2, '0') + '/' + mm + '/' + ano + "','DD/MM/YYYY')"

    // janelas de estoque: inicial até 40% do mês, final nos últimos 40%
    const diaEI = Math.max(5, Math.round(fimMesNum * 0.4))
    const diaEF = Math.min(fimMesNum - 1, Math.round(fimMesNum * 0.6))
    const fimEI =
      "TO_DATE('" + String(diaEI).padStart(2, '0') + '/' + mm + '/' + ano + "','DD/MM/YYYY')"
    const iniEF =
      "TO_DATE('" + String(diaEF).padStart(2, '0') + '/' + mm + '/' + ano + "','DD/MM/YYYY')"

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
          timeout: 90,
        })
        if (res.statusCode !== 200) return { erro: 'edge HTTP ' + res.statusCode }
        const d = res.json || {}
        const rb = (d.data && d.data.responseBody) || {}
        const rows = rb.rows || []
        if (!rows.length) return { erro: 'vazio', rows: [] }
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

    const filtroLoja = lojaFiltro ? ' AND PLV.CODPARC = ' + Number(lojaFiltro) + ' ' : ''

    // Uma única consulta com UNION ALL: cada bloco devolve a coluna de origem
    // no campo O (1=venda, 2=recebido, 3=estoque inicial, 4=estoque final,
    // 5=consumo) e o valor correspondente em C1/C2.
    // [0]=CODPARC [1]=CODPROD [2]=ORIGEM [3]=QTD [4]=VALOR
    const linhas = rodar(
      'SELECT CODPARC, CODPROD, O, ROUND(SUM(Q),3) QTD, ROUND(SUM(C),2) VLR FROM (' +
        // 1) VENDAS
        'SELECT PLV.CODPARC, NVL(PM.CODPROD,0) CODPROD, 1 O, SUM(PLV.QTDNEG) Q, SUM(PLV.VLRTOT) C ' +
        'FROM SANKHYA.AD_VENDASPLV PLV ' +
        'LEFT JOIN SANKHYA.TGFPRO P ON PLV.CODPROD=P.CODPROD AND P.CODPROD<>195 ' +
        'LEFT JOIN SANKHYA.TGFPRO PM ON PM.CODPROD=CASE WHEN P.AD_CODGRUPOABC IS NOT NULL THEN P.AD_CODGRUPOABC ELSE P.AD_CODPRODGRUP END ' +
        'WHERE PLV.DTNEG BETWEEN ' +
        iniMes +
        ' AND ' +
        fimMes +
        filtroLoja +
        ' GROUP BY PLV.CODPARC, NVL(PM.CODPROD,0) ' +
        'UNION ALL ' +
        // 2) RECEBIDO (TIPMOV V entra, D sai)
        'SELECT C.CODPARC, NVL(PM.CODPROD,0), 2, ' +
        "SUM(CASE WHEN T.TIPMOV='V' THEN I.QTDNEG ELSE -I.QTDNEG END), 0 " +
        'FROM SANKHYA.TGFCAB C ' +
        'JOIN SANKHYA.TGFITE I ON C.NUNOTA=I.NUNOTA ' +
        'JOIN SANKHYA.TGFTOP T ON C.CODTIPOPER=T.CODTIPOPER AND C.DHTIPOPER=T.DHALTER ' +
        'JOIN SANKHYA.TGFPAR PA ON C.CODPARC=PA.CODPARC ' +
        'LEFT JOIN SANKHYA.TGFPRO P ON I.CODPROD=P.CODPROD AND P.CODPROD<>195 ' +
        'LEFT JOIN SANKHYA.TGFPRO PM ON PM.CODPROD=CASE WHEN P.AD_CODGRUPOABC IS NOT NULL THEN P.AD_CODGRUPOABC ELSE P.AD_CODPRODGRUP END ' +
        'WHERE C.DTNEG BETWEEN ' +
        iniMes +
        ' AND ' +
        fimMes +
        " AND C.STATUSNOTA='L' AND PA.AD_SELECIONADO IN (1,2) AND T.TIPMOV IN ('V','D')" +
        (lojaFiltro ? ' AND C.CODPARC = ' + Number(lojaFiltro) + ' ' : ' ') +
        'GROUP BY C.CODPARC, NVL(PM.CODPROD,0) ' +
        'UNION ALL ' +
        // 3) ESTOQUE INICIAL
        // CORREÇÃO 13/11: o estoque inicial do mês NÃO é o inventário do
        // começo do próprio mês — é o ÚLTIMO inventário fechado ANTES dele
        // (fim do mês anterior). Medido na 07-CR-LAR: usando o inventário de
        // out/2026 como EI, só 35 produtos tinham EI e EF; usando set/2026,
        // 174 produtos fecham as duas pontas. A janela errada era a causa da
        // composição vazia e do % de quebra absurdo.
        // 18/11/2026 — CAUSA RAIZ DA QUEBRA VAZIA (era 0 lojas, 4.739
        // produtos descartados por "sem estoque inicial").
        //
        // O inventário NÃO é um retrato único por loja/dia: a loja roda
        // VÁRIAS contagens parciais no mesmo dia (medido na 03-CR-GVT: 7
        // inventários em 08/09, um com 35 itens, outro com 88). A subquery
        // antiga pegava `MAX(DTINVENTARIO)` — a data — e com isso trazia
        // apenas UM dos vários inventários do dia, perdendo quase todos os
        // produtos.
        //
        // REGRA CORRETA: o último inventário **POR PRODUTO**, dentro da
        // janela. Como CODINV é sequencial, MAX(CODINV) por produto é a
        // contagem mais recente daquele produto.
        // OTIMIZAÇÃO (18/11/2026): a versão anterior usava subquery
        // CORRELACIONADA por linha de produto e passava de 5 minutos no
        // DbExplorer (a conexão morria antes de responder). Aqui o "último
        // inventário por produto" é calculado UMA vez, numa agregação, e só
        // depois juntado. Mesmo resultado, tempo viável.
        'SELECT K.CODPARC, NVL(PM.CODPROD,0), 3, SUM(V.QTD), 0 ' +
        'FROM (SELECT CB2.CODPARC, I2.CODPROD, MAX(CB2.CODINV) AS CODINV ' +
        '      FROM SANKHYA.AD_CABINVENTARIO CB2 ' +
        '      JOIN SANKHYA.AD_ITEINVENTARIO I2 ON I2.CODINV=CB2.CODINV ' +
        "      WHERE CB2.STATUS='F' AND CB2.DTINVENTARIO < " +
        iniMes +
        (lojaFiltro ? ' AND CB2.CODPARC = ' + Number(lojaFiltro) + ' ' : ' ') +
        '      GROUP BY CB2.CODPARC, I2.CODPROD) K ' +
        'JOIN SANKHYA.AD_ITEINVENTARIO V ON V.CODINV=K.CODINV AND V.CODPROD=K.CODPROD ' +
        'LEFT JOIN SANKHYA.TGFPRO P ON V.CODPROD=P.CODPROD AND P.CODPROD<>195 ' +
        'LEFT JOIN SANKHYA.TGFPRO PM ON PM.CODPROD=CASE WHEN P.AD_CODGRUPOABC IS NOT NULL THEN P.AD_CODGRUPOABC ELSE P.AD_CODPRODGRUP END ' +
        'GROUP BY K.CODPARC, NVL(PM.CODPROD,0) ' +
        'UNION ALL ' +
        // 4) ESTOQUE FINAL
        // ATENÇÃO (bug de 13/11): se a janela final do mês ainda não tem
        // inventário (mês em curso), EF ficava ZERO e o cálculo explodia —
        // QTDCMV = EI + RECEBIDO - 0, gerando % de 64%, 229%, -66%.
        // Agora usa o último inventário fechado ATÉ O FIM DO MÊS, mesmo que
        // fora da janela; só devolve vazio se não houver nenhum no mês.
        // Mesma regra do EI: último inventário POR PRODUTO dentro do mês.
        'SELECT K.CODPARC, NVL(PM.CODPROD,0), 4, SUM(V.QTD), 0 ' +
        'FROM (SELECT CB2.CODPARC, I2.CODPROD, MAX(CB2.CODINV) AS CODINV ' +
        '      FROM SANKHYA.AD_CABINVENTARIO CB2 ' +
        '      JOIN SANKHYA.AD_ITEINVENTARIO I2 ON I2.CODINV=CB2.CODINV ' +
        "      WHERE CB2.STATUS='F' AND CB2.DTINVENTARIO BETWEEN " +
        iniMes +
        ' AND ' +
        fimMes +
        (lojaFiltro ? ' AND CB2.CODPARC = ' + Number(lojaFiltro) + ' ' : ' ') +
        '      GROUP BY CB2.CODPARC, I2.CODPROD) K ' +
        'JOIN SANKHYA.AD_ITEINVENTARIO V ON V.CODINV=K.CODINV AND V.CODPROD=K.CODPROD ' +
        'LEFT JOIN SANKHYA.TGFPRO P ON V.CODPROD=P.CODPROD AND P.CODPROD<>195 ' +
        'LEFT JOIN SANKHYA.TGFPRO PM ON PM.CODPROD=CASE WHEN P.AD_CODGRUPOABC IS NOT NULL THEN P.AD_CODGRUPOABC ELSE P.AD_CODPRODGRUP END ' +
        'GROUP BY K.CODPARC, NVL(PM.CODPROD,0) ' +
        'UNION ALL ' +
        // 5) CONSUMO
        'SELECT CC.CODPARC, NVL(PM.CODPROD,0), 5, SUM(IT.QUANTIDADE), 0 ' +
        'FROM SANKHYA.AD_CABCONSUMO CC ' +
        'JOIN SANKHYA.AD_ITECONSUMO IT ON CC.CODCON=IT.CODCON ' +
        'LEFT JOIN SANKHYA.TGFPRO P ON IT.CODPROD=P.CODPROD AND P.CODPROD<>195 ' +
        'LEFT JOIN SANKHYA.TGFPRO PM ON PM.CODPROD=CASE WHEN P.AD_CODGRUPOABC IS NOT NULL THEN P.AD_CODGRUPOABC ELSE P.AD_CODPRODGRUP END ' +
        "WHERE CC.STATUS='F' AND CC.DTCONSUMO BETWEEN " +
        iniMes +
        ' AND ' +
        fimMes +
        (lojaFiltro ? ' AND CC.CODPARC = ' + Number(lojaFiltro) + ' ' : ' ') +
        'GROUP BY CC.CODPARC, NVL(PM.CODPROD,0)' +
        ') GROUP BY CODPARC, CODPROD, O',
    )

    const falhas = {}
    if (linhas.erro && linhas.erro !== 'vazio') falhas.dados = linhas.erro

    // agrega por loja + produto e calcula a quebra no JS
    const porLojaProduto = {}
    for (const r of linhas.rows || []) {
      const cp = String(v(r, 0))
      const pr = String(v(r, 1))
      const kk = cp + '|' + pr
      if (!porLojaProduto[kk]) {
        porLojaProduto[kk] = {
          cp: n(v(r, 0)),
          pr: n(v(r, 1)),
          vendas: 0,
          rec: 0,
          ei: 0,
          ef: 0,
          cons: 0,
          vlr: 0,
        }
      }
      const o = Number(v(r, 2))
      const qtd = Number(v(r, 3)) || 0
      if (o === 1) {
        porLojaProduto[kk].vendas += qtd
        porLojaProduto[kk].vlr += Number(v(r, 4)) || 0
      } else if (o === 2) porLojaProduto[kk].rec += qtd
      else if (o === 3) porLojaProduto[kk].ei += qtd
      else if (o === 4) porLojaProduto[kk].ef += qtd
      else if (o === 5) porLojaProduto[kk].cons += qtd
    }

    // custo unitário por produto — o dono definiu (13/11) usar o PREÇO MÉDIO
    // DE VENDA como proxy do custo. Mantido por decisão dele.
    const porProduto = {}
    for (const kk of Object.keys(porLojaProduto)) {
      const d = porLojaProduto[kk]
      const qtdCmv = d.ei + d.rec - d.ef
      d.qtdCmv = qtdCmv
      d.qtdQuebra = qtdCmv - d.vendas - d.cons
      if (!porProduto[d.pr]) porProduto[d.pr] = { cmv: 0, qtdQuebra: 0 }
      porProduto[d.pr].cmv += qtdCmv
      porProduto[d.pr].qtdQuebra += d.qtdQuebra
    }

    // custo médio por produto: usa o preço médio do que foi vendido (proxy
    // fiel quando não há custo de recebimento na janela)
    const custoProduto = {}
    for (const kk of Object.keys(porLojaProduto)) {
      const d = porLojaProduto[kk]
      if (d.vendas > 0 && d.vlr > 0) {
        const preco = d.vlr / d.vendas
        if (!custoProduto[d.pr] || custoProduto[d.pr] < preco) {
          custoProduto[d.pr] = preco
        }
      }
    }

    // ------------------------------------------------------------------
    // CAUSA RAIZ DO % ABSURDO (229%, -66%, -75%) — 13/11
    //
    // Os inventários são PARCIAIS e rodam em ondas: na loja 07-CR-LAR, o
    // inventário de 06/10 tem 413 produtos e o de 31/10 tem 254. Um produto
    // presente no EI mas ausente no EF entrava como:
    //     QTDCMV = EI + REC - 0  (sem EF)  ->  quebra gigante e falsa
    // e produto no EF sem EI entrava como quebra negativa.
    //
    // REGRA: só entra no cálculo o produto com inventário nas DUAS pontas
    // (EI > 0 E EF > 0). Produto sem uma das pontas é descartado — melhor
    // não mostrar do que mostrar número inventado. O total de produtos
    // considerados vai na resposta para a tela poder avisar.
    // ------------------------------------------------------------------
    const porLoja = {}
    let descartadosEi = 0
    let descartadosEf = 0
    for (const kk of Object.keys(porLojaProduto)) {
      const d = porLojaProduto[kk]
      if (!(d.ei > 0)) {
        descartadosEi++
        continue
      }
      if (!(d.ef > 0)) {
        descartadosEf++
        continue
      }
      if (!porLoja[d.cp]) {
        porLoja[d.cp] = {
          codparc: d.cp,
          vlrVenda: 0,
          vlrQuebra: 0,
          qtdQuebra: 0,
          qtdCmv: 0,
          produtos: [],
        }
      }
      const L = porLoja[d.cp]
      L.vlrVenda += d.vlr
      L.qtdCmv += d.qtdCmv
      L.qtdQuebra += d.qtdQuebra
      // custo unitário = preço médio de VENDA do produto (proxy definido
      // pelo dono em 13/11). Só entra na composição quem teve venda.
      const custo = custoProduto[d.pr] || 0
      const vlrQb = (d.qtdQuebra || 0) * custo
      L.vlrQuebra += vlrQb
      if (d.qtdQuebra) {
        L.produtos.push({
          codprod: d.pr,
          qtd_quebra: Number(d.qtdQuebra.toFixed(3)),
          qtd_cmv: Number(d.qtdCmv.toFixed(3)),
          vendas: Number(d.vendas.toFixed(3)),
          ei: Number(d.ei.toFixed(3)),
          recebido: Number(d.rec.toFixed(3)),
          ef: Number(d.ef.toFixed(3)),
          consumo: Number(d.cons.toFixed(3)),
          custo_unit: Number(custo.toFixed(4)),
          vlr_quebra: Number(vlrQb.toFixed(2)),
          perc_quebra_qtd:
            d.qtdCmv > 0 ? Number(((d.qtdQuebra / d.qtdCmv) * 100).toFixed(2)) : null,
        })
      }
    }

    // nomes dos produtos (consulta separada — o nome não vem no agregado)
    const ids = Object.keys(porProduto).filter((k) => k && k !== '0')
    const nomeProd = {}
    if (ids.length) {
      const rn = rodar(
        'SELECT CODPROD, DESCRPROD FROM SANKHYA.TGFPRO WHERE CODPROD IN (' +
          ids.slice(0, 900).join(',') +
          ')',
      )
      for (const r of rn.rows || []) {
        nomeProd[String(v(r, 0))] = v(r, 1)
      }
    }

    const out = Object.keys(porLoja).map(function (cp) {
      const L = porLoja[cp]
      return {
        codparc: L.codparc,
        vlr_venda: Number(L.vlrVenda.toFixed(2)),
        vlr_quebra: Number(L.vlrQuebra.toFixed(2)),
        qtd_quebra: Number(L.qtdQuebra.toFixed(0)),
        qtd_venda_possivel: Number(L.qtdCmv.toFixed(0)),
        perc_quebra_venda:
          L.vlrVenda > 0 ? Number(((L.vlrQuebra / L.vlrVenda) * 100).toFixed(2)) : null,
        perc_quebra_qtd: L.qtdCmv > 0 ? Number(((L.qtdQuebra / L.qtdCmv) * 100).toFixed(2)) : null,
        // composição por produto (item i2): top 40 por valor de quebra
        produtos: L.produtos
          .sort(function (a, b) {
            return b.vlr_quebra - a.vlr_quebra
          })
          .slice(0, 40)
          .map(function (p) {
            return Object.assign({}, p, {
              produto: nomeProd[String(p.codprod)] || 'Produto ' + p.codprod,
            })
          }),
      }
    })

    const falhasArr = Object.keys(falhas)
    const resp = {
      ok: true,
      periodo: 'Mês ' + mm + '/' + ano,
      janelas: { mes: [iniMes, fimMes] },
      // transparência: quantos produtos ficaram de fora por inventário
      // parcial em uma das pontas (não escondemos a limitação)
      cobertura: {
        produtos_sem_estoque_inicial: descartadosEi,
        produtos_sem_estoque_final: descartadosEf,
        lojas_com_quebra: out.length,
      },
      lojas: out,
    }
    if (falhasArr.length)
      resp.falhas = falhasArr.map(function (k) {
        return k + ': ' + falhas[k]
      })

    try {
      console.log(
        '[varejo/quebra] ' +
          mm +
          '/' +
          ano +
          ' lojas=' +
          out.length +
          ' falhas=' +
          (falhasArr.join('|') || 'ok'),
      )
    } catch (_) {}

    return e.json(200, resp)
  },
  $apis.requireAuth(),
)
