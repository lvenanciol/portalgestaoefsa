// 0048_documentos_anexos_maxselect_multi.js
// Garante maxSelect: 10 (múltiplos anexos) no campo 'anexo' das coleções:
// alvaras, contratos, atas, processos_juridicos e documentos.
// Atualiza o FileField existente preservando seu id para não perder arquivos já vinculados.

migrate(
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']

    for (const nomeColecao of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeColecao)
        const campoExistente = col.fields.getByName('anexo')

        if (campoExistente) {
          col.fields.add(
            new FileField({
              id: campoExistente.id,
              name: 'anexo',
              maxSelect: 10,
              maxSize: 52428800, // 50MB
            }),
          )
        } else {
          col.fields.add(
            new FileField({
              name: 'anexo',
              maxSelect: 10,
              maxSize: 52428800,
            }),
          )
        }

        app.save(col)
      } catch (err) {
        console.log('0048_documentos_anexos_maxselect_multi erro em ' + nomeColecao + ': ' + err)
      }
    }
  },
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']
    for (const nomeColecao of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeColecao)
        const campo = col.fields.getByName('anexo')
        if (campo) {
          col.fields.add(
            new FileField({
              id: campo.id,
              name: 'anexo',
              maxSelect: 1,
              maxSize: 52428800,
            }),
          )
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
