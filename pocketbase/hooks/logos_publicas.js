// LOGIN (22/10): logomarcas para a tela de login (ANÔNIMO) — leitura pública
// de logo/emblema/sigla/cor/empresa APENAS (sem segredos). GET /backend/v1/public/logos
routerAdd(
  'GET',
  '/backend/v1/public/logos',
  (e) => {
    const rs = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 20, 0)
    const out = []
    for (const r of rs) {
      out.push({
        id: r.getString('id'),
        empresa: r.getString('empresa'),
        sigla: r.getString('sigla'),
        cor: r.getString('cor'),
        logo: r.getString('logo'),
        emblema: r.getString('emblema'),
      })
    }
    return e.json(200, { ok: true, logos: out })
  },
  // sem $apis.requireAuth() — público (só dados de marca, sem segredos)
)

// PWA: ícone da Extrafruti em PNG puro servido com Content-Type image/png
// Lê os bytes diretamente do storage do PocketBase e serve sem redirect
routerAdd('GET', '/backend/v1/public/extrafruti-icon.png', (e) => {
  try {
    const rec = $app.findFirstRecordByFilter('logomarcas', 'empresa ~ "Extrafruti"')
    const arquivo = rec.getString('emblema') || rec.getString('logo')
    const res = $http.send({
      url:
        'https://portal-de-gestao-executivo-b4d94.shrd01.internal.goskip.dev/api/files/pbc_3701359284/' +
        rec.id +
        '/' +
        arquivo,
      method: 'GET',
    })
    return e.blob(200, 'image/png', res.raw)
  } catch (err) {
    return e.json(500, { ok: false, erro: String(err) })
  }
})


