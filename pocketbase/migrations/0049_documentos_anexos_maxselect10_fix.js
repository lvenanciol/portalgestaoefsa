// 0049_documentos_anexos_maxselect10_fix.js
// Atualiza o campo 'anexo' para maxSelect: 10 em todas as 5 coleções de documentos:
// alvaras, contratos, atas, processos_juridicos e documentos.

migrate(
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']

    for (const nome of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const campo = col.fields.getByName('anexo')
        if (campo) {
          campo.maxSelect = 10
          campo.maxSize = 52428800 // 50MB
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
        console.log('0049: colecao ' + nome + ' anexo atualizado para maxSelect 10')
      } catch (err) {
        console.log('0049: erro ao atualizar ' + nome + ': ' + err)
      }
    }
  },
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']
    for (const nome of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const campo = col.fields.getByName('anexo')
        if (campo) {
          campo.maxSelect = 1
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
