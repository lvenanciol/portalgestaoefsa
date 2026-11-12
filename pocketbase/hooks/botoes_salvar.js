// Fase 9 — Salva botões ocultos por grupo (admin-only).
// POST /backend/v1/botoes/salvar  body: { grupo_id, botoes: {screen: [keys]} }
// Grava em grupos_permissao.permissoes.botoes (JSONB) e registra auditoria.
//
// 11/11/2026 (v2, bug "Suprimentos sem nada na sidebar"): além do mapa de
// revogações, este endpoint AGORA DERIVA as concessões de módulo a partir da
// matriz — o quadro do Controle de Acessos é a fonte da verdade do admin, mas
// só gravava revogações (crud_<tela>_<acao>:off) e NUNCA gravava
// permissoes['tarefas-agenda'].ver=true. Com o curinga removido (0071-0073),
// can() e o gate de API deixaram de ver concessão nenhuma para grupos não-Admin
// → sidebar vazia e "/" bloqueado. A partir daqui, salvar a matriz grava em
// permissoes[modulo] o que a tela mostra marcado (Ver/Criar/Editar/Excluir).

routerAdd(
  'POST',
  '/backend/v1/botoes/salvar',
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
    const grupoId = String(body.grupo_id || '')
    const botoes = body.botoes
    if (!grupoId) return e.badRequestError('grupo_id obrigatório')
    if (!botoes || typeof botoes !== 'object') return e.badRequestError('botoes obrigatório')

    let grupo
    try {
      grupo = $app.findRecordById('grupos_permissao', grupoId)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Grupo não encontrado.' })
    }

    // preserva o resto do JSON de permissões
    let permissoes = {}
    try {
      const raw = grupo.getString('permissoes')
      permissoes = raw ? JSON.parse(raw) : {}
    } catch (_) {
      permissoes = {}
    }
    permissoes['botoes'] = botoes

    // DERIVAÇÃO — tela (BUTTON_GATES) → módulo do JSON de permissões. Deve
    // espelhar TELA_MODULO (src/services/botoes-service.ts) e o MODULO_TELA de
    // permissoes-service.ts. Runtime JSVM: tabela literal DENTRO do callback.
    const MODULO_DA_TELA = {
      dashboard: 'dashboard-executivo',
      financeiro: 'financeiro-contabil',
      financeiro_real: 'financeiro-contabil',
      desempenho: 'desempenho-unidade',
      indicadores: 'indicadores',
      documentos: 'documentos-importacoes',
      tarefas: 'tarefas-agenda',
      projetos: 'projetos',
      atas: 'atas-reunioes',
      emails: 'emails',
      contratos: 'contratos',
      'power-bi': 'power-bi',
      ia: 'ia-gemini',
      menus: 'arvore-menus',
      acessos: 'controle-acessos',
      configuracoes: 'configuracoes',
    }
    const ACAO_DA_CHAVE = { ver: 'ver', criar: 'criar', editar: 'editar', excluir: 'excluir' }

    for (const tela in MODULO_DA_TELA) {
      const modulo = MODULO_DA_TELA[tela]
      const ocultos = Array.isArray(botoes[tela]) ? botoes[tela].map(String) : []
      const revogada = (acao) =>
        ocultos.indexOf('crud_' + tela + '_' + acao + ':off') >= 0 ||
        ocultos.indexOf('crud_' + tela + '_todas:off') >= 0
      let mod = permissoes[modulo]
      if (!mod || typeof mod !== 'object') mod = {}
      for (const acao in ACAO_DA_CHAVE) {
        // revogação vence: coluna desmarcada grava false explícito
        mod[acao] = !revogada(acao)
      }
      permissoes[modulo] = mod
    }

    try {
      grupo.set('permissoes', JSON.stringify(permissoes))
      $app.save(grupo)
    } catch (err) {
      return e.json(500, { ok: false, erro: 'Falha ao salvar: ' + String(err) })
    }

    // Auditoria
    try {
      const id = $security.randomString(15)
      const agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'salvar_botoes_grupo', 'controle-acessos', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'grupo ' + grupo.getString('nome') + ': ' + JSON.stringify(botoes).slice(0, 500),
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
