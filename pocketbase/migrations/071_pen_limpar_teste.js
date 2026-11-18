/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA DOS DADOS DE TESTE DE RLS (18/11/2026)
//
// O teste de isolamento já foi executado e PASSOU (dois usuários, dois
// workspaces, cada um vendo só o seu; escrita cruzada bloqueada com HTTP 400;
// anônimo vendo 0). Esta migração remove o que o teste criou, para não deixar
// usuário e registro fictícios no banco de produção.
//
// O CAMPO users.workspace_id PERMANECE — é estrutura da política de RLS.
// ============================================================================
migrate(
  (app) => {
    // registros de teste
    let removidos = 0
    try {
      const objs = app.findRecordsByFilter('pen_objective', 'workspace_id ~ "teste"', '', 50, 0)
      for (const o of objs) {
        app.delete(o)
        removidos++
      }
    } catch (e) {
      console.log('[limpeza] objetivos: ' + String(e).slice(0, 120))
    }

    // usuários de teste
    for (const email of ['rls.alpha@teste.pge', 'rls.beta@teste.pge']) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
        console.log('[limpeza] usuário removido: ' + email)
      } catch (_) {
        console.log('[limpeza] usuário ausente: ' + email)
      }
    }

    console.log('[limpeza] objetivos removidos: ' + removidos)

    // conferência final: nenhum resíduo
    try {
      const resta = app.findRecordsByFilter('pen_objective', 'workspace_id ~ "teste"', '', 10, 0)
      console.log('[limpeza] resíduos restantes: ' + (resta ? resta.length : 0))
    } catch (_) {}

    console.log('[limpeza] CONCLUÍDO — campo users.workspace_id mantido (é da política)')
  },
  (app) => {
    console.log('[limpeza] rollback não aplicável')
  },
)
