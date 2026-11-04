// pocketbase/migrations/0044_juridicos_evolucao_audiencias.js
// Migração para a evolução da aba Jurídico e controle de Audiências:
// 1. Adiciona campos em 'processos_juridicos':
//    - processo_codigo (text, ex: '1.0010944')
//    - numeros_alternativos (text, ex: 'Número antigo: ... MTE: ...')
//    - numero_cnj (text, ex: '0000365-46.2023.5.17.0003')
//    - titulo (text)
//    - orgao (text)
//    - acao (text)
//    - tipo (text, ex: 'Judicial' / 'Administrativo')
//    - natureza (text, ex: 'Trabalhista' / 'Cível')
//    - cliente_principal (text)
//    - contrario_principal (text)
//    - responsavel_principal (text)
//    - valor_base (number)
//    - valor_corrigido (number)
//    - juros (number)
//    - multa (number)
//    - valor_atualizado_indexado (number)
//    - valor_envolvido (number)
//    - versao_atual (number)
//
// 2. Cria coleção 'juridicos_historico':
//    - processo_id (relation -> processos_juridicos ou text)
//    - numero_processo (text)
//    - versao (number)
//    - data_importacao (date)
//    - valores_anteriores (json)
//    - alteracoes (json)
//    - importado_por (text)
//
// 3. Cria coleção 'audiencias':
//    - pasta (text)
//    - numero_processo (text)
//    - numero_cnj (text)
//    - vara (text)
//    - cidade_uf (text)
//    - natureza_posicao (text)
//    - cliente_principal (text)
//    - parte_contraria (text)
//    - audiencia_tipo (text, ex: 'Inicial - Conciliação', 'Instrução e Julgamento')
//    - data_hora_inicio (date)
//    - advogado_responsavel (text)
//    - tipo_audiencia (text, ex: 'Presencial', 'Virtual', 'Híbrida')
//    - processo_id (relation -> processos_juridicos)
//    - observacoes (text)

migrate(
  (app) => {
    // 1. Atualizar 'processos_juridicos'
    const juridicos = app.findCollectionByNameOrId('processos_juridicos')

    const novosCampos = [
      { name: 'processo_codigo', type: 'text', max: 80 },
      { name: 'numeros_alternativos', type: 'text', max: 300 },
      { name: 'numero_cnj', type: 'text', max: 100 },
      { name: 'titulo', type: 'text', max: 300 },
      { name: 'orgao', type: 'text', max: 250 },
      { name: 'acao', type: 'text', max: 150 },
      { name: 'tipo', type: 'text', max: 80 },
      { name: 'natureza', type: 'text', max: 100 },
      { name: 'cliente_principal', type: 'text', max: 200 },
      { name: 'contrario_principal', type: 'text', max: 200 },
      { name: 'responsavel_principal', type: 'text', max: 200 },
      { name: 'valor_base', type: 'number' },
      { name: 'valor_corrigido', type: 'number' },
      { name: 'juros', type: 'number' },
      { name: 'multa', type: 'number' },
      { name: 'valor_atualizado_indexado', type: 'number' },
      { name: 'valor_envolvido', type: 'number' },
      { name: 'versao_atual', type: 'number' },
    ]

    novosCampos.forEach((c) => {
      if (!juridicos.fields.getByName(c.name)) {
        if (c.type === 'text') {
          juridicos.fields.add(new TextField({ name: c.name, max: c.max }))
        } else if (c.type === 'number') {
          juridicos.fields.add(new NumberField({ name: c.name }))
        }
      }
    })

    juridicos.addIndex('idx_juridicos_numcnj', false, 'numero_cnj', '')
    juridicos.addIndex('idx_juridicos_proccod', false, 'processo_codigo', '')
    app.save(juridicos)

    // 2. Coleção 'juridicos_historico'
    let historico
    try {
      historico = app.findCollectionByNameOrId('juridicos_historico')
    } catch (_) {
      historico = null
    }

    if (!historico) {
      historico = new Collection({
        name: 'juridicos_historico',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'processo_id',
            type: 'relation',
            collectionId: juridicos.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'numero_processo', type: 'text', max: 120 },
          { name: 'versao', type: 'number' },
          { name: 'data_importacao', type: 'date' },
          { name: 'valores_anteriores', type: 'json' },
          { name: 'alteracoes', type: 'json' },
          { name: 'importado_por', type: 'text', max: 120 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_jurhist_proc ON juridicos_historico (processo_id)',
          'CREATE INDEX idx_jurhist_num ON juridicos_historico (numero_processo)',
        ],
      })
      app.save(historico)
    }

    // 3. Coleção 'audiencias'
    let audiencias
    try {
      audiencias = app.findCollectionByNameOrId('audiencias')
    } catch (_) {
      audiencias = null
    }

    if (!audiencias) {
      audiencias = new Collection({
        name: 'audiencias',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'pasta', type: 'text', max: 100 },
          { name: 'numero_processo', type: 'text', max: 120 },
          { name: 'numero_cnj', type: 'text', max: 100 },
          { name: 'vara', type: 'text', max: 200 },
          { name: 'cidade_uf', type: 'text', max: 150 },
          { name: 'natureza_posicao', type: 'text', max: 150 },
          { name: 'cliente_principal', type: 'text', max: 200 },
          { name: 'parte_contraria', type: 'text', max: 200 },
          { name: 'audiencia_tipo', type: 'text', max: 200 },
          { name: 'data_hora_inicio', type: 'date' },
          { name: 'advogado_responsavel', type: 'text', max: 150 },
          { name: 'tipo_audiencia', type: 'text', max: 100 },
          {
            name: 'processo_id',
            type: 'relation',
            collectionId: juridicos.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'observacoes', type: 'text', max: 2000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_aud_data ON audiencias (data_hora_inicio)',
          'CREATE INDEX idx_aud_cnj ON audiencias (numero_cnj)',
          'CREATE INDEX idx_aud_pasta ON audiencias (pasta)',
          'CREATE INDEX idx_aud_proc ON audiencias (processo_id)',
        ],
      })
      app.save(audiencias)
    }
  },
  (app) => {
    try {
      const aud = app.findCollectionByNameOrId('audiencias')
      app.delete(aud)
    } catch (_) {}
    try {
      const hist = app.findCollectionByNameOrId('juridicos_historico')
      app.delete(hist)
    } catch (_) {}
  },
)
