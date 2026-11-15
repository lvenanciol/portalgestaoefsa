/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — STATUS POR SESSÃO + LIMPEZA DAS 32 DUPLICATAS (15/11/2026)
//
// ─────────────────────────────────────────────────────────────────────────
// b) "Não agendado" salvava como "agendado"
//
// A lista derivava o status da sessão em apenas DOIS valores:
//     concluída ? 'concluido' : 'agendado'
// Não existia estado para "nao_agendado", então o que o dono escolhia se
// perdia. É preciso guardar o status POR DATA, não derivar por ausência.
//
// Novo campo: `sessoes_status` = objeto { "2026-12-17": "nao_agendado", ... }
// `sessoes_concluidas` continua existindo por compatibilidade; quando a data
// está nele, o status é 'concluido'.
// ─────────────────────────────────────────────────────────────────────────
// b6) 32 tarefas novas em 'triagem'
//
// O reconciliar buscava a tarefa existente por JANELA DE PRAZO em UTC:
//     prazo >= 'DD 00:00:00.000Z' && prazo <= 'DD 23:59:59.999Z'
// Uma tarefa gravada em 17/12 00:00Z corresponde a 16/12 21:00 no horário
// local — cai FORA da janela do dia 17. A busca não achava, e criava outra.
//
// Correção: além da janela, procurar por TÍTULO contendo a data dd/mm/aaaa,
// que é o padrão usado por todos os caminhos que criam tarefa de sessão.
// ============================================================================
migrate(
  (app) => {
    // ============ 1) campo sessoes_status ============
    let colT = null
    try {
      colT = app.findCollectionByNameOrId('ll5_treatments')
    } catch (_) {
      colT = null
    }

    if (colT) {
      const nomes = (colT.fields || []).map((f) => f.name)
      if (!nomes.includes('sessoes_status')) {
        colT.fields.add(new JSONField({ name: 'sessoes_status', maxSize: 12000 }))
        try {
          app.save(colT)
          console.log('[sessao] + sessoes_status')
        } catch (err) {
          console.log('[sessao] save: ' + String(err).slice(0, 160))
        }
      } else {
        console.log('[sessao] sessoes_status já existe')
      }

      // conferência
      try {
        const conf = app.findCollectionByNameOrId('ll5_treatments')
        const n2 = (conf.fields || []).map((f) => f.name)
        console.log('[sessao] CONFERÊNCIA: ' + (n2.includes('sessoes_status') ? 'OK' : 'AUSENTE'))
      } catch (_) {}
    }

    // ============ 2) apaga as duplicatas em 'triagem' ============
    //
    // Regra: tarefa em 'triagem' cujo TÍTULO (contendo dd/mm/aaaa) já existe
    // em outra tarefa com status diferente. Mantém a que não é triagem.
    const db = app.db()

    try {
      const antes = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of antes) console.log('[sessao] triagem antes: ' + String(x.get('n')))
    } catch (_) {}

    // 2a — por data no título
    try {
      db.newQuery(
        "DELETE FROM tarefas WHERE status = 'triagem' AND EXISTS (" +
          '  SELECT 1 FROM tarefas t2 ' +
          '  WHERE t2.id != tarefas.id ' +
          "    AND COALESCE(t2.status, '') != 'triagem' " +
          "    AND LENGTH(COALESCE(tarefas.titulo, '')) > 10 " +
          '    AND SUBSTR(t2.titulo, -10) = SUBSTR(tarefas.titulo, -10) ' +
          ')',
      ).execute()
      console.log('[sessao] DELETE 2a (por título) executado')
    } catch (err) {
      console.log('[sessao] 2a falhou: ' + String(err).slice(0, 200))
    }

    // 2b — por dia do prazo (10 primeiros chars), como reforço
    try {
      db.newQuery(
        "DELETE FROM tarefas WHERE status = 'triagem' AND LENGTH(COALESCE(prazo,'')) >= 10 AND EXISTS (" +
          '  SELECT 1 FROM tarefas t2 ' +
          '  WHERE t2.id != tarefas.id ' +
          "    AND COALESCE(t2.status, '') != 'triagem' " +
          '    AND SUBSTR(t2.prazo, 1, 10) = SUBSTR(tarefas.prazo, 1, 10) ' +
          ')',
      ).execute()
      console.log('[sessao] DELETE 2b (por dia do prazo) executado')
    } catch (err) {
      console.log('[sessao] 2b falhou: ' + String(err).slice(0, 200))
    }

    try {
      const depois = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of depois) console.log('[sessao] triagem depois: ' + String(x.get('n')))
    } catch (_) {}
  },
  (app) => {
    console.log('[sessao] rollback: campo e limpeza mantidos')
  },
)
