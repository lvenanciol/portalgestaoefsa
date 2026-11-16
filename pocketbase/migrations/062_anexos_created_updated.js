/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// ADICIONAR `created` E `updated` EM ll5_attachments (16/11/2026)
//
// SINTOMA: "ícone ver indisponível mesmo anexando arquivo" — o anexo é gravado,
// mas a lista nunca carrega.
//
// CAUSA (provada pelo log do Skip Cloud):
//   GET /api/collections/ll5_attachments/records?...&sort=-created  → 400
//   "invalid sort field 'created'"
//
// A coleção foi criada com `new Collection({fields})`, e nessa forma o
// PocketBase NÃO cria os campos automáticos `created`/`updated`. Sem eles,
// qualquer consulta que ordene por `-created` (o padrão do nosso helper
// `listar`) falha com 400 e a lista volta VAZIA.
//
// Correção: adicionar os dois AutodateField. Eles já vêm preenchidos nos
// registros existentes a partir de agora (registros antigos ficam com o
// horário da migração).
// ============================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ll5_attachments')

    // já existem? então nada a fazer
    let temCreated = false
    let temUpdated = false
    const campos = col.fields
    for (let i = 0; i < campos.length; i++) {
      const nome = String(campos[i].name || '')
      if (nome === 'created') temCreated = true
      if (nome === 'updated') temUpdated = true
    }

    if (!temCreated) {
      col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
      console.log('[anexos] campo created adicionado')
    } else {
      console.log('[anexos] created já existia')
    }

    if (!temUpdated) {
      col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
      console.log('[anexos] campo updated adicionado')
    } else {
      console.log('[anexos] updated já existia')
    }

    if (!temCreated || !temUpdated) {
      app.save(col)
      console.log('[anexos] coleção salva')
    }

    // ---- conferência ----
    try {
      const ach = app.findRecordsByFilter('ll5_attachments', "id != ''", '-created', 5, 0)
      console.log('[anexos] consulta com sort=-created OK: ' + ach.length + ' registro(s)')
      for (const a of ach) {
        console.log(
          '[anexos] ex.: ' +
            String(a.getString('nome_arquivo') || '?') +
            ' | tratamento=' +
            String(a.getString('tratamento_id') || '?'),
        )
      }
    } catch (err) {
      console.log('[anexos] consulta FALHOU: ' + String(err).slice(0, 160))
    }

    console.log('[anexos] CONCLUÍDO')
  },
  (app) => {
    console.log('[anexos] rollback: campos created/updated mantidos')
  },
)
