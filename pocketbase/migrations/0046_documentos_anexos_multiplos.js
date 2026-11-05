// 0046_documentos_anexos_multiplos.js
// Converte o campo 'anexo' para FileField com maxSelect: 0 (múltiplos anexos sem limite)
// nas 5 coleções da tela Documentos: alvaras, contratos, atas, processos_juridicos e documentos.
// Preserva retrocompatibilidade total com arquivos já anexados anteriormente.

migrate(
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']

    for (const nomeColecao of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeColecao)
        const campoAnexo = col.fields.getByName('anexo')
        if (campoAnexo) {
          // No PocketBase v0.36 JSVM, para FileField existente basta atualizar maxSelect
          // ou substituir pelo add(new FileField(...))
          campoAnexo.maxSelect = 0
          campoAnexo.maxSize = 52428800 // 50MB
        } else {
          col.fields.add(
            new FileField({
              name: 'anexo',
              maxSelect: 0,
              maxSize: 52428800,
            }),
          )
        }
        app.save(col)
      } catch (err) {
        console.log('0046_documentos_anexos_multiplos erro na colecao ' + nomeColecao + ': ' + err)
      }
    }
  },
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']
    for (const nomeColecao of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeColecao)
        const campoAnexo = col.fields.getByName('anexo')
        if (campoAnexo) {
          campoAnexo.maxSelect = 1
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
