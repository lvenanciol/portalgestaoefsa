// 0072 — Auditor não é Admin: também perde o curinga (regra única do 0071
// cobre apenas nome != "Admin"; auditor é grupo de leitura com módulos próprios).
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('grupos_permissao', 'nome = "Auditor"', '', 1, 0)
      if (!rec) return
      let obj = null
      try {
        const raw = rec.get('permissoes')
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e) {
        obj = null
      }
      if (!obj || typeof obj !== 'object' || !obj['*']) return
      const novo = {}
      for (const k of Object.keys(obj)) {
        if (k !== '*') novo[k] = obj[k]
      }
      rec.set('permissoes', novo)
      app.save(rec)
      console.log('0072: curinga removido do Auditor')
    } catch (e) {
      console.log('0072: ' + String(e).slice(0, 150))
    }
  },
  (app) => {
    // Reversão: no-op.
  },
)
