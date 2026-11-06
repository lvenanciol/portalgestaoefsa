// 0047_documentos_anexo_maxselect10.js
// Garante que o campo 'anexo' das 5 coleções da tela Documentos
// (alvaras, contratos, atas, processos_juridicos, documentos) é um FileField
// MULTI-arquivo (maxSelect: 10), resolvendo de vez o bug de "o segundo anexo
// substitui o primeiro". A migração 0046 tentou maxSelect: 0, mas o PocketBase
// não persistiu (o campo seguiu single-file no backend: a UI listava 2 arquivos
// e o backend gravava só o último).
// Idempotente: se já estiver correto, é no-op (aplicável com segurança em
// qualquer instância onde 0046 tenha ou não rodado).

migrate(
  (app) => {
    const colecoes = ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']

    for (const nomeColecao of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeColecao)
        const campoAnexo = col.fields.getByName('anexo')
        if (campoAnexo) {
          campoAnexo.maxSelect = 10
          campoAnexo.maxSize = 52428800 // 50MB
          app.save(col)
        } else {
          col.fields.add(
            new FileField({
              name: 'anexo',
              maxSelect: 10,
              maxSize: 52428800,
            }),
          )
          app.save(col)
        }
        console.log('0047: anexo da colecao ' + nomeColecao + ' ajustado para maxSelect 10')
      } catch (err) {
        console.log('0047 erro na colecao ' + nomeColecao + ': ' + err)
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
