// pocketbase/migrations/0051_seed_alvaras_mockup.js
// Adiciona os 2 alvarás adicionais presentes no mockup da imagem 2 para totalizar exatamente
// os 4 alvarás visíveis da imagem:
// 1) 936124016 (Registro Marca no INPI - FoldBox) -> já existe no banco
// 2) ALV-2026/0891 (Alvará de Localização e Funcionamento - Extrafruti) -> já existe no banco
// 3) ALV-2026/0744 (Alvará Sanitário - Casafruti) -> status vencendo (20/01/2027)
// 4) ALV-2025/0331 (AVCB - Centro de Distribuição - Extrafruti) -> status vencido (12/09/2026)

migrate(
  (app) => {
    try {
      const colAlv = app.findCollectionByNameOrId('alvaras')

      // ALV-2026/0744 - Alvará Sanitário - Casafruti
      try {
        const existe744 = app.findFirstRecordByFilter('alvaras', 'numero = "ALV-2026/0744"')
        if (!existe744) {
          const rec1 = new Record(colAlv)
          rec1.set('numero', 'ALV-2026/0744')
          rec1.set('tipo', 'Alvará Sanitário')
          rec1.set('empresa', 'Casafruti')
          rec1.set('orgao_emissor', 'Vigilância Sanitária')
          rec1.set('municipio', 'Serra / ES')
          rec1.set('validade', '2027-01-20 00:00:00.000Z')
          rec1.set('status', 'vencendo')
          rec1.set('observacoes', 'Inspeção predial agendada para renovação periódica.')
          app.save(rec1)
        }
      } catch (e1) {
        // Se erro ao buscar, cria se coleção permitir
      }

      // ALV-2025/0331 - Alvará de Bombeiros / AVCB - Extrafruti
      try {
        const existe331 = app.findFirstRecordByFilter('alvaras', 'numero = "ALV-2025/0331"')
        if (!existe331) {
          const rec2 = new Record(colAlv)
          rec2.set('numero', 'ALV-2025/0331')
          rec2.set('tipo', 'Alvará de Bombeiros')
          rec2.set('empresa', 'Extrafruti')
          rec2.set('orgao_emissor', 'Corpo de Bombeiros Militar')
          rec2.set('municipio', 'Cariacica / ES')
          rec2.set('validade', '2026-09-12 00:00:00.000Z')
          rec2.set('status', 'vencido')
          rec2.set('observacoes', 'Vistoria técnica solicitada com protocolo em aberto.')
          app.save(rec2)
        }
      } catch (e2) {
        // Ignora erro se já existir
      }
    } catch (err) {
      // Ignora erro geral
    }
  },
  (app) => {
    // Revert opcional
  },
)
