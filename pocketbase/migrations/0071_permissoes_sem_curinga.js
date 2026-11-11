// 0071 — Permissões FAIL-CLOSED (11/11/2026): a sidebar do grupo "Suprimentos"
// exibia TODAS as telas porque o grupo tinha o curinga '*' com ver:true
// (herdado da seed do grupo "Auditor", mig 0003) e o can() do frontend tratava
// o curinga como concessão universal. Regra nova: grupo não-Admin NÃO pode ter
// curinga — sem entrada específica do módulo, sem acesso. Idempotente.
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
      try {
        const raw = rec.get('permissoes')
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e) {
        obj = null
      }
      if (!obj || typeof obj !== 'object' || !obj['*']) continue
      const novo = {}
      for (const k of Object.keys(obj)) {
        if (k !== '*') novo[k] = obj[k]
      }
      rec.set('permissoes', novo)
      app.save(rec)
      corrigidos++
      console.log('0071: curinga "*" removido do grupo ' + rec.getString('nome'))
    }
    console.log('0071: grupos corrigidos = ' + corrigidos)
  },
  (app) => {
    // Reversão: no-op — recriar o curinga seria reintroduzir o vazamento.
  },
)
