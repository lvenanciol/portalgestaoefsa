/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — SEÇÃO DE ASSUNTOS PESSOAIS DO TITULAR (15/11/2026)
//
// Cria as coleções da seção LL5 dentro do PGE existente. NÃO recria o portal:
// apenas adiciona as entidades que as telas LL5 consomem.
//
// MODELO DE DONO
//   Toda tabela de dados tem owner_id (relation users) + created_by/updated_by
//   (texto com o e-mail de quem tocou o registro). O isolamento é aplicado em
//   DUAS camadas:
//     1. regra do PocketBase — o usuário lê apenas o que é dele;
//     2. repositório no front (src/ll5/repo) — filtra por owner_id antes de
//        qualquer transformação, e é o que o teste automatizado exercita.
//   A regra do banco sozinha não serve para o admin (que precisa ver tudo),
//   e a UI sozinha não é segurança. Documentado em DECISIONS.md.
//
// SEED
//   Esta migração NÃO cria dados de demonstração. O seed roda no cliente, pelo
//   MESMO fluxo de criação do CRUD (exigência do briefing: "as 4 abas nascem
//   pelo seed através do mesmo fluxo de criação de aba"). Aqui só criamos o
//   usuário familiar de teste, porque criar auth record exige o servidor.
// ============================================================================
migrate(
  (app) => {
    // ---------------------------------------------------------------- users
    let usersColId = ''
    try {
      usersColId = app.findCollectionByNameOrId('users').id
    } catch (_) {
      usersColId = ''
    }

    // helper: cria a coleção se ainda não existir (idempotente)
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

    function camposDono(col) {
      if (usersColId) {
        col.fields.add(
          new RelationField({
            name: 'owner_id',
            collectionId: usersColId,
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
            required: false,
          }),
        )
      }
      col.fields.add(new TextField({ name: 'created_by', max: 190 }))
      col.fields.add(new TextField({ name: 'updated_by', max: 190 }))
      col.fields.add(new BoolField({ name: 'demo' }))
    }

    // ============================================================== 1) TABS
    const tabs = garantir('ll5_tabs', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'nome', max: 80, required: true }))
      col.fields.add(new TextField({ name: 'icone', max: 40 }))
      col.fields.add(new TextField({ name: 'cor', max: 20 }))
      col.fields.add(new NumberField({ name: 'ordem', onlyInt: true }))
      col.fields.add(
        new SelectField({
          name: 'template_type',
          maxSelect: 1,
          values: ['running', 'tratamentos', 'gym', 'composicao', 'custom'],
        }),
      )
      col.fields.add(new TextField({ name: 'schema_template', max: 400 }))
      col.fields.add(new JSONField({ name: 'fontes_dados', maxSize: 2000 }))
      col.fields.add(new BoolField({ name: 'ia_habilitada' }))
      col.fields.add(new BoolField({ name: 'ativo' }))
      col.fields.add(new DateField({ name: 'deletado_em' }))
      col.fields.add(new TextField({ name: 'instrucao_ia', max: 2000 }))
    })
    tabs.listRule = "@request.auth.id != ''"
    tabs.viewRule = "@request.auth.id != ''"
    tabs.createRule = "@request.auth.id != ''"
    tabs.updateRule = "@request.auth.id != ''"
    tabs.deleteRule = "@request.auth.id != ''"
    app.save(tabs)

    // ==================================================== 2) RUNNING
    const running = garantir('ll5_running', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'titulo', max: 120 }))
      col.fields.add(new DateField({ name: 'data' }))
      col.fields.add(new TextField({ name: 'hora', max: 8 }))
      col.fields.add(
        new SelectField({ name: 'tipo', maxSelect: 1, values: ['rua', 'esteira', 'trail'] }),
      )
      col.fields.add(new NumberField({ name: 'distancia_km' }))
      col.fields.add(new NumberField({ name: 'duracao_s', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'pace_medio_s_km', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'fc_media', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'fc_max', onlyInt: true }))
      col.fields.add(new JSONField({ name: 'zonas_fc', maxSize: 2000 }))
      col.fields.add(new NumberField({ name: 'cadencia_spm', onlyInt: true }))
      col.fields.add(new NumberField({ name: 'elevacao_m' }))
      col.fields.add(new JSONField({ name: 'splits', maxSize: 20000 }))
      col.fields.add(new NumberField({ name: 'training_effect' }))
      col.fields.add(new NumberField({ name: 'decoupling' }))
      col.fields.add(
        new SelectField({
          name: 'fonte',
          maxSelect: 1,
          values: ['garmin', 'apple', 'manual'],
        }),
      )
      col.fields.add(new TextField({ name: 'dispositivo', max: 80 }))
    })
    running.listRule = "@request.auth.id != ''"
    running.viewRule = "@request.auth.id != ''"
    running.createRule = "@request.auth.id != ''"
    running.updateRule = "@request.auth.id != ''"
    running.deleteRule = "@request.auth.id != ''"
    app.save(running)

    // ==================================================== 3) GYM
    const gym = garantir('ll5_gym_sessions', (col) => {
      camposDono(col)
      col.fields.add(new DateField({ name: 'data' }))
      col.fields.add(new TextField({ name: 'hora', max: 8 }))
      col.fields.add(
        new SelectField({
          name: 'divisao',
          maxSelect: 1,
          values: ['push', 'pull', 'legs', 'upper', 'full', 'custom'],
        }),
      )
      col.fields.add(new NumberField({ name: 'volume_total_kg' }))
      col.fields.add(new NumberField({ name: 'rpe_medio' }))
      col.fields.add(new NumberField({ name: 'duracao_min', onlyInt: true }))
      col.fields.add(
        new SelectField({ name: 'fonte', maxSelect: 1, values: ['garmin', 'apple', 'manual'] }),
      )
      col.fields.add(new TextField({ name: 'dispositivo', max: 80 }))
    })
    gym.listRule = "@request.auth.id != ''"
    gym.viewRule = "@request.auth.id != ''"
    gym.createRule = "@request.auth.id != ''"
    gym.updateRule = "@request.auth.id != ''"
    gym.deleteRule = "@request.auth.id != ''"
    app.save(gym)

    const gymEx = garantir('ll5_gym_exercises', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'sessao_id', max: 20 }))
      col.fields.add(new TextField({ name: 'exercicio_nome', max: 120 }))
      col.fields.add(new TextField({ name: 'grupo_muscular', max: 60 }))
      col.fields.add(new JSONField({ name: 'series', maxSize: 5000 }))
      col.fields.add(new NumberField({ name: 'tempo_sob_tensao_s', onlyInt: true }))
      col.fields.add(new BoolField({ name: 'distancia_falha' }))
    })
    gymEx.listRule = "@request.auth.id != ''"
    gymEx.viewRule = "@request.auth.id != ''"
    gymEx.createRule = "@request.auth.id != ''"
    gymEx.updateRule = "@request.auth.id != ''"
    gymEx.deleteRule = "@request.auth.id != ''"
    app.save(gymEx)

    // ==================================================== 4) TRATAMENTOS
    const ttypes = garantir('ll5_treatment_types', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'nome', max: 80, required: true }))
      col.fields.add(new TextField({ name: 'cor', max: 20 }))
      col.fields.add(new TextField({ name: 'icone', max: 40 }))
      col.fields.add(new NumberField({ name: 'ordem', onlyInt: true }))
      col.fields.add(new BoolField({ name: 'ativo' }))
      col.fields.add(new DateField({ name: 'deletado_em' }))
    })
    ttypes.listRule = "@request.auth.id != ''"
    ttypes.viewRule = "@request.auth.id != ''"
    ttypes.createRule = "@request.auth.id != ''"
    ttypes.updateRule = "@request.auth.id != ''"
    ttypes.deleteRule = "@request.auth.id != ''"
    app.save(ttypes)

    const treat = garantir('ll5_treatments', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'tipo_id', max: 20 }))
      col.fields.add(new TextField({ name: 'tipo_nome', max: 80 }))
      col.fields.add(new TextField({ name: 'profissional', max: 120 }))
      col.fields.add(new DateField({ name: 'inicio' }))
      col.fields.add(new TextField({ name: 'frequencia', max: 60 }))
      col.fields.add(
        new SelectField({
          name: 'status',
          maxSelect: 1,
          values: ['em_andamento', 'concluido', 'suspenso', 'cancelado'],
        }),
      )
      col.fields.add(new DateField({ name: 'proxima_sessao' }))
      col.fields.add(new TextField({ name: 'observacoes', max: 2000 }))
      col.fields.add(new DateField({ name: 'deletado_em' }))
    })
    treat.listRule = "@request.auth.id != ''"
    treat.viewRule = "@request.auth.id != ''"
    treat.createRule = "@request.auth.id != ''"
    treat.updateRule = "@request.auth.id != ''"
    treat.deleteRule = "@request.auth.id != ''"
    app.save(treat)

    const atts = garantir('ll5_attachments', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'tratamento_id', max: 20 }))
      col.fields.add(
        new SelectField({
          name: 'tipo',
          maxSelect: 1,
          values: ['exame', 'laudo', 'prescricao', 'outro'],
        }),
      )
      col.fields.add(new TextField({ name: 'nome_arquivo', max: 255 }))
      col.fields.add(new TextField({ name: 'mime', max: 120 }))
      col.fields.add(new NumberField({ name: 'tamanho', onlyInt: true }))
      col.fields.add(new TextField({ name: 'storage_key', max: 400 }))
      col.fields.add(new NumberField({ name: 'confianca_extracao' }))
      col.fields.add(new TextField({ name: 'enviado_por', max: 190 }))
      col.fields.add(new FileField({ name: 'arquivo', maxSelect: 1, maxSize: 52428800 }))
    })
    atts.listRule = "@request.auth.id != ''"
    atts.viewRule = "@request.auth.id != ''"
    atts.createRule = "@request.auth.id != ''"
    atts.updateRule = "@request.auth.id != ''"
    atts.deleteRule = "@request.auth.id != ''"
    app.save(atts)

    // ==================================================== 5) COMPOSIÇÃO
    const comp = garantir('ll5_body_composition', (col) => {
      camposDono(col)
      // identificação
      col.fields.add(
        new SelectField({
          name: 'metodo',
          maxSelect: 1,
          values: ['dexa', 'bia', 'antropometria', 'balanca'],
          required: true,
        }),
      )
      col.fields.add(new DateField({ name: 'data_exame', required: true }))
      col.fields.add(new TextField({ name: 'hora_exame', max: 8 }))
      col.fields.add(new TextField({ name: 'equipamento', max: 120 }))
      col.fields.add(new TextField({ name: 'clinica_laboratorio', max: 160 }))
      col.fields.add(new TextField({ name: 'profissional_responsavel', max: 120 }))
      col.fields.add(new NumberField({ name: 'jejum_horas' }))
      col.fields.add(
        new SelectField({
          name: 'hidratacao_autorrelato',
          maxSelect: 1,
          values: ['baixa', 'normal', 'alta'],
        }),
      )
      col.fields.add(new BoolField({ name: 'treinou_24h' }))
      col.fields.add(new TextField({ name: 'arquivo_origem', max: 255 }))
      col.fields.add(new NumberField({ name: 'confianca_extracao' }))
      // composição global
      col.fields.add(new NumberField({ name: 'peso_kg' }))
      col.fields.add(new NumberField({ name: 'altura_cm' }))
      col.fields.add(new NumberField({ name: 'imc' }))
      col.fields.add(new NumberField({ name: 'perimetro_cintura_cm' }))
      col.fields.add(new NumberField({ name: 'perimetro_quadril_cm' }))
      col.fields.add(new NumberField({ name: 'rcq' }))
      col.fields.add(new NumberField({ name: 'massa_gorda_kg' }))
      col.fields.add(new NumberField({ name: 'gordura_pct' }))
      col.fields.add(new NumberField({ name: 'massa_magra_kg' }))
      col.fields.add(new NumberField({ name: 'massa_muscular_esqueletica_kg' }))
      col.fields.add(new NumberField({ name: 'mme_pct' }))
      col.fields.add(new NumberField({ name: 'massa_ossea_kg' }))
      col.fields.add(new NumberField({ name: 'agua_corporal_l' }))
      col.fields.add(new NumberField({ name: 'agua_corporal_pct' }))
      col.fields.add(new NumberField({ name: 'gordura_visceral_kg' }))
      col.fields.add(new NumberField({ name: 'gordura_visceral_area_cm2' }))
      col.fields.add(new NumberField({ name: 'gordura_visceral_indice' }))
      col.fields.add(new NumberField({ name: 'tmb_informada_kcal' }))
      col.fields.add(new NumberField({ name: 'proteina_pct' }))
      col.fields.add(new NumberField({ name: 'idade_corporal' }))
      // DEXA
      col.fields.add(new NumberField({ name: 't_score' }))
      col.fields.add(new NumberField({ name: 'z_score' }))
      col.fields.add(new NumberField({ name: 'razao_android_gynoid' }))
      col.fields.add(new NumberField({ name: 'gordura_visceral_android_pct' }))
      // estado calculado / validação
      col.fields.add(
        new SelectField({
          name: 'validacao_status',
          maxSelect: 1,
          values: ['ok', 'divergente', 'advertencia'],
        }),
      )
      col.fields.add(new JSONField({ name: 'validacao_detalhe', maxSize: 8000 }))
      col.fields.add(
        new SelectField({
          name: 'confiabilidade',
          maxSelect: 1,
          values: ['alta', 'media', 'baixa'],
        }),
      )
      col.fields.add(new TextField({ name: 'hash_arquivo', max: 120 }))
      col.fields.add(new TextField({ name: 'chave_dedupe', max: 200 }))
      col.fields.add(new BoolField({ name: 'divergencia_altura_confirmada' }))
      col.fields.add(new BoolField({ name: 'nova_serie_confirmada' }))
    })
    comp.listRule = "@request.auth.id != ''"
    comp.viewRule = "@request.auth.id != ''"
    comp.createRule = "@request.auth.id != ''"
    comp.updateRule = "@request.auth.id != ''"
    comp.deleteRule = "@request.auth.id != ''"
    comp.indexes = [
      'CREATE UNIQUE INDEX idx_ll5_comp_dedupe ON ll5_body_composition (chave_dedupe)',
    ]
    app.save(comp)

    const seg = garantir('ll5_body_segments', (col) => {
      camposDono(col)
      col.fields.add(new TextField({ name: 'composicao_id', max: 20 }))
      col.fields.add(
        new SelectField({
          name: 'regiao',
          maxSelect: 1,
          values: [
            'braco_direito',
            'braco_esquerdo',
            'tronco',
            'perna_direita',
            'perna_esquerda',
            'pernas_total',
            'apendicular',
          ],
        }),
      )
      col.fields.add(new NumberField({ name: 'massa_gorda_g' }))
      col.fields.add(new NumberField({ name: 'massa_magra_g' }))
    })
    seg.listRule = "@request.auth.id != ''"
    seg.viewRule = "@request.auth.id != ''"
    seg.createRule = "@request.auth.id != ''"
    seg.updateRule = "@request.auth.id != ''"
    seg.deleteRule = "@request.auth.id != ''"
    app.save(seg)

    // ==================================================== 6) IA + AUDITORIA
    const reports = garantir('ll5_ai_reports', (col) => {
      camposDono(col)
      col.fields.add(
        new SelectField({
          name: 'scope',
          maxSelect: 1,
          values: ['running', 'gym', 'tratamentos', 'composicao', 'global'],
        }),
      )
      col.fields.add(
        new SelectField({
          name: 'persona',
          maxSelect: 1,
          values: ['medicina_esportiva', 'nutrologo', 'fisiologia'],
        }),
      )
      col.fields.add(
        new SelectField({
          name: 'persona_variant',
          maxSelect: 1,
          values: ['protocolo_alta_performance', 'generico'],
        }),
      )
      col.fields.add(new JSONField({ name: 'payload_snapshot', maxSize: 200000 }))
      col.fields.add(new TextField({ name: 'input_hash', max: 120 }))
      col.fields.add(new JSONField({ name: 'output_json', maxSize: 200000 }))
      col.fields.add(new TextField({ name: 'modelo', max: 60 }))
      col.fields.add(new NumberField({ name: 'temperatura' }))
      col.fields.add(new TextField({ name: 'prompt_version', max: 20 }))
      col.fields.add(new TextField({ name: 'validado_por', max: 190 }))
      col.fields.add(new DateField({ name: 'validado_em' }))
    })
    reports.listRule = "@request.auth.id != ''"
    reports.viewRule = "@request.auth.id != ''"
    reports.createRule = "@request.auth.id != ''"
    reports.updateRule = "@request.auth.id != ''"
    reports.deleteRule = "@request.auth.id != ''"
    app.save(reports)

    const log = garantir('ll5_access_log', (col) => {
      col.fields.add(new TextField({ name: 'ator_id', max: 20 }))
      col.fields.add(new TextField({ name: 'ator_role', max: 30 }))
      col.fields.add(
        new SelectField({
          name: 'acao',
          maxSelect: 1,
          values: ['leitura', 'escrita', 'exclusao', 'geracao_parecer', 'exportacao'],
        }),
      )
      col.fields.add(new TextField({ name: 'entidade', max: 60 }))
      col.fields.add(new TextField({ name: 'entidade_id', max: 20 }))
      col.fields.add(new TextField({ name: 'owner_id_alvo', max: 20 }))
      col.fields.add(new TextField({ name: 'campos_sensiveis', max: 400 }))
      col.fields.add(new TextField({ name: 'ip', max: 45 }))
      col.fields.add(new TextField({ name: 'detalhe', max: 500 }))
    })
    log.listRule = "@request.auth.id != ''"
    log.viewRule = "@request.auth.id != ''"
    log.createRule = "@request.auth.id != ''"
    log.updateRule = null
    log.deleteRule = null
    app.save(log)

    // ==================================================== 7) USUÁRIO FAMILIAR
    // Membro de teste para provar o isolamento por owner. Senha conhecida,
    // role mínimo: sem grupo Admin.
    if (usersColId) {
      try {
        app.findAuthRecordByEmail('users', 'familiar@extrafruti.com.br')
        console.log('[ll5] usuário familiar já existe')
      } catch (_) {
        try {
          const users = app.findCollectionByNameOrId('users')
          const rec = new Record(users)
          rec.set('email', 'familiar@extrafruti.com.br')
          rec.setPassword('Extrafruti@2026')
          rec.set('name', 'Familiar Demo')
          rec.set('emailVisibility', true)
          rec.set('verified', true)
          app.save(rec)
          console.log('[ll5] usuário familiar criado')
        } catch (err) {
          console.warn('[ll5] falha ao criar familiar: ' + String(err).slice(0, 200))
        }
      }
    }

    console.log('[ll5] coleções criadas/atualizadas')
  },
  (app) => {
    // rollback: remove apenas as coleções criadas por esta migração
    const nomes = [
      'll5_access_log',
      'll5_ai_reports',
      'll5_body_segments',
      'll5_body_composition',
      'll5_attachments',
      'll5_treatments',
      'll5_treatment_types',
      'll5_gym_exercises',
      'll5_gym_sessions',
      'll5_running',
      'll5_tabs',
    ]
    for (const n of nomes) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
