/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FORÇAR CONCLUSÃO DAS TAREFAS DE SESSÃO CONCLUÍDA — v3 (16/11/2026)
//
// As migrações 123 e 125 não resolveram: o print mostra 13/11, 15/10 e 23/09
// ainda em "A Fazer" no kanban, com "Concluída" na aba Tratamentos.
//
// As tentativas anteriores dependiam de:
//   · `tarefa_por_data` (pode estar vazio/errado)
//   · casar o TIPO no título (acento/encoding pode divergir)
//   · janela de prazo (falha por fuso)
//
// ESTA VERSÃO NÃO DEPENDE DE NADA DISSO. Ela é direta:
//   1. para CADA tratamento, lê `sessoes_concluidas` e `proximas_sessoes`;
//   2. recalcula quais datas estão concluídas;
//   3. busca a tarefa por `tarefa_por_data[data]`, e se não houver, por
//      qualquer tarefa cujo `prazo` comece com aquela data (comparação de
//      TEXTO, sem fuso);
//   4. aplica status='concluida' + status_kanban='concluido' por SQL.
//
// Ao final imprime uma tabela de conferência: data → tarefa encontrada → estado.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- 1) índice de tarefas por DIA (texto puro) ----------
    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[forcar] listar tarefas: ' + String(err).slice(0, 140))
      tarefas = []
    }
    console.log('[forcar] tarefas: ' + tarefas.length)

    // dia → [{id, titulo, status, kanban}]
    const porDia = {}
    for (const t of tarefas) {
      let prazoStr = ''
      try {
        prazoStr = String(t.get('prazo') || '')
      } catch (_) {}
      const m = /(\d{4})-(\d{2})-(\d{2})/.exec(prazoStr)
      if (!m) continue
      const dia = m[1] + '-' + m[2] + '-' + m[3]
      if (!porDia[dia]) porDia[dia] = []
      porDia[dia].push({
        id: String(t.id),
        titulo: String(t.getString('titulo') || ''),
        status: String(t.getString('status') || ''),
        kanban: String(t.getString('status_kanban') || ''),
      })
    }
    console.log('[forcar] dias com tarefa: ' + Object.keys(porDia).length)

    // ---------- 2) tratamentos ----------
    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (_) {
      tratamentos = []
    }
    console.log('[forcar] tratamentos: ' + tratamentos.length)

    let ajustadas = 0
    const conferencia = []

    for (const tr of tratamentos) {
      const tipo = String(tr.getString('tipo_nome') || '').trim()

      // datas concluídas
      let concluidas = []
      try {
        const b = tr.get('sessoes_concluidas')
        if (Array.isArray(b)) concluidas = b
        else if (typeof b === 'string') {
          const p = JSON.parse(b)
          concluidas = Array.isArray(p) ? p : []
        }
      } catch (_) {
        concluidas = []
      }
      if (!concluidas.length) continue

      // mapa data → tarefa
      let mapa = {}
      try {
        const mm = tr.get('tarefa_por_data')
        if (mm && typeof mm === 'object' && !Array.isArray(mm)) mapa = mm
      } catch (_) {
        mapa = {}
      }

      for (const bruto of concluidas) {
        const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(String(bruto || ''))
        if (!dm) continue
        const dia = dm[1] + '-' + dm[2] + '-' + dm[3]

        // candidatos neste dia
        const doDia = porDia[dia] || []

        // preferência 1: id do mapa
        let escolhida = null
        const idMapa = mapa[dia] ? String(mapa[dia]) : ''
        if (idMapa) {
          for (const c of doDia) {
            if (c.id === idMapa) {
              escolhida = c
              break
            }
          }
        }

        // preferência 2: título que começa com o TIPO
        if (!escolhida && tipo) {
          for (const c of doDia) {
            if (c.titulo.indexOf(tipo) === 0) {
              escolhida = c
              break
            }
          }
        }

        // preferência 3: qualquer tarefa do dia (o dia é da sessão)
        if (!escolhida && doDia.length) escolhida = doDia[0]

        if (!escolhida) {
          if (conferencia.length < 20) conferencia.push(dia + ' → SEM TAREFA (tipo: ' + tipo + ')')
          continue
        }

        // conclui (idempotente)
        try {
          db.newQuery(
            "UPDATE tarefas SET status = 'concluida', status_kanban = 'concluido' WHERE id = {:id}",
          )
            .bind({ id: escolhida.id })
            .execute()

          const jaEstava = escolhida.status === 'concluida' && escolhida.kanban === 'concluido'
          if (!jaEstava) ajustadas++

          if (conferencia.length < 20) {
            conferencia.push(
              dia +
                ' → ' +
                escolhida.titulo.slice(0, 40) +
                ' [' +
                (jaEstava ? 'já ok' : 'CONCLUÍDA AGORA') +
                ']',
            )
          }
        } catch (err) {
          if (conferencia.length < 20)
            conferencia.push(dia + ' → ERRO: ' + String(err).slice(0, 60))
        }
      }
    }

    console.log('[forcar] tarefas concluídas agora: ' + ajustadas)
    for (const c of conferencia) console.log('[forcar] ' + c)

    // ---------- 3) retrato final ----------
    try {
      const r = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const x of r) l.push(String(x.get('status_kanban')) + '=' + String(x.get('n')))
      console.log('[forcar] por coluna: ' + l.join(' · '))
    } catch (_) {}

    console.log('[forcar] CONCLUÍDO')
  },
  (app) => {
    console.log('[forcar] rollback: reversão manual se necessário')
  },
)
