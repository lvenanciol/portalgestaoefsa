// Fase 3 — Lista usuários com grupo/empresa/unidade (Controle de Acessos). Somente Admin.
// redeploy v2 — arquivo não subiu no build v0.0.10 (deploy gap)
routerAdd(
  'GET',
  '/backend/v1/usuarios',
  (e) => {
    const auth = e.auth
    let isAdmin = false
    if (auth) {
      try {
        const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
        isAdmin = g.getString('nome') === 'Admin'
      } catch (_) {}
    }
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const rows = $app.findRecordsByFilter('users', "id != ''", '-created', 200, 0)
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      let grupoNome = ''
      let empresaNome = ''
      let unidadeNome = ''
      try {
        grupoNome = $app
          .findRecordById('grupos_permissao', r.getString('grupo_id'))
          .getString('nome')
      } catch (_) {}
      try {
        empresaNome = $app.findRecordById('empresas', r.getString('empresa_id')).getString('nome')
      } catch (_) {}
      try {
        unidadeNome = $app.findRecordById('unidades', r.getString('unidade_id')).getString('nome')
      } catch (_) {}
      out.push({
        id: r.id,
        nome: r.getString('name'),
        email: r.getString('email'),
        cargo: r.getString('cargo'),
        ativo: r.getBool('ativo'),
        ultimo_login: r.getDateTime('ultimo_login').string(),
        grupo: grupoNome,
        empresa: empresaNome,
        unidade: unidadeNome,
      })
    }
    return e.json(200, { usuarios: out })
  },
  $apis.requireAuth(),
)
