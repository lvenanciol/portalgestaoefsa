// 11/11/2026 — GATE DE PERMISSÕES NA API (não só na tela)
//
// PROBLEMA: esconder tela e botão não protege nada no PocketBase — o cliente
// fala direto com /api/collections/<col>/records. Um grupo sem o módulo
// "contratos" (ou sem "criar") continuava lendo e escrevendo contratos pela
// API. Essas coleções estavam em "@request.auth.id != ''": qualquer
// autenticado, tudo liberado.
//
// ESTE HOOK aplica, por coleção:
//   leitura (list/view) → 'ver' em QUALQUER módulo dono (leitura cruzada
//                         legítima entre telas: Tarefas lê `projetos`)
//   create / update / delete → 'criar' / 'editar' / 'excluir' no módulo DONO
// e a MATRIZ CRUD do Controle de Acessos revoga por cima
// (permissoes.botoes[tela] = ["crud_<tela>_<acao>:off", …] ou "_todas:off").
//
// Admin do grupo e superuser passam. Sem sessão, cai na regra da coleção.
// Coleção fora do mapa: não é tocada.
//
// RUNTIME (JSVM): callbacks não enxergam função/const de topo — a tabela vai
// LITERAL dentro de cada callback. Registrar sem coleção fixa (um handler por
// operação) evita 18×5 registros repetidos; toda saída é `return e.next()` ou
// `throw`, nunca um `return` vazio (que cancelaria a operação sem erro).

onRecordsListRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth) return e.next()
  let col = ''
  try {
    col = String(e.collection.name || '')
  } catch (_) {}
  const M = {
    contratos: ['contratos', 'documentos-importacoes', 'tarefas-agenda', 'dashboard-executivo'],
    alvaras: ['documentos-importacoes', 'atas-reunioes'],
    convencoes: ['documentos-importacoes'],
    seguros: ['documentos-importacoes'],
    processos_juridicos: ['documentos-importacoes'],
    audiencias: ['documentos-importacoes', 'atas-reunioes'],
    documentos: ['documentos-importacoes', 'financeiro-contabil'],
    atas: ['documentos-importacoes', 'atas-reunioes'],
    atas_reunioes: ['atas-reunioes', 'documentos-importacoes'],
    projetos: ['projetos', 'tarefas-agenda'],
    marcos: ['projetos', 'tarefas-agenda'],
    indicadores: ['indicadores', 'dashboard-executivo', 'desempenho-unidade'],
    emails: ['emails'],
    emails_inbox: ['emails'],
    parceiros: [
      'parceiros',
      'tarefas-agenda',
      'controle-acessos',
      'projetos',
      'atas-reunioes',
      'indicadores',
      'documentos-importacoes',
    ],
  }
  const mods = M[col]
  if (!mods) return e.next()
  let perm = null
  let nome = ''
  try {
    const gid = auth.getString('grupo_id')
    if (gid) {
      const g = $app.findRecordById('grupos_permissao', gid)
      nome = String(g.getString('nome')).trim()
      const raw = g.getString('permissoes')
      perm = raw ? JSON.parse(raw) : null
    }
  } catch (_) {}
  if (nome === 'Admin') return e.next()
  let ok = false
  for (let i = 0; i < mods.length; i++) {
    const m = perm ? perm[mods[i]] : null
    if (m && m.ver === true) ok = true
  }
  if (!ok && perm && perm['*'] && perm['*'].ver === true) ok = true
  if (!ok) throw new ForbiddenError('Seu grupo nao tem acesso a este modulo do portal.')
  return e.next()
})

onRecordViewRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth) return e.next()
  let col = ''
  try {
    col = String(e.collection.name || '')
  } catch (_) {}
  const M = {
    contratos: ['contratos', 'documentos-importacoes', 'tarefas-agenda', 'dashboard-executivo'],
    alvaras: ['documentos-importacoes', 'atas-reunioes'],
    convencoes: ['documentos-importacoes'],
    seguros: ['documentos-importacoes'],
    processos_juridicos: ['documentos-importacoes'],
    audiencias: ['documentos-importacoes', 'atas-reunioes'],
    documentos: ['documentos-importacoes', 'financeiro-contabil'],
    atas: ['documentos-importacoes', 'atas-reunioes'],
    atas_reunioes: ['atas-reunioes', 'documentos-importacoes'],
    projetos: ['projetos', 'tarefas-agenda'],
    marcos: ['projetos', 'tarefas-agenda'],
    indicadores: ['indicadores', 'dashboard-executivo', 'desempenho-unidade'],
    emails: ['emails'],
    emails_inbox: ['emails'],
    parceiros: [
      'parceiros',
      'tarefas-agenda',
      'controle-acessos',
      'projetos',
      'atas-reunioes',
      'indicadores',
      'documentos-importacoes',
    ],
  }
  const mods = M[col]
  if (!mods) return e.next()
  let perm = null
  let nome = ''
  try {
    const gid = auth.getString('grupo_id')
    if (gid) {
      const g = $app.findRecordById('grupos_permissao', gid)
      nome = String(g.getString('nome')).trim()
      const raw = g.getString('permissoes')
      perm = raw ? JSON.parse(raw) : null
    }
  } catch (_) {}
  if (nome === 'Admin') return e.next()
  let ok = false
  for (let i = 0; i < mods.length; i++) {
    const m = perm ? perm[mods[i]] : null
    if (m && m.ver === true) ok = true
  }
  if (!ok && perm && perm['*'] && perm['*'].ver === true) ok = true
  if (!ok) throw new ForbiddenError('Seu grupo nao tem acesso a este modulo do portal.')
  return e.next()
})

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth) return e.next()
  let col = ''
  try {
    col = String(e.collection.name || '')
  } catch (_) {}
  const W = {
    contratos: ['contratos', 'contratos'],
    alvaras: ['documentos-importacoes', 'documentos'],
    convencoes: ['documentos-importacoes', 'documentos'],
    seguros: ['documentos-importacoes', 'documentos'],
    processos_juridicos: ['documentos-importacoes', 'documentos'],
    audiencias: ['documentos-importacoes', 'documentos'],
    documentos: ['documentos-importacoes', 'documentos'],
    atas: ['documentos-importacoes', 'documentos'],
    atas_reunioes: ['atas-reunioes', 'atas'],
    projetos: ['projetos', 'projetos'],
    marcos: ['projetos', 'projetos'],
    indicadores: ['indicadores', 'indicadores'],
    emails: ['emails', 'emails'],
    emails_inbox: ['emails', 'emails'],
    parceiros: ['parceiros', 'parceiros'],
  }
  const cfg = W[col]
  if (!cfg) return e.next()
  let perm = null
  let nome = ''
  try {
    const gid = auth.getString('grupo_id')
    if (gid) {
      const g = $app.findRecordById('grupos_permissao', gid)
      nome = String(g.getString('nome')).trim()
      const raw = g.getString('permissoes')
      perm = raw ? JSON.parse(raw) : null
    }
  } catch (_) {}
  if (nome === 'Admin') return e.next()
  let ok = false
  const m = perm ? perm[cfg[0]] : null
  if (m && m.criar === true) ok = true
  if (!ok && perm && perm['*'] && perm['*'].criar === true) ok = true
  try {
    const b = perm && perm['botoes'] ? perm['botoes'][cfg[1]] : null
    if (Array.isArray(b)) {
      if (b.indexOf('crud_' + cfg[1] + '_criar:off') >= 0) ok = false
      if (b.indexOf('crud_' + cfg[1] + '_todas:off') >= 0) ok = false
    }
  } catch (_) {}
  if (!ok) throw new ForbiddenError('Seu grupo nao pode criar neste modulo.')
  return e.next()
})

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth) return e.next()
  let col = ''
  try {
    col = String(e.collection.name || '')
  } catch (_) {}
  const W = {
    contratos: ['contratos', 'contratos'],
    alvaras: ['documentos-importacoes', 'documentos'],
    convencoes: ['documentos-importacoes', 'documentos'],
    seguros: ['documentos-importacoes', 'documentos'],
    processos_juridicos: ['documentos-importacoes', 'documentos'],
    audiencias: ['documentos-importacoes', 'documentos'],
    documentos: ['documentos-importacoes', 'documentos'],
    atas: ['documentos-importacoes', 'documentos'],
    atas_reunioes: ['atas-reunioes', 'atas'],
    projetos: ['projetos', 'projetos'],
    marcos: ['projetos', 'projetos'],
    indicadores: ['indicadores', 'indicadores'],
    emails: ['emails', 'emails'],
    emails_inbox: ['emails', 'emails'],
    parceiros: ['parceiros', 'parceiros'],
  }
  const cfg = W[col]
  if (!cfg) return e.next()
  let perm = null
  let nome = ''
  try {
    const gid = auth.getString('grupo_id')
    if (gid) {
      const g = $app.findRecordById('grupos_permissao', gid)
      nome = String(g.getString('nome')).trim()
      const raw = g.getString('permissoes')
      perm = raw ? JSON.parse(raw) : null
    }
  } catch (_) {}
  if (nome === 'Admin') return e.next()
  let ok = false
  const m = perm ? perm[cfg[0]] : null
  if (m && m.editar === true) ok = true
  if (!ok && perm && perm['*'] && perm['*'].editar === true) ok = true
  try {
    const b = perm && perm['botoes'] ? perm['botoes'][cfg[1]] : null
    if (Array.isArray(b)) {
      if (b.indexOf('crud_' + cfg[1] + '_editar:off') >= 0) ok = false
      if (b.indexOf('crud_' + cfg[1] + '_todas:off') >= 0) ok = false
    }
  } catch (_) {}
  if (!ok) throw new ForbiddenError('Seu grupo nao pode editar neste modulo.')
  return e.next()
})

onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth) return e.next()
  let col = ''
  try {
    col = String(e.collection.name || '')
  } catch (_) {}
  const W = {
    contratos: ['contratos', 'contratos'],
    alvaras: ['documentos-importacoes', 'documentos'],
    convencoes: ['documentos-importacoes', 'documentos'],
    seguros: ['documentos-importacoes', 'documentos'],
    processos_juridicos: ['documentos-importacoes', 'documentos'],
    audiencias: ['documentos-importacoes', 'documentos'],
    documentos: ['documentos-importacoes', 'documentos'],
    atas: ['documentos-importacoes', 'documentos'],
    atas_reunioes: ['atas-reunioes', 'atas'],
    projetos: ['projetos', 'projetos'],
    marcos: ['projetos', 'projetos'],
    indicadores: ['indicadores', 'indicadores'],
    emails: ['emails', 'emails'],
    emails_inbox: ['emails', 'emails'],
    parceiros: ['parceiros', 'parceiros'],
  }
  const cfg = W[col]
  if (!cfg) return e.next()
  let perm = null
  let nome = ''
  try {
    const gid = auth.getString('grupo_id')
    if (gid) {
      const g = $app.findRecordById('grupos_permissao', gid)
      nome = String(g.getString('nome')).trim()
      const raw = g.getString('permissoes')
      perm = raw ? JSON.parse(raw) : null
    }
  } catch (_) {}
  if (nome === 'Admin') return e.next()
  let ok = false
  const m = perm ? perm[cfg[0]] : null
  if (m && m.excluir === true) ok = true
  if (!ok && perm && perm['*'] && perm['*'].excluir === true) ok = true
  try {
    const b = perm && perm['botoes'] ? perm['botoes'][cfg[1]] : null
    if (Array.isArray(b)) {
      if (b.indexOf('crud_' + cfg[1] + '_excluir:off') >= 0) ok = false
      if (b.indexOf('crud_' + cfg[1] + '_todas:off') >= 0) ok = false
    }
  } catch (_) {}
  if (!ok) throw new ForbiddenError('Seu grupo nao pode excluir neste modulo.')
  return e.next()
})
