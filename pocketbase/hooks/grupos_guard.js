// 11/11/2026 — GUARDA DE PERMISSÕES (escalação de privilégio)
//
// BURACO ENCONTRADO: `grupos_permissao` estava com create/update/delete em
// "@request.auth.id != ''" (migração 0064). Qualquer usuário autenticado podia
// reescrever o JSON `permissoes` do PRÓPRIO grupo — inclusive se dar acesso a
// telas, abas e botões que o admin negou — e, pior, do grupo Admin.
// A tela /acessos ser Admin-only não protege a API: o PocketBase é chamado
// direto pelo cliente.
//
// Esta guarda fecha a API: só membro do grupo "Admin" grava em grupos_permissao.
// $app.save() interno (migrações/hooks) NÃO passa por aqui.
//
// NOTA DE RUNTIME: o JSVM do PocketBase executa cada callback em um pool
// separado — função/const de topo dá ReferenceError. Por isso a checagem é
// repetida INLINE dentro de cada callback (validado pelo QA do Skip).

onRecordCreateRequest((e) => {
  const auth = e.auth
  let permitido = false
  if (auth) {
    try {
      if (auth.collection().name === '_superusers') {
        permitido = true
      }
    } catch (_) {}
    if (!permitido) {
      try {
        const gid = auth.getString('grupo_id')
        if (gid) {
          const g = $app.findRecordById('grupos_permissao', gid)
          permitido = String(g.getString('nome')).trim() === 'Admin'
        }
      } catch (_) {}
    }
  }
  if (!permitido) {
    throw new ForbiddenError('Somente administradores podem criar grupos de permissão.')
  }
  return e.next()
}, 'grupos_permissao')

onRecordUpdateRequest((e) => {
  const auth = e.auth
  let permitido = false
  if (auth) {
    try {
      if (auth.collection().name === '_superusers') {
        permitido = true
      }
    } catch (_) {}
    if (!permitido) {
      try {
        const gid = auth.getString('grupo_id')
        if (gid) {
          const g = $app.findRecordById('grupos_permissao', gid)
          permitido = String(g.getString('nome')).trim() === 'Admin'
        }
      } catch (_) {}
    }
  }
  if (!permitido) {
    throw new ForbiddenError('Somente administradores podem alterar permissões de grupo.')
  }
  return e.next()
}, 'grupos_permissao')

onRecordDeleteRequest((e) => {
  const auth = e.auth
  let permitido = false
  if (auth) {
    try {
      if (auth.collection().name === '_superusers') {
        permitido = true
      }
    } catch (_) {}
    if (!permitido) {
      try {
        const gid = auth.getString('grupo_id')
        if (gid) {
          const g = $app.findRecordById('grupos_permissao', gid)
          permitido = String(g.getString('nome')).trim() === 'Admin'
        }
      } catch (_) {}
    }
  }
  if (!permitido) {
    throw new ForbiddenError('Somente administradores podem excluir grupos de permissão.')
  }
  return e.next()
}, 'grupos_permissao')
