// diagnóstico temporário: tipo real de cfg.get('config') no JSVM
routerAdd(
  'GET',
  '/backend/v1/diag/config-type',
  (e) => {
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    if (!cfg) return e.json(200, { achou: false })
    const c = cfg.get('config')
    return e.json(200, {
      achou: true,
      tipo: typeof c,
      eArray: Array.isArray(c),
      preview: String(c).slice(0, 200),
    })
  },
  $apis.requireAuth(),
)
