// ============================================================================
// EXCLUSÃO DE USUÁRIO — DELETE /backend/v1/usuarios/{id}
//
// 18/11/2026: o botão "Excluir" da tela de Controle de Acessos não existia e
// o endpoint também não. Criado aqui.
//
// PROTEÇÕES (deliberadas):
//   1. Somente Admin (ou superuser).
//   2. NUNCA excluir a si próprio — evita o admin se trancar fora do sistema.
//   3. NUNCA excluir o último Admin ativo — sem isso, um clique remove o único
//      administrador e ninguém mais consegue gerenciar acessos.
//   4. Registra em `auditoria` com o e-mail removido e quem removeu.
//
// Não é exclusão física de histórico: tarefas e atas apontam para o usuário por
// e-mail/nome em texto, então nada é órfão no banco.
// ============================================================================
routerAdd(
  'DELETE',
  '/backend/v1/usuarios/{id}',
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

    const id = e.request.pathValue('id')
    let alvo
    try {
      alvo = $app.findRecordById('users', id)
    } catch (_) {
      return e.notFoundError('Usuário não encontrado.')
    }

    // ---- proteção 2: não excluir a si próprio ----
    if (auth && auth.id === id) {
      return e.badRequestError(
        'Você não pode excluir o próprio usuário. Peça a outro administrador.',
      )
    }

    const emailAlvo = alvo.getString('email')
    const nomeAlvo = alvo.getString('name')

    // ---- proteção 3: não remover o último Admin ativo ----
    let ehAdminAlvo = false
    try {
      const gAlvo = $app.findRecordById('grupos_permissao', alvo.getString('grupo_id'))
      ehAdminAlvo = gAlvo.getString('nome') === 'Admin'
    } catch (_) {}

    if (ehAdminAlvo) {
      let adminsAtivos = 0
      try {
        const grupos = $app.findRecordsByFilter('grupos_permissao', 'nome = "Admin"', '', 1, 0)
        if (grupos && grupos.length) {
          const gid = grupos[0].id
          const lista = $app.findRecordsByFilter(
            'users',
            'grupo_id = "' + gid + '" && ativo = true',
            '',
            200,
            0,
          )
          adminsAtivos = lista.length
        }
      } catch (_) {}

      if (adminsAtivos <= 1) {
        return e.badRequestError(
          'Este é o último administrador ativo. Promova outro usuário a Admin antes de excluir.',
        )
      }
    }

    try {
      $app.delete(alvo)
    } catch (err) {
      return e.badRequestError('Falha ao excluir: ' + String(err).slice(0, 200))
    }

    // ---- auditoria ----
    try {
      const col = $app.findCollectionByNameOrId('auditoria')
      const a = new Record(col)
      if (auth) {
        a.set('usuario_id', auth.id)
        a.set('usuario_email', auth.getString('email'))
      }
      a.set('acao', 'excluir')
      a.set('modulo', 'usuarios')
      a.set('detalhe', { email: emailAlvo, nome: nomeAlvo, id: id })
      $app.save(a)
    } catch (errAud) {
      console.log('[usuarios/delete] auditoria falhou: ' + String(errAud).slice(0, 120))
    }

    console.log(
      '[usuarios/delete] removido ' +
        emailAlvo +
        ' por ' +
        (auth ? auth.getString('email') : 'superuser'),
    )
    return e.json(200, { ok: true, id: id, email: emailAlvo })
  },
  $apis.requireAuth(),
)
