// Fechamento de gaps da verificação (19/10):
// - arquivos_importados.versao (biblioteca de documentos com versões)
// - ia_pareceres.modelo (modelo usado — custo/tokens não expostos pelo gateway)
// - emails.corpo + emails.modelo (compositor)
// - tarefas.empresa (escopo empresa/unidade)

migrate(
  (app) => {
    const arq = app.findCollectionByNameOrId('arquivos_importados')
    arq.fields.add(new NumberField({ name: 'versao', onlyInt: true }))
    app.save(arq)

    const par = app.findCollectionByNameOrId('ia_pareceres')
    par.fields.add(new TextField({ name: 'modelo', max: 40 }))
    app.save(par)

    const em = app.findCollectionByNameOrId('emails')
    em.fields.add(new TextField({ name: 'corpo', max: 20000 }))
    em.fields.add(new TextField({ name: 'modelo', max: 60 }))
    app.save(em)

    const ta = app.findCollectionByNameOrId('tarefas')
    ta.fields.add(new TextField({ name: 'empresa', max: 120 }))
    app.save(ta)
  },
  (app) => {
    for (const [col, fields] of [
      ['arquivos_importados', ['versao']],
      ['ia_pareceres', ['modelo']],
      ['emails', ['corpo', 'modelo']],
      ['tarefas', ['empresa']],
    ]) {
      try {
        const c = app.findCollectionByNameOrId(col)
        for (const f of fields) {
          try {
            c.fields.removeByName(f)
          } catch (_) {}
        }
        app.save(c)
      } catch (_) {}
    }
  },
)
