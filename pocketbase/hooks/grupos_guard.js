// 11/11/2026 — GUARDA DE PERMISSÕES (escalação de privilégio)
//
// BURACO ENCONTRADO: `grupos_permissao` estava com create/update/delete em
// "@request.auth.id != ''" (migração 0064). Qualquer usuário autenticado podia
// reescrever o JSON `permissoes` do PRÓPRIO grupo — inclusive se dar acesso a
// telas, abas e botões que o admin negou — e, pior, do grupo Admin.
// A tela /acessos ser Admin-only não protege a API: o PocketBase é chamado
// direto pelo cliente.
//
// Esta guarda fecha a API: só membro do grupo "Admin" grava em grupos_permissao.
// $app.save() interno (migrações/hooks) NÃO passa por aqui.

function _isAdminAuth(rec) {
  if (!rec) return false
  try {
    if (rec.collection().name === '_superusers') return true
  } catch (_) {}
  try {
    const gid = rec.getString('grupo_id')
    if (!gid) return false
    const g = $app.findRecordById('grupos_permissao', gid)
    return String(g.getString('nome')).trim() === 'Admin'
  } catch (_) {
    return false
  }
}

onRecordCreateRequest((e) => {
  if (!_isAdminAuth(e.auth)) {
    throw new ForbiddenError('Somente administradores podem criar grupos de permissão.')
  }
  return e.next()
}, 'grupos_permissao')

onRecordUpdateRequest((e) => {
  if (!_isAdminAuth(e.auth)) {
    throw new ForbiddenError('Somente administradores podem alterar permissões de grupo.')
  }
  return e.next()
}, 'grupos_permissao')

onRecordDeleteRequest((e) => {
  if (!_isAdminAuth(e.auth)) {
    throw new ForbiddenError('Somente administradores podem excluir grupos de permissão.')
  }
  return e.next()
}, 'grupos_permissao')
