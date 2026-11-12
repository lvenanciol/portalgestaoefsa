import pb from '@/lib/pocketbase/client'

// Fase 3 — Serviço de permissões: lê o grupo do usuário e expõe
// can(modulo, acao) + escopo (grupo/empresa/unidade) + menus permitidos.

export interface Permissoes {
  escopo: 'grupo' | 'empresa' | 'unidade'
  empresaId: string
  unidadeId: string
  grupoNome: string
  permissoes: Record<string, Record<string, boolean>> | null
}

let cache: { permissoes: Permissoes | null; expiraEm: number } = {
  permissoes: null,
  expiraEm: 0,
}

export async function carregarPermissoes(force = false): Promise<Permissoes | null> {
  const agora = Date.now()
  if (!force && cache.expiraEm > agora) return cache.permissoes
  try {
    const user = pb.authStore.record
    if (!user) return null
    const grupoId = user.grupo_id
    if (!grupoId) return null
    const grupo = await pb.collection('grupos_permissao').getOne(grupoId)
    let permissoes: Record<string, Record<string, boolean>> | null = null
    try {
      permissoes =
        typeof grupo.permissoes === 'string' ? JSON.parse(grupo.permissoes) : grupo.permissoes
    } catch (_) {
      permissoes = null
    }
    const p: Permissoes = {
      escopo: grupo.escopo || 'grupo',
      empresaId: user.empresa_id || '',
      unidadeId: user.unidade_id || '',
      grupoNome: grupo.nome,
      permissoes,
    }
    cache = { permissoes: p, expiraEm: agora + 5 * 60 * 1000 }
    return p
  } catch (_) {
    return null
  }
}

export function permissoesCache(): Permissoes | null {
  return cache.permissoes
}

export function limparCachePermissoes() {
  cache = { permissoes: null, expiraEm: 0 }
}

// can('financeiro-contabil', 'ver') → boolean
// '*' no módulo = catch-all do grupo (Admin/Auditor)
//
// 11/11/2026 — a MATRIZ CRUD do Controle de Acessos passou a valer de verdade.
// Antes ela era gravada em permissoes.botoes['crud_<tela>_<acao>:off'] e
// NINGUÉM lia: o admin desmarcava "Editar" na tela e o botão continuava lá.
// Agora a marcação é uma REVOGAÇÃO que se sobrepõe ao JSON de módulos —
// nunca amplia acesso, só retira (fail-safe na direção segura).
export function can(p: Permissoes | null, modulo: string, acao: string): boolean {
  if (!p || !p.permissoes) return false
  const tela = MODULO_TELA[modulo]
  if (tela && crudNegado(p, tela, acao)) return false
  const mod = p.permissoes[modulo]
  if (mod && mod[acao] === true) return true
  // 11/11/2026 (pedido "só exibir telas com permissão"): o curinga '*' era
  // tratado como concessão universal em QUALQUER grupo — o grupo Suprimentos
  // tinha '*' com ver:true (herdado da seed do Auditor) e via tudo. Agora o
  // curinga só vale para Admin; grupo não-Admin precisa da entrada específica
  // do módulo (fail-closed). Migração 0071/0072 remove o curinga dos demais.
  if (p.grupoNome === 'Admin') {
    const wildcard = p.permissoes['*']
    if (wildcard && wildcard[acao] === true) return true
  }
  // 11/11/2026 (v2, bug "sidebar vazia no Suprimentos") — a MATRIZ CRUD do
  // Controle de Acessos é a fonte da concessão para grupos não-Admin: ela
  // nunca gravou permissoes[modulo].ver/criar/… (só grava revogações
  // crud_<tela>_<acao>:off em permissoes.botoes), e depois da retirada do
  // curinga NENHUM grupo não-Admin via nada — sidebar vazia e "/" bloqueado
  // mesmo com Ver/Criar/Editar marcados em tarefas/projetos. Regra: grupo COM
  // matriz configurada (permissoes.botoes não vazio) tem ver/criar/editar/
  // excluir em todo módulo cuja coluna NÃO esteja revogada na matriz (o que a
  // tela mostra marcado = concedido); grupo nunca configurado continua
  // fail-closed (nada visível). O hook botoes_salvar e a migração 0074 gravam
  // as concessões explícitas no banco para o gate de API.
  if (
    p.grupoNome !== 'Admin' &&
    tela &&
    matrizConfigurada(p) &&
    (acao === 'ver' || acao === 'criar' || acao === 'editar' || acao === 'excluir')
  ) {
    return true
  }
  return false
}

// A matriz do grupo já foi configurada pelo admin? A chave "botoes" existe no
// JSON desde a primeira gravação da matriz (salvarBotoesGrupo sempre a escreve,
// mesmo vazia: admin que salvou sem desmarcar nada = tudo concedido). Checar a
// CHAVE e não o conteúdo — grupo recém-criado, sem matriz salva, continua
// fail-closed.
function matrizConfigurada(p: Permissoes): boolean {
  const perm = p.permissoes as Record<string, unknown> | undefined
  if (!perm) return false
  return Object.prototype.hasOwnProperty.call(perm, 'botoes')
}

