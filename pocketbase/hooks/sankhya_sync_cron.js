// COR-1 (19/10) — Sync Sankhya INCREMENTAL POR JANELAS (nunca full refresh).
// A watermark ('financeiro_watermark') marca o FIM da última janela concluída.
// A cada execução (cron diário 06:00 BRT — '0 9 * * *' UTC — inalterado):
//   1. início = dia 1 do mês da watermark (re-leitura idempotente do mês
//      parcial para somas mensais exatas), limitado a 12 meses atrás;
//   2. divide [início, hoje] em janelas de <= 30 dias e processa em
//      sequência via DbExplorerSP.executeQuery com filtro de data por janela;
//   3. ao concluir CADA janela: persiste a watermark no fim da janela,
//      registra no log (início, fim, linhas, status — sankhya_cache
//      'sync_janelas_log' + console do pod) e grava no snapshot os meses
//      já completos;
//   4. em falha: interrompe e mantém a watermark da última janela OK —
//      a próxima execução retoma dali (nunca reinicia o intervalo).
// Sem watermark (1ª rodada): backfill chunked dos últimos 12 meses.
// Queries de estado (aging, top parceiros, por empresa) são aditivas por
// janela e consolidadas no snapshot ao completar todas as janelas;
// ap_top/ar_top acumulam por parceiro e aplicam TOP 5 no consolidado.
// Rota de teste admin-only: POST /backend/v1/sankhya/sync-chunked-test
// body {max_janelas: N} — roda as próximas N janelas e devolve o relatório.
// Toda a lógica vive DENTRO de cada callback (a VM do PocketBase executa
// callbacks em pools separados — declarações de topo não são visíveis lá).

