/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA DE USUÁRIOS DE TESTE (18/11/2026)
//
// Criados durante a investigação do defeito "criar usuário não cria":
// teste.criar.3130@pge.local e teste.final.7741@pge.local.
// Removidos aqui. Os usuários reais NÃO são tocados.
// ============================================================================
migrate(
  (app) => {
    const alvos = ['teste.criar.3130@pge.local', 'teste.final.7741@pge.local']
    let n = 0
    for (const email of alvos) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
        n++
        console.log('[limpa-user] removido: ' + email)
      } catch (_) {
        console.log('[limpa-user] ausente: ' + email)
      }
    }
    console.log('[limpa-user] removidos: ' + n)
  },
  (app) => {
    console.log('[limpa-user] rollback não aplicável')
  },
)
