/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LOGOMARCA ACEITA .PDF .PNG .JPEG NO PRÓPRIO CAMPO (18/11/2026) — item (d)
//
// DIRETIVA: "no cadastro de logomarcas o campo 'logomarca principal' deve ter
// anexos/upload separados em .pdf .png e .jpeg para o app definir quando usar
// .pdf .png ou .jpeg".
//
// Já existe:
//   logo        → PNG (corpo do e-mail, preserva transparência)
//   logo_jpeg   → JPEG (PDF)
//
// FALTAVA o PDF. Agora:
//   logo_pdf    → versão PDF da logomarca
//
// REGRA DE USO NO APP (implementada no hook de envio):
//   1. PDF disponível  → usa o PDF (vetorial, melhor qualidade em impressão)
//   2. senão JPEG      → embute como /DCTDecode
//   3. senão PNG       → decodifica para RGB e embute
//
// O campo aceita os três formatos, como pedido. A escolha é automática.
// ============================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('logomarcas')

    const nomes = []
    for (let i = 0; i < col.fields.length; i++) {
      nomes.push(String(col.fields[i].name || ''))
    }

    if (nomes.indexOf('logo_pdf') < 0) {
      col.fields.add(
        new FileField({
          name: 'logo_pdf',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['application/pdf'],
          thumbs: [],
        }),
      )
      console.log('[logos] campo logo_pdf criado')
    } else {
      console.log('[logos] logo_pdf já existia')
    }

    // o campo principal também passa a aceitar PDF explicitamente
    for (let i = 0; i < col.fields.length; i++) {
      const f = col.fields[i]
      if (f.name === 'logo') {
        f.mimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
        f.maxSize = 5242880
        console.log('[logos] campo logo agora aceita PDF/PNG/JPEG/WEBP')
      }
      if (f.name === 'emblema') {
        f.mimeTypes = ['image/png', 'image/jpeg', 'image/webp']
      }
    }

    app.save(col)

    try {
      const logos = app.findRecordsByFilter('logomarcas', "id != ''", '', 30, 0)
      for (const r of logos) {
        console.log(
          '[logos] ' +
            String(r.getString('empresa') || '?') +
            ' | png=' +
            (r.getString('logo') || '—') +
            ' | jpeg=' +
            (r.getString('logo_jpeg') || '—') +
            ' | pdf=' +
            (r.getString('logo_pdf') || '—'),
        )
      }
    } catch (_) {}

    console.log('[logos] CONCLUÍDO')
  },
  (app) => {
    console.log('[logos] rollback: campos mantidos')
  },
)
