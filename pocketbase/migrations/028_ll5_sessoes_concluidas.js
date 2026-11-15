/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — STATUS INDIVIDUAL DE SESSÃO (15/11/2026)
//
// ERRO MEU: eu adicionei `sessoes_concluidas` editando a migração 027, que JÁ
// havia sido aplicada. Migração aplicada NÃO roda de novo — o campo nunca
// existiu no banco, então o update falhava em silêncio e o botão "marcar como
// realizada" não mudava nada (nem a tarefa, nem a sessão).
//
// Esta migração cria o campo de verdade:
//   sessoes_concluidas → array de datas (YYYY-MM-DD) já realizadas
//
// O status da SESSÃO passa a ser derivado: se a data está no array, ela está
// concluída. O tratamento só fica 'concluido' quando todas as sessões estão.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_treatments')
    } catch (_) {
      console.log('[ll5/sessoes] ll5_treatments não existe')
      return
    }

    const nomes = (col.fields || []).map((f) => f.name)

    if (!nomes.includes('sessoes_concluidas')) {
      col.fields.add(new JSONField({ name: 'sessoes_concluidas', maxSize: 8000 }))
      console.log('[ll5/sessoes] + sessoes_concluidas')
    } else {
      console.log('[ll5/sessoes] sessoes_concluidas já existe')
    }

    if (!nomes.includes('tarefa_por_data')) {
      col.fields.add(new JSONField({ name: 'tarefa_por_data', maxSize: 12000 }))
      console.log('[ll5/sessoes] + tarefa_por_data')
    }

    try {
      app.save(col)
      console.log('[ll5/sessoes] coleção salva')
    } catch (err) {
      console.log('[ll5/sessoes] FALHA: ' + String(err).slice(0, 200))
    }

    // conferência
    try {
      const conf = app.findCollectionByNameOrId('ll5_treatments')
      const n2 = (conf.fields || []).map((f) => f.name)
      console.log(
        '[ll5/sessoes] CONFERÊNCIA: sessoes_concluidas=' +
          (n2.includes('sessoes_concluidas') ? 'OK' : 'AUSENTE') +
          ' tarefa_por_data=' +
          (n2.includes('tarefa_por_data') ? 'OK' : 'AUSENTE'),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[ll5/sessoes] rollback: campos mantidos para preservar dados')
  },
)