// Cron diário 06:00 BRT (09:00 UTC) — cadência inalterada (COR-1)
cronAdd('sankhya_sync_diario', '0 9 * * *', () => {
  const maxJanelas = 0
  const janelas = []
  const falhas = []

  function sjFmtD(d) {
    return d.toISOString().slice(0, 10)
  }
  function sjMesFimMs(mes) {
    const y = parseInt(mes.slice(0, 4), 10)
    const m = parseInt(mes.slice(5, 7), 10)
    return Date.UTC(y, m, 1) - 1
  }
  function sjParseWm(s) {
    if (!s) return null
    try {
      const d = new Date(s.replace(' ', 'T'))
      if (isNaN(d.getTime())) return null
      return d
    } catch (_) {
      return null
    }
  }
  function sjRodarSql(sql) {
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
  function sjPersistirWatermark(fimJanela, janelasOk) {
    try {
      let wm = null
      try {
        wm = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
      } catch (_) {
        wm = null
      }
      const valor = fimJanela.toISOString().replace('T', ' ')
      const payload = JSON.stringify({
        janelas_concluidas: janelasOk,
        ultima_janela: sjFmtD(fimJanela),
      })
      if (wm) {
        wm.set('gerado_em', valor)
        wm.set('status', 'incremental_janelas')
        wm.set('payload', payload)
        $app.save(wm)
      } else {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        const novo = new Record(col)
        novo.set('chave', 'financeiro_watermark')
        novo.set('gerado_em', valor)
        novo.set('status', 'incremental_janelas')
        novo.set('payload', payload)
        $app.save(novo)
      }
    } catch (err) {
      console.log('sankhya_sync: falha ao persistir watermark ' + String(err))
    }
  }
  function sjRegistrarLog() {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'sync_janelas_log'")
      } catch (_) {
        rec = null
      }
      const valor = JSON.stringify(janelas.slice(-100))
      if (rec) {
        rec.set('payload', valor)
        rec.set('status', 'log')
        rec.set('gerado_em', new DateTime().string())
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        const novo = new Record(col)
        novo.set('chave', 'sync_janelas_log')
        novo.set('payload', valor)
        novo.set('status', 'log')
        novo.set('gerado_em', new DateTime().string())
        $app.save(novo)
      }
    } catch (err) {
      console.log('sankhya_sync: falha ao gravar log de janelas ' + String(err))
    }
  }

  const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
  const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
  if (!edgeUrl || !edgeSecret) {
    console.log('sankhya_sync_diario: proxy não configurado')
    return
  }

  // ---- intervalo [início, hoje]
  const hoje = new Date()
  hoje.setUTCHours(0, 0, 0, 0)
  const piso = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 12, 1))
  let inicio = null
  let wmRec = null
  try {
    wmRec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
  } catch (_) {
    wmRec = null
  }
  if (wmRec) {
    const ult = sjParseWm(wmRec.getString('gerado_em'))
    if (ult) {
      inicio = new Date(Date.UTC(ult.getUTCFullYear(), ult.getUTCMonth(), 1))
      if (inicio.getTime() < piso.getTime()) inicio = new Date(piso.getTime())
    }
  }
  if (!inicio) inicio = new Date(piso.getTime())

  // ---- lista de janelas de <= 30 dias
  const lista = []
  let s = new Date(inicio.getTime())
  while (s.getTime() <= hoje.getTime()) {
    const f = new Date(s.getTime())
    f.setUTCDate(f.getUTCDate() + 30 - 1)
    if (f.getTime() > hoje.getTime()) f.setTime(hoje.getTime())
    lista.push([new Date(s.getTime()), new Date(f.getTime())])
    s = new Date(f.getTime())
    s.setUTCDate(s.getUTCDate() + 1)
  }

  // ---- snapshot atual
  let snapRec = null
  try {
    snapRec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
  } catch (_) {
    snapRec = null
  }
  let snap = null
  if (snapRec) {
    try {
      snap = JSON.parse(snapRec.getString('payload') || '{}')
    } catch (_) {
      snap = null
    }
  }
  if (!snap || !snap.dados) {
    snap = {
      ok: true,
      gerado_em: '',
      incremental: true,
      meses_janela: 12,
      dados: {},
      falhas: [],
    }
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
  for (let i = 0; i < chaves.length; i++) {
    if (!Array.isArray(snap.dados[chaves[i]])) snap.dados[chaves[i]] = []
  }

  // ---- acumuladores em memória (parciais por janela)
  const acc = {
    fat: {},
    ap_mensal: {},
    ar_mensal: {},
    ap_aging: {},
    ar_aging: {},
    ap_top: {},
    ar_top: {},
    fluxo: {},
    ap_por_empresa: {},
    ar_por_empresa: {},
  }
  function accAdd(bucket, chave, tot, n) {
    const cur = bucket[chave] || { t: 0, n: 0 }
    cur.t += tot || 0
    cur.n += n || 0
    bucket[chave] = cur
  }
  function acumular(chave, rows) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (chave === 'fat') {
        accAdd(acc.fat, String(r[0]) + '|' + String(r[1]), Number(r[2]) || 0, 0)
      } else if (
        chave === 'ap_mensal' ||
        chave === 'ar_mensal' ||
        chave === 'ap_aging' ||
        chave === 'ar_aging'
      ) {
        accAdd(acc[chave], String(r[0]), Number(r[1]) || 0, Number(r[2]) || 0)
      } else if (chave === 'ap_top' || chave === 'ar_top') {
        accAdd(acc[chave], String(r[0]), Number(r[1]) || 0, 0)
      } else if (chave === 'fluxo') {
        const cur = acc.fluxo[String(r[0])] || { t: 0, n: 0, e: 0, s: 0 }
        cur.e += Number(r[1]) || 0
        cur.s += Number(r[2]) || 0
        acc.fluxo[String(r[0])] = cur
      } else if (chave === 'ap_por_empresa' || chave === 'ar_por_empresa') {
        accAdd(acc[chave], String(r[0]) + '|' + String(r[1]), Number(r[2]) || 0, 0)
      }
    }
  }

  function mergeMes(chave, mes) {
    const linhas = []
    if (chave === 'fat') {
      for (const k of Object.keys(acc.fat)) {
        if (k.split('|')[0] === mes) {
          const parts = k.split('|')
          linhas.push([parts[0], parts[1], acc.fat[k].t])
        }
      }
      linhas.sort(function (a, b) {
        if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
        return a[1] < b[1] ? -1 : 1
      })
    } else if (chave === 'ap_mensal' || chave === 'ar_mensal') {
      const v = acc[chave][mes]
      if (v) linhas.push([mes, v.t, v.n])
    } else if (chave === 'fluxo') {
      const v = acc.fluxo[mes]
      if (v) linhas.push([mes, v.e, v.s])
    }
    if (!linhas.length) return
    snap.dados[chave] = snap.dados[chave]
      .filter(function (r) {
        return r[0] !== mes
      })
      .concat(linhas)
  }

  function mergeMesesAte(wFim) {
    const limite = wFim.getTime() + 86399999
    const meses = {}
    for (const k of Object.keys(acc.fat)) meses[k.split('|')[0]] = true
    for (const k of Object.keys(acc.ap_mensal)) meses[k] = true
    for (const k of Object.keys(acc.ar_mensal)) meses[k] = true
    for (const k of Object.keys(acc.fluxo)) meses[k] = true
    for (const mes of Object.keys(meses)) {
      if (sjMesFimMs(mes) <= limite) {
        mergeMes('fat', mes)
        mergeMes('ap_mensal', mes)
        mergeMes('ar_mensal', mes)
        mergeMes('fluxo', mes)
      }
    }
  }

  function finalizarTudo() {
    mergeMesesAte(new Date(hoje.getTime() + 2 * 86399999))
    snap.dados.ap_aging = Object.keys(acc.ap_aging).map(function (k) {
      return [k, acc.ap_aging[k].t, acc.ap_aging[k].n]
    })
    snap.dados.ar_aging = Object.keys(acc.ar_aging).map(function (k) {
      return [k, acc.ar_aging[k].t, acc.ar_aging[k].n]
    })
    snap.dados.ap_top = Object.keys(acc.ap_top)
      .map(function (k) {
        return [k, acc.ap_top[k].t]
      })
      .sort(function (a, b) {
        return b[1] - a[1]
      })
      .slice(0, 5)
    snap.dados.ar_top = Object.keys(acc.ar_top)
      .map(function (k) {
        return [k, acc.ar_top[k].t]
      })
      .sort(function (a, b) {
        return b[1] - a[1]
      })
      .slice(0, 5)
    snap.dados.ap_por_empresa = Object.keys(acc.ap_por_empresa).map(function (k) {
      const p = k.split('|')
      return [p[0], p[1], acc.ap_por_empresa[k].t]
    })
    snap.dados.ar_por_empresa = Object.keys(acc.ar_por_empresa).map(function (k) {
      const p = k.split('|')
      return [p[0], p[1], acc.ar_por_empresa[k].t]
    })
  }

  function salvarSnapshot() {
    snap.gerado_em = new DateTime().string()
    snap.incremental = true
    snap.meses_janela = 12
    try {
      if (snapRec) {
        snapRec.set('payload', JSON.stringify(snap))
        snapRec.set('gerado_em', snap.gerado_em)
        snapRec.set('status', falhas.length === 0 ? 'ok' : 'parcial')
        snapRec.set('falhas', JSON.stringify(falhas))
        $app.save(snapRec)
      } else {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        const novo = new Record(col)
        novo.set('chave', 'financeiro')
        novo.set('payload', JSON.stringify(snap))
        novo.set('gerado_em', snap.gerado_em)
        novo.set('status', falhas.length === 0 ? 'ok' : 'parcial')
        novo.set('falhas', JSON.stringify(falhas))
        $app.save(novo)
        snapRec = novo
      }
    } catch (err) {
      console.log('sankhya_sync: falha ao gravar snapshot ' + String(err))
    }
  }

  function sqlsJanela(iniS, fimS) {
    const cIni = "TO_DATE('" + iniS + "','YYYY-MM-DD')"
    const cFim = "TO_DATE('" + fimS + "','YYYY-MM-DD') + 1"
    return {
      fat:
        "SELECT TO_CHAR(DTNEG,'YYYY-MM') MES, CODEMP, SUM(VLRNOTA) TOT FROM TGFCAB WHERE DTNEG >= " +
        cIni +
        ' AND DTNEG < ' +
        cFim +
        " AND STATUSNOTA='L' GROUP BY TO_CHAR(DTNEG,'YYYY-MM'), CODEMP ORDER BY 1",
      ap_mensal:
        "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
        cIni +
        ' AND DTVENC < ' +
        cFim +
        " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
      ar_mensal:
        "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
        cIni +
        ' AND DTVENC < ' +
        cFim +
        " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
      ap_aging:
        "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
        cIni +
        ' AND DTVENC < ' +
        cFim +
        " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
      ar_aging:
        "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
        cIni +
        ' AND DTVENC < ' +
        cFim +
        " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
      ap_top:
        'SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        cIni +
        ' AND f.DTVENC < ' +
        cFim +
        ' GROUP BY p.NOMEPARC',
      ar_top:
        'SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        cIni +
        ' AND f.DTVENC < ' +
        cFim +
        ' GROUP BY p.NOMEPARC',
      fluxo:
        "SELECT TO_CHAR(DHBAIXA,'YYYY-MM') MES, SUM(CASE WHEN RECDESP=1 THEN VLRDESDOB ELSE 0 END) ENT, SUM(CASE WHEN RECDESP=-1 THEN VLRDESDOB ELSE 0 END) SAI FROM TGFFIN WHERE DHBAIXA IS NOT NULL AND DHBAIXA >= " +
        cIni +
        ' AND DHBAIXA < ' +
        cFim +
        " GROUP BY TO_CHAR(DHBAIXA,'YYYY-MM') ORDER BY 1",
      ap_por_empresa:
        'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        cIni +
        ' AND f.DTVENC < ' +
        cFim +
        ' GROUP BY e.CODEMP, e.RAZAOABREV',
      ar_por_empresa:
        'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        cIni +
        ' AND f.DTVENC < ' +
        cFim +
        ' GROUP BY e.CODEMP, e.RAZAOABREV',
    }
  }

  // ---- processamento sequencial das janelas
  let concluidas = 0
  let empresasOk = false
  const ordem = [
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
  for (let wi = 0; wi < lista.length; wi++) {
    if (maxJanelas && concluidas >= maxJanelas) break
    const wIni = lista[wi][0]
    const wFim = lista[wi][1]
    const iniS = sjFmtD(wIni)
    const fimS = sjFmtD(wFim)
    const t0 = Date.now()
    if (!empresasOk) {
      const re = sjRodarSql('SELECT CODEMP, RAZAOABREV FROM SANKHYA.TSIEMP ORDER BY CODEMP')
      if (re.erro) {
        falhas.push('empresas: ' + re.erro)
        break
      }
      snap.dados.empresas = re.rows
      empresasOk = true
    }
    const SQLS = sqlsJanela(iniS, fimS)
    let linhas = 0
    let wErro = ''
    for (let ci = 0; ci < ordem.length; ci++) {
      const chave = ordem[ci]
      const r = sjRodarSql(SQLS[chave])
      if (r.erro) {
        wErro = chave + ': ' + r.erro
        break
      }
      linhas += (r.rows || []).length
      acumular(chave, r.rows || [])
    }
    const entrada = {
      inicio: iniS,
      fim: fimS,
      linhas: linhas,
      status: wErro ? 'falha' : 'ok',
      duracao_ms: Date.now() - t0,
    }
    if (wErro) entrada.erro = wErro
    janelas.push(entrada)
    console.log(
      'sankhya_sync janela ' + (wi + 1) + '/' + lista.length + ' ' + JSON.stringify(entrada),
    )
    if (wErro) {
      falhas.push(wErro)
      break
    }
    sjPersistirWatermark(wFim, concluidas + 1)
    sjRegistrarLog()
    mergeMesesAte(wFim)
    salvarSnapshot()
    concluidas++
  }

  const completa = falhas.length === 0 && concluidas >= lista.length
  if (completa) {
    finalizarTudo()
    salvarSnapshot()
    sjRegistrarLog()
  }
  console.log(
    'sankhya_sync_diario: ' +
      JSON.stringify({
        ok: falhas.length === 0,
        completa: completa,
        janelas: concluidas + '/' + lista.length,
        falhas: falhas,
      }),
  )
})

