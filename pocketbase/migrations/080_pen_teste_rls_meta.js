/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// TESTE DA RLS DE META (18/11/2026)
//
// A regra criada na 079 só está PROVADA se um usuário SEM a flag
// (pode_alterar_meta) for BARRADO ao gravar campo='target'.
// Um teste com o CEO passando não prova restrição nenhuma.
//
// Cria um usuário sem a flag, com o mesmo workspace.
// A migração seguinte remove.
// ============================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    const email = 'sem.meta@pge.local'
    let rec = null
    try {
      rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
    } catch (_) {
      rec = null
    }
    if (!rec) {
      rec = new Record(col)
      rec.setEmail(email)
      rec.setPassword('SemMeta@2026')
      rec.setVerified(true)
      rec.set('name', 'Usuário sem permissão de meta')
      rec.set('ativo', true)
    }
    rec.set('workspace_id', 'ws-pge-001')
    rec.set('pode_alterar_meta', false)
    app.save(rec)
    console.log('[rlsmeta] usuário de teste pronto: ' + email + ' (pode_alterar_meta=false)')
  },
  (app) => {
    console.log('[rlsmeta] rollback')
  },
)
