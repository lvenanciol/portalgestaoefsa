/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// COMPOSIÇÃO POR CANAIS (19/11/2026)
//
// DIRETIVA DO DONO: ao clicar no card Faturamento (e no card CMV), abrir uma
// tela com a composição POR CANAL — Atacado, Distribuição e Varejo — com
// Canal | Meta [R$] | Realizado [R$] | % Meta | % A.A.
//
// REGRA DE CANAIS (definida pelo dono em 18/11/2026, vale para esta tela):
//   ATACADO      = TGFCAB com CODEMP = 1
//   DISTRIBUIÇÃO = TGFCAB com CODEMP IN (4,10) E AD_SELECIONADO NOT IN (1,2)
//                  ("tudo o que as empresas 4 e 10 vendem, exceto Carone e
//                   Coutinho" — o corte das redes é pelo AD_SELECIONADO do
//                   PARCEIRO, não por empresa)
//   VAREJO       = NUNCA por TGFCAB: AD_VENDASPLV com AD_SELECIONADO IN (1,2)
//                  (é a base do Power BI "Acompanhamento Varejo")
//
// MEDIDO out/2026 (para conferência):
//   Atacado       R$  18.326.857
//   Distribuição  R$ 142.722.945
//   Varejo        R$  59.587.828
//
// No CMV a mesma estrutura vale: o varejo usa a CMV do "Resumo Lojas"
// (AD_RESUMOLOJAS.CMVACUM), que é a fonte do BI; atacado e distribuição
// saem do custo dos itens na TGFITE.
// ============================================================================

