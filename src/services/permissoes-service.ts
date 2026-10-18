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
export function can(p: Permissoes | null, modulo: string, acao: string): boolean {
  if (!p || !p.permissoes) return false
  const mod = p.permissoes[modulo]
  if (mod && mod[acao] === true) return true
  const wildcard = p.permissoes['*']
  if (wildcard && wildcard[acao] === true) return true
  return false
}

// Menus visíveis: item oculto quando o grupo não tem 'ver' no módulo da rota
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
