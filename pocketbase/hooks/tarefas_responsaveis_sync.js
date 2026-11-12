// Sincroniza o vínculo ESTRUTURAL de responsáveis (relation 'responsaveis_ids')
// com a atribuição real que a interface grava (texto 'responsavel' + JSON
// 'parceiros'), nas criações e edições de tarefas (13/11/2026).
//
// Por que existe: a regra de API da coleção 'tarefas' (mig 0069) e o filtro da
// tela usam 'responsaveis_ids' — mas a interface só grava 'responsavel' e
// 'parceiros'. Sem este guard, toda tarefa nova nasce sem vínculo estrutural e
// o usuário atribuído (ex.: "[ SUP ] Luke") não vê a tarefa (bug da rodada).
//
// Critério de casamento (idêntico ao backfill da migração 0075 e ao sino):
//   a) users.parceiro_id ∈ tarefa.parceiros  (vínculo estrutural — prioritário)
//   b) nome do texto 'responsavel' casa com users.name (sem tag "[ ... ]")
//      — tolerante: trim, case-insensitive, sem acentos, prefixo/contém
// Convenções do projeto: lógica INLINE no callback (JSVM não vê top-level) e
// falha aqui NUNCA impede a operação da tarefa (try/catch + e.next()).
onRecordCreateRequest((e) => {
  try {
    const record = e.record

    function parseIds(raw) {
      if (!raw) return []
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean)
      } catch (_) {}
      return []
    }

    function norm(s) {
      return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    }

    function limparTag(s) {
      return String(s || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .trim()
    }

    const alvo = new Set(parseIds(record.get('responsaveis_ids')))

    // a) vínculo estrutural: parceiro do usuário ∈ parceiros da tarefa
    for (const pid of parseIds(record.get('parceiros'))) {
      try {
        const vinc = $app.findRecordsByFilter(
          'users',
          'parceiro_id = "' + String(pid).replace(/"/g, '\\"') + '"',
          '',
          20,
          0,
        )
        for (const u of vinc) alvo.add(u.id)
      } catch (_) {}
    }

    // b) texto 'responsavel' casa com o nome (sem tag) do usuário
    const respNorm = norm(limparTag(record.get('responsavel')))
    if (respNorm) {
      const primeiro = respNorm.split(/\s+/)[0]
      if (primeiro && primeiro.length >= 3) {
        try {
          const cands = $app.findRecordsByFilter(
            'users',
            'name ~ "' + primeiro.replace(/"/g, '\\"') + '"',
            '',
            20,
            0,
          )
          for (const u of cands) {
            const nomeUser = norm(limparTag(u.getString('name')))
            if (respNorm === nomeUser || respNorm.indexOf(nomeUser) !== -1) alvo.add(u.id)
          }
        } catch (_) {}
      }
    }

    // c) fallback preservado: se nada casou, o criador entra
    if (alvo.size === 0) {
      let emailCriador = String(record.get('criado_por') || '')
        .trim()
        .toLowerCase()
      try {
        const auth = e.requestInfo().auth
        if (!emailCriador && auth && auth.email) emailCriador = String(auth.email).toLowerCase()
      } catch (_) {}
      emailCriador = String(emailCriador || '')
        .trim()
        .toLowerCase()
      if (emailCriador) {
        try {
          const criador = $app.findAuthRecordByEmail('users', emailCriador)
          if (criador) alvo.add(criador.id)
        } catch (_) {}
      }
    }

    record.set('responsaveis_ids', Array.from(alvo))
  } catch (_) {
    // falha de sync NUNCA impede a criação da tarefa
  }
  e.next()
}, 'tarefas')

onRecordUpdateRequest((e) => {
  try {
    const record = e.record

    function parseIds(raw) {
      if (!raw) return []
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean)
      } catch (_) {}
      return []
    }

    function norm(s) {
      return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    }

    function limparTag(s) {
      return String(s || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .trim()
    }

    const alvo = new Set(parseIds(record.get('responsaveis_ids')))

    for (const pid of parseIds(record.get('parceiros'))) {
      try {
        const vinc = $app.findRecordsByFilter(
          'users',
          'parceiro_id = "' + String(pid).replace(/"/g, '\\"') + '"',
          '',
          20,
          0,
        )
        for (const u of vinc) alvo.add(u.id)
      } catch (_) {}
    }

    const respNorm = norm(limparTag(record.get('responsavel')))
    if (respNorm) {
      const primeiro = respNorm.split(/\s+/)[0]
      if (primeiro && primeiro.length >= 3) {
        try {
          const cands = $app.findRecordsByFilter(
            'users',
            'name ~ "' + primeiro.replace(/"/g, '\\"') + '"',
            '',
            20,
            0,
          )
          for (const u of cands) {
            const nomeUser = norm(limparTag(u.getString('name')))
            if (respNorm === nomeUser || respNorm.indexOf(nomeUser) !== -1) alvo.add(u.id)
          }
        } catch (_) {}
      }
    }

    // Em update NÃO há fallback do criador: se o dono editou sem mudar
    // atribuição, o vínculo já existe (evita sobrescrever lista válida).
    if (alvo.size > 0) {
      record.set('responsaveis_ids', Array.from(alvo))
    }
  } catch (_) {
    // falha de sync NUNCA impede a edição da tarefa
  }
  e.next()
}, 'tarefas')
