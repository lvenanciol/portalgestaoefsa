/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — ALINHA OS SELECTS COM O QUE O IMPORTADOR ENVIA (15/11/2026)
//
// CAUSA RAIZ DO "Failed to create record":
//   O campo `tipo` é um SELECT com values ['rua','esteira','trail','outro'].
//   O importador CSV envia 'forca' (Strength Training) e 'indoor'
//   (Indoor Running) — valores FORA da lista.
//   O campo `qualidade_dados` aceita ['completo','resumo','parcial'] mas o
//   importador grava 'limitado' (sessões de força) e 'incompleto'.
//
//   O PocketBase rejeita o registro inteiro quando um select recebe valor
//   inválido — e, como a inserção é em BATCH, o lote todo falhava.
//   Os 99 erros do primeiro lote de 100 são exatamente isso.
//
// Esta migração amplia os dois selects para aceitar todos os valores que o
// importador realmente produz.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_activity')
    } catch (_) {
      console.log('[ll5/selects] ll5_activity não existe')
      return
    }

    // ---- tipo: aceitar TODOS os tipos que o CSV/FIT produzem ----
    try {
      const tipo = col.fields.getByName('tipo')
      if (tipo && tipo.type === 'select') {
        tipo.values = [
          'rua',
          'esteira',
          'trail',
          'indoor',
          'forca',
          'caminhada',
          'natacao',
          'ciclismo',
          'outro',
        ]
        tipo.maxSelect = 1
        console.log('[ll5/selects] tipo ampliado: ' + tipo.values.join(', '))
      }
    } catch (err) {
      console.log('[ll5/selects] falha em tipo: ' + String(err))
    }

    // ---- qualidade_dados: aceitar 'limitado' e 'incompleto' ----
    try {
      const q = col.fields.getByName('qualidade_dados')
      if (q && q.type === 'select') {
        q.values = ['completo', 'resumo', 'parcial', 'limitado', 'incompleto']
        q.maxSelect = 1
        console.log('[ll5/selects] qualidade_dados ampliado: ' + q.values.join(', '))
      }
    } catch (err) {
      console.log('[ll5/selects] falha em qualidade_dados: ' + String(err))
    }

    // ---- origem_aba: já aceita running/gym, mas garante ----
    try {
      const o = col.fields.getByName('origem_aba')
      if (o && o.type === 'select') {
        o.values = ['running', 'gym']
        o.maxSelect = 1
      }
    } catch (_) {}

    try {
      app.save(col)
      console.log('[ll5/selects] ll5_activity atualizada')
    } catch (err) {
      console.log('[ll5/selects] FALHA ao salvar: ' + String(err).slice(0, 200))
    }
  },
  (app) => {
    // rollback: volta à lista original
    try {
      const col = app.findCollectionByNameOrId('ll5_activity')
      const tipo = col.fields.getByName('tipo')
      if (tipo) tipo.values = ['rua', 'esteira', 'trail', 'outro']
      const q = col.fields.getByName('qualidade_dados')
      if (q) q.values = ['completo', 'resumo', 'parcial']
      app.save(col)
    } catch (_) {}
  },
)
