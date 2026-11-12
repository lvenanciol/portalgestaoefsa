/// <reference path="../pb_data/types.d.ts" />
// 0075 — CORREÇÃO: usuário "[ SUP ] Luke" não via as tarefas atribuídas a ele
// (13/11/2026)
//
// CAUSA RAIZ (confirmada nos dados reais):
//  - A atribuição real de tarefas é gravada no TEXTO 'responsavel'
//    (ex.: "[ SUP ] Luke") e no JSON 'parceiros' (ids de parceiros).
//  - O usuário Luke tem users.parceiro_id = cxoarnd7blxuu02, e as tarefas dele
//    trazem parceiros = ["cxoarnd7blxuu02", ...].
//  - MAS a regra de API da coleção (mig 0069) e o filtro client-side da tela só
//    consideram 'responsaveis_ids' (que só tinha o id de quem criou) e
//    'criado_por' — Luke não casava em nenhum dos dois e via zero tarefas.
//
// ESTA MIGRAÇÃO (idempotente, aditiva):
//  1) Backfill de responsaveis_ids: usuário cujo parceiro_id está no JSON
//     'parceiros' da tarefa, OU cujo nome (sem tag "[ ... ]") casa com o texto
//     'responsavel', entra como responsável.
//  2) Regras de API passam a aceitar também o vínculo estrutural via parceiros:
//     user.parceiro_id ∈ tarefas.parceiros ("parceiros.id ?=" na regra).
//  3) Guarda de consistência em hook: toda tarefa criada/editada ganha
//     responsaveis_ids resolvidos (parceiros + nome do responsável).
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('tarefas')
    } catch (_) {
      return
    }

    // ---- 1) Backfill de responsaveis_ids a partir do vínculo real ----
    const norm = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    const limparTag = (s) =>
      String(s || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .trim()

    // Mapa: parceiro_id -> [ids de usuários]
    const usuariosPorParceiro = {}
    let usuarios = []
    try {
      usuarios = app.findRecordsByFilter('users', "id != ''", '', 0, 0)
    } catch (_) {
      usuarios = []
    }
    for (const u of usuarios) {
      const pid = String(u.getString('parceiro_id') || '').trim()
      if (!pid) continue
      if (!usuariosPorParceiro[pid]) usuariosPorParceiro[pid] = []
      usuariosPorParceiro[pid].push(u.id)
    }

    // Mapa: primeiro nome (sem acento/tag) -> [ids de usuários]
    const usuariosPorPrimeiroNome = {}
    for (const u of usuarios) {
      const nomeLimpo = limparTag(u.getString('name'))
      const primeiro = norm(nomeLimpo.split(/\s+/)[0])
      if (!primeiro || primeiro.length < 3) continue
      if (!usuariosPorPrimeiroNome[primeiro]) usuariosPorPrimeiroNome[primeiro] = []
      usuariosPorPrimeiroNome[primeiro].push(u.id)
    }

    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", '', 0, 0)
    } catch (_) {
      tarefas = []
    }

    function parseIds(raw) {
      if (!raw) return []
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean)
      } catch (_) {}
      return []
    }

    let corrigidas = 0
    for (const t of tarefas) {
      try {
        const atuais = parseIds(t.getString('responsaveis_ids'))
        const alvo = new Set(atuais)

        // a) Vínculo estrutural: parceiro do usuário ∈ parceiros da tarefa
        for (const pid of parseIds(t.getString('parceiros'))) {
          for (const uid of usuariosPorParceiro[pid] || []) alvo.add(uid)
        }

        // b) Texto 'responsavel' casa com o nome (sem tag) do usuário
        const respNorm = norm(limparTag(t.getString('responsavel')))
        if (respNorm) {
          const primeiro = respNorm.split(/\s+/)[0]
          if (primeiro && primeiro.length >= 3) {
            for (const uid of usuariosPorPrimeiroNome[primeiro] || []) {
              const u = usuarios.find((x) => x.id === uid)
              if (!u) continue
              const nomeUser = norm(limparTag(u.getString('name')))
              if (respNorm === nomeUser || respNorm.indexOf(nomeUser) !== -1) alvo.add(uid)
            }
          }
        }

        // c) Fallback preservado: criador entra como responsável
        const emailCriador = String(t.getString('criado_por') || '')
          .trim()
          .toLowerCase()
        if (emailCriador && alvo.size === 0) {
          try {
            const criador = app.findAuthRecordByEmail('users', emailCriador)
            if (criador) alvo.add(criador.id)
          } catch (_) {}
        }

        if (alvo.size > 0) {
          const lista = Array.from(alvo)
          const antiga = parseIds(t.getString('responsaveis_ids'))
          const mudou =
            lista.length !== antiga.length || lista.some((id) => antiga.indexOf(id) === -1)
          if (mudou) {
            t.set('responsaveis_ids', lista)
            app.save(t)
            corrigidas++
          }
        }
      } catch (_) {
        // uma tarefa problemática não pode abortar o backfill inteiro
      }
    }
    console.log('[0075] tarefas com responsaveis_ids corrigidas:', corrigidas)

    // ---- 2) Regras de API: aceitar também o vínculo via parceiros ----
    // "parceiros.id ?=" funciona porque 'parceiros' é JSON contendo ids de
    // parceiros e users.parceiro_id é relation para o mesmo registro — o motor
    // do PocketBase resolve o back-relay através do campo relation do user.
    const regraDono =
      "@request.auth.id != '' && (" +
      'responsaveis_ids.id ?= @request.auth.id || ' +
      'parceiros.id ?= @request.auth.parceiro_id || ' +
      'criado_por = @request.auth.email' +
      ')'
    col.listRule = regraDono
    col.viewRule = regraDono
    col.updateRule = regraDono
    col.deleteRule = regraDono
    app.save(col)
  },
  (app) => {
    // Reverte para as regras da 0069 (mantém os dados do backfill).
    try {
      const col = app.findCollectionByNameOrId('tarefas')
      const regraDono =
        "@request.auth.id != '' && (" +
        'responsaveis_ids.id ?= @request.auth.id || ' +
        'criado_por = @request.auth.email' +
        ')'
      col.listRule = regraDono
      col.viewRule = regraDono
      col.updateRule = regraDono
      col.deleteRule = regraDono
      app.save(col)
    } catch (_) {}
  },
)
