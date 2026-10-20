// TAREFA 5b — ata guarda o arquivo de áudio (gravado/upload) + transcrição
// literal é persistida no campo pauta (visão principal). Campo file 'audio'.

migrate(
  (app) => {
    const atas = app.findCollectionByNameOrId('atas')
    atas.fields.add(
      new FileField({
        name: 'audio',
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: [
          'audio/mpeg',
          'audio/mp4',
          'audio/wav',
          'audio/webm',
          'audio/ogg',
          'audio/x-m4a',
        ],
      }),
    )
    app.save(atas)
  },
  (app) => {
    try {
      const atas = app.findCollectionByNameOrId('atas')
      atas.fields.removeByName('audio')
      app.save(atas)
    } catch (_) {}
  },
)
