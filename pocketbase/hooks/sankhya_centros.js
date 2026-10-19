// Ajustes PGE (19/10) — T3: centros de resultado do Sankhya para vínculo de
// parceiros (dropdown busca/filtro). Fonte: TTRBC (Centro de Resultados) via
// edge proxy DbExplorerSP. Cache em sankhya_cache (chave 'centros_resultado',
// TTL 24h) para não bater no ERP a cada digitação.

routerAdd(
  'GET',
  '/backend/v1/sankhya/centros-resultado',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const busca = String(q.busca || '')
      .trim()
      .toLowerCase()

    // cache 24h
    let itens = []
    let fonte = 'cache'
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'centros_resultado'")
      if (rec) {
        const gerado = new Date(rec.getString('gerado_em').replace(' ', 'T') + 'Z').getTime()
        if (Date.now() - gerado < 24 * 3600 * 1000) {
          itens = JSON.parse(rec.getString('payload') || '[]')
        } else {
          rec = null // expirado — rebusca
        }
      }
    } catch (_) {
      rec = null
    }

    if (!itens.length) {
      const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
      const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
      if (!edgeUrl || !edgeSecret) return e.json(502, { ok: false, erro: 'Proxy não configurado.' })
      const res = $http.send({
        url: edgeUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
        body: JSON.stringify({
          op: 'dbExplorer',
          payload: {
            requestBody: {
              serviceName: 'DbExplorerSP.executeQuery',
              requestBody: {
                sql: 'SELECT CODCRR, DESCRICAO FROM SANKHYA.TTRBC ORDER BY DESCRICAO',
              },
            },
          },
        }),
        timeout: 45,
      })
      if (res.statusCode !== 200) return e.json(502, { ok: false, erro: 'edge ' + res.statusCode })
      const d = res.json || {}
      const rb = (d.data && d.data.responseBody) || {}
      if (!rb.rows) {
        return e.json(502, {
          ok: false,
          erro:
            'edge sem rows: ' +
            ((d.data && (d.data.statusMessage || d.data.error)) || JSON.stringify(d).slice(0, 200)),
        })
      }
      itens = rb.rows.map((r) => ({ codigo: String(r[0]), descricao: String(r[1]) }))
      fonte = 'sankhya'
      // grava cache
      try {
        const agora = new DateTime().string()
        if (rec) {
          rec.set('payload', JSON.stringify(itens))
          rec.set('gerado_em', agora)
          rec.set('status', 'ok')
          $app.save(rec)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'centros_resultado')
          novo.set('payload', JSON.stringify(itens))
          novo.set('gerado_em', agora)
          novo.set('status', 'ok')
          $app.save(novo)
        }
      } catch (_) {}
    }

    // filtro busca (descrição ou código)
    let out = itens
    if (busca) {
      out = itens.filter(
        (i) =>
          i.descricao.toLowerCase().includes(busca) ||
          String(i.codigo).toLowerCase().includes(busca),
      )
    }
    return e.json(200, { ok: true, fonte: fonte, total: out.length, itens: out.slice(0, 50) })
  },
  $apis.requireAuth(),
)
