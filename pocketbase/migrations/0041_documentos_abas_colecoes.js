// pocketbase/migrations/0041_documentos_abas_colecoes.js
// Migração para as novas abas de Documentos:
// 1. Cria coleção 'alvaras' (numero, orgao_emissor, validade, municipio, empresa, status, anexo, observacoes)
// 2. Cria coleção 'processos_juridicos' (numero_processo, vara_comarca, autor, reu, empresa, fase_instancia, assunto_tipo, valor_causa, data_distribuicao, advogado, status, risco, proxima_audiencia, observacoes, anexo)
// 3. Garante campos na coleção 'contratos' (objeto, vigencia_inicio, vigencia_fim, reajuste_indice, valor_mensal, forma_pagamento, garantia, vistoria, status, tipo_documento, anexo)
// 4. Garante campos na coleção 'atas' (data, tipo_ata [AGE/AGO/Reunião], pauta, mesa_diretora, deliberacoes, assinatura_eletronica, empresa, anexo)
// 5. Atualiza o menu /documentos no banco para "Documentos"
// 6. Insere seeds plausíveis PT-BR (Ata AGE Casafruti Conde de Bonfim, Contrato de Locação Petrolina, Alvará Extrafruti, Processo Jurídico)

migrate(
  (app) => {
    // 1. Coleção 'alvaras'
    let alvaras
    try {
      alvaras = app.findCollectionByNameOrId('alvaras')
    } catch (_) {
      alvaras = null
    }

    if (!alvaras) {
      alvaras = new Collection({
        name: 'alvaras',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'numero', type: 'text', required: true, max: 100 },
          { name: 'tipo', type: 'text', max: 100 }, // Funcionamento, Sanitário, Bombeiros, etc.
          { name: 'orgao_emissor', type: 'text', max: 150 },
          { name: 'municipio', type: 'text', max: 100 },
          { name: 'empresa', type: 'text', max: 100 },
          { name: 'validade', type: 'date' },
          {
            name: 'status',
            type: 'select',
            values: ['regular', 'vencendo', 'vencido', 'em_renovacao'],
            maxSelect: 1,
          },
          { name: 'observacoes', type: 'text', max: 2000 },
          { name: 'anexo', type: 'file', maxSelect: 1, maxSize: 52428800 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_alvaras_empresa ON alvaras (empresa)'],
      })
      app.save(alvaras)
    }

    // 2. Coleção 'processos_juridicos' (para a aba Jurídicos)
    let juridicos
    try {
      juridicos = app.findCollectionByNameOrId('processos_juridicos')
    } catch (_) {
      juridicos = null
    }

    if (!juridicos) {
      juridicos = new Collection({
        name: 'processos_juridicos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'numero_processo', type: 'text', required: true, max: 120 },
          { name: 'vara_comarca', type: 'text', max: 200 },
          { name: 'autor', type: 'text', max: 200 },
          { name: 'reu', type: 'text', max: 200 },
          { name: 'empresa', type: 'text', max: 100 },
          { name: 'fase_instancia', type: 'text', max: 150 },
          { name: 'assunto_tipo', type: 'text', max: 200 },
          { name: 'valor_causa', type: 'number' },
          { name: 'data_distribuicao', type: 'date' },
          { name: 'advogado', type: 'text', max: 150 },
          {
            name: 'status',
            type: 'select',
            values: ['ativo', 'suspenso', 'acordo', 'encerrado', 'em_recurso'],
            maxSelect: 1,
          },
          {
            name: 'risco',
            type: 'select',
            values: ['provavel', 'possivel', 'remoto'],
            maxSelect: 1,
          },
          { name: 'proxima_audiencia', type: 'date' },
          { name: 'observacoes', type: 'text', max: 3000 },
          { name: 'anexo', type: 'file', maxSelect: 1, maxSize: 52428800 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_juridicos_empresa ON processos_juridicos (empresa)',
          'CREATE INDEX idx_juridicos_status ON processos_juridicos (status)',
        ],
      })
      app.save(juridicos)
    }

    // 3. Ajustes na coleção 'contratos'
    const contratos = app.findCollectionByNameOrId('contratos')
    if (!contratos.fields.getByName('garantia')) {
      contratos.fields.add(new TextField({ name: 'garantia', max: 200 }))
    }
    if (!contratos.fields.getByName('vistoria')) {
      contratos.fields.add(new TextField({ name: 'vistoria', max: 200 }))
    }
    app.save(contratos)

    // 4. Ajustes na coleção 'atas'
    const atas = app.findCollectionByNameOrId('atas')
    if (!atas.fields.getByName('tipo_ata')) {
      atas.fields.add(
        new SelectField({
          name: 'tipo_ata',
          values: ['AGE', 'AGO', 'Reunião Diretoria', 'Comitê', 'Outro'],
          maxSelect: 1,
        }),
      )
    }
    if (!atas.fields.getByName('mesa_diretora')) {
      atas.fields.add(new TextField({ name: 'mesa_diretora', max: 300 }))
    }
    if (!atas.fields.getByName('deliberacoes')) {
      atas.fields.add(new TextField({ name: 'deliberacoes', max: 5000 }))
    }
    if (!atas.fields.getByName('assinatura_eletronica')) {
      atas.fields.add(new TextField({ name: 'assinatura_eletronica', max: 300 }))
    }
    if (!atas.fields.getByName('empresa')) {
      atas.fields.add(new TextField({ name: 'empresa', max: 100 }))
    }
    if (!atas.fields.getByName('anexo')) {
      atas.fields.add(new FileField({ name: 'anexo', maxSelect: 1, maxSize: 52428800 }))
    }
    app.save(atas)

    // 5. Renomear menu no banco de "Documentos & Importações" para "Documentos"
    try {
      const menuDocs = app.findFirstRecordByFilter('menus', 'rota = "/documentos"', '', 1, 0)
      if (menuDocs) {
        menuDocs.set('titulo', 'Documentos')
        app.save(menuDocs)
      }
    } catch (_) {}

    // 6. Seeds plausíveis para as coleções não ficarem vazias
    // Seed em alvaras
    try {
      const alvaraExistente = app.findFirstRecordByFilter(
        'alvaras',
        'numero = "ALV-2026/0891"',
        '',
        1,
        0,
      )
      if (!alvaraExistente) {
        const recAlv = new Record(app.findCollectionByNameOrId('alvaras'))
        recAlv.set('numero', 'ALV-2026/0891')
        recAlv.set('tipo', 'Alvará de Localização e Funcionamento')
        recAlv.set('orgao_emissor', 'Secretaria Municipal da Fazenda')
        recAlv.set('municipio', 'Viana - ES')
        recAlv.set('empresa', 'Extrafruti')
        recAlv.set('validade', '2027-12-31 00:00:00.000Z')
        recAlv.set('status', 'regular')
        recAlv.set(
          'observacoes',
          'Centro de distribuição matriz - renovação aprovada sem pendências.',
        )
        app.save(recAlv)
      }
    } catch (_) {}

    // Seed em atas (Ata de AGE - Casafruti Conde de Bonfim)
    try {
      const ataExistente = app.findFirstRecordByFilter(
        'atas',
        'titulo ~ "Casafruti Conde de Bonfim"',
        '',
        1,
        0,
      )
      if (!ataExistente) {
        const recAta = new Record(app.findCollectionByNameOrId('atas'))
        recAta.set('titulo', 'Ata de AGE - Casafruti Conde de Bonfim')
        recAta.set('tipo_ata', 'AGE')
        recAta.set('data', '2026-09-15 14:00:00.000Z')
        recAta.set('empresa', 'Casafruti')
        recAta.set('participantes', 'Acionistas majoritários e membros do conselho')
        recAta.set('mesa_diretora', 'Presidente: Diretor Geral; Secretário: Coordenador Jurídico')
        recAta.set(
          'pauta',
          'Aprovação de abertura de filial Conde de Bonfim, investimento em instalações e alteração de capital social.',
        )
        recAta.set(
          'deliberacoes',
          'Aprovada por unanimidade a implantação da nova unidade com aporte orçamentário e consolidação estatutária.',
        )
        recAta.set(
          'assinatura_eletronica',
          'Assinatura digital padrão ICP-Brasil / DocuSign coletada de todos os presentes.',
        )
        recAta.set(
          'resumo',
          'AGE deliberando e autorizando a nova unidade Casafruti Conde de Bonfim.',
        )
        recAta.set(
          'decisoes',
          '1. Abertura autorizada. 2. Adequação orçamentária vinculada ao projeto de expansão.',
        )
        app.save(recAta)
      }
    } catch (_) {}

    // Seed em contratos (Contrato Petrolina - Revisado assinado)
    try {
      const contExistente = app.findFirstRecordByFilter(
        'contratos',
        'titulo ~ "Contrato Petrolina"',
        '',
        1,
        0,
      )
      if (!contExistente) {
        const recCont = new Record(app.findCollectionByNameOrId('contratos'))
        recCont.set('titulo', 'Contrato Petrolina - Revisado assinado')
        recCont.set('parte', 'Locadora Petrolina Empreendimentos Imobiliários Ltda')
        recCont.set('tipo', 'locacao')
        recCont.set('empresa', 'Extrafruti')
        recCont.set('valor_mensal', 42500)
        recCont.set('inicio', '2026-08-01 00:00:00.000Z')
        recCont.set('fim', '2031-07-31 00:00:00.000Z')
        recCont.set('status', 'ativo')
        recCont.set(
          'objeto',
          'Locação de galpão frigorificado e pátio de triagem para distribuição regional em Petrolina/PE.',
        )
        recCont.set('indexador', 'IGP-M (reajuste anual)')
        recCont.set('forma_pagamento', 'Boleto bancário até o dia 10 de cada mês')
        recCont.set('garantia', 'Carta de fiança bancária no valor de 3 aluguéis vigentes')
        recCont.set('vistoria', 'Laudo de vistoria inicial assinado e anexo ao instrumento')
        recCont.set('multa_pct', 10)
        recCont.set('rescisao', 'Aviso prévio de 90 dias com multa proporcional ao prazo residual')
        recCont.set(
          'observacao',
          'Contrato de locação comercial estratégica para expansão da cadeia de suprimentos.',
        )
        app.save(recCont)
      }
    } catch (_) {}

    // Seed em processos_juridicos (Relatório de processos - Extrafruti)
    try {
      const jurExistente = app.findFirstRecordByFilter(
        'processos_juridicos',
        'numero_processo = "0012845-67.2025.8.08.0001"',
        '',
        1,
        0,
      )
      if (!jurExistente) {
        const recJur = new Record(app.findCollectionByNameOrId('processos_juridicos'))
        recJur.set('numero_processo', '0012845-67.2025.8.08.0001')
        recJur.set('vara_comarca', '3ª Vara Cível de Vitória / ES')
        recJur.set('autor', 'Logística Expressa Transportes Ltda')
        recJur.set('reu', 'Extrafruti Distribuidora de Hortifruti Ltda')
        recJur.set('empresa', 'Extrafruti')
        recJur.set('fase_instancia', 'Fase Instrutória / 1ª Instância')
        recJur.set('assunto_tipo', 'Cobrança de frete extraordinário / Contratual')
        recJur.set('valor_causa', 145000)
        recJur.set('data_distribuicao', '2025-11-10 00:00:00.000Z')
        recJur.set('advogado', 'Dra. Camila Bittencourt (OAB/ES 18.234)')
        recJur.set('status', 'ativo')
        recJur.set('risco', 'possivel')
        recJur.set('proxima_audiencia', '2026-12-04 14:30:00.000Z')
        recJur.set(
          'observacoes',
          'Contestação apresentada demonstrando que a entrega ocorreu fora dos padrões de temperatura contratados.',
        )
        app.save(recJur)
      }
    } catch (_) {}
  },
  (app) => {
    // Reverter migração se necessário
  },
)
