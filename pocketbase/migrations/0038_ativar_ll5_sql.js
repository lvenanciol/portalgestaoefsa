// Migration 0038 — Força ativação de logomarca e empresa LL5 via SQL direto
migrate(
  (app) => {
    try {
      app
        .db()
        .newQuery(
          "UPDATE logomarcas SET ativo = 1 WHERE empresa = 'LL5' OR sigla = 'LL5' OR id = '1g38jxd238vb848'",
        )
        .execute()
    } catch (_) {}
    try {
      app
        .db()
        .newQuery("UPDATE empresas SET ativa = 1 WHERE nome = 'LL5' OR nome = 'll5'")
        .execute()
    } catch (_) {}
  },
  (app) => {},
)
