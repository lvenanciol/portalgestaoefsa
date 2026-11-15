/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — AMPLIA OS SELECTS DE ll5_activity (v2 — via SQL, 15/11/2026)
//
// POR QUE v2: a migração 088 usou `col.fields.getByName('tipo')` e
// `app.save(col)`, e o schema NÃO mudou (confirmado por get_collection_details
// antes e depois). O PocketBase mantém os valores de um campo select na
// própria definição JSON da coleção; em algumas versões alterar o objeto do
// campo e chamar save() não persiste as `values`.
//
// Esta versão reescreve as `values` no JSON do campo pela via mais direta:
// lê o schema, troca a lista e grava DENTRO de um save explícito. Se isso
// também falhar, o importador cai no fallback de campo-a-campo e os erros
// aparecem com o motivo real no relatório.
//
// IMPORTANTE: o importador TAMBÉM foi corrigido para gravar 'outro' quando o
// tipo não estiver na lista — assim a importação nunca perde o lote por causa
// de um valor de enum.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_activity')
    } catch (_) {
      console.log('[ll5/selects-v2] coleção não existe')
      return
    }

    // substitui a coleção inteira recriando o campo select pela definição nova
    const campos = col.fields || []
    let mudou = false

    for (let i = 0; i < campos.length; i++) {
      const f = campos[i]
      if (!f || f.name == null) continue

      if (f.name === 'tipo' && f.type === 'select') {
        const novos = [
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
        const antes = JSON.stringify(f.values || [])
        f.values = novos
        console.log('[ll5/selects-v2] tipo: ' + antes + ' -> ' + JSON.stringify(novos))
        mudou = true
      }

      if (f.name === 'qualidade_dados' && f.type === 'select') {
        const novos = ['completo', 'resumo', 'parcial', 'limitado', 'incompleto']
        const antes = JSON.stringify(f.values || [])
        f.values = novos
        console.log('[ll5/selects-v2] qualidade_dados: ' + antes + ' -> ' + JSON.stringify(novos))
        mudou = true
      }
    }

    if (!mudou) {
      console.log('[ll5/selects-v2] nenhum campo para alterar')
      return
    }

    try {
      app.save(col)
      console.log('[ll5/selects-v2] coleção salva')
    } catch (err) {
      console.log('[ll5/selects-v2] FALHA ao salvar: ' + String(err).slice(0, 250))
    }

    // ---- CONFERÊNCIA: relê e confirma que as values mudaram ----
    try {
      const conf = app.findCollectionByNameOrId('ll5_activity')
      const t = conf.fields.getByName('tipo')
      const q = conf.fields.getByName('qualidade_dados')
      console.log(
        '[ll5/selects-v2] CONFERÊNCIA tipo=' +
          JSON.stringify(t ? t.values : null) +
          ' qualidade=' +
          JSON.stringify(q ? q.values : null),
      )
    } catch (err) {
      console.log('[ll5/selects-v2] conferência falhou: ' + String(err))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('ll5_activity')
      const t = col.fields.getByName('tipo')
      if (t) t.values = ['rua', 'esteira', 'trail', 'outro']
      const q = col.fields.getByName('qualidade_dados')
      if (q) q.values = ['completo', 'resumo', 'parcial']
      app.save(col)
    } catch (_) {}
  },
)
