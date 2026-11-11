// CARROSSEL DE EMPRESAS NA REDEFINIÇÃO DE SENHA — v3 (11/11/2026)
//
// A tela pública /reset-password?token=… não tem sessão: para exibir o mesmo
// carrossel de empresas do login é preciso identificar o DONO do token de
// redefinição. O token é um JWT assinado pela coleção `users`; decodificamos o
// payload SEM verificar a assinatura apenas para extrair o id do usuário
// (nada sensível é retornado: só nome/cor das empresas do vínculo).
//
// v3 — HARDENING da decodificação e da resposta:
// - Decodificação MANUAL do base64url do payload: helpers de JWT do JSVM
//   ($security.parseUnverifiedToken) NÃO existem e $security.parseJWT devolve
//   objeto goja não-enumerável — era a causa de `empresas: []` na v0.0.343.
// - O payload do JWT pode vir em dois formatos: { id: "…" } (PocketBase >= 0.23)
//   e { type:"authRecord", record:{ id } } (tokens de conveniência). Cobrimos os
//   dois; aceitamos também user_id/uid por robustez.
// - O campo users.empresas é JSON (array de ids de `empresas`), gravado pelo
//   Controle de Acessos; se vier vazio, caímos para a empresa principal
//   (users.empresa_id) — mesma resolução de usuarios_listar.js v3.
// - Cada empresa volta com a URL PÚBLICA da sua logomarca (coleção `logomarcas`,
//   campo emblema com fallback para logo) já resolvida pelo servidor, para o
//   carrossel não depender de segunda chamada autenticada do frontend.
//
// POST /backend/v1/public/reset-empresas  body: { token }
// → { ok: true, nome, empresas: [{ id, nome, cor, logoUrl }] }
//
// Rota PÚBLICA (sem requireAuth): o token é a única credencial apresentada.
// TUDO inline no callback: o JSVM executa callbacks em pool separado — funções
// top-level não são visíveis dentro dele (erro de scoping do deploy).

routerAdd('POST', '/backend/v1/public/reset-empresas', (e) => {
  const vazio = { ok: true, nome: '', empresas: [] }

  // --- base64url → string UTF-8 (goja não tem atob nem Buffer) -------------
  function b64urlDecode(s) {
    const mapa = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_+/'
    const limpo = String(s || '').replace(/[^A-Za-z0-9\-_+\/]/g, '')
    let bits = 0
    let acc = 0
    const bytes = []
    for (let i = 0; i < limpo.length; i++) {
      const ch = limpo[i]
      if (ch === '=') break
      const idx = mapa.indexOf(ch)
      if (idx < 0) continue
      acc = (acc << 6) | idx
      bits += 6
      if (bits >= 8) {
        bits -= 8
        bytes.push((acc >> bits) & 0xff)
      }
    }
    let str = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b < 0x80) {
        str += String.fromCharCode(b)
      } else if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) {
        str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
        i++
      } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
        str += String.fromCharCode(
          ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
        )
        i += 2
      }
    }
    return str
  }

  // --- id do usuário a partir do payload do JWT (sem verificar assinatura) --
  function extrairIdDoToken(token) {
    const partes = String(token || '').split('.')
    if (partes.length < 2) return ''
    let payload = null
    try {
      payload = JSON.parse(b64urlDecode(partes[1]))
    } catch (_) {
      return ''
    }
    if (!payload || typeof payload !== 'object') return ''
    if (payload.id) return String(payload.id)
    if (payload.user_id) return String(payload.user_id)
    if (payload.uid) return String(payload.uid)
    if (payload.record && payload.record.id) return String(payload.record.id)
    return ''
  }

  // -------------------------------------------------------------------------
  let token = ''
  try {
    token = String((e.requestInfo().body || {}).token || '')
  } catch (_) {
    token = ''
  }
  if (!token) return e.json(200, vazio)

  const id = extrairIdDoToken(token)
  if (!id) return e.json(200, vazio)

  // Usuário dono do token.
  let user = null
  try {
    user = $app.findRecordById('users', id)
  } catch (_) {
    user = null
  }
  if (!user) return e.json(200, vazio)

  // Empresas vinculadas (mesma resolução de usuarios_listar.js v3).
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

  // Logomarcas ativas (uma por empresa, indexada pelo nome) — para o carrossel
  // mostrar a imagem real sem precisar de sessão no frontend.
  let colLogos = null
  try {
    colLogos = $app.findCollectionByNameOrId('logomarcas')
  } catch (_) {
    colLogos = null
  }
  const colIdLogos = colLogos ? colLogos.id : 'logomarcas'

  let base = ''
  try {
    base = String($app.settings().meta.appUrl || '')
  } catch (_) {
    base = ''
  }
  if (!base) {
    try {
      base = String($secrets.get('PB_INSTANCE_URL') || '')
    } catch (_) {}
  }
  base = String(base)
    .replace(/\/_\/?$/, '')
    .replace(/\/$/, '')

  const logosPorEmpresa = {}
  try {
    const registros = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 50, 0)
    for (let i = 0; i < registros.length; i++) {
      const rec = registros[i]
      const nomeEmp = rec.getString('empresa')
      const emblema = rec.getString('emblema')
      const logo = rec.getString('logo')
      const arquivo = emblema || logo
      if (!arquivo) continue
      logosPorEmpresa[String(nomeEmp).toLowerCase()] =
        base + '/api/files/' + colIdLogos + '/' + rec.id + '/' + arquivo
    }
  } catch (_) {
    // sem logomarcas cadastradas: o frontend usa o fallback de cor/sigla
  }

  // Monta a resposta com nome, cor e logo de cada empresa do vínculo.
  const empresas = []
  for (let i = 0; i < ids.length; i++) {
    try {
      const emp = $app.findRecordById('empresas', ids[i])
      const nomeEmp = emp.getString('nome')
      empresas.push({
        id: emp.id,
        nome: nomeEmp,
        cor: emp.getString('cor') || '#1B5E20',
        logoUrl: logosPorEmpresa[String(nomeEmp).toLowerCase()] || '',
      })
    } catch (_) {}
  }

  return e.json(200, { ok: true, nome: user.getString('name'), empresas: empresas })
})
