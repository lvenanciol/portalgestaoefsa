// T4a (20/10) — logomarcas: regras superuser-only causavam 403 para admin
// comum ("Only superusers can perform this action"). Novas regras:
// authenticated lê; create/update/delete liberado para authenticated
// (a tela é admin-only pelo roteamento; gates da Fase 9 controlam botões).
// T4b: mimeTypes aceitos pdf/png/jpg/svg/webp nos campos logo/emblema.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('logomarcas')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != ''"
    col.updateRule = "@request.auth.id != ''"
    col.deleteRule = "@request.auth.id != ''"
    for (const f of col.fields) {
      if (f.name === 'logo' || f.name === 'emblema') {
        f.mimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
      }
    }
    app.save(col)
  },
  (app) => {
    // reversão: volta para superuser-only
    const col = app.findCollectionByNameOrId('logomarcas')
    col.listRule = null
    col.viewRule = null
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null
    app.save(col)
  },
)
