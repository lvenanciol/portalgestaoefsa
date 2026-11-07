migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter(
        'processos_juridicos',
        "numero_processo = '0001234-56.2026.5.17.0001'",
        '',
        10,
        0,
      )
      for (const rec of records) {
        app.delete(rec)
      }
    } catch (err) {
      // no-op seguro se a coleção ou registro já não existirem
    }
  },
  (app) => {
    // down: no-op (registro de teste removido intencionalmente)
  },
)
