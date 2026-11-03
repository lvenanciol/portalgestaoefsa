// 0040_origem_marcos_tarefas.js
// Migração para modelo de vínculo por ORIGEM (Prompt 5 revisado v3):
// 1. Cria coleção 'marcos' vinculada a 'projetos'.
// 2. Adiciona campos 'origem' (select: projeto | avulsa), 'projeto_id' e 'marco_id' na coleção 'tarefas'.
// 3. Backfill de marcos dos projetos existentes a partir do JSON de marcos ou "Marco inicial (migração)".
// 4. Backfill de tarefas existentes separando as duas classes:
//    (a) origem='projeto' e marco_id NULL -> backfill com "Marco inicial (migração)" do respectivo projeto.
//    (b) origem='avulsa' (projeto_id NULL) -> nada a fazer, já em conformidade.
// 5. Instala triggers SQLite para integridade referencial e CHECK constraint chk_tarefa_marco_obrigatorio.

migrate(
  (app) => {
    const projetos = app.findCollectionByNameOrId('projetos')

    // 1. Coleção 'marcos'
    let marcos
    try {
      marcos = app.findCollectionByNameOrId('marcos')
    } catch (_) {
      marcos = null
    }

    if (!marcos) {
      marcos = new Collection({
        name: 'marcos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          {
            name: 'projeto_id',
            type: 'relation',
            collectionId: projetos.id,
            required: true,
            maxSelect: 1,
          },
          { name: 'data', type: 'date' },
          { name: 'ordem', type: 'number' },
          { name: 'concluido', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_marcos_projeto ON marcos (projeto_id)'],
      })
      app.save(marcos)
    }

    // 2. Campos em 'tarefas'
    const tarefas = app.findCollectionByNameOrId('tarefas')

    // Recarregar marcos para garantir id resolvido
    marcos = app.findCollectionByNameOrId('marcos')

    if (!tarefas.fields.getByName('origem')) {
      tarefas.fields.add(
        new SelectField({
          name: 'origem',
          values: ['projeto', 'avulsa'],
          maxSelect: 1,
        }),
      )
    }

    if (!tarefas.fields.getByName('projeto_id')) {
      tarefas.fields.add(
        new RelationField({
          name: 'projeto_id',
          collectionId: projetos.id,
          maxSelect: 1,
        }),
      )
    }

    if (!tarefas.fields.getByName('marco_id')) {
      tarefas.fields.add(
        new RelationField({
          name: 'marco_id',
          collectionId: marcos.id,
          maxSelect: 1,
        }),
      )
    }

    app.save(tarefas)

    // 3. Migrar marcos a partir do JSON de projetos existentes usando SQL direto
    const todosProjetos = app.findRecordsByFilter('projetos', '1=1', '', 500, 0)
    const marcoInicialPorProjeto = {}

    for (const p of todosProjetos) {
      const pId = p.id
      let marcosJson = []
      try {
        const raw = p.get('marcos')
        if (raw) {
          marcosJson = typeof raw === 'string' ? JSON.parse(raw) : raw
        }
      } catch (_) {
        marcosJson = []
      }

      // Consulta direta no SQLite para verificar se já existem marcos criados
      let rows = []
      try {
        rows = app
          .db()
          .newQuery(
            'SELECT id, nome, ordem FROM marcos WHERE projeto_id = {:pid} ORDER BY ordem ASC',
          )
          .bind({ pid: pId })
          .all()
      } catch (_) {
        rows = []
      }

      if (!rows || rows.length === 0) {
        if (Array.isArray(marcosJson) && marcosJson.length > 0) {
          let idx = 1
          for (const m of marcosJson) {
            const mNome = m && m.nome ? String(m.nome).trim() : `Fase ${idx}`
            const mData = m && m.data ? String(m.data) : ''
            const rec = new Record(marcos)
            rec.set('nome', mNome)
            rec.set('projeto_id', pId)
            if (mData) {
              try {
                rec.set('data', mData)
              } catch (_) {}
            }
            rec.set('ordem', idx)
            rec.set('concluido', !!(m && m.ok))
            app.save(rec)
            if (!marcoInicialPorProjeto[pId]) {
              marcoInicialPorProjeto[pId] = rec.id
            }
            idx++
          }
        } else {
          // Criar marco inicial
          const rec = new Record(marcos)
          rec.set('nome', 'Marco inicial (migração)')
          rec.set('projeto_id', pId)
          rec.set('ordem', 1)
          rec.set('concluido', false)
          app.save(rec)
          marcoInicialPorProjeto[pId] = rec.id
        }
      } else {
        marcoInicialPorProjeto[pId] = rows[0].id
      }
    }

    // 4. Backfill em tarefas:
    // (a) origem='projeto' e marco_id NULL -> backfill com "Marco inicial (migração)" do respectivo projeto.
    // (b) origem='avulsa' (projeto_id NULL) -> nada a fazer, já em conformidade.
    let contagemA = 0
    let contagemB = 0

    const todasTarefas = app.findRecordsByFilter('tarefas', '1=1', '', 5000, 0)

    for (const t of todasTarefas) {
      const vinculoTipo = t.get('vinculo_tipo')
      const vinculoId = t.get('vinculo_id')
      let projetoIdAtual = ''
      try {
        projetoIdAtual = t.get('projeto_id') || ''
      } catch (_) {}

      let ehProjeto = false
      let targetProjetoId = ''

      if (projetoIdAtual) {
        targetProjetoId = projetoIdAtual
        ehProjeto = true
      } else if (vinculoTipo === 'projeto' && vinculoId) {
        targetProjetoId = vinculoId
        ehProjeto = true
      }

      // Validar se targetProjetoId realmente existe
      if (ehProjeto && targetProjetoId) {
        try {
          app.findRecordById('projetos', targetProjetoId)
        } catch (_) {
          ehProjeto = false
          targetProjetoId = ''
        }
      } else {
        ehProjeto = false
      }

      if (ehProjeto) {
        // Classe (a): origem = 'projeto'
        let targetMarcoId = ''
        try {
          targetMarcoId = t.get('marco_id') || ''
        } catch (_) {}

        if (!targetMarcoId) {
          targetMarcoId = marcoInicialPorProjeto[targetProjetoId]
          if (!targetMarcoId) {
            let rows = []
            try {
              rows = app
                .db()
                .newQuery(
                  'SELECT id FROM marcos WHERE projeto_id = {:pid} ORDER BY ordem ASC LIMIT 1',
                )
                .bind({ pid: targetProjetoId })
                .all()
            } catch (_) {
              rows = []
            }

            if (rows && rows.length > 0) {
              targetMarcoId = rows[0].id
            } else {
              const novoM = new Record(marcos)
              novoM.set('nome', 'Marco inicial (migração)')
              novoM.set('projeto_id', targetProjetoId)
              novoM.set('ordem', 1)
              novoM.set('concluido', false)
              app.save(novoM)
              targetMarcoId = novoM.id
              marcoInicialPorProjeto[targetProjetoId] = targetMarcoId
            }
          }
        }

        t.set('origem', 'projeto')
        t.set('projeto_id', targetProjetoId)
        t.set('marco_id', targetMarcoId)
        app.save(t)
        contagemA++
      } else {
        // Classe (b): origem = 'avulsa'
        t.set('origem', 'avulsa')
        t.set('projeto_id', '')
        t.set('marco_id', '')
        app.save(t)
        contagemB++
      }
    }

    // 5. Grava auditoria / diagnóstico
    try {
      const auditoria = app.findCollectionByNameOrId('auditoria')
      const diag = new Record(auditoria)
      diag.set('usuario_email', 'sistema@migracao')
      diag.set('acao', 'MIGRACAO_0040_ORIGEM_MARCOS')
      diag.set('modulo', 'PROJETOS_TAREFAS')
      diag.set(
        'detalhe',
        JSON.stringify({
          descricao: 'Backfill do modelo de vínculo por ORIGEM concluído',
          contagem_a_projeto_com_marco: contagemA,
          contagem_b_avulsa_em_conformidade: contagemB,
          total_tarefas: contagemA + contagemB,
          timestamp: new Date().toISOString(),
        }),
      )
      app.save(diag)
    } catch (_) {}

    // 6. Triggers SQLite para ON DELETE RESTRICT em marcos e CHECK constraint em tarefas
    try {
      app
        .db()
        .newQuery(`
        CREATE TRIGGER IF NOT EXISTS trg_marcos_delete_restrict
        BEFORE DELETE ON marcos
        FOR EACH ROW
        BEGIN
          SELECT CASE
            WHEN EXISTS (SELECT 1 FROM tarefas WHERE marco_id = OLD.id)
            THEN RAISE(ABORT, 'ON DELETE RESTRICT: marco possui tarefas vinculadas')
          END;
        END;
      `)
        .execute()

      app
        .db()
        .newQuery(`
        CREATE TRIGGER IF NOT EXISTS trg_tarefa_chk_insert
        BEFORE INSERT ON tarefas
        FOR EACH ROW
        BEGIN
          SELECT CASE
            WHEN NOT (
              ((NEW.origem = 'avulsa' OR NEW.origem IS NULL OR NEW.origem = '') AND (NEW.projeto_id IS NULL OR NEW.projeto_id = '') AND (NEW.marco_id IS NULL OR NEW.marco_id = ''))
              OR
              (NEW.origem = 'projeto' AND (NEW.projeto_id IS NOT NULL AND NEW.projeto_id != '') AND (NEW.marco_id IS NOT NULL AND NEW.marco_id != ''))
            )
            THEN RAISE(ABORT, 'CONSTRAINT chk_tarefa_marco_obrigatorio VIOLATION')
          END;
        END;
      `)
        .execute()

      app
        .db()
        .newQuery(`
        CREATE TRIGGER IF NOT EXISTS trg_tarefa_chk_update
        BEFORE UPDATE ON tarefas
        FOR EACH ROW
        BEGIN
          SELECT CASE
            WHEN NOT (
              ((NEW.origem = 'avulsa' OR NEW.origem IS NULL OR NEW.origem = '') AND (NEW.projeto_id IS NULL OR NEW.projeto_id = '') AND (NEW.marco_id IS NULL OR NEW.marco_id = ''))
              OR
              (NEW.origem = 'projeto' AND (NEW.projeto_id IS NOT NULL AND NEW.projeto_id != '') AND (NEW.marco_id IS NOT NULL AND NEW.marco_id != ''))
            )
            THEN RAISE(ABORT, 'CONSTRAINT chk_tarefa_marco_obrigatorio VIOLATION')
          END;
        END;
      `)
        .execute()
    } catch (_) {}
  },
  (app) => {
    try {
      app.db().newQuery('DROP TRIGGER IF EXISTS trg_marcos_delete_restrict;').execute()
      app.db().newQuery('DROP TRIGGER IF EXISTS trg_tarefa_chk_insert;').execute()
      app.db().newQuery('DROP TRIGGER IF EXISTS trg_tarefa_chk_update;').execute()
    } catch (_) {}

    try {
      const tarefas = app.findCollectionByNameOrId('tarefas')
      for (const n of ['origem', 'projeto_id', 'marco_id']) {
        if (tarefas.fields.getByName(n)) {
          tarefas.fields.removeByName(n)
        }
      }
      app.save(tarefas)
    } catch (_) {}

    try {
      const marcos = app.findCollectionByNameOrId('marcos')
      if (marcos) {
        app.delete(marcos)
      }
    } catch (_) {}
  },
)
