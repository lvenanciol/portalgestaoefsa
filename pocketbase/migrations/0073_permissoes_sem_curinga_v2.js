// 0073 — 2ª tentativa: remove o curinga '*' dos grupos não-Admin.
// O 0071 rodou mas o curinga do grupo Suprimentos PERMANECEU — no JSVM o campo
// JSON `permissoes` lido via rec.get() pode vir como string (não objeto), e o
// try/catch do 0071 engoliu o parse sem remover. Aqui tratamos os DOIS formatos
// explicitamente e regravamos como STRING (formato que o PocketBase persiste),
// sem engolir erro de parse silenciosamente.
migrate(
  (app) => {
    const records = app.findRecordsByFilter(
      'grupos_permissao',
      'nome != "Admin"',
      '-updated',
      500,
      0,
    )
    let corrigidos = 0
    for (const rec of records) {
      let obj = null
      let eraString = false
      const raw = rec.getString('permissoes')
      if (raw) {
        eraString = true
        try {
          obj = JSON.parse(raw)
        } catch (e) {
          obj = null
        }
      } else {
        try {
          obj = rec.get('permissoes')
        } catch (e) {
          obj = null
        }
      }
      if (!obj || typeof obj !== 'object' || !obj['*']) continue
      const novo = {}
      for (const k of Object.keys(obj)) {
        if (k !== '*') novo[k] = obj[k]
      }
      rec.set('permissoes', eraString ? JSON.stringify(novo) : novo)
      app.save(rec)
      corrigidos++
      console.log('0073: curinga removido de ' + rec.getString('nome'))
    }
    console.log('0073: grupos corrigidos = ' + corrigidos)
  },
  (app) => {
    // Reversão: no-op — recriar o curinga reintroduziria o vazamento.
  },
)
