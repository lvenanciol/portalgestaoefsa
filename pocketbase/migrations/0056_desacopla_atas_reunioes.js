/**
 * Migração 0056 — Desacoplamento das Atas (contábeis × reuniões)
 *
 * Cria a coleção 'atas_reunioes' com os campos usados pela tela
 * Atas & Reuniões (Operação) e migra para ela os registros de REUNIÃO
 * hoje na coleção 'atas', que passa a servir apenas atas contábeis/formais.
 *
 * Idempotente: roda em banco vazio (coleção só é criada se não existir) e
 * na re-execução não duplica nem perde registros (só move o que ainda
 * não existe em 'atas_reunioes', pelo id original).
 *
 * Identificação de reuniões: participantes OU modalidade OU link_reuniao
 * OU audio preenchidos — os dois registros reais ("ORÇAMENTO VENDAS
 * EXTRABOM 2027" e "RDE") têm participantes + modalidade, e a ata formal
 * da Casafruti não tem nenhum desses.
 */
migrate(
  (app) => {
    let reunioes
    try {
      reunioes = app.findCollectionByNameOrId('atas_reunioes')
    } catch (_) {
      reunioes = null
    }

    if (!reunioes) {
      reunioes = new Collection({
        name: 'atas_reunioes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 500 },
          { name: 'data', type: 'date' },
          { name: 'participantes', type: 'text', max: 2000 },
          { name: 'resumo', type: 'text', max: 8000 },
          { name: 'decisoes', type: 'text', max: 8000 },
          {
            name: 'modalidade',
            type: 'select',
            values: ['Presencial', 'Microsoft Teams', 'Google Meet', 'Zoom'],
            maxSelect: 1,
          },
          { name: 'link_reuniao', type: 'text', max: 1000 },
          { name: 'pauta', type: 'text', max: 20000 },
          { name: 'pauta_itens', type: 'json', maxSize: 4000000 },
          { name: 'empresa', type: 'text', max: 200 },
          { name: 'action_items', type: 'json', maxSize: 4000000 },
          { name: 'audio', type: 'file', maxSelect: 10, maxSize: 104857600 },
          { name: 'anexo', type: 'file', maxSelect: 10, maxSize: 52428800 },
          { name: 'criado_por', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_atas_reunioes_data ON atas_reunioes (data)'],
      })
      app.save(reunioes)
    }

    // Migração dos registros de reunião que ainda estejam em 'atas'.
    // Idempotente: só move o registro se ainda não existir em 'atas_reunioes'
    // com o mesmo id (em banco vazio, nada a mover — no-op).
    const origem = app.findCollectionByNameOrId('atas')
    const candidatos = app.findRecordsByFilter('atas', '', '-created', 500, 0)
    for (const r of candidatos) {
      const ehReuniao =
        r.getString('participantes').trim() !== '' ||
        r.getString('modalidade').trim() !== '' ||
        r.getString('link_reuniao').trim() !== '' ||
        r.getString('audio').trim() !== ''
      if (!ehReuniao) continue

      // Preserva o id original — nunca duplica em re-execução.
      let jaExiste = false
      try {
        app.findRecordById('atas_reunioes', r.id)
        jaExiste = true
      } catch (_) {
        jaExiste = false
      }
      if (jaExiste) continue

      const novo = new Record(reunioes)
      novo.set('id', r.id) // cria em 'atas_reunioes' com o MESMO id
      const campos = [
        'titulo',
        'data',
        'participantes',
        'resumo',
        'decisoes',
        'modalidade',
        'link_reuniao',
        'pauta',
        'pauta_itens',
        'empresa',
        'action_items',
        'audio',
        'anexo',
        'criado_por',
      ]
      for (const c of campos) novo.set(c, r.get(c))
      novo.set('created', r.get('created'))
      novo.set('updated', r.get('updated'))
      app.save(novo)
      app.delete(r)
      console.log('migrada reunião para atas_reunioes: ' + r.getString('titulo'))
    }
  },
  (app) => {
    // Down: devolve os registros migrados para 'atas' e remove a coleção
    let reunioes
    try {
      reunioes = app.findCollectionByNameOrId('atas_reunioes')
    } catch (_) {
      reunioes = null
    }
    if (!reunioes) return
    const origem = app.findCollectionByNameOrId('atas')
    const regs = app.findRecordsByFilter('atas_reunioes', '', '', 500, 0)
    for (const r of regs) {
      const novo = new Record(origem)
      novo.set('id', r.id)
      for (const c of [
        'titulo',
        'data',
        'participantes',
        'resumo',
        'decisoes',
        'modalidade',
        'link_reuniao',
        'pauta',
        'pauta_itens',
        'empresa',
        'action_items',
        'audio',
        'anexo',
        'criado_por',
      ]) {
        novo.set(c, r.get(c))
      }
      app.save(novo)
      app.delete(r)
    }
    app.delete(reunioes)
  },
)
