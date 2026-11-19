/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FILA DE E-MAIL (19/11/2026)
//
// PROBLEMA MEDIDO: o botão "Enviar" do chat da tarefa travava ~8 segundos.
// A instrumentação provou a causa:
//   · o hook `chat_email` gasta 3 ms;
//   · `enviarEmail` → `$app.newMailClient().send()` leva 3.600–4.900 ms POR
//     DESTINATÁRIO, e o laço envia um por vez, em série, DENTRO do request;
//   · `$app.go` NÃO existe neste JSVM ("Object has no member 'go'") e
//     `setTimeout` também não — não há thread nem timer para paralelizar.
//
// SOLUÇÃO: fila no banco. O hook grava o e-mail como PENDENTE (1 insert,
// ~milissegundos) e responde na hora; um cron drena a fila a cada minuto,
// fora do ciclo de resposta.
//
// A coleção `emails` existente NÃO serve: seu campo `status` só aceita
// `enviado|erro` e não guarda o HTML. Coleção própria, isolada.
// ============================================================================

migrate(
  (app) => {
    const col = new Collection({
      name: 'emails_fila',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.grupo_id.nome = 'Admin'",
      viewRule: "@request.auth.id != '' && @request.auth.grupo_id.nome = 'Admin'",
      // só o backend grava (hook e cron usam $app, que ignora regras)
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: 'para', required: true, max: 190 }),
        new TextField({ name: 'assunto', required: true, max: 190 }),
        new TextField({ name: 'corpo_texto', max: 40000 }),
        new TextField({ name: 'corpo_html', max: 200000 }),
        new SelectField({
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['pendente', 'enviado', 'erro'],
        }),
        new TextField({ name: 'erro', max: 500 }),
        new TextField({ name: 'modelo', max: 60 }),
        new NumberField({ name: 'tentativas' }),
        new AutodateField({ name: 'enviado_em' }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
    })
    app.save(col)

    // índice para o cron achar os pendentes rápido
    const c2 = app.findCollectionByNameOrId('emails_fila')
    c2.addIndex('idx_fila_status', false, 'status, created', '')
    app.save(c2)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('emails_fila'))
  },
)
