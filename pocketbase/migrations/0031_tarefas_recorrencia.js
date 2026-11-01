migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('tarefas')
    if (!col.fields.getByName('recorrencia')) {
      col.fields.add(
        new SelectField({
          name: 'recorrencia',
          values: ['Nenhuma', 'Diária', 'Semanal', 'Mensal', 'Bimestral', 'A definir'],
          maxSelect: 1,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('tarefas')
    const f = col.fields.getByName('recorrencia')
    if (f) {
      col.fields.remove(f)
      app.save(col)
    }
  },
)
