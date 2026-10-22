// T0a (22/10) — emails_inbox.pasta: caixa (inbox), sent (enviados), trash
// (excluídos), drafts (rascunhos). Tarefa f: o front lista as pastas na
// mesma caixa "Caixa Sincronizada" (título muda conforme a seleção) e
// "Sincronizar caixa" respeita a pasta selecionada. Sync antigo gravava
// tudo como 'caixa' — default 'caixa' mantém os registros existentes.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('emails_inbox')
    const tem = col.fields.some((f) => f.name === 'pasta')
    if (!tem) {
      col.fields.add(
        new Field({
          type: 'select',
          name: 'pasta',
          required: false,
          maxSelect: 1,
          values: ['caixa', 'sent', 'trash', 'drafts'],
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('emails_inbox')
    col.fields = col.fields.filter((f) => f.name !== 'pasta')
    app.save(col)
  },
)
