/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA DO TESTE DE RLS (18/11/2026)
//
// Remove: o usuário de teste "sem.meta@pge.local" e os registros de auditoria
// das validações (campo='target' e 'progresso' gravados por este teste).
// O DADO do plano e a regra de RLS PERMANECEM.
// ============================================================================
migrate(
  (app) => {
    let n = 0
    try {
      const regs = app.findRecordsByFilter(
        'pen_audit',
        'registro_id = "z" || registro_id = "x" || registro_id = "y"',
        '',
        100,
        0,
      )
      for (const r of regs) {
        app.delete(r)
        n++
      }
    } catch (e) {
      console.log('[limpeza28] auditoria: ' + String(e).slice(0, 140))
    }
    console.log('[limpeza28] registros de teste removidos: ' + n)

    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'sem.meta@pge.local'))
      console.log('[limpeza28] usuário sem.meta removido')
    } catch (_) {
      console.log('[limpeza28] usuário sem.meta ausente')
    }

    // conferência: a RLS continua ativa?
    try {
      const col = app.findCollectionByNameOrId('pen_audit')
      console.log('[limpeza28] RLS mantida: ' + String(col.createRule))
    } catch (_) {}

    // o CEO continua com a permissão?
    try {
      const ceo = app.findAuthRecordByEmail('_pb_users_auth_', 'lvenanciol@gmail.com')
      console.log('[limpeza28] CEO pode_alterar_meta = ' + ceo.getBool('pode_alterar_meta'))
    } catch (_) {}
    console.log('[limpeza28] CONCLUÍDO')
  },
  (app) => {
    console.log('[limpeza28] rollback não aplicável')
  },
)
