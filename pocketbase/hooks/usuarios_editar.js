// Fase 3 — Editar vínculos/status de um usuário (Controle de Acessos). Somente Admin.
// v4 (11/11/2026): aceita `empresas` (lista) + dados herdados do parceiro.
// A primeira empresa da lista vira a principal (empresa_id).
routerAdd(
  'PATCH',
  '/backend/v1/usuarios/{id}',
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

    const id = e.request.pathValue('id')
    let rec
    try {
      rec = $app.findRecordById('users', id)
    } catch (_) {
      return e.notFoundError('Usuário não encontrado')
    }

    // (11/11/2026) E-mail de acesso: derivado do parceiro vinculado. Quando o
    // parceiro muda de e-mail, o login da conta precisa acompanhar — senão a
    // tela exibe um endereço e a autenticação usa outro.
    if (body.email !== undefined) {
      const novoEmail = String(body.email || '')
        .trim()
        .toLowerCase()
      if (novoEmail) {
        const atual = String(rec.getString('email') || '').toLowerCase()
        if (novoEmail !== atual) {
          // não permite colidir com outra conta
          let emUso = false
          try {
            const outro = $app.findAuthRecordByEmail('users', novoEmail)
            if (outro && outro.id !== rec.id) emUso = true
          } catch (_) {}
          if (emUso) {
            return e.badRequestError(
              'O e-mail ' + novoEmail + ' já pertence a outro usuário do sistema.',
            )
          }
          rec.setEmail(novoEmail)
          // e-mail mudou → exige nova verificação? mantém verificado porque é
          // uma conta corporativa criada pelo admin.
          rec.setVerified(true)
        }
      }
    }

    if (body.nome !== undefined) rec.set('name', String(body.nome))
    if (body.cargo !== undefined) rec.set('cargo', String(body.cargo))
    if (body.ativo !== undefined) rec.set('ativo', Boolean(body.ativo))
    if (body.grupo_id !== undefined) rec.set('grupo_id', body.grupo_id)
    if (body.unidade_id !== undefined) rec.set('unidade_id', body.unidade_id)

    // ===== Empresas (múltiplas) =====
    // `empresas` é a lista completa; `empresa_id` é a principal (1ª da lista).
    if (Array.isArray(body.empresas)) {
      const ids = []
      for (const v of body.empresas) {
        const s = String(v || '').trim()
        if (s && !ids.includes(s)) ids.push(s)
      }
      try {
        rec.set('empresas', JSON.stringify(ids))
      } catch (_) {}
      // Principal: primeira selecionada. Lista vazia limpa a principal.
      const principal = ids.length > 0 ? ids[0] : ''
      rec.set('empresa_id', principal)
      // Unidade só faz sentido dentro da empresa principal: se ela não está
      // mais na lista, a unidade fica órfã e é limpa.
      const unidadeAtual = rec.getString('unidade_id')
      if (unidadeAtual) {
        try {
          const u = $app.findRecordById('unidades', unidadeAtual)
          const uniEmp = u.getString('empresa_id')
          if (uniEmp && ids.length > 0 && !ids.includes(uniEmp)) {
            rec.set('unidade_id', '')
          }
        } catch (_) {}
      }
    } else if (body.empresa_id !== undefined) {
      // Compatibilidade: cliente antigo manda só empresa_id
      rec.set('empresa_id', body.empresa_id)
    }

    // ===== Dados herdados do parceiro =====
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
    // (11/11/2026) Sem `catch` mudo: se o campo não existir, a edição FALHA com
    // mensagem, em vez de salvar o usuário sem o vínculo e parecer que deu certo.
    if (body.parceiro_id !== undefined) {
      try {
        rec.set('parceiro_id', String(body.parceiro_id || ''))
      } catch (err) {
        return e.badRequestError(
          'Falha ao gravar o parceiro vinculado: ' + String(err).slice(0, 160),
        )
      }
    }

    if (body.senha) {
      if (String(body.senha).length < 8) return e.badRequestError('senha mínima de 8 caracteres')
      rec.setPassword(String(body.senha))
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
      a.set('acao', 'editar')
      a.set('modulo', 'usuarios')
      a.set('detalhe', { usuario: id, campos: Object.keys(body) })
      $app.save(a)
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
