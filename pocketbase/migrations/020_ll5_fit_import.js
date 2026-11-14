/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — IMPORTADOR .FIT: tabela de atividades + jobs (15/11/2026)
//
// Duas coleções:
//   ll5_activity    → uma linha por atividade importada (UPSERT por
//                     fonte + device_activity_id)
//   ll5_fit_jobs    → estado do job assíncrono (retomável, idempotente)
//
// O schema aceita campo ausente: toda coluna numérica é NULLABLE. Um .FIT de
// 8 anos atrás pode não ter gct/vertical_oscillation/training_effect — gravar
// 0 seria inventar dado. NULL é a única resposta honesta.
// ============================================================================
migrate(
  (app) => {
    let usersColId = ''
    try {
      usersColId = app.findCollectionByNameOrId('users').id
    } catch (_) {
      usersColId = ''
    }

    function garantir(nome, montar) {
      try {
        return app.findCollectionByNameOrId(nome)
      } catch (_) {
        const col = new Collection({ name: nome, type: 'base' })
        montar(col)
        app.save(col)
        return app.findCollectionByNameOrId(nome)
      }
    }

    // ======================================================= ll5_activity
    const act = garantir('ll5_activity', (col) => {
      if (usersColId) {
        col.fields.add(
          new RelationField({
            name: 'owner_id',
            collectionId: usersColId,
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
          }),
        )
      }
      col.fields.add(new TextField({ name: 'created_by', max: 190 }))
      col.fields.add(new TextField({ name: 'updated_by', max: 190 }))
      col.fields.add(new BoolField({ name: 'demo' }))

      // --- chave de negócio ---
      col.fields.add(new TextField({ name: 'device_activity_id', max: 120, required: true }))
      col.fields.add(new TextField({ name: 'fonte', max: 40, required: true }))
      col.fields.add(
        new SelectField({
          name: 'tipo',
          maxSelect: 1,
          values: ['rua', 'esteira', 'trail', 'outro'],
        }),
      )
      col.fields.add(new DateField({ name: 'data_hora_inicio' }))
      col.fields.add(new NumberField({ name: 'duracao_s' }))
      col.fields.add(new NumberField({ name: 'distancia_m' }))

      // --- resumo ---
      col.fields.add(new NumberField({ name: 'pace_medio_s_km' }))
      col.fields.add(new NumberField({ name: 'fc_media' }))
      col.fields.add(new NumberField({ name: 'fc_max' }))
      col.fields.add(new JSONField({ name: 'zonas_fc_seg', maxSize: 4000 }))
      col.fields.add(new NumberField({ name: 'cadencia_spm' }))
      col.fields.add(new NumberField({ name: 'elevacao_m' }))
      col.fields.add(new NumberField({ name: 'ganho_elevacao_m' }))
      col.fields.add(new NumberField({ name: 'calorias' }))

      // --- running dynamics ---
      col.fields.add(new NumberField({ name: 'ground_contact_time_ms' }))
      col.fields.add(new NumberField({ name: 'vertical_oscillation_cm' }))
      col.fields.add(new NumberField({ name: 'vertical_ratio_pct' }))

      // --- carga ---
      col.fields.add(new NumberField({ name: 'te_aerobico' }))
      col.fields.add(new NumberField({ name: 'te_anaerobico' }))
      col.fields.add(new NumberField({ name: 'training_load' }))
      col.fields.add(new NumberField({ name: 'trimp' }))
      col.fields.add(new NumberField({ name: 'decoupling_pct' }))

      // --- streams ---
      col.fields.add(new JSONField({ name: 'fc_amostras', maxSize: 500000 }))
      col.fields.add(new JSONField({ name: 'cadencia_amostras', maxSize: 500000 }))
      col.fields.add(new JSONField({ name: 'altitude_amostras', maxSize: 500000 }))
      col.fields.add(new JSONField({ name: 'gps_amostras', maxSize: 500000 }))
      col.fields.add(new JSONField({ name: 'laps', maxSize: 200000 }))
      col.fields.add(new JSONField({ name: 'eventos', maxSize: 100000 }))

      // --- confiabilidade ---
      col.fields.add(
        new SelectField({
          name: 'fonte_fc',
          maxSelect: 1,
          values: ['optica_pulso', 'cinta_peito', 'desconhecida'],
        }),
      )
      col.fields.add(
        new SelectField({
          name: 'confiabilidade_fc',
          maxSelect: 1,
          values: ['alta', 'baixa', 'insuficiente'],
        }),
      )
      col.fields.add(new BoolField({ name: 'tem_streams' }))
      col.fields.add(
        new SelectField({
          name: 'qualidade_dados',
          maxSelect: 1,
          values: ['completo', 'resumo', 'parcial'],
        }),
      )
      col.fields.add(new BoolField({ name: 'possivel_duplicata' }))
      col.fields.add(new TextField({ name: 'arquivo_origem', max: 255 }))
    })
    act.listRule = "@request.auth.id != ''"
    act.viewRule = "@request.auth.id != ''"
    act.createRule = "@request.auth.id != ''"
    act.updateRule = "@request.auth.id != ''"
    act.deleteRule = "@request.auth.id != ''"
    act.indexes = [
      'CREATE UNIQUE INDEX idx_ll5_activity_dedupe ON ll5_activity (fonte, device_activity_id)',
      'CREATE INDEX idx_ll5_activity_owner_data ON ll5_activity (owner_id, data_hora_inicio)',
    ]
    app.save(act)

    // ======================================================= ll5_fit_jobs
    const jobs = garantir('ll5_fit_jobs', (col) => {
      if (usersColId) {
        col.fields.add(
          new RelationField({
            name: 'owner_id',
            collectionId: usersColId,
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
          }),
        )
      }
      col.fields.add(new TextField({ name: 'created_by', max: 190 }))
      col.fields.add(
        new SelectField({
          name: 'status',
          maxSelect: 1,
          values: ['pendente', 'processando', 'concluido', 'falhou', 'parcial'],
        }),
      )
      col.fields.add(new NumberField({ name: 'total_arquivos', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'processados', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'importados', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'duplicados', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'enriquecidos', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'erros', onlyInt: true }))
      // fila de trabalho persistida: permite retomar de onde parou
      col.fields.add(new JSONField({ name: 'fila', maxSize: 2000000 }))
      col.fields.add(new JSONField({ name: 'log', maxSize: 500000 }))
      col.fields.add(new JSONField({ name: 'resumo', maxSize: 200000 }))
      col.fields.add(new DateField({ name: 'iniciado_em' }))
      col.fields.add(new DateField({ name: 'finalizado_em' }))
      col.fields.add(new NumberField({ name: 'indice_retomada', onlyInt: true }))
    })
    jobs.listRule = "@request.auth.id != ''"
    jobs.viewRule = "@request.auth.id != ''"
    jobs.createRule = "@request.auth.id != ''"
    jobs.updateRule = "@request.auth.id != ''"
    jobs.deleteRule = "@request.auth.id != ''"
    app.save(jobs)

    console.log('[ll5/fit] coleções ll5_activity e ll5_fit_jobs prontas')
  },
  (app) => {
    for (const n of ['ll5_fit_jobs', 'll5_activity']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
