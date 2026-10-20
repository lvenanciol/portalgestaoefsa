// T4/T7 (20/10) — Upload de logo/emblema SEM superuser (coleção logomarcas
// tem regra superuser-only → ClientResponseError 403 para admin comum).
// POST /backend/v1/logomarcas/upload (multipart: campo 'arquivo' + 'empresa' + 'tipo')
// O hook roda com auth de admin e grava via $app (superuser interno).
// Aceita pdf/png/jpg/svg (T4b: PDF é anexado e exibido via <object>/link).

routerAdd(
  'POST',
  '/backend/v1/logomarcas/upload',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const reqInfo = e.requestInfo()
    const empresa = String((reqInfo.body && reqInfo.body.empresa) || '').trim()
    const tipo = String((reqInfo.body && reqInfo.body.tipo) || 'logo') // logo | emblema
    if (!empresa) return e.badRequestError('empresa é obrigatório')

    // arquivo multipart
    const arq = e.findFileField ? null : null
    let arquivo = null
    try {
      const files = reqInfo.files || []
      for (const f of files) {
        if (f && (f.originalFilename || f.name)) arquivo = f
      }
    } catch (_) {}
    if (!arquivo) return e.badRequestError('arquivo é obrigatório (campo "arquivo")')

    const nome = String(arquivo.originalFilename || arquivo.name || '')
    const okExt = /\.(pdf|png|jpg|jpeg|svg|webp)$/i.test(nome)
    if (!okExt)
      return e.badRequestError('Formato não suportado (aceito: pdf, png, jpg, svg, webp).')

    try {
      const rec = $app.findFirstRecordByFilter(
        'logomarcas',
        'empresa = "' + empresa.replace(/"/g, '') + '"',
      )
      const col = $app.findCollectionByNameOrId('logomarcas')
      // limpa arquivo anterior do campo
      try {
        rec.set(tipo, null)
      } catch (_) {}
      rec.set(tipo, arquivo)
      $app.save(rec)
      return e.json(200, { ok: true, id: rec.id, campo: tipo, arquivo: nome })
    } catch (err) {
      return e.json(502, { ok: false, erro: 'Falha ao gravar: ' + String(err).slice(0, 160) })
    }
  },
  $apis.requireAuth(),
)
