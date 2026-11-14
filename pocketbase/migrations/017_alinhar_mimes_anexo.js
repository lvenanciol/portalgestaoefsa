// ============================================================================
// 15/11/2026 — ALINHA OS MIME TYPES DO CAMPO `anexo`
//
// PROBLEMA: "Erro ao anexar arquivo em documentos -> convenções".
// O input de upload aceita 13 extensões (.pdf,.docx,.doc,.xlsx,.xls,.png,
// .jpg,.jpeg,.webp,.gif,.bmp,.txt), mas o campo `anexo` das coleções
// `convencoes` e `seguros` só aceitava 3 MIME types:
//   application/pdf, image/png, image/jpeg
// Qualquer .docx, .xlsx, .webp, .txt etc. era REJEITADO pelo PocketBase.
//
// As coleções `alvaras` e `documentos` já tinham a lista completa (10 tipos)
// — a inconsistência veio de migrações escritas em momentos diferentes.
//
// Esta migração iguala TODAS as coleções documentais à mesma lista, que é a
// que o front declara no `accept` do input. Idempotente: só grava se diferir.
// ============================================================================
migrate(
  (app) => {
    // Lista canônica — casa com o `accept` de DocumentoDetalheAnexos.tsx
    const MIMES = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/bmp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    const COLECOES = ['convencoes', 'seguros', 'alvaras', 'documentos', 'contratos', 'atas']

    for (const nome of COLECOES) {
      let col
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        console.log('[mimes-anexo] coleção inexistente, ignorada: ' + nome)
        continue
      }

      const campo = col.fields.getByName('anexo')
      if (!campo) {
        console.log('[mimes-anexo] sem campo anexo: ' + nome)
        continue
      }

      const atuais = campo.mimeTypes || []
      const faltando = MIMES.filter((m) => !atuais.includes(m))

      if (faltando.length === 0 && atuais.length === MIMES.length) {
        console.log('[mimes-anexo] já completo: ' + nome)
        continue
      }

      campo.mimeTypes = MIMES
      app.save(col)
      console.log('[mimes-anexo] ' + nome + ': ' + atuais.length + ' -> ' + MIMES.length + ' tipos')
    }
  },
  (app) => {
    // rollback: volta convenções e seguros à lista original de 3 tipos
    for (const nome of ['convencoes', 'seguros']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const campo = col.fields.getByName('anexo')
        if (campo) {
          campo.mimeTypes = ['application/pdf', 'image/png', 'image/jpeg']
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
