// pocketbase/migrations/0052_seed_alvaras_mockup_completo.js
// Adiciona os 2 alvarás complementares do mockup Imagem 2 diretamente via DAO/app.save

migrate(
  (app) => {
    try {
      const colAlv = app.findCollectionByNameOrId('alvaras')

      // ALV-2026/0744 - Alvará Sanitário - Casafruti
      try {
        let rec1 = null
        try {
          rec1 = app.findFirstRecordByData('alvaras', 'numero', 'ALV-2026/0744')
        } catch (_) {}

        if (!rec1) {
          rec1 = new Record(colAlv)
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
      } catch (err1) {
        console.error('Erro ao semear ALV-2026/0744:', err1)
      }

      // ALV-2025/0331 - AVCB - Centro de Distribuição - Extrafruti
      try {
        let rec2 = null
        try {
          rec2 = app.findFirstRecordByData('alvaras', 'numero', 'ALV-2025/0331')
        } catch (_) {}

        if (!rec2) {
          rec2 = new Record(colAlv)
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
      } catch (err2) {
        console.error('Erro ao semear ALV-2025/0331:', err2)
      }
    } catch (e) {
      console.error('Erro em 0052_seed_alvaras_mockup_completo:', e)
    }
  },
  (app) => {},
)
