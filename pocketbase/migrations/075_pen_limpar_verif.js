/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA DA VERIFICAÇÃO (18/11/2026)
//
// Remove o usuário de verificação e os registros de teste de exportação que
// ele gerou em pen_audit. O DADO REAL semeado (empresas, objetivos, KPIs,
// iniciativas, causas, RAID) PERMANECE — esse é o conteúdo do plano.
// ============================================================================
migrate(
  (app) => {
    // registros de auditoria criados pelo teste
    let n = 0
    try {
      const regs = app.findRecordsByFilter('pen_audit', 'user_id = "Verificação PEN"', '', 50, 0)
      for (const r of regs) {
        app.delete(r)
        n++
      }
    } catch (e) {
      console.log('[limpeza3] auditoria: ' + String(e).slice(0, 120))
    }
    console.log('[limpeza3] registros de auditoria de teste removidos: ' + n)

    // usuário de verificação
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'verif.pen@pge.local'))
      console.log('[limpeza3] usuário verif.pen removido')
    } catch (_) {
      console.log('[limpeza3] usuário verif.pen ausente')
    }

    // conferência: o dado do plano continua lá
    for (const c of ['pen_company', 'pen_objective', 'pen_initiative', 'pen_risk']) {
      try {
        const todos = app.findRecordsByFilter(c, "id != ''", '', 500, 0)
        console.log('[limpeza3] ' + c + ' = ' + todos.length + ' (preservado)')
      } catch (_) {}
    }
    console.log('[limpeza3] CONCLUÍDO')
  },
  (app) => {
    console.log('[limpeza3] rollback não aplicável')
  },
)
