// ============================================================================
// ÁRVORE DE MENUS — CRUD de seções e itens (15/11/2026)
//
// POR QUE UM HOOK E NÃO A API DIRETA
// A coleção `menus` tem createRule/updateRule/deleteRule = null. Nenhuma
// escrita passa pela API do PocketBase — só por `$app` no servidor. Foi por
// isso que as migrações 076/077/078 registraram "applied" sem mudar nada.
//
// REGRA DO JSVM (obrigatória): NENHUMA função no topo do arquivo. Os callbacks
// rodam em outro pool de VM e um helper de topo causaria ReferenceError.
// Todo o auxiliar é declarado DENTRO de cada callback.
//
// ENDPOINTS (todos POST, exigem Admin):
//   /backend/v1/menus/criar      {titulo, rota, secao, ordem, icone, ativo}
//   /backend/v1/menus/editar     {id, ...campos}
//   /backend/v1/menus/excluir    {id}
//   /backend/v1/menus/mover      {id, secao, ordem}
//   /backend/v1/menus/reordenar  {secao, ids: []}
// ============================================================================

// ---------------------------------------------------------------------------
// CRIAR
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/criar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const grupoId = auth.getString('grupo_id')
      if (!grupoId) isAdmin = true
      else isAdmin = $app.findRecordById('grupos_permissao', grupoId).getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
    if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const titulo = String(body.titulo || '').trim()
    const secao = String(body.secao || '').trim()
    const rota = String(body.rota || '').trim()
    if (!titulo) return e.badRequestError('Informe o título do item.')
    if (!secao) return e.badRequestError('Informe a seção do item.')

    const ordem = Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 99
    const icone = String(body.icone || '').trim() || 'file-text'
    const ativo = body.ativo === undefined ? true : !!body.ativo

    if (rota) {
      try {
        const existe = $app.findFirstRecordByData('menus', 'rota', rota)
        if (existe) {
          return e.badRequestError('Já existe um item de menu com a rota ' + rota + '.')
        }
      } catch (_) {
        // livre
      }
    }

    const col = $app.findCollectionByNameOrId('menus')
    const rec = new Record(col)
    rec.set('titulo', titulo)
    rec.set('rota', rota || null)
    rec.set('secao', secao)
    rec.set('ordem', ordem)
    rec.set('icone', icone)
    rec.set('ativo', ativo)
    $app.save(rec)

    return e.json(200, { ok: true, id: rec.id })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// EDITAR
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/editar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const grupoId = auth.getString('grupo_id')
      if (!grupoId) isAdmin = true
      else isAdmin = $app.findRecordById('grupos_permissao', grupoId).getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
    if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const id = String(body.id || '').trim()
    if (!id) return e.badRequestError('Informe o id do item.')

    let rec
    try {
      rec = $app.findRecordById('menus', id)
    } catch (_) {
      return e.notFoundError('Item de menu não encontrado.')
    }

    const titulo = String(body.titulo || '').trim()
    const secao = String(body.secao || '').trim()
    const rota = String(body.rota || '').trim()
    if (!titulo) return e.badRequestError('Informe o título do item.')
    if (!secao) return e.badRequestError('Informe a seção do item.')

    if (rota) {
      try {
        const outro = $app.findFirstRecordByData('menus', 'rota', rota)
        if (outro && outro.id !== id) {
          return e.badRequestError('Outro item já usa a rota ' + rota + '.')
        }
      } catch (_) {
        // livre
      }
    }

    const ordem = Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : rec.get('ordem') || 99
    const icone = String(body.icone || '').trim() || 'file-text'
    const ativo = body.ativo === undefined ? !!rec.get('ativo') : !!body.ativo

    rec.set('titulo', titulo)
    rec.set('rota', rota || null)
    rec.set('secao', secao)
    rec.set('ordem', ordem)
    rec.set('icone', icone)
    rec.set('ativo', ativo)
    $app.save(rec)

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// EXCLUIR
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/excluir',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const grupoId = auth.getString('grupo_id')
      if (!grupoId) isAdmin = true
      else isAdmin = $app.findRecordById('grupos_permissao', grupoId).getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
    if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const id = String(body.id || '').trim()
    if (!id) return e.badRequestError('Informe o id do item.')

    try {
      const rec = $app.findRecordById('menus', id)
      $app.delete(rec)
    } catch (_) {
      return e.notFoundError('Item de menu não encontrado.')
    }

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// MOVER ENTRE SEÇÕES
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/mover',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const grupoId = auth.getString('grupo_id')
      if (!grupoId) isAdmin = true
      else isAdmin = $app.findRecordById('grupos_permissao', grupoId).getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
    if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const id = String(body.id || '').trim()
    const secao = String(body.secao || '').trim()
    if (!id) return e.badRequestError('Informe o id do item.')
    if (!secao) return e.badRequestError('Informe a seção de destino.')

    let rec
    try {
      rec = $app.findRecordById('menus', id)
    } catch (_) {
      return e.notFoundError('Item de menu não encontrado.')
    }

    let ordem = Number(body.ordem)
    if (!Number.isFinite(ordem)) {
      let maior = 0
      try {
        const esc = secao.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const irmaos = $app.findRecordsByFilter('menus', 'secao = "' + esc + '"', '-ordem', 1, 0)
        if (irmaos && irmaos.length) maior = Number(irmaos[0].get('ordem')) || 0
      } catch (_) {
        maior = 0
      }
      ordem = maior + 1
    }

    rec.set('secao', secao)
    rec.set('ordem', ordem)
    $app.save(rec)

    return e.json(200, { ok: true, secao: secao, ordem: ordem })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// REORDENAR DENTRO DA SEÇÃO
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/reordenar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const grupoId = auth.getString('grupo_id')
      if (!grupoId) isAdmin = true
      else isAdmin = $app.findRecordById('grupos_permissao', grupoId).getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
    if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).trim()) : []
    if (!ids.length) return e.badRequestError('Informe a lista de ids na nova ordem.')

    let atualizados = 0
    for (let i = 0; i < ids.length; i++) {
      try {
        const rec = $app.findRecordById('menus', ids[i])
        rec.set('ordem', i + 1)
        $app.save(rec)
        atualizados++
      } catch (_) {
        // item removido: segue com os demais
      }
    }

    return e.json(200, { ok: true, atualizados: atualizados })
  },
  $apis.requireAuth(),
)
