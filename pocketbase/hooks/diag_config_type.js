// diagnóstico temporário: o que o cfgObj v12b processa do registro atual
routerAdd(
  'GET',
  '/backend/v1/diag/config-type',
  (e) => {
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    if (!cfg) return e.json(200, { achou: false })
    let c = cfg.get('config')
    const tipoCru = typeof c
    const eArrayCru = Array.isArray(c)
    if (Array.isArray(c)) c = c.join('')
    const tipoPosJoin = typeof c
    let parsed = null
    let erroParse = ''
    if (typeof c === 'string') {
      try {
        parsed = JSON.parse(c)
      } catch (err) {
        erroParse = String(err).slice(0, 120)
      }
    }
    return e.json(200, {
      achou: true,
      tipoCru: tipoCru,
      eArrayCru: eArrayCru,
      lenCru: eArrayCru ? c.length : undefined,
      tipoPosJoin: tipoPosJoin,
      preview: String(c).slice(0, 300),
      parseOk: !!parsed,
      phoneParsed: parsed ? String(parsed.phone_number_id || '') : undefined,
      erroParse: erroParse,
    })
  },
  $apis.requireAuth(),
)
