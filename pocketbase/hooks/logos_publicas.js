// Endpoint público de logomarcas ativas para o carrossel de login e PWA.
// Rota pública: GET /backend/v1/public/logos (sem autenticação obrigatória).
// Retorna { logos: [...] } com id, empresa, sigla, cor, logo, emblema, logoUrl e emblemaUrl.

routerAdd('GET', '/backend/v1/public/logos', (e) => {
  try {
    const col = $app.findCollectionByNameOrId('logomarcas')
    const records = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 50, 0)

    let base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($secrets.get('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/?$/, '').replace(/\/$/, '')

    const logos = (records || []).map((rec) => {
      const id = rec.id
      const empresa = rec.getString('empresa')
      const sigla = rec.getString('sigla')
      const cor = rec.getString('cor') || '#1B5E20'
      const logo = rec.getString('logo')
      const emblema = rec.getString('emblema')
      // ícone tem precedência sobre logo para emblema/icone; fallback para logo
      const icone = emblema || logo

      const colId = col.id || 'logomarcas'
      const logoUrl = logo
        ? base
          ? base + '/api/files/' + colId + '/' + id + '/' + logo
          : '/api/files/' + colId + '/' + id + '/' + logo
        : ''
      const emblemaUrl = emblema
        ? base
          ? base + '/api/files/' + colId + '/' + id + '/' + emblema
          : '/api/files/' + colId + '/' + id + '/' + emblema
        : ''
      const iconeUrl = emblemaUrl || logoUrl

      return {
        id: id,
        empresa: empresa,
        sigla: sigla,
        cor: cor,
        logo: logo,
        emblema: emblema,
        icone: icone,
        logoUrl: logoUrl,
        emblemaUrl: emblemaUrl,
        iconeUrl: iconeUrl,
      }
    })

    return e.json(200, { ok: true, logos: logos })
  } catch (err) {
    return e.json(500, {
      ok: false,
      erro: 'Falha ao buscar logomarcas: ' + String(err).slice(0, 150),
    })
  }
})
