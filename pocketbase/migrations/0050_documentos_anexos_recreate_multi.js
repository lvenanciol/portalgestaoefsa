// 0050_documentos_anexos_recreate_multi.js
// Recria o campo 'anexo' usando removeByName + add(new FileField({ maxSelect: 10 }))
// nas 5 coleções: processos_juridicos, alvaras, atas, contratos, documentos.
// PocketBase Go não altera o tipo/maxSelect de FileField existente sem recriação explícita.
// Preserva os arquivos existentes através de backup dos valores antes da remoção e restauração após o add.

migrate(
  (app) => {
    const colecoes = ['processos_juridicos', 'alvaras', 'atas', 'contratos', 'documentos']

    for (const nomeCol of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeCol)

        // 1. Guardar valores de 'anexo' para todos os registros que possuem algum arquivo
        const backups = []
        try {
          const registros = app.findAllRecords(col)
          for (const reg of registros) {
            const val = reg.get('anexo')
            if (val) {
              backups.push({
                id: reg.id,
                anexo: val,
              })
            }
          }
        } catch (eFind) {
          console.log('[0050] aviso lendo registros existentes de ' + nomeCol + ': ' + eFind)
        }

        // 2. Remover campo anexo se existir
        if (col.fields.getByName('anexo')) {
          col.fields.removeByName('anexo')
          app.save(col)
        }

        // 3. Recriar campo anexo novo com maxSelect: 10 e maxSize 50MB
        col.fields.add(
          new FileField({
            name: 'anexo',
            maxSelect: 10,
            maxSize: 52428800,
            mimeTypes: [
              'application/pdf',
              'image/png',
              'image/jpeg',
              'image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain',
              'text/csv',
            ],
          }),
        )
        app.save(col)

        // 4. Restaurar valores preservados em cada registro
        if (backups.length > 0) {
          for (const item of backups) {
            try {
              const reg = app.findRecordById(nomeCol, item.id)
              // Se antes era string única, para maxSelect: 10 PocketBase aceita array ou string
              const v = Array.isArray(item.anexo) ? item.anexo : [item.anexo]
              reg.set('anexo', v)
              app.save(reg)
            } catch (eRest) {
              console.log(
                '[0050] erro restaurando anexo no registro ' +
                  item.id +
                  ' de ' +
                  nomeCol +
                  ': ' +
                  eRest,
              )
            }
          }
        }

        console.log(
          '[0050] Sucesso ao recriar anexo (maxSelect: 10) em ' +
            nomeCol +
            '. Backups restaurados: ' +
            backups.length,
        )
      } catch (err) {
        console.log('[0050] Erro geral ao recriar anexo em ' + nomeCol + ': ' + err)
        throw err
      }
    }
  },
  (app) => {
    // Reversão defensiva: caso necessário
    const colecoes = ['processos_juridicos', 'alvaras', 'atas', 'contratos', 'documentos']
    for (const nomeCol of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nomeCol)
        if (col.fields.getByName('anexo')) {
          col.fields.removeByName('anexo')
          app.save(col)
        }
        col.fields.add(
          new FileField({
            name: 'anexo',
            maxSelect: 1,
            maxSize: 52428800,
          }),
        )
        app.save(col)
      } catch (_) {}
    }
  },
)
