// Fase 3 — Migração 0005: backfill dos grupos dos usuários seed.
// A 0004 criou os usuários mas o lookup de grupo falhou (bind em SELECT
// via .all() não retornou linhas no runtime de migração). Correção direta
// por e-mail, idempotente.
migrate(
  (app) => {
    const pares = [
      ['financeiro@extrafruti.com.br', 'Financeiro'],
      ['gestor@extrafruti.com.br', 'Gestor de Unidade'],
      ['auditor@extrafruti.com.br', 'Auditor'],
      ['rh@extrafruti.com.br', 'RH'],
      ['comercial@extrafruti.com.br', 'Comercial'],
    ]
    for (let i = 0; i < pares.length; i++) {
      app
        .db()
        .newQuery(
          "UPDATE users SET grupo_id = (SELECT id FROM grupos_permissao WHERE nome = {:g} LIMIT 1) WHERE email = {:e} AND (grupo_id = '')",
        )
        .bind({ g: pares[i][1], e: pares[i][0] })
        .execute()
    }
  },
  (app) => {},
)
