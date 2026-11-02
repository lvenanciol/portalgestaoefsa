// Migration 0037 — Ativa o registro de logomarca da LL5 e garante empresa ativa
migrate(
  (app) => {
    // 1. Garantir que a empresa LL5 esteja ativa
    try {
      const empLL5 = app.findFirstRecordByFilter('empresas', 'nome = "LL5" || nome = "ll5"')
      if (!empLL5.getBool('ativa')) {
        empLL5.set('ativa', true)
        app.save(empLL5)
      }
    } catch (_) {}

    // 2. Garantir que a logomarca da LL5 esteja com ativo = true
    try {
      const logoLL5 = app.findFirstRecordByFilter('logomarcas', 'empresa = "LL5" || sigla = "LL5"')
      if (!logoLL5.getBool('ativo')) {
        logoLL5.set('ativo', true)
        app.save(logoLL5)
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão no-op para preservar estado
  },
)
