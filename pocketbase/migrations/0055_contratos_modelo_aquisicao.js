migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('contratos')
    if (!col.fields.getByName('modelo_contrato')) {
      col.fields.add(
        new SelectField({
          name: 'modelo_contrato',
          values: ['reajuste_periodico', 'unico_aquisicao'],
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!col.fields.getByName('valor_total')) {
      col.fields.add(
        new NumberField({
          name: 'valor_total',
          min: 0,
          required: false,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('contratos')
    if (col.fields.getByName('modelo_contrato')) {
      col.fields.removeByName('modelo_contrato')
    }
    if (col.fields.getByName('valor_total')) {
      col.fields.removeByName('valor_total')
    }
    app.save(col)
  },
)