routerAdd(
  'GET',
  '/backend/v1/varejo/canais',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const h = new Date()
    const ano = Number(q.ano || h.getUTCFullYear())
    const mes = Number(q.mes || h.getUTCMonth() + 1)
    const metrica = String(q.metrica || 'faturamento') // faturamento | cmv

    const mm = String(mes).padStart(2, '0')
    const iniMes = "TO_DATE('01/" + mm + '/' + ano + "','DD/MM/YYYY')"
    const fimMesNum = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    // 19/11/2026 — LIMITE SUPERIOR EXCLUSIVO.
    // Eu usava `BETWEEN iniMes AND fimMes` com fimMes = dia 31. Em TGFCAB a
    // DTNEG tem hora: uma nota emitida em 31/10 às 14h é MAIOR que
    // TO_DATE('31/10/2026') (que é 00:00) e ficava fora — e as consultas de
    // atacado/distribuição voltavam ZERO. Uso `< primeiro dia do mês seguinte`.
    const proxMesNum = mes === 12 ? 1 : mes + 1
    const proxAnoNum = mes === 12 ? ano + 1 : ano
    const proxMM = String(proxMesNum).padStart(2, '0')
    const fimMes = "TO_DATE('01/" + proxMM + '/' + proxAnoNum + "','DD/MM/YYYY')"
    // mesmo período do ano anterior, para o % A.A.
    const iniAA = "TO_DATE('01/" + mm + '/' + (ano - 1) + "','DD/MM/YYYY')"
    const fimAA = "TO_DATE('01/" + proxMM + '/' + (ano - 1) + "','DD/MM/YYYY')"

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

    // ---- expressões de valor conforme a métrica pedida ----
    //
    // ARMADILHA MEDIDA 19/11: `SUM(C.VLRNOTA)` com JOIN em TGFITE multiplica
    // o valor pelo número de itens da nota. O atacado de out/2026 dava
    // R$ 118 milhões em vez de R$ 18,3 milhões — 6,5x, exatamente a média de
    // itens por nota. VLRNOTA é do CABEÇALHO: somar a nota exige ou uma
    // subquery por NUNOTA, ou somar direto na TGFCAB sem o join.
    // CUSTO existe por ITEM (TGFITE.VLRCUSTO), então no CMV o join é correto.
    const campoValor = metrica === 'cmv' ? 'NVL(I.VLRCUSTO,0)' : 'NVL(C.VLRNOTA,0)'
    // no faturamento a consulta NÃO faz join com TGFITE (ver sqlEmpresas)
    const precisaJoinItem = metrica === 'cmv'

    // ATACADO + DISTRIBUIÇÃO (TGFCAB), com o corte de redes na distribuição
    const sqlEmpresas = function (filtroEmp, filtroRedes) {
      return (
        'SELECT NVL(SUM(' +
        campoValor +
        '),0) VLR, COUNT(DISTINCT C.NUMNOTA) NOTAS ' +
        'FROM SANKHYA.TGFCAB C ' +
        (precisaJoinItem ? 'JOIN SANKHYA.TGFITE I ON I.NUNOTA=C.NUNOTA ' : '') +
        'LEFT JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        iniMes +
        ' AND C.DTNEG < ' +
        fimMes +
        "  AND C.STATUSNOTA='L' " +
        '  AND C.CODEMP IN (' +
        filtroEmp +
        ') ' +
        filtroRedes
      )
    }
    const sqlEmpresasAA = function (filtroEmp, filtroRedes) {
      return (
        'SELECT NVL(SUM(' +
        campoValor +
        '),0) VLR ' +
        'FROM SANKHYA.TGFCAB C ' +
        (precisaJoinItem ? 'JOIN SANKHYA.TGFITE I ON I.NUNOTA=C.NUNOTA ' : '') +
        'LEFT JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        iniAA +
        ' AND C.DTNEG < ' +
        fimAA +
        "  AND C.STATUSNOTA='L' " +
        '  AND C.CODEMP IN (' +
        filtroEmp +
        ') ' +
        filtroRedes
      )
    }

    const REDES_FORA = ' AND NVL(P.AD_SELECIONADO,0) NOT IN (1,2) '

    // VAREJO — base do BI (AD_VENDASPLV); CMV vem do Resumo Lojas
    const sqlVarejo = function (ini, fim) {
      return (
        'SELECT NVL(SUM(PLV.' +
        (metrica === 'cmv' ? 'VLRTOT_ECO' : 'VLRTOT') +
        '),0) VLR ' +
        'FROM SANKHYA.AD_VENDASPLV PLV ' +
        'INNER JOIN SANKHYA.TGFPAR PAR ON PAR.CODPARC=PLV.CODPARC ' +
        'WHERE PLV.DTNEG >= ' +
        ini +
        ' AND PLV.DTNEG < ' +
        fim +
        '  AND PAR.AD_SELECIONADO IN (1,2) AND PLV.CODPARC NOT IN (36,37,6959) ' +
        '  AND PLV.VLRTOT > 0'
      )
    }
    // CMV do varejo: Resumo Lojas é a fonte oficial (decisão do dono)
    const sqlCmvResumo = function (anoRef, mesRef) {
      return (
        'SELECT NVL(SUM(CMVACUM),0) VLR FROM SANKHYA.AD_RESUMOLOJAS ' +
        'WHERE ANO = ' +
        anoRef +
        ' AND TO_NUMBER(MES) = ' +
        mesRef
      )
    }

    const out = { ok: true, periodo: 'Mês ' + mm + '/' + ano, metrica: metrica, canais: [] }

    // --- ATACADO ---
    const at = rodar(sqlEmpresas('1', ''))
    const atAA = rodar(sqlEmpresasAA('1', ''))
    // --- DISTRIBUIÇÃO (exceto Carone e Coutinho) ---
    const di = rodar(sqlEmpresas('4,10', REDES_FORA))
    const diAA = rodar(sqlEmpresasAA('4,10', REDES_FORA))
    // --- VAREJO ---
    const va = rodar(sqlVarejo(iniMes, fimMes))
    const vaAA = rodar(sqlVarejo(iniAA, fimAA))
    // CMV do varejo (Resumo Lojas)
    let vaCmv = null
    let vaCmvAA = null
    if (metrica === 'cmv') {
      const r1 = rodar(sqlCmvResumo(ano, mes))
      const r2 = rodar(sqlCmvResumo(ano - 1, mes))
      vaCmv = n(v((r1.rows || [])[0] || null, 0)) || 0
      vaCmvAA = n(v((r2.rows || [])[0] || null, 0)) || 0
    }

    // 19/11/2026 — BUG: eu passava o RESULTADO ({rows:[...]}) para `mk`, que
    // espera a LINHA. `v({rows:...}, 0)` devolvia undefined e todos os canais
    // saíam zerados. Aqui extraio a primeira linha, quando houver.
    const primeiraLinha = function (res) {
      const rows = (res && res.rows) || []
      return rows.length ? rows[0] : null
    }
    const mk = function (nome, cur, aa, cmvCur, cmvAA) {
      const realizado =
        cmvCur !== undefined && cmvCur !== null ? cmvCur : n(v(primeiraLinha(cur), 0)) || 0
      const anterior =
        cmvAA !== undefined && cmvAA !== null ? cmvAA : n(v(primeiraLinha(aa), 0)) || 0
      return {
        canal: nome,
        meta: null, // meta por canal não existe no Sankhya hoje — fica "—"
        realizado: Number(realizado.toFixed(2)),
        anterior: Number(anterior.toFixed(2)),
        variacao_aa:
          anterior > 0 ? Number((((realizado - anterior) / anterior) * 100).toFixed(2)) : null,
        perc_meta: null, // depende da meta por canal (não parametrizada)
      }
    }

    out.canais = [
      mk('Atacado', at, atAA),
      mk('Distribuição', di, diAA),
      mk(
        'Varejo',
        va,
        vaAA,
        metrica === 'cmv' ? vaCmv : undefined,
        metrica === 'cmv' ? vaCmvAA : undefined,
      ),
    ]
    out.total = {
      realizado: Number(
        out.canais
          .reduce(function (a, c) {
            return a + (c.realizado || 0)
          }, 0)
          .toFixed(2),
      ),
      anterior: Number(
        out.canais
          .reduce(function (a, c) {
            return a + (c.anterior || 0)
          }, 0)
          .toFixed(2),
      ),
    }
    // transparência: % Meta não é exibido porque a meta por canal não existe
    out.obs_meta =
      'Meta por canal não está parametrizada no Sankhya. O % Meta fica vazio em vez de estimado.'

    const falhas = []
    if (at.erro) falhas.push('atacado: ' + at.erro)
    if (di.erro) falhas.push('distribuicao: ' + di.erro)
    if (va.erro) falhas.push('varejo: ' + va.erro)
    if (falhas.length) out.falhas = falhas

    try {
      console.log(
        '[varejo/canais] ' + metrica + ' ' + mm + '/' + ano + ' canais=' + out.canais.length,
      )
    } catch (_) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
