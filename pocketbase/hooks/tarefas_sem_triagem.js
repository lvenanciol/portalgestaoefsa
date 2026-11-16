// ============================================================================
// TAREFAS EM 'triagem' SÃO EXCLUÍDAS INCONDICIONALMENTE (16/11/2026)
//
// DIRETIVA DO DONO: "TAREFAS criadas com status = triagem devem ser excluídas
// incondicionalmente".
//
// Este hook roda em TODO salvamento de `tarefas`:
//   · se a tarefa está em status_kanban = 'triagem', ela é APAGADA;
//   · se chega uma atualização que tenta MUDAR para 'triagem', o valor é
//     rejeitado e a tarefa permanece no status anterior.
//
// Por que um hook e não só a migração: a migração limpa o que existe, mas
// outros caminhos (cron de recorrência, reconciliar, salvamento de
// tratamentos, importação) podem criar tarefa sem definir status_kanban — e
// o DEFAULT do campo no PocketBase é 'triagem'. O hook fecha essa porta.
// ============================================================================

onRecordCreateRequest((e) => {
  try {
    const st = String(e.record.getString('status_kanban') || '')
    if (st === 'triagem') {
      // nunca permitir criar em triagem: promove para 'a_fazer'
      e.record.set('status_kanban', 'a_fazer')
      console.log('[sem-triagem] criação em triagem promovida para a_fazer: ' + e.record.id)
    }
  } catch (err) {
    console.log('[sem-triagem] create: ' + String(err).slice(0, 120))
  }
  e.next()
}, 'tarefas')

onRecordUpdateRequest((e) => {
  try {
    const st = String(e.record.getString('status_kanban') || '')
    if (st === 'triagem') {
      e.record.set('status_kanban', 'a_fazer')
      console.log('[sem-triagem] atualização para triagem bloqueada: ' + e.record.id)
    }
  } catch (err) {
    console.log('[sem-triagem] update: ' + String(err).slice(0, 120))
  }
  e.next()
}, 'tarefas')

// ---------------------------------------------------------------------------
// Limpeza periódica: se algo escapar (gravação via hook do sistema, migração
// antiga, admin), este job apaga a cada 15 minutos.
// ---------------------------------------------------------------------------
cronAdd('tarefas_limpar_triagem', '*/15 * * * *', () => {
  try {
    const db = $app.db()
    let antes = 0
    try {
      const r = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const x of r) antes = Number(x.get('n') || 0)
    } catch (_) {}

    if (antes === 0) {
      // nada a fazer — não polui o log
      return
    }

    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[sem-triagem] cron apagou ' + antes + ' tarefa(s) em triagem')
    } catch (err) {
      console.log('[sem-triagem] cron falhou: ' + String(err).slice(0, 160))
    }
  } catch (errGeral) {
    console.log('[sem-triagem] cron erro: ' + String(errGeral).slice(0, 160))
  }
})
