// Fase 3 — CRUD de usuários (Controle de Acessos). Somente Admin.
// v4 (11/11/2026): aceita `empresas` (lista) + dados herdados do parceiro
// (telefone, whatsapp, centro de resultado, observação).
// A empresa PRINCIPAL (empresa_id) é a primeira da lista, mantendo compatibilidade
// com o escopo (grupo|empresa|unidade) e com os relatórios que leem empresa_id.
routerAdd(
  'POST',
  '/backend/v1/usuarios',
  (e) => {
    const body = e.requestInfo().body || {}
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

    const email = String(body.email || '').toLowerCase()
    const senha = String(body.senha || '')
    if (!email || senha.length < 8) {
      return e.badRequestError('email e senha (min 8) são obrigatórios')
    }
    try {
      $app.findAuthRecordByEmail('users', email)
      return e.badRequestError('E-mail já cadastrado')
    } catch (_) {}

    // Lista de empresas: aceita array novo OU empresa_id isolado (compatibilidade)
    const empresasIds = []
    if (Array.isArray(body.empresas)) {
      for (const id of body.empresas) {
        const v = String(id || '').trim()
        if (v && !empresasIds.includes(v)) empresasIds.push(v)
      }
    }
    const empresaId = String(body.empresa_id || empresasIds[0] || '').trim()
    if (empresaId && !empresasIds.includes(empresaId)) empresasIds.unshift(empresaId)

    const users = $app.findCollectionByNameOrId('users')
    const rec = new Record(users)
    rec.setEmail(email)
    rec.setPassword(senha)
    rec.setVerified(true)
    rec.set('name', String(body.nome || ''))
    rec.set('cargo', String(body.cargo || ''))
    rec.set('ativo', body.ativo !== false)
    if (body.grupo_id) rec.set('grupo_id', body.grupo_id)
    if (empresaId) rec.set('empresa_id', empresaId)
    if (body.unidade_id) rec.set('unidade_id', body.unidade_id)

    // Dados que vêm do parceiro (opcionais)
    const textos = [
      'telefone',
      'whatsapp',
      'centro_resultado',
      'centro_resultado_codigo',
      'observacao',
    ]
    for (const campo of textos) {
      if (body[campo] !== undefined) {
        try {
          rec.set(campo, String(body[campo] || ''))
        } catch (_) {}
      }
    }

    // Vínculo com Parceiros & Contatos.
    // (11/11/2026) NÃO engolir o erro: o `try/catch` vazio anterior fazia o
    // usuário ser salvo SEM o vínculo quando o campo não existia, sem avisar
    // ninguém — foi assim que o problema passou despercebido.
    try {
      rec.set('empresas', JSON.stringify(empresasIds))
    } catch (err) {
      return e.badRequestError(
        'Falha ao gravar as empresas do usuário: ' + String(err).slice(0, 160),
      )
    }
    if (body.parceiro_id) {
      const pid = String(body.parceiro_id).trim()
      if (pid) {
        try {
          rec.set('parceiro_id', pid)
        } catch (err) {
          return e.badRequestError(
            'Falha ao gravar o parceiro vinculado: ' + String(err).slice(0, 160),
          )
        }
      }
    }

    try {
      $app.save(rec)
    } catch (err) {
      return e.badRequestError('Dados inválidos: ' + String(err))
    }

    try {
      const col = $app.findCollectionByNameOrId('auditoria')
      const a = new Record(col)
      if (auth) {
        a.set('usuario_id', auth.id)
        a.set('usuario_email', auth.getString('email'))
      }
      a.set('acao', 'criar')
      a.set('modulo', 'usuarios')
      a.set('detalhe', {
        email: email,
        parceiro_id: body.parceiro_id || '',
        empresas: empresasIds,
      })
      $app.save(a)
    } catch (_) {}

    return e.json(200, { id: rec.id, email: email, empresas: empresasIds })
  },
  $apis.requireAuth(),
)
