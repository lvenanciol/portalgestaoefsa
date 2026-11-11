import pb from '@/lib/pocketbase/client'

// Fase 3 — Serviço de usuários (Controle de Acessos) via /backend/v1/usuarios.

export interface UsuarioLista {
  id: string
  nome: string
  email: string
  cargo: string
  ativo: boolean
  ultimo_login: string
  grupo: string
  empresa: string
  unidade: string
  /** CAC (11/11/2026): parceiro de "Parceiros & Contatos" vinculado ao usuário */
  parceiro_id?: string
  parceiro_nome?: string
}

export const listarUsuarios = () =>
  pb.send('/backend/v1/usuarios', { method: 'GET' }) as Promise<{ usuarios: UsuarioLista[] }>

export const criarUsuario = (data: {
  nome: string
  email: string
  senha: string
  cargo?: string
  grupo_id?: string
  empresa_id?: string
  unidade_id?: string
  ativo?: boolean
  /** Vínculo com um registro de "Parceiros & Contatos" (tarefa CAC, 11/11/2026) */
  parceiro_id?: string
}) => pb.send('/backend/v1/usuarios', { method: 'POST', body: JSON.stringify(data) })

export const editarUsuario = (
  id: string,
  data: {
    nome?: string
    cargo?: string
    ativo?: boolean
    grupo_id?: string
    empresa_id?: string
    unidade_id?: string
    senha?: string
    /** Vínculo com "Parceiros & Contatos" (tarefa CAC) — '' desvincula */
    parceiro_id?: string
  },
) => pb.send(`/backend/v1/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

// ===== Parceiros & Contatos usados no CAC (11/11/2026) =====
// Busca por nome/CNPJ/e-mail com limite, para o campo de vínculo do usuário.
// Não carrega a base inteira: a tela abre com os 20 mais recentes e filtra
// no servidor conforme o que a pessoa digita.
export interface ParceiroOpcao {
  id: string
  nome: string
  cnpj?: string
  email?: string
  tipo?: string
}

export const listarParceiros = async (termo = '', limite = 20): Promise<ParceiroOpcao[]> => {
  const t = termo.trim()
  const filtro = t ? pb.filter('(nome ~ {:t} || cnpj ~ {:t} || email ~ {:t})', { t }) : ''
  try {
    const regs = await pb.collection('parceiros').getList(1, limite, {
      sort: '-created',
      filter: filtro,
    })
    return (regs.items || []).map((r: any) => ({
      id: r.id,
      nome: r.nome || r.razao_social || r.name || '(sem nome)',
      cnpj: r.cnpj || r.documento || '',
      email: r.email || '',
      tipo: r.tipo || r.categoria || '',
    }))
  } catch (e) {
    console.warn('[CAC] Falha ao listar parceiros:', (e as any)?.message || e)
    return []
  }
}

// ===== CRUD de Grupos de permissão (tarefa CAC) =====
// 'escopo' é um select com valores fixos (grupo|empresa|unidade). O default
// 'Padrão' não existe no schema e fazia o create falhar com 400.
export const criarGrupo = (data: { nome: string; escopo?: string }) =>
  pb.collection('grupos_permissao').create({
    nome: data.nome,
    escopo: data.escopo || 'grupo',
  })

export const editarGrupo = (id: string, data: { nome?: string; escopo?: string }) =>
  pb.collection('grupos_permissao').update(id, data)

export const excluirGrupo = (id: string) => pb.collection('grupos_permissao').delete(id)

export const listarGrupos = () => pb.collection('grupos_permissao').getFullList({ sort: 'nome' })
export const listarEmpresas = () => pb.collection('empresas').getFullList({ sort: 'nome' })
export const listarUnidades = () => pb.collection('unidades').getFullList({ sort: 'nome' })
export const listarMenus = () => pb.collection('menus').getFullList({ sort: 'ordem' })
export const listarAuditoria = (limit = 100) =>
  pb.send(`/backend/v1/auditoria?limit=${limit}`, { method: 'GET' }) as Promise<{
    registros: {
      id: string
      created: string
      usuario_email: string
      acao: string
      modulo: string
      ip: string
    }[]
  }>
