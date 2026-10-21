// T-Xb (2026-10-21) — atas: campo de áudio aceita MÚLTIPLOS arquivos
// (gravações ilimitadas + uploads em lote). Substitui o FileField 'audio'
// (maxSelect 1) por maxSelect 0 = ilimitado. Mime types ampliados p/ m4a comum.

migrate(
  (app) => {
    const atas = app.findCollectionByNameOrId('atas')
    try {
      atas.fields.removeByName('audio')
    } catch (_) {}
    atas.fields.add(
      new FileField({
        name: 'audio',
        maxSelect: 0,
        maxSize: 52428800,
        mimeTypes: [
          'audio/mpeg',
          'audio/mp4',
          'audio/wav',
          'audio/webm',
          'audio/ogg',
          'audio/x-m4a',
          'audio/mp3',
        ],
      }),
    )
    app.save(atas)
  },
  (app) => {
    try {
      const atas = app.findCollectionByNameOrId('atas')
      atas.fields.removeByName('audio')
      atas.fields.add(
        new FileField({
          name: 'audio',
          maxSelect: 1,
          maxSize: 20971520,
          mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'],
        }),
      )
      app.save(atas)
    } catch (_) {}
  },
)
