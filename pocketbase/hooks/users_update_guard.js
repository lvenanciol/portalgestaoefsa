// Fase 3 — Guarda de self-update no users via API: usuário comum NÃO pode
// alterar os próprios vínculos (grupo/empresa/unidade/ativo/verified).
// Edições administrativas passam pela rota /backend/v1/usuarios/{id}
// ($app.save não dispara request hooks — só este gate HTTP é bloqueado).
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const body = e.requestInfo().body || {}
  const sensitive = ['grupo_id', 'empresa_id', 'unidade_id', 'ativo', 'verified', 'emailVisibility']
  for (let i = 0; i < sensitive.length; i++) {
    if (Object.prototype.hasOwnProperty.call(body, sensitive[i])) {
      throw new ForbiddenError('Alteração de vínculo/status só via Controle de Acessos.')
    }
  }
  return e.next()
}, 'users')
