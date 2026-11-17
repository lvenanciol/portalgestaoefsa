/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LOGOMARCA EM PNG **E** JPEG (18/11/2026) — diretiva (d)
//
// DIRETIVA: "no cadastro de logomarcas o campo 'logomarca principal' deve ter
// anexos/upload separados em .png e .jpeg para o app definir quando usar .png
// ou .jpeg".
//
// MOTIVO TÉCNICO: o e-mail usa PNG (`cid:`), que preserva transparência; o PDF
// embutido por este projeto aceita SOMENTE JPEG (/Filter /DCTDecode) — um PNG
// exigiria descomprimir e desfazer os filtros de scanline, o que o runtime não
// faz. Ter as duas versões resolve o PDF sem gambiarra no gerador.
//
// CAMPOS NOVOS:
//   logo_jpeg     → versão JPEG da logomarca principal (para o PDF)
//   emblema_jpeg  → versão JPEG do emblema
//
// O campo `logo`/`emblema` continua sendo o original (normalmente PNG), usado
// no corpo do e-mail. Nada é migrado nem sobrescrito.
// ============================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('logomarcas')

    const nomes = []
    for (let i = 0; i < col.fields.length; i++) {
      nomes.push(String(col.fields[i].name || ''))
    }

    const mimeImagem = ['image/png', 'image/jpeg', 'image/webp']

    if (nomes.indexOf('logo_jpeg') < 0) {
      col.fields.add(
        new FileField({
          name: 'logo_jpeg',
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: mimeImagem,
          thumbs: [],
        }),
      )
      console.log('[logos] campo logo_jpeg criado')
    } else {
      console.log('[logos] logo_jpeg já existia')
    }

    if (nomes.indexOf('emblema_jpeg') < 0) {
      col.fields.add(
        new FileField({
          name: 'emblema_jpeg',
          maxSelect: 1,
          maxSize: 1048576,
          mimeTypes: mimeImagem,
          thumbs: [],
        }),
      )
      console.log('[logos] campo emblema_jpeg criado')
    } else {
      console.log('[logos] emblema_jpeg já existia')
    }

    app.save(col)

    // ---------- conferência ----------
    try {
      const logos = app.findRecordsByFilter('logomarcas', "id != ''", '', 30, 0)
      for (const r of logos) {
        const emp = String(r.getString('empresa') || '?')
        const l = String(r.getString('logo') || '')
        const lj = String(r.getString('logo_jpeg') || '')
        console.log('[logos] ' + emp + ' | logo=' + (l || '—') + ' | jpeg=' + (lj || '—'))
      }
    } catch (err) {
      console.log('[logos] conferência: ' + String(err).slice(0, 120))
    }

    console.log('[logos] CONCLUÍDO')
  },
  (app) => {
    console.log('[logos] rollback: campos logo_jpeg/emblema_jpeg mantidos')
  },
)
