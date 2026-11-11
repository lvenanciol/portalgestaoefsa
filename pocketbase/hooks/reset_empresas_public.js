// CARROSSEL DE EMPRESAS NA REDEFINIÇÃO DE SENHA (11/11/2026)
//
// A tela pública /reset-password?token=… não tem sessão: para exibir o mesmo
// carrossel de empresas do login é preciso identificar o DONO do token de
// redefinição. O token é um JWT assinado pela coleção `users` — decodificamos
// o payload SEM verificar a assinatura apenas para extrair o id do usuário
// (nada sensível é retornado: só nome/cor das empresas do vínculo).
//
// POST /backend/v1/public/reset-empresas  body: { token }
// → { ok: true, nome, empresas: [{ id, nome, cor }] }
//
// Fonte de verdade = a mesma do Controle de Acessos e da topbar:
// users.empresas (JSON de ids de `empresas`), com fallback para a empresa
// principal (users.empresa_id) quando a lista estiver vazia.
// Rota PÚBLICA (sem requireAuth): o token é a única credencial apresentada.
routerAdd('POST', '/backend/v1/public/reset-empresas', (e) => {
  let token = ''
  try {
    token = String((e.requestInfo().body || {}).token || '')
  } catch (_) {
    token = ''
  }
  if (!token) return e.json(200, { ok: true, nome: '', empresas: [] })

  // 1. Payload do token (sem verificação de assinatura — só para achar o id).
  let payload = null
  try {
    payload = $security.parseUnverifiedToken(token)
  } catch (_) {
    payload = null
  }
  if (!payload || !payload.id) return e.json(200, { ok: true, nome: '', empresas: [] })

  // 2. Usuário dono do token.
  let user = null
  try {
    user = $app.findRecordById('users', String(payload.id))
  } catch (_) {
    user = null
  }
  if (!user) return e.json(200, { ok: true, nome: '', empresas: [] })

  // 3. Empresas vinculadas (mesma resolução de usuarios_listar.js v3).
  let ids = []
  try {
    const raw = user.getString('empresas')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) ids = arr.map(String).filter(Boolean)
    }
  } catch (_) {
    ids = []
  }
  if (ids.length === 0) {
    const principal = user.getString('empresa_id')
    if (principal) ids = [principal]
  }

  const empresas = []
  for (const id of ids) {
    try {
      const emp = $app.findRecordById('empresas', id)
      empresas.push({
        id: emp.id,
        nome: emp.getString('nome'),
        cor: emp.getString('cor') || '#1B5E20',
      })
    } catch (_) {}
  }

  return e.json(200, { ok: true, nome: user.getString('name'), empresas: empresas })
})
