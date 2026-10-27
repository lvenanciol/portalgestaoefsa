migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('menus', 'rota = "/power-bi"', '', 1, 0)
      if (records && records.length > 0) {
        const r = records[0]
        r.set('secao', 'GESTÃO')
        r.set('ordem', 5)
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const records = app.findRecordsByFilter('menus', 'rota = "/power-bi"', '', 1, 0)
      if (records && records.length > 0) {
        const r = records[0]
        r.set('secao', 'PLATAFORMA')
        r.set('ordem', 11)
        app.save(r)
      }
    } catch (_) {}
  },
)
