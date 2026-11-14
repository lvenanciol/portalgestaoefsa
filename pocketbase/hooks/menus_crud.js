// ============================================================================
// ÁRVORE DE MENUS — CRUD de seções e itens (15/11/2026)
//
// POR QUE UM HOOK E NÃO A API DIRETA
// A coleção `menus` tem createRule/updateRule/deleteRule = null. Nenhuma
// escrita passa pela API do PocketBase — só por `$app` no servidor. Foi por
// isso que as migrações 076/077/078 registraram "applied" sem mudar nada.
//
// Aqui o servidor valida o grupo Admin e grava com privilégio total.
//
// ENDPOINTS (todos POST, exigem Admin):
//   /backend/v1/menus/criar      {titulo, rota, secao, ordem, icone, ativo}
//   /backend/v1/menus/editar     {id, ...campos}
//   /backend/v1/menus/excluir    {id}
//   /backend/v1/menus/mover      {id, secao, ordem}      — troca de seção
//   /backend/v1/menus/reordenar  {secao, ids: []}        — ordem dentro da seção
// ============================================================================

/** Verifica se o chamador é administrador. */
function exigirAdmin(e) {
  const auth = e.auth
  if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

  let isAdmin = false
  try {
    const grupoId = auth.getString('grupo_id')
    if (!grupoId) {
      // sem grupo = superusuário do portal
      isAdmin = true
    } else {
      const g = $app.findRecordById('grupos_permissao', grupoId)
      isAdmin = g.getString('nome') === 'Admin'
    }
  } catch (_) {
    isAdmin = false
  }

  if (!isAdmin && e.hasSuperuserAuth && e.hasSuperuserAuth()) isAdmin = true
  if (!isAdmin) throw new ForbiddenError('Acesso restrito a administradores.')
  return auth
}

/** Normaliza e valida o payload de um item de menu. */
function lerCampos(body) {
  const titulo = String(body.titulo || '').trim()
  if (!titulo) throw new BadRequestError('Informe o título do item.')

  const rota = String(body.rota || '').trim()
  const secao = String(body.secao || '').trim()
  if (!secao) throw new BadRequestError('Informe a seção do item.')

  const ordem = Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 99
  const icone = String(body.icone || '').trim() || 'file-text'
  const ativo = body.ativo === undefined ? true : !!body.ativo

  return { titulo, rota, secao, ordem, icone, ativo }
}

// ---------------------------------------------------------------------------
// CRIAR
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/menus/criar',
  (e) => {
    exigirAdmin(e)
    const body = e.requestInfo().body || {}
    const c = lerCampos(body)

    // rota é única (uma tela não aparece duas vezes na sidebar)
    if (c.rota) {
      try {
        const existe = $app.findFirstRecordByData('menus', 'rota', c.rota)
        if (existe) {
          return e.badRequestError('Já existe um item de menu com a rota ' + c.rota + '.')
        }
      } catch (_) {
        // não existe — pode criar
      }
    }

    const col = $app.findCollectionByNameOrId('menus')
    const rec = new Record(col)
    rec.set('titulo', c.titulo)
    rec.set('rota', c.rota || null)
    rec.set('secao', c.secao)
    rec.set('ordem', c.ordem)
    rec.set('icone', c.icone)
    rec.set('ativo', c.ativo)
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
    exigirAdmin(e)
    const body = e.requestInfo().body || {}
    const id = String(body.id || '').trim()
    if (!id) return e.badRequestError('Informe o id do item.')

    let rec
    try {
      rec = $app.findRecordById('menus', id)
    } catch (_) {
      return e.notFoundError('Item de menu não encontrado.')
    }

    const c = lerCampos(body)

    // unicidade da rota, ignorando o próprio registro
    if (c.rota) {
      try {
        const outro = $app.findFirstRecordByData('menus', 'rota', c.rota)
        if (outro && outro.id !== id) {
          return e.badRequestError('Outro item já usa a rota ' + c.rota + '.')
        }
      } catch (_) {
        // livre
      }
    }

    rec.set('titulo', c.titulo)
    rec.set('rota', c.rota || null)
    rec.set('secao', c.secao)
    rec.set('ordem', c.ordem)
    rec.set('icone', c.icone)
    rec.set('ativo', c.ativo)
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
    exigirAdmin(e)
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
    exigirAdmin(e)
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

    // ordem de destino: informada ou vai para o fim da seção
    let ordem = Number(body.ordem)
    if (!Number.isFinite(ordem)) {
      let maior = 0
      try {
        const irmaos = $app.findRecordsByFilter(
          'menus',
          'secao = "' + secao.replace(/"/g, '\\"') + '"',
          '-ordem',
          1,
          0,
        )
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
    exigirAdmin(e)
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
        // item removido no meio do caminho: segue com os demais
      }
    }

    return e.json(200, { ok: true, atualizados: atualizados })
  },
  $apis.requireAuth(),
)
