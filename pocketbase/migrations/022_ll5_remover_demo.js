/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — REMOÇÃO DOS DADOS DE DEMONSTRAÇÃO (15/11/2026)
//
// PROBLEMA RELATADO PELO DONO: a tela Saúde mostrava números que pareciam
// reais — "51,7 km" no KPI era exatamente a soma das 5 corridas fictícias do
// seed (10,02 + 8,40 + 15,10 + 6,20 + 12,00 = 51,72 km).
//
// Esta migração APAGA todo registro com demo=true das coleções do LL5.
// É irreversível por design: dado de demonstração não deve voltar.
//
// O seed no front também foi removido (botão "Carregar base inicial" deixou
// de existir) e o repositório passou a excluir demo=true por padrão.
// ============================================================================
migrate(
  (app) => {
    const colecoes = [
      'll5_running',
      'll5_gym_sessions',
      'll5_gym_exercises',
      'll5_treatments',
      'll5_treatment_types',
      'll5_attachments',
      'll5_body_composition',
      'll5_body_segments',
      'll5_activity',
      'll5_ai_reports',
    ]

    let total = 0

    for (const nome of colecoes) {
      let registros = []
      try {
        registros = app.findRecordsByFilter(nome, 'demo = true', '', 0, 0)
      } catch (_) {
        // coleção inexistente ou sem o campo: segue
        continue
      }

      for (const r of registros) {
        try {
          app.delete(r)
          total++
        } catch (err) {
          console.log('[ll5/limpar-demo] falha em ' + nome + '/' + r.id + ': ' + String(err))
        }
      }

      if (registros.length > 0) {
        console.log('[ll5/limpar-demo] ' + nome + ': ' + registros.length + ' removido(s)')
      }
    }

    console.log('[ll5/limpar-demo] TOTAL removido: ' + total)
  },
  (app) => {
    // rollback: os dados de demonstração NÃO são recriados de propósito.
    // Recriá-los reintroduziria o problema que esta migração resolve.
    console.log('[ll5/limpar-demo] rollback: nenhum dado de demo é recriado')
  },
)