// Teste/validação admin-only (COR-1): roda as próximas N janelas e devolve
// o relatório — usado para simular watermark antiga e provar o avanço por
// janela e a retomada sem reiniciar o intervalo.
routerAdd(
  'POST',
  '/backend/v1/sankhya/sync-chunked-test',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const body = e.requestInfo().body || {}
    const maxJanelas = Number(body.max_janelas) || 0
    const janelas = []
    const falhas = []

    function sjFmtD(d) {
      return d.toISOString().slice(0, 10)
    }
    function sjMesFimMs(mes) {
      const y = parseInt(mes.slice(0, 4), 10)
      const m = parseInt(mes.slice(5, 7), 10)
      return Date.UTC(y, m, 1) - 1
    }
    function sjParseWm(s) {
      if (!s) return null
      try {
        const d = new Date(s.replace(' ', 'T'))
        if (isNaN(d.getTime())) return null
        return d
      } catch (_) {
        return null
      }
    }
    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, {
        ok: false,
        erro: 'Proxy não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).',
      })
    }
    function sjRodarSql(sql) {
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
    function sjPersistirWatermark(fimJanela, janelasOk) {
      try {
        let wm = null
        try {
          wm = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
        } catch (_) {
          wm = null
        }
        const valor = fimJanela.toISOString().replace('T', ' ')
        const payload = JSON.stringify({
          janelas_concluidas: janelasOk,
          ultima_janela: sjFmtD(fimJanela),
        })
        if (wm) {
          wm.set('gerado_em', valor)
          wm.set('status', 'incremental_janelas')
          wm.set('payload', payload)
          $app.save(wm)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'financeiro_watermark')
          novo.set('gerado_em', valor)
          novo.set('status', 'incremental_janelas')
          novo.set('payload', payload)
          $app.save(novo)
        }
      } catch (err) {
        console.log('sankhya_sync: falha ao persistir watermark ' + String(err))
      }
    }
    function sjRegistrarLog() {
      try {
        let rec = null
        try {
          rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'sync_janelas_log'")
        } catch (_) {
          rec = null
        }
        const valor = JSON.stringify(janelas.slice(-100))
        if (rec) {
          rec.set('payload', valor)
          rec.set('status', 'log')
          rec.set('gerado_em', new DateTime().string())
          $app.save(rec)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'sync_janelas_log')
          novo.set('payload', valor)
          novo.set('status', 'log')
          novo.set('gerado_em', new DateTime().string())
          $app.save(novo)
        }
      } catch (err) {
        console.log('sankhya_sync: falha ao gravar log de janelas ' + String(err))
      }
    }

    // ---- intervalo [início, hoje]
    const hoje = new Date()
    hoje.setUTCHours(0, 0, 0, 0)
    const piso = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 12, 1))
    let inicio = null
    let wmRec = null
    try {
      wmRec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
    } catch (_) {
      wmRec = null
    }
    if (wmRec) {
      const ult = sjParseWm(wmRec.getString('gerado_em'))
      if (ult) {
        inicio = new Date(Date.UTC(ult.getUTCFullYear(), ult.getUTCMonth(), 1))
        if (inicio.getTime() < piso.getTime()) inicio = new Date(piso.getTime())
      }
    }
    if (!inicio) inicio = new Date(piso.getTime())

    // ---- lista de janelas de <= 30 dias
    const lista = []
    let s = new Date(inicio.getTime())
    while (s.getTime() <= hoje.getTime()) {
      const f = new Date(s.getTime())
      f.setUTCDate(f.getUTCDate() + 30 - 1)
      if (f.getTime() > hoje.getTime()) f.setTime(hoje.getTime())
      lista.push([new Date(s.getTime()), new Date(f.getTime())])
      s = new Date(f.getTime())
      s.setUTCDate(s.getUTCDate() + 1)
    }

    // ---- snapshot atual
    let snapRec = null
    try {
      snapRec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
    } catch (_) {
      snapRec = null
    }
    let snap = null
    if (snapRec) {
      try {
        snap = JSON.parse(snapRec.getString('payload') || '{}')
      } catch (_) {
        snap = null
      }
    }
    if (!snap || !snap.dados) {
      snap = {
        ok: true,
        gerado_em: '',
        incremental: true,
        meses_janela: 12,
        dados: {},
        falhas: [],
      }
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
    for (let i = 0; i < chaves.length; i++) {
      if (!Array.isArray(snap.dados[chaves[i]])) snap.dados[chaves[i]] = []
    }

    // ---- acumuladores em memória (parciais por janela)
    const acc = {
      fat: {},
      ap_mensal: {},
      ar_mensal: {},
      ap_aging: {},
      ar_aging: {},
      ap_top: {},
      ar_top: {},
      fluxo: {},
      ap_por_empresa: {},
      ar_por_empresa: {},
    }
    function accAdd(bucket, chave, tot, n) {
      const cur = bucket[chave] || { t: 0, n: 0 }
      cur.t += tot || 0
      cur.n += n || 0
      bucket[chave] = cur
    }
    function acumular(chave, rows) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (chave === 'fat') {
          accAdd(acc.fat, String(r[0]) + '|' + String(r[1]), Number(r[2]) || 0, 0)
        } else if (
          chave === 'ap_mensal' ||
          chave === 'ar_mensal' ||
          chave === 'ap_aging' ||
          chave === 'ar_aging'
        ) {
          accAdd(acc[chave], String(r[0]), Number(r[1]) || 0, Number(r[2]) || 0)
        } else if (chave === 'ap_top' || chave === 'ar_top') {
          accAdd(acc[chave], String(r[0]), Number(r[1]) || 0, 0)
        } else if (chave === 'fluxo') {
          const cur = acc.fluxo[String(r[0])] || { t: 0, n: 0, e: 0, s: 0 }
          cur.e += Number(r[1]) || 0
          cur.s += Number(r[2]) || 0
          acc.fluxo[String(r[0])] = cur
        } else if (chave === 'ap_por_empresa' || chave === 'ar_por_empresa') {
          accAdd(acc[chave], String(r[0]) + '|' + String(r[1]), Number(r[2]) || 0, 0)
        }
      }
    }

    function mergeMes(chave, mes) {
      const linhas = []
      if (chave === 'fat') {
        for (const k of Object.keys(acc.fat)) {
          if (k.split('|')[0] === mes) {
            const parts = k.split('|')
            linhas.push([parts[0], parts[1], acc.fat[k].t])
          }
        }
        linhas.sort(function (a, b) {
          if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
          return a[1] < b[1] ? -1 : 1
        })
      } else if (chave === 'ap_mensal' || chave === 'ar_mensal') {
        const v = acc[chave][mes]
        if (v) linhas.push([mes, v.t, v.n])
      } else if (chave === 'fluxo') {
        const v = acc.fluxo[mes]
        if (v) linhas.push([mes, v.e, v.s])
      }
      if (!linhas.length) return
      snap.dados[chave] = snap.dados[chave]
        .filter(function (r) {
          return r[0] !== mes
        })
        .concat(linhas)
    }

    function mergeMesesAte(wFim) {
      const limite = wFim.getTime() + 86399999
      const meses = {}
      for (const k of Object.keys(acc.fat)) meses[k.split('|')[0]] = true
      for (const k of Object.keys(acc.ap_mensal)) meses[k] = true
      for (const k of Object.keys(acc.ar_mensal)) meses[k] = true
      for (const k of Object.keys(acc.fluxo)) meses[k] = true
      for (const mes of Object.keys(meses)) {
        if (sjMesFimMs(mes) <= limite) {
          mergeMes('fat', mes)
          mergeMes('ap_mensal', mes)
          mergeMes('ar_mensal', mes)
          mergeMes('fluxo', mes)
        }
      }
    }

    function finalizarTudo() {
      mergeMesesAte(new Date(hoje.getTime() + 2 * 86399999))
      snap.dados.ap_aging = Object.keys(acc.ap_aging).map(function (k) {
        return [k, acc.ap_aging[k].t, acc.ap_aging[k].n]
      })
      snap.dados.ar_aging = Object.keys(acc.ar_aging).map(function (k) {
        return [k, acc.ar_aging[k].t, acc.ar_aging[k].n]
      })
      snap.dados.ap_top = Object.keys(acc.ap_top)
        .map(function (k) {
          return [k, acc.ap_top[k].t]
        })
        .sort(function (a, b) {
          return b[1] - a[1]
        })
        .slice(0, 5)
      snap.dados.ar_top = Object.keys(acc.ar_top)
        .map(function (k) {
          return [k, acc.ar_top[k].t]
        })
        .sort(function (a, b) {
          return b[1] - a[1]
        })
        .slice(0, 5)
      snap.dados.ap_por_empresa = Object.keys(acc.ap_por_empresa).map(function (k) {
        const p = k.split('|')
        return [p[0], p[1], acc.ap_por_empresa[k].t]
      })
      snap.dados.ar_por_empresa = Object.keys(acc.ar_por_empresa).map(function (k) {
        const p = k.split('|')
        return [p[0], p[1], acc.ar_por_empresa[k].t]
      })
    }

    function salvarSnapshot() {
      snap.gerado_em = new DateTime().string()
      snap.incremental = true
      snap.meses_janela = 12
      try {
        if (snapRec) {
          snapRec.set('payload', JSON.stringify(snap))
          snapRec.set('gerado_em', snap.gerado_em)
          snapRec.set('status', falhas.length === 0 ? 'ok' : 'parcial')
          snapRec.set('falhas', JSON.stringify(falhas))
          $app.save(snapRec)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'financeiro')
          novo.set('payload', JSON.stringify(snap))
          novo.set('gerado_em', snap.gerado_em)
          novo.set('status', falhas.length === 0 ? 'ok' : 'parcial')
          novo.set('falhas', JSON.stringify(falhas))
          $app.save(novo)
          snapRec = novo
        }
      } catch (err) {
        console.log('sankhya_sync: falha ao gravar snapshot ' + String(err))
      }
    }

    function sqlsJanela(iniS, fimS) {
      const cIni = "TO_DATE('" + iniS + "','YYYY-MM-DD')"
      const cFim = "TO_DATE('" + fimS + "','YYYY-MM-DD') + 1"
      return {
        fat:
          "SELECT TO_CHAR(DTNEG,'YYYY-MM') MES, CODEMP, SUM(VLRNOTA) TOT FROM TGFCAB WHERE DTNEG >= " +
          cIni +
          ' AND DTNEG < ' +
          cFim +
          " AND STATUSNOTA='L' GROUP BY TO_CHAR(DTNEG,'YYYY-MM'), CODEMP ORDER BY 1",
        ap_mensal:
          "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
          cIni +
          ' AND DTVENC < ' +
          cFim +
          " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
        ar_mensal:
          "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
          cIni +
          ' AND DTVENC < ' +
          cFim +
          " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
        ap_aging:
          "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
          cIni +
          ' AND DTVENC < ' +
          cFim +
          " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
        ar_aging:
          "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
          cIni +
          ' AND DTVENC < ' +
          cFim +
          " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
        ap_top:
          'SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
          cIni +
          ' AND f.DTVENC < ' +
          cFim +
          ' GROUP BY p.NOMEPARC',
        ar_top:
          'SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
          cIni +
          ' AND f.DTVENC < ' +
          cFim +
          ' GROUP BY p.NOMEPARC',
        fluxo:
          "SELECT TO_CHAR(DHBAIXA,'YYYY-MM') MES, SUM(CASE WHEN RECDESP=1 THEN VLRDESDOB ELSE 0 END) ENT, SUM(CASE WHEN RECDESP=-1 THEN VLRDESDOB ELSE 0 END) SAI FROM TGFFIN WHERE DHBAIXA IS NOT NULL AND DHBAIXA >= " +
          cIni +
          ' AND DHBAIXA < ' +
          cFim +
          " GROUP BY TO_CHAR(DHBAIXA,'YYYY-MM') ORDER BY 1",
        ap_por_empresa:
          'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
          cIni +
          ' AND f.DTVENC < ' +
          cFim +
          ' GROUP BY e.CODEMP, e.RAZAOABREV',
        ar_por_empresa:
          'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
          cIni +
          ' AND f.DTVENC < ' +
          cFim +
          ' GROUP BY e.CODEMP, e.RAZAOABREV',
      }
    }

    // ---- processamento sequencial das janelas
    let concluidas = 0
    let empresasOk = false
    const ordem = [
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
    for (let wi = 0; wi < lista.length; wi++) {
      if (maxJanelas && concluidas >= maxJanelas) break
      const wIni = lista[wi][0]
      const wFim = lista[wi][1]
      const iniS = sjFmtD(wIni)
      const fimS = sjFmtD(wFim)
      const t0 = Date.now()
      if (!empresasOk) {
        const re = sjRodarSql('SELECT CODEMP, RAZAOABREV FROM SANKHYA.TSIEMP ORDER BY CODEMP')
        if (re.erro) {
          falhas.push('empresas: ' + re.erro)
          break
        }
        snap.dados.empresas = re.rows
        empresasOk = true
      }
      const SQLS = sqlsJanela(iniS, fimS)
      let linhas = 0
      let wErro = ''
      for (let ci = 0; ci < ordem.length; ci++) {
        const chave = ordem[ci]
        const r = sjRodarSql(SQLS[chave])
        if (r.erro) {
          wErro = chave + ': ' + r.erro
          break
        }
        linhas += (r.rows || []).length
        acumular(chave, r.rows || [])
      }
      const entrada = {
        inicio: iniS,
        fim: fimS,
        linhas: linhas,
        status: wErro ? 'falha' : 'ok',
        duracao_ms: Date.now() - t0,
      }
      if (wErro) entrada.erro = wErro
      janelas.push(entrada)
      console.log(
        'sankhya_sync janela ' + (wi + 1) + '/' + lista.length + ' ' + JSON.stringify(entrada),
      )
      if (wErro) {
        falhas.push(wErro)
        break
      }
      sjPersistirWatermark(wFim, concluidas + 1)
      sjRegistrarLog()
      mergeMesesAte(wFim)
      salvarSnapshot()
      concluidas++
    }

    const completa = falhas.length === 0 && concluidas >= lista.length
    if (completa) {
      finalizarTudo()
      salvarSnapshot()
      sjRegistrarLog()
    }

    return e.json(200, {
      ok: falhas.length === 0,
      completa: completa,
      inicio_backfill: sjFmtD(inicio),
      total_janelas: lista.length,
      concluidas: concluidas,
      janelas: janelas,
      falhas: falhas,
    })
  },
  $apis.requireAuth(),
)
