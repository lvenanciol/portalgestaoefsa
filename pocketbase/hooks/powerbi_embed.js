// T11a (21/10) — Embed token para "Power BI para organização".
// POST /backend/v1/powerbi/embed (JSON: { access_token, report_id, workspace_id? })
// O iframe com embed_url crua é bloqueado (X-Frame-Options) — o embed correto
// usa powerbi-client no front com um EMBED TOKEN efêmero gerado aqui via
// POST /v1.0/myorg/GenerateToken (scopes: Report.Read).
// Devolve { ok, embed_url, embed_token, report_id }

routerAdd(
  'POST',
  '/backend/v1/powerbi/embed',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const token = String(body.access_token || '').trim()
    const reportId = String(body.report_id || '').trim()
    if (!token || !reportId) {
      return e.json(400, { ok: false, erro: 'access_token e report_id são obrigatórios.' })
    }

    try {
      const res = $http.send({
        url:
          'https://api.powerbi.com/v1.0/myorg/reports/' +
          encodeURIComponent(reportId) +
          '/GenerateToken',
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'view' }),
        timeout: 20,
      })
      const bodyStr =
        typeof res.body === 'string'
          ? res.body
          : Array.isArray(res.body)
            ? String.fromCharCode.apply(null, res.body)
            : String(res.body || '')
      if (res.statusCode !== 200) {
        return e.json(502, {
          ok: false,
          erro:
            'GenerateToken ' +
            res.statusCode +
            ' — requer licença Pro/PPU e permissão no relatório. ' +
            bodyStr.slice(0, 160),
        })
      }
      const d = JSON.parse(bodyStr)
      return e.json(200, {
        ok: true,
        embed_token: String(d.token || ''),
        embed_url: String(d.embedUrl || ''),
        report_id: reportId,
      })
    } catch (err) {
      return e.json(502, { ok: false, erro: 'Falha GenerateToken: ' + String(err).slice(0, 160) })
    }
  },
  $apis.requireAuth(),
)