// Nome do módulo (JSON de permissões) → chave da tela (BUTTON_GATES).
function MODULO_TELA_LOOKUP(): Record<string, string> {
  return {
    'dashboard-executivo': 'dashboard',
    'financeiro-contabil': 'financeiro',
    'desempenho-unidade': 'desempenho',
    indicadores: 'indicadores',
    'documentos-importacoes': 'documentos',
    'tarefas-agenda': 'tarefas',
    projetos: 'projetos',
    'atas-reunioes': 'atas',
    emails: 'emails',
    contratos: 'contratos',
    'power-bi': 'power-bi',
    'ia-gemini': 'ia',
    'arvore-menus': 'menus',
    'controle-acessos': 'acessos',
    configuracoes: 'configuracoes',
  }
}
const MODULO_TELA = MODULO_TELA_LOOKUP()

// A matriz marca o que está HABILITADO; o armazenamento guarda o que está
// OCULTO com o sufixo ':off'. Este helper responde "esta operação foi revogada?".
function crudNegado(p: Permissoes | null, tela: string, acao: string): boolean {
  if (!p || !p.permissoes) return false
  const b = (p.permissoes as Record<string, unknown>)['botoes']
  if (!b || typeof b !== 'object') return false
  const lista = (b as Record<string, unknown>)[tela]
  if (!Array.isArray(lista)) return false
  const chave = 'crud_' + tela + '_' + acao + ':off'
  const colTodas = 'crud_' + tela + '_todas:off'
  return lista.map(String).includes(chave) || lista.map(String).includes(colTodas)
}

// Menus visíveis: item oculto quando o grupo não tem 'ver' no módulo da rota.
// FAIL-CLOSED: rota sem módulo declarado NÃO aparece para quem não é Admin —
// /logomarcas e /integracoes ficavam de fora do mapa e por isso entravam por
// URL digitada em qualquer grupo.
export const MENU_MODULOS: Record<string, string> = {
  '/': 'dashboard-executivo',
  '/financeiro': 'financeiro-contabil',
  '/desempenho': 'desempenho-unidade',
  '/indicadores': 'indicadores',
  '/documentos': 'documentos-importacoes',
  '/tarefas': 'tarefas-agenda',
  '/projetos': 'projetos',
  '/atas': 'atas-reunioes',
  '/emails': 'emails',
  '/contratos': 'contratos',
  '/parceiros': 'parceiros',
  '/logomarcas': 'logomarcas',
  '/integracoes': 'integracoes',
  // Sub-rotas de Integrações: sem estas entradas o item correspondente da
  // sidebar ficava OCULTO para quem não é Admin (fail-closed), mesmo com a
  // seção liberada no Controle de Acessos — e a URL digitada era bloqueada.
  '/integracoes/sankhya': 'integracoes',
  '/integracoes/whatsapp': 'integracoes',
  '/power-bi': 'power-bi',
  '/ia': 'ia-gemini',
  '/menus': 'arvore-menus',
  '/acessos': 'controle-acessos',
  '/configuracoes': 'configuracoes',
}

export function menuVisivel(p: Permissoes | null, rota: string): boolean {
  if (!p) return false
  if (p.grupoNome === 'Admin') return true
  const modulo = MENU_MODULOS[rota]
  if (!modulo) return false
  return can(p, modulo, 'ver')
}

// ORDEM DA SIDEBAR — usada para escolher a tela default do usuário.
// Ordem de exibição real: GESTÃO → OPERAÇÃO → RELACIONAMENTO → PLATAFORMA →
// INTEGRAÇÕES (mesma dos navSections da Sidebar / ordem da coleção `menus`).
const ORDEM_MENU: string[] = [
  '/',
  '/financeiro',
  '/desempenho',
  '/indicadores',
  '/power-bi',
  '/documentos',
  '/tarefas',
  '/projetos',
  '/atas',
  '/emails',
  '/contratos',
  '/parceiros',
  '/ia',
  '/menus',
  '/acessos',
  '/configuracoes',
  '/integracoes',
]

// Primeira rota permitida ao grupo — tela default do login. Usado pelo guard
// da rota inicial: quando o módulo da rota "/" (dashboard) não é permitido,
// o portal cai na primeira tela concedida em vez do bloqueio "Acesso não
// liberado" (pedido 11/11/2026 — grupo Suprimentos cai em Tarefas & Agenda).
export function primeiraRotaPermitida(p: Permissoes | null): string | null {
  if (!p) return null
  for (const rota of ORDEM_MENU) {
    if (menuVisivel(p, rota)) return rota
  }
  return null
}
