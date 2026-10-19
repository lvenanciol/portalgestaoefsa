// Ajustes PGE — T3/T4: itens de menu das telas novas (Parceiros, Logomarcas)
// na coleção menus (sidebar dinâmica lê daqui).

migrate(
  (app) => {
    const seeds = [
      {
        titulo: 'Parceiros & Contatos',
        rota: '/parceiros',
        secao: 'RELACIONAMENTO',
        ordem: 11,
        icone: 'users',
      },
      {
        titulo: 'Logomarcas',
        rota: '/logomarcas',
        secao: 'PLATAFORMA',
        ordem: 16,
        icone: 'settings',
      },
    ]
    for (const s of seeds) {
      try {
        app.findFirstRecordByFilter('menus', 'rota = "' + s.rota + '"')
      } catch (_) {
        const col = app.findCollectionByNameOrId('menus')
        const r = new Record(col)
        r.set('titulo', s.titulo)
        r.set('rota', s.rota)
        r.set('secao', s.secao)
        r.set('ordem', s.ordem)
        r.set('icone', s.icone)
        r.set('ativo', true)
        app.save(r)
      }
    }
  },
  (app) => {
    for (const rota of ['/parceiros', '/logomarcas']) {
      try {
        const r = app.findFirstRecordByFilter('menus', 'rota = "' + rota + '"')
        app.delete(r)
      } catch (_) {}
    }
  },
)
