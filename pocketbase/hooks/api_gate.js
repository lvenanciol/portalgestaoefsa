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
// 11/11/2026 (pedido "só exibir telas/botões com permissão"): o curinga '*' no
// JSON de permissões era tratado como concessão universal em QUALQUER grupo —
// o grupo Suprimentos tinha '*' com ver:true (herdado da seed do Auditor, mig
// 0003) e lia/criava/editava/excluía por cima de módulos NÃO concedidos, mesmo
// depois de a sidebar esconder as telas. Regra nova: curinga só vale para o
// grupo Admin; os demais grupos precisam da entrada ESPECÍFICA do módulo
// (fail-closed). As migrações 0071/0072 removem o curinga dos grupos no banco.
//
// 12/11/2026 (bug "Projetos 403 no Suprimentos"): a MATRIZ do Controle de
// Acessos nunca grava permissoes[modulo].ver — grava só revogações
// crud_<tela>_<acao>:off em permissoes.botoes. Grupos não-Admin ficavam sem
// nenhuma entrada explícita e o gate negava TUDO (Projetos 403, tela liberada
// na sidebar). Regra única com o frontend (permissoes-service.ts): módulo com
// linha na matriz (MODULOS_COM_MATRIZ — mesmas chaves de BUTTON_GATES) está
// concedido salvo revogação crud_<tela>_<acao>:off; módulo FORA da matriz
// (configuracoes, logomarcas, integracoes...) só para Admin. Grupo sem
// "botoes" no JSON = nunca configurado = fail-closed (nada liberado).
const MODULOS_COM_MATRIZ = {
  dashboard: 1,
  financeiro: 1,
  desempenho: 1,
  indicadores: 1,
  documentos: 1,
  tarefas: 1,
  projetos: 1,
  atas: 1,
  emails: 1,
  contratos: 1,
  'power-bi': 1,
  ia: 1,
  menus: 1,
  acessos: 1,
}
// tela da matriz → módulo do mapa M/W acima (telas da matriz cujo módulo
// difere da chave; chaves iguais ficam implícitas)
const TELA_MODULO_EXTRA = { dashboard: 'dashboard-executivo', financeiro: 'financeiro-contabil' }

// leitura: módulo concedido? (matriz configurada + não revogado + Admin bypass)
function moduloVerConcedido(mods, perm, nome) {
  if (!perm || (nome !== 'Admin' && !perm['botoes'])) return false
  if (nome === 'Admin') return true
  for (var i = 0; i < mods.length; i++) {
    const modulo = mods[i]
    const tela =
      modulo === 'dashboard-executivo'
        ? 'dashboard'
        : modulo === 'financeiro-contabil'
          ? 'financeiro'
          : modulo
    if (TelaModulo(modulo) === null) continue
    const b = perm['botoes']
    if (
      b &&
      Array.isArray(b[tela]) &&
      (b[tela].indexOf('crud_' + tela + '_ver:off') >= 0 ||
        b[tela].indexOf('crud_' + tela + '_todas:off') >= 0)
    )
      continue
    return true
  }
  return false
}
// módulo → tela da matriz (ou null se o módulo NÃO tem linha na matriz —
// nesse caso a concessão não pode ser inferida: falha fechada)
function TelaModulo(modulo) {
  if (MODULOS_COM_MATRIZ[modulo]) return modulo
  if (modulo === 'dashboard-executivo') return 'dashboard'
  if (modulo === 'financeiro-contabil') return 'financeiro'
  return null
}
// escrita: módulo concedido + não revogado na ação (criar/editar/excluir)
function moduloAcaoConcedido(modulo, acao, perm, nome) {
  if (!perm) return false
  if (nome === 'Admin') return true
  if (!perm['botoes']) return false // matriz nunca configurada → fail-closed
  const tela = TelaModulo(modulo)
  if (!tela) return false
  const b = perm['botoes']
  if (
    b &&
    Array.isArray(b[tela]) &&
    (b[tela].indexOf('crud_' + tela + '_' + acao + ':off') >= 0 ||
      b[tela].indexOf('crud_' + tela + '_todas:off') >= 0)
  )
    return false
  return true
}
// revogação da matriz para a ação (chamado DEPOIS de moduloAcaoConcedido)
function crudRevogado(modulo, acao, perm) {
  const tela = TelaModulo(modulo)
  if (!tela) return false
  const b = perm ? perm['botoes'] : null
  if (
    b &&
    Array.isArray(b[tela]) &&
    (b[tela].indexOf('crud_' + tela + '_' + acao + ':off') >= 0 ||
      b[tela].indexOf('crud_' + tela + '_todas:off') >= 0)
  )
    return true
  return false
}
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
    if (moduloVerConcedido(mods, perm, nome)) ok = true
  }
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
    if (moduloVerConcedido(mods, perm, nome)) ok = true
  }
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
  const ok = moduloAcaoConcedido(cfg[0], 'criar', perm, nome)
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
  if (!ok && perm && perm['*'] && perm['*'].editar === true && nome === 'Admin') ok = true
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
  if (!ok && perm && perm['*'] && perm['*'].excluir === true && nome === 'Admin') ok = true
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
