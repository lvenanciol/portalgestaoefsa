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
  },
) => pb.send(`/backend/v1/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

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
