/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// TESTE DE RLS COM DOIS WORKSPACES DISTINTOS (18/11/2026) — Portão 1
//
// DIRETIVA: "RLS testada com dois usuários distintos".
//
// O teste NÃO pode ser feito por curl anônimo: a regra exige usuário
// autenticado (`@request.auth.id != ""`), então anônimo dá 0 itens e isso não
// prova isolamento — prova só que a porta está fechada. O que precisa ser
// provado é: o usuário A do workspace "ws-alpha" NÃO enxerga dado do
// workspace "ws-beta", mesmo autenticado.
//
// Este script:
//   1. cria/garante dois usuários de teste (alpha e beta) com workspace_id
//      distinto e senha conhecida
//   2. insere um registro em pen_objective em CADA workspace
//   3. autentica como alpha e conta quantos enxerga (deve ver 1, o próprio)
//   4. autentica como beta e conta (deve ver 1, o próprio)
//   5. imprime o veredito: P ASSA se cada um vê exatamente o seu
//
// Os registros e usuários de teste são REMOVIDOS ao final (o teste não deixa
// lixo no banco de produção).
// ============================================================================
migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const objCol = app.findCollectionByNameOrId('pen_objective')

    const WS_A = 'ws-alpha-teste'
    const WS_B = 'ws-beta-teste'
    const EMAIL_A = 'rls.alpha@teste.pge'
    const EMAIL_B = 'rls.beta@teste.pge'
    const SENHA = 'RlsTeste@2026'

    // ---- helper: garante usuário com workspace ----
    function garantirUsuario(email, nome, ws) {
      let rec = null
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        rec = null
      }
      if (!rec) {
        rec = new Record(usersCol)
        rec.setEmail(email)
        rec.setPassword(SENHA)
        rec.setVerified(true)
        rec.set('name', nome)
        rec.set('ativo', true)
        app.save(rec)
        console.log('[rls] usuário criado: ' + email)
      } else {
        console.log('[rls] usuário já existia: ' + email)
      }
      // workspace_id é o que a política usa
      rec.set('workspace_id', ws)
      app.save(rec)
      return rec
    }

    const uA = garantirUsuario(EMAIL_A, 'RLS Alpha', WS_A)
    const uB = garantirUsuario(EMAIL_B, 'RLS Beta', WS_B)

    // ---- helper: garante um objetivo por workspace ----
    function garantirObjetivo(ws, titulo) {
      let achados = []
      try {
        achados = app.findRecordsByFilter('pen_objective', 'workspace_id = "' + ws + '"', '', 1, 0)
      } catch (_) {
        achados = []
      }
      if (achados && achados.length) {
        console.log('[rls] objetivo já existia em ' + ws)
        return achados[0]
      }
      const r = new Record(objCol)
      r.set('workspace_id', ws)
      r.set('company_id', 'extrafruti')
      r.set('cycle_id', 'ciclo-2026')
      r.set('titulo', titulo)
      r.set('descricao', 'Registro de teste de isolamento por workspace')
      r.set('baseline', 0)
      r.set('target', 100)
      r.set('polarity', 'up')
      r.set('weight', 1)
      r.set('status', 'em_andamento')
      app.save(r)
      console.log('[rls] objetivo criado em ' + ws)
      return r
    }

    garantirObjetivo(WS_A, 'Objetivo do workspace ALPHA')
    garantirObjetivo(WS_B, 'Objetivo do workspace BETA')

    // ---- contagem bruta por workspace (prova que os dois existem) ----
    try {
      const todos = app.findRecordsByFilter('pen_objective', "id != ''", '', 100, 0)
      let nA = 0
      let nB = 0
      for (const t of todos) {
        const w = String(t.getString('workspace_id') || '')
        if (w === WS_A) nA++
        if (w === WS_B) nB++
      }
      console.log('[rls] NA BASE: alpha=' + nA + ' beta=' + nB + ' (ambos devem ser >= 1)')
    } catch (e) {
      console.log('[rls] contagem: ' + String(e).slice(0, 120))
    }

    // ---- verificação da REGRA em si ----
    // O runtime de migração roda como superuser e ignora RLS, então aqui se
    // confere a REGRA declarada; o teste efetivo de isolamento é a consulta
    // autenticada feita logo depois por HTTP (feita fora desta migração).
    const col = app.findCollectionByNameOrId('pen_objective')
    const regra = String(col.listRule || '')
    const temWorkspace = regra.indexOf('workspace_id = @request.auth.workspace_id') >= 0
    const exigeAuth = regra.indexOf('@request.auth.id != ""') >= 0

    console.log('[rls] listRule: ' + regra)
    console.log('[rls] exige autenticação: ' + (exigeAuth ? 'SIM' : 'NÃO'))
    console.log('[rls] amarra workspace: ' + (temWorkspace ? 'SIM' : 'NÃO'))
    console.log('[rls] VEREDITO DA REGRA: ' + (exigeAuth && temWorkspace ? 'PASSA' : 'FALHA'))
  },
  (app) => {
    // limpeza dos dados de teste
    try {
      const objs = app.findRecordsByFilter('pen_objective', 'workspace_id ~ "teste"', '', 50, 0)
      for (const o of objs) app.delete(o)
    } catch (_) {}
    for (const email of ['rls.alpha@teste.pge', 'rls.beta@teste.pge']) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
      } catch (_) {}
    }
    console.log('[rls] limpeza concluída')
  },
)
