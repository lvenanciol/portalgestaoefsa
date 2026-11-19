/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FILA DE E-MAIL — CRIA OS CAMPOS QUE FALTARAM (19/11/2026)
//
// A migração 0140 (0155 na instância) criou a coleção `emails_fila` mas os
// campos NÃO foram materializados: a coleção ficou só com o `id` de sistema.
// Sintoma que denunciou: o cron logava
//   "invalid filter expression: invalid left operand \"status\" - unknown field \"status\""
// e nenhum e-mail era enfileirado.
//
// Aqui os campos são adicionados com `col.fields.add(new XField(...))` —
// a forma documentada. A tentativa anterior passou `fields: [...]` no
// construtor de `new Collection({...})`, que não materializou.
// ============================================================================

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('emails_fila')

    function tem(nome) {
      return !!col.fields.getByName(nome)
    }

    if (!tem('para')) col.fields.add(new TextField({ name: 'para', max: 190 }))
    if (!tem('assunto')) col.fields.add(new TextField({ name: 'assunto', max: 190 }))
    if (!tem('corpo_texto')) col.fields.add(new TextField({ name: 'corpo_texto', max: 40000 }))
    if (!tem('corpo_html')) col.fields.add(new TextField({ name: 'corpo_html', max: 200000 }))
    if (!tem('status')) {
      col.fields.add(
        new SelectField({
          name: 'status',
          maxSelect: 1,
          values: ['pendente', 'enviado', 'erro'],
        }),
      )
    }
    if (!tem('erro')) col.fields.add(new TextField({ name: 'erro', max: 500 }))
    if (!tem('modelo')) col.fields.add(new TextField({ name: 'modelo', max: 60 }))
    if (!tem('tentativas')) col.fields.add(new NumberField({ name: 'tentativas' }))
    if (!tem('enviado_em')) col.fields.add(new DateField({ name: 'enviado_em' }))

    // regra de leitura: só Admin vê a fila (não é dado de negócio do usuário)
    col.listRule = "@request.auth.id != '' && @request.auth.grupo_id.nome = 'Admin'"
    col.viewRule = col.listRule
    // escrita só pelo backend (hook e cron usam $app, que ignora regras)
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null

    app.save(col)
  },
  (app) => {
    // rollback: remove os campos adicionados (mantém a coleção)
    const col = app.findCollectionByNameOrId('emails_fila')
    const nomes = [
      'para',
      'assunto',
      'corpo_texto',
      'corpo_html',
      'status',
      'erro',
      'modelo',
      'tentativas',
      'enviado_em',
    ]
    for (const n of nomes) {
      try {
        if (col.fields.getByName(n)) col.fields.removeByName(n)
      } catch (_) {}
    }
    app.save(col)
  },
)
