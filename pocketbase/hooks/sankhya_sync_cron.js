// Fechamento de gaps (verificação 19/10) — Sync Sankhya INCREMENTAL:
// guarda watermark (última data sincronizada) em sankhya_cache e nas rodadas
// seguintes só refaz os meses >= watermark (janela deslizante de 3 meses para
// segurança de retificações); primeira execução = full 12m.
// Chave do watermark: 'financeiro_watermark' (gerado_em da última rodada OK).

cronAdd('sankhya_sync_diario', '0 9 * * *', () => {
  const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
  const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
  const falhas = []

  if (!edgeUrl || !edgeSecret) {
    falhas.push('Proxy não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).')
  }

  // watermark: janela incremental = meses desde a última sync OK (mín 3, máx 12)
  let mesesJanela = 12
  let incremental = false
  let wmRec = null
  try {
    wmRec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
    const ult = wmRec.getString('gerado_em') || ''
    if (ult) {
      const dias = (Date.now() - new Date(ult.replace(' ', 'T') + 'Z').getTime()) / 86400000
      if (dias >= 0 && dias < 400) {
        mesesJanela = Math.min(12, Math.max(3, Math.ceil(dias / 30) + 1))
        incremental = true
      }
    }
  } catch (_) {}

  const W = "ADD_MONTHS(TRUNC(SYSDATE,'MM'),-" + mesesJanela + ')'
  const SQLS = {
    empresas: 'SELECT CODEMP, RAZAOABREV FROM SANKHYA.TSIEMP ORDER BY CODEMP',
    fat:
      "SELECT TO_CHAR(DTNEG,'YYYY-MM') MES, CODEMP, SUM(VLRNOTA) TOT FROM TGFCAB WHERE DTNEG >= " +
      W +
      " AND STATUSNOTA='L' GROUP BY TO_CHAR(DTNEG,'YYYY-MM'), CODEMP ORDER BY 1",
    ap_mensal:
      "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
      W +
      " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
    ar_mensal:
      "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
      W +
      " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
    ap_aging:
      "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
      W +
      " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
    ar_aging:
      "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
      W +
      " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
    ap_top:
      'SELECT * FROM (SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
      W +
      ' GROUP BY p.NOMEPARC ORDER BY SUM(f.VLRDESDOB) DESC) WHERE ROWNUM <= 5',
    ar_top:
      'SELECT * FROM (SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
      W +
      ' GROUP BY p.NOMEPARC ORDER BY SUM(f.VLRDESDOB) DESC) WHERE ROWNUM <= 5',
    fluxo:
      "SELECT TO_CHAR(DHBAIXA,'YYYY-MM') MES, SUM(CASE WHEN RECDESP=1 THEN VLRDESDOB ELSE 0 END) ENT, SUM(CASE WHEN RECDESP=-1 THEN VLRDESDOB ELSE 0 END) SAI FROM TGFFIN WHERE DHBAIXA IS NOT NULL AND DHBAIXA >= " +
      W +
      " GROUP BY TO_CHAR(DHBAIXA,'YYYY-MM') ORDER BY 1",
    ap_por_empresa:
      'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
      W +
      ' GROUP BY e.CODEMP, e.RAZAOABREV ORDER BY 3 DESC',
    ar_por_empresa:
      'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
      W +
      ' GROUP BY e.CODEMP, e.RAZAOABREV ORDER BY 3 DESC',
  }

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

  const chaves = [
    'empresas',
    'fat',
    'ap_mensal',
    'ar_mensal',
    'ap_aging',
    'ar_aging',
    'ap_top',
    'ar_top',
    'fluxo',
    'ap_por_empresa',
    'ar_por_empresa',
  ]
  const dados = {}
  for (let i = 0; i < chaves.length; i++) {
    const k = chaves[i]
    if (falhas.length && !edgeUrl) {
      dados[k] = []
      continue
    }
    const r = rodar(SQLS[k])
    if (r.erro) {
      falhas.push(k + ': ' + r.erro)
      dados[k] = []
    } else {
      dados[k] = r.rows
    }
  }

  // merge incremental: se incremental, mescla com o snapshot anterior (meses fora da janela vêm do cache)
  let payloadFinal = dados
  if (incremental && falhas.length === 0) {
    try {
      const anterior = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
      const prev = JSON.parse(anterior.getString('payload') || '{}')
      const prevDados = prev.dados || {}
      const mesCorte = null // janela em meses: meses fora da janela nova vêm do snapshot anterior
      // simples e robusto: para séries mensais, mescla por MES (novo sobrescreve)
      const seriesMes = ['fat', 'ap_mensal', 'ar_mensal', 'fluxo']
      for (const s of seriesMes) {
        const novos = dados[s] || []
        const velhos = prevDados[s] || []
        const mesNovo = new Set(novos.map((r) => r[0]))
        const mesNovoEmp = new Set(novos.map((r) => r[0] + '|' + r[1]))
        const mantidos = velhos.filter((r) => {
          if (s === 'fat') return !mesNovoEmp.has(r[0] + '|' + r[1])
          return !mesNovo.has(r[0])
        })
        dados[s] = mantidos.concat(novos)
      }
      payloadFinal = dados
    } catch (_) {}
  }

  const resultado = {
    ok: falhas.length === 0,
    gerado_em: new DateTime().string(),
    incremental: incremental,
    meses_janela: mesesJanela,
    dados: payloadFinal,
    falhas: falhas,
  }

  // grava snapshot
  try {
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
    } catch (_) {}
    if (rec) {
      rec.set('payload', JSON.stringify(resultado))
      rec.set('gerado_em', resultado.gerado_em)
      rec.set('status', resultado.ok ? 'ok' : 'parcial')
      rec.set('falhas', JSON.stringify(falhas))
      $app.save(rec)
    } else {
      const col = $app.findCollectionByNameOrId('sankhya_cache')
      const novo = new Record(col)
      novo.set('chave', 'financeiro')
      novo.set('payload', JSON.stringify(resultado))
      novo.set('gerado_em', resultado.gerado_em)
      novo.set('status', resultado.ok ? 'ok' : 'parcial')
      novo.set('falhas', JSON.stringify(falhas))
      $app.save(novo)
    }
  } catch (err) {
    $app.logger().error('sankhya_sync: falha ao gravar cache', 'error', String(err))
  }

  // atualiza watermark só em rodada OK
  if (falhas.length === 0) {
    try {
      const agora = new DateTime().string()
      if (wmRec) {
        wmRec.set('gerado_em', agora)
        wmRec.set('status', incremental ? 'incremental' : 'full')
        wmRec.set('payload', JSON.stringify({ meses_janela: mesesJanela }))
        $app.save(wmRec)
      } else {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        const novo = new Record(col)
        novo.set('chave', 'financeiro_watermark')
        novo.set('gerado_em', agora)
        novo.set('status', incremental ? 'incremental' : 'full')
        novo.set('payload', JSON.stringify({ meses_janela: mesesJanela }))
        $app.save(novo)
      }
    } catch (_) {}
  }
})
