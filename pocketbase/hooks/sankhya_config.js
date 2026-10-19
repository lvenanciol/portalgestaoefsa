// TAREFA B — config Sankhya (espelho do sankhya-service do Foldbox):
// GET /backend/v1/integracoes/sankhya/config → status mascarado das credenciais
// POST /backend/v1/integracoes/sankhya/config → salva credenciais (JSONB em
// integracoes_config.integracao='sankhya'; segredos preservados se mascarados)
// + auditoria. A conexão real segue via sankhya_proxy (edge Foldbox).

routerAdd(
  'GET',
  '/backend/v1/integracoes/sankhya/config',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'sankhya'")
    } catch (_) {}
    const c = cfg ? cfg.get('config') || {} : {}
    const mask = function (v, keep) {
      if (!v) return ''
      if (v.length <= keep) return '••••••'
      return v.slice(0, keep) + '••••••••' + v.slice(-4)
    }
    const tem = function (v) {
      return !!v && !String(v).startsWith('••••')
    }
    return e.json(200, {
      success: true,
      config: {
        base_url: c.base_url || 'https://api.sankhya.com.br',
        client_id: tem(c.client_id) ? mask(c.client_id, 6) : '',
        client_secret: tem(c.client_secret) ? mask(c.client_secret, 4) : '',
        appkey: tem(c.appkey) ? mask(c.appkey, 4) : '',
        token: tem(c.token) ? mask(c.token, 6) : '',
        user: c.user || '',
        password: tem(c.password) ? '••••••••' : '',
      },
      has_client_id: tem(c.client_id),
      has_client_secret: tem(c.client_secret),
      has_appkey: tem(c.appkey),
      has_token: tem(c.token),
      has_user: !!c.user,
      has_password: tem(c.password),
      atualizado_em: cfg ? cfg.getDateTime('updated').string() : null,
      atualizado_por: c.atualizado_por || '',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/integracoes/sankhya/config',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const body = e.requestInfo().body || {}
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'sankhya'")
    } catch (_) {}
    const atual = cfg ? cfg.get('config') || {} : {}
    const manter = function (novo, antigo) {
      const v = String(novo || '').trim()
      return v && !v.startsWith('••••') ? v : antigo || ''
    }
    const config = {
      base_url: String(body.base_url || 'https://api.sankhya.com.br').trim(),
      client_id: manter(body.client_id, atual.client_id),
      client_secret: manter(body.client_secret, atual.client_secret),
      appkey: manter(body.appkey, atual.appkey),
      token: manter(body.token, atual.token),
      user: String(body.user || '').trim() || atual.user || '',
      password: manter(body.password, atual.password),
      atualizado_por: auth.getString('email'),
    }
    if (cfg) {
      cfg.set('config', config)
      cfg.set('atualizado_por', auth.getString('email'))
      $app.save(cfg)
    } else {
      const col = $app.findCollectionByNameOrId('integracoes_config')
      const r = new Record(col)
      r.set('integracao', 'sankhya')
      r.set('config', config)
      r.set('atualizado_por', auth.getString('email'))
      $app.save(r)
    }
    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'sankhya_config_salvar', 'integracoes', 'Credenciais Sankhya salvas', {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}
    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
