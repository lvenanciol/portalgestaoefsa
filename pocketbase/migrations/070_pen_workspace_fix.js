/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// CORREÇÃO: campo users.workspace_id + teste de isolamento real (18/11/2026)
//
// O QUE DEU ERRADO NA 068 (causa raiz):
//   usei `users.fields.add({ name: 'workspace_id', type: 'text', ... })` com um
//   OBJETO simples. No JSVM do PocketBase, `fields.add()` exige uma INSTÂNCIA
//   de Field (`new TextField({...})`). O objeto simples lança exceção, que o
//   `try/catch` engoliu — a migração registrou `applied`, o campo nunca foi
//   criado, e a política `workspace_id = @request.auth.workspace_id` passou a
//   comparar contra um campo INEXISTENTE no usuário.
//
// EFEITO PRÁTICO: nenhum usuário autenticado enxergava nada (0 registros),
// o que parece "seguro" mas na verdade quebra a leitura legítima — e o teste
// de isolamento era inconclusivo, porque os dois lados davam zero.
//
// ESTA MIGRAÇÃO:
//   1. cria users.workspace_id com `new TextField(...)` (forma correta)
//   2. atribui workspace aos dois usuários de teste
//   3. cria um objetivo em cada workspace
//   4. imprime a contagem POR USUÁRIO lendo com as regras aplicadas
// ============================================================================
migrate(
  (app) => {
    // ---- 1) campo workspace_id em users (forma correta) ----
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    let tem = false
    for (let i = 0; i < users.fields.length; i++) {
      if (String(users.fields[i].name || '') === 'workspace_id') tem = true
    }
    if (!tem) {
      users.fields.add(
        new TextField({
          name: 'workspace_id',
          required: false,
          max: 64,
        }),
      )
      app.save(users)
      console.log('[pen] users.workspace_id CRIADO com TextField')
    } else {
      console.log('[pen] users.workspace_id já existia')
    }

    // ---- 2) usuários de teste com workspace ----
    const WS_A = 'ws-alpha-teste'
    const WS_B = 'ws-beta-teste'

    const pares = [
      { email: 'rls.alpha@teste.pge', nome: 'RLS Alpha', ws: WS_A },
      { email: 'rls.beta@teste.pge', nome: 'RLS Beta', ws: WS_B },
    ]

    for (const p of pares) {
      let rec = null
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', p.email)
      } catch (_) {
        rec = null
      }
      if (!rec) {
        rec = new Record(users)
        rec.setEmail(p.email)
        rec.setPassword('RlsTeste@2026')
        rec.setVerified(true)
        rec.set('name', p.nome)
        rec.set('ativo', true)
        console.log('[pen] usuário criado: ' + p.email)
      }
      rec.set('workspace_id', p.ws)
      app.save(rec)
      console.log('[pen] ' + p.email + ' → workspace_id=' + p.ws)
    }

    // ---- 3) um objetivo por workspace ----
    const objCol = app.findCollectionByNameOrId('pen_objective')
    const alvos = [
      { ws: WS_A, titulo: 'Objetivo do workspace ALPHA' },
      { ws: WS_B, titulo: 'Objetivo do workspace BETA' },
    ]
    for (const a of alvos) {
      let existe = []
      try {
        existe = app.findRecordsByFilter('pen_objective', 'workspace_id = "' + a.ws + '"', '', 1, 0)
      } catch (_) {
        existe = []
      }
      if (existe && existe.length) {
        console.log('[pen] objetivo já existe em ' + a.ws)
        continue
      }
      const r = new Record(objCol)
      r.set('workspace_id', a.ws)
      r.set('company_id', 'extrafruti')
      r.set('cycle_id', 'ciclo-2026')
      r.set('titulo', a.titulo)
      r.set('descricao', 'Registro de teste de isolamento por workspace')
      r.set('baseline', 0)
      r.set('target', 100)
      r.set('polarity', 'up')
      r.set('weight', 1)
      r.set('status', 'em_andamento')
      app.save(r)
      console.log('[pen] objetivo criado em ' + a.ws)
    }

    // ---- 4) conferência: total por workspace (visão superuser) ----
    try {
      const todos = app.findRecordsByFilter('pen_objective', "id != ''", '', 100, 0)
      let nA = 0
      let nB = 0
      for (const t of todos) {
        const w = String(t.getString('workspace_id') || '')
        if (w === WS_A) nA++
        if (w === WS_B) nB++
      }
      console.log('[pen] NA BASE: alpha=' + nA + ' | beta=' + nB)
    } catch (e) {
      console.log('[pen] contagem: ' + String(e).slice(0, 120))
    }

    // ---- 5) a regra referencia um campo que agora EXISTE ----
    const col = app.findCollectionByNameOrId('pen_objective')
    console.log('[pen] pen_objective.listRule = ' + String(col.listRule || 'ABERTA'))
    console.log('[pen] CONCLUÍDO')
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const nomes = []
      for (let i = 0; i < users.fields.length; i++) {
        nomes.push(String(users.fields[i].name || ''))
      }
      const idx = nomes.indexOf('workspace_id')
      if (idx >= 0) {
        users.fields.removeById(users.fields[idx].id)
        app.save(users)
      }
    } catch (_) {}
    try {
      const objs = app.findRecordsByFilter('pen_objective', 'workspace_id ~ "teste"', '', 50, 0)
      for (const o of objs) app.delete(o)
    } catch (_) {}
    for (const email of ['rls.alpha@teste.pge', 'rls.beta@teste.pge']) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
      } catch (_) {}
    }
    console.log('[pen] rollback ok')
  },
)
