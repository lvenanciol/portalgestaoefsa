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
