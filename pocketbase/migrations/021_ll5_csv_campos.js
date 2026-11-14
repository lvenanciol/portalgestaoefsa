/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — CSV DO GARMIN: campos adicionais (15/11/2026)
//
// Estende `ll5_activity` com os campos que o CSV traz e o .FIT não tinha:
//   · FCmax validada estatisticamente (218) + zonas estimadas
//   · carga por proxy (TSS está 0,0 no export)
//   · sinalização de longo em Z4
//   · campos de força (reps/sets, sem volume)
//   · potência e sua confiabilidade
//
// Idempotente: só adiciona o que falta.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_activity')
    } catch (_) {
      console.warn('[ll5/csv] ll5_activity não existe — rode a migração 020 antes')
      return
    }

    const existentes = (col.fields || []).map((f) => f.name)
    const add = (campo) => {
      if (!existentes.includes(campo.name)) col.fields.add(campo)
    }

    // --- identificação do tipo de registro ---
    add(new TextField({ name: 'titulo', max: 200 }))
    add(
      new SelectField({
        name: 'origem_aba',
        maxSelect: 1,
        values: ['running', 'gym'],
      }),
    )

    // --- tempos adicionais do CSV ---
    add(new NumberField({ name: 'tempo_movimento_s' }))
    add(new NumberField({ name: 'tempo_decorrido_s' }))

    // --- corpo ---
    add(new NumberField({ name: 'passos' }))
    add(new NumberField({ name: 'body_battery_drain' }))
    add(new NumberField({ name: 'num_voltas', onlyInt: true }))
    add(new NumberField({ name: 'melhor_volta_s' }))

    // --- corrida: cadência e pace ---
    add(new NumberField({ name: 'cadencia_max_spm' }))
    add(new BoolField({ name: 'cadencia_invalida' }))
    add(new NumberField({ name: 'melhor_pace_s_km' }))
    add(new NumberField({ name: 'gap_s_km' }))
    add(new NumberField({ name: 'perda_elevacao_m' }))
    add(new NumberField({ name: 'elevacao_min_m' }))
    add(new NumberField({ name: 'elevacao_max_m' }))
    add(new NumberField({ name: 'comprimento_passada_m' }))

    // --- potência ---
    add(new NumberField({ name: 'potencia_media_w' }))
    add(new NumberField({ name: 'potencia_max_w' }))
    add(new NumberField({ name: 'potencia_normalizada_w' }))
    add(new BoolField({ name: 'potencia_confiavel' }))
    add(new BoolField({ name: 'tem_running_dynamics' }))

    // --- força ---
    add(new NumberField({ name: 'total_reps', onlyInt: true }))
    add(new NumberField({ name: 'total_sets', onlyInt: true }))
    add(new NumberField({ name: 'volume_kg' }))
    add(new BoolField({ name: 'tem_detalhe_exercicio' }))

    // --- FCmax validada e zonas ---
    add(new NumberField({ name: 'fcmax_referencia', onlyInt: true }))
    add(new BoolField({ name: 'fcmax_validada' }))
    add(new TextField({ name: 'fcmax_metodo_validacao', max: 80 }))
    add(new BoolField({ name: 'zonas_estimadas' }))

    // --- carga por proxy ---
    add(new NumberField({ name: 'carga_proxy' }))
    add(new TextField({ name: 'carga_metodo', max: 60 }))
    add(new NumberField({ name: 'carga_semana_iso', onlyInt: true }))
    add(new NumberField({ name: 'carga_ano_iso', onlyInt: true }))

    // --- sinalização ---
    add(new BoolField({ name: 'sinalizar_intensidade_excessiva' }))

    // --- qualidade estendida (o select original tem 3 valores; recriamos) ---
    try {
      const q = col.fields.getByName('qualidade_dados')
      if (q && q.type === 'select') {
        q.values = ['completo', 'resumo', 'parcial', 'limitado', 'incompleto']
        // remove a exigência de valor único anterior se houver
        q.maxSelect = 1
      }
    } catch (_) {
      // segue
    }

    app.save(col)
    console.log('[ll5/csv] campos adicionais aplicados em ll5_activity')
  },
  (app) => {
    // rollback: não remove campos (dados seriam perdidos). Só registra.
    console.log('[ll5/csv] rollback: campos mantidos para preservar dados')
  },
)
