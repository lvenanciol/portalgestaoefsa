// Fase 3 — Migração 0004: completa o seed de usuários.
// 1) Backfill idempotente: vincula o admin seed ao grupo Admin
//    (o lookup da 0003 falhou silenciosamente — findFirstRecordByFilter
//    com sort/limit/offset não é a assinatura correta em migrações).
// 2) 1 usuário seed por grupo (entregável da Fase 3), idempotente por e-mail.
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE users SET grupo_id = (SELECT id FROM grupos_permissao WHERE nome = 'Admin' LIMIT 1) WHERE email = 'leo@extrafruti.com.br' AND (grupo_id = '' OR grupo_id IS NULL)",
      )
      .execute()

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const seeds = [
      {
        email: 'financeiro@extrafruti.com.br',
        nome: 'Equipe Financeiro',
        grupo: 'Financeiro',
        cargo: 'Analista Financeiro',
      },
      {
        email: 'gestor@extrafruti.com.br',
        nome: 'Gestor de Unidade',
        grupo: 'Gestor de Unidade',
        cargo: 'Gestor de Loja',
      },
      {
        email: 'auditor@extrafruti.com.br',
        nome: 'Auditoria Interna',
        grupo: 'Auditor',
        cargo: 'Auditor',
      },
      { email: 'rh@extrafruti.com.br', nome: 'Equipe RH', grupo: 'RH', cargo: 'Analista de RH' },
      {
        email: 'comercial@extrafruti.com.br',
        nome: 'Equipe Comercial',
        grupo: 'Comercial',
        cargo: 'Gerente Comercial',
      },
    ]
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', s.email)
        continue // já existe
      } catch (_) {}
      let gid = ''
      try {
        const rows = app
          .db()
          .newQuery('SELECT id FROM grupos_permissao WHERE nome = {:g}')
          .bind({ g: s.grupo })
          .all()
        if (rows && rows.length) gid = rows[0].id
      } catch (_) {
        gid = ''
      }
      const rec = new Record(users)
      rec.setEmail(s.email)
      rec.setPassword('Extrafruti@2026')
      rec.setVerified(true)
      rec.set('name', s.nome)
      rec.set('cargo', s.cargo)
      rec.set('ativo', true)
      if (gid) rec.set('grupo_id', gid)
      app.save(rec)
    }
  },
  (app) => {
    const emails = [
      'financeiro@extrafruti.com.br',
      'gestor@extrafruti.com.br',
      'auditor@extrafruti.com.br',
      'rh@extrafruti.com.br',
      'comercial@extrafruti.com.br',
    ]
    for (let i = 0; i < emails.length; i++) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', emails[i]))
      } catch (_) {}
    }
  },
)
