import pb from '@/lib/pocketbase/client'

export type TarefaOrigem = 'projeto' | 'avulsa'

export interface VincularTarefaParams {
  tarefaId: string
  projetoId: string
  marcoId: string
}

export interface ProgressoResultado {
  projetoId: string
  progresso: number
  total_tarefas: number
  concluidas: number
  canceladas: number
  bloqueadas: number
  tarefas_sem_marco_inconsistente: number
}

export interface VincularTarefaResposta {
  success: boolean
  tarefa: {
    id: string
    origem: TarefaOrigem
    projeto_id: string
    marco_id: string
  }
  projeto_progresso?: ProgressoResultado | null
  projeto_origem_progresso?: ProgressoResultado | null
  error?: string
}

export interface DesvincularTarefaResposta {
  success: boolean
  tarefa: {
    id: string
    origem: TarefaOrigem
    projeto_id: null
    marco_id: null
  }
  projeto_progresso?: ProgressoResultado | null
  error?: string
}

export interface MarcoRegistro {
  id: string
  nome: string
  projeto_id: string
  data?: string
  ordem?: number
  concluido?: boolean
}

export interface DiagnosticoOrigemResposta {
  total_tarefas: number
  total_projetos: number
  total_marcos: number
  classe_a_projeto_com_marco: number
  classe_b_avulsa_em_conformidade: number
  violacoes_integridade: number
  violacoes: Array<{
    id: string
    titulo?: string
    origem?: string
    projeto_id?: string
    marco_id?: string
    motivo: string
  }>
}

/**
 * Endpoint dedicado para vincular tarefa a um projeto com marco obrigatório.
 * Regras:
 * - marcoId é OBRIGATÓRIO neste endpoint. Não aceita null/vazio.
 * - Validação de pertinência do marco ao projeto.
 * - Operação atômica no backend (origem = 'projeto', projeto_id e marco_id preenchidos).
 * - Recalcula progresso imediatamente.
 */
export async function vincularTarefaAoProjeto(
  params: VincularTarefaParams,
): Promise<VincularTarefaResposta> {
  const { tarefaId, projetoId, marcoId } = params

  if (!tarefaId) {
    throw new Error('tarefaId é obrigatório.')
  }
  if (!projetoId) {
    throw new Error('projetoId é obrigatório para vincular tarefa ao projeto.')
  }
  if (!marcoId || marcoId.trim() === '') {
    const err: any = new Error('marcoId é obrigatório. Selecione um marco do projeto.')
    err.status = 422
    throw err
  }

  const res = await pb.send<VincularTarefaResposta>('/backend/v1/tarefas-projeto/vincular', {
    method: 'POST',
    body: {
      tarefaId,
      projetoId,
      marcoId,
    },
  })

  return res
}

/**
 * Endpoint inverso: desvincularTarefaDeProjeto(tarefaId)
 * - Zera projeto_id E marco_id juntos.
 * - origem = 'avulsa'.
 * - Recalcula progresso do projeto que perdeu a tarefa.
 */
export async function desvincularTarefaDeProjeto(
  tarefaId: string,
): Promise<DesvincularTarefaResposta> {
  if (!tarefaId) {
    throw new Error('tarefaId é obrigatório.')
  }

  const res = await pb.send<DesvincularTarefaResposta>('/backend/v1/tarefas-projeto/desvincular', {
    method: 'POST',
    body: {
      tarefaId,
    },
  })

  return res
}

/**
 * Recalcula o progresso de um projeto explicitamente.
 */
export async function recalcularProgressoProjeto(projetoId: string): Promise<ProgressoResultado> {
  if (!projetoId) {
    throw new Error('projetoId é obrigatório.')
  }

  const res = await pb.send<ProgressoResultado & { success: boolean }>(
    '/backend/v1/tarefas-projeto/recalcular-progresso',
    {
      method: 'POST',
      body: {
        projetoId,
      },
    },
  )

  return res
}

/**
 * Obtém diagnóstico atual do modelo de vínculo por ORIGEM.
 */
export async function obterDiagnosticoOrigem(): Promise<DiagnosticoOrigemResposta> {
  const res = await pb.send<DiagnosticoOrigemResposta>('/backend/v1/tarefas-projeto/diagnostico', {
    method: 'GET',
  })
  return res
}

/**
 * Busca lista de marcos de um projeto ordenados.
 */
export async function listarMarcosProjeto(projetoId: string): Promise<MarcoRegistro[]> {
  if (!projetoId) return []
  try {
    const list = await pb.collection('marcos').getFullList<MarcoRegistro>({
      filter: `projeto_id = "${projetoId}"`,
      sort: 'ordem',
    })
    return list
  } catch (err) {
    console.warn('Erro ao carregar marcos do projeto:', err)
    return []
  }
}

/**
 * Proibido alterar projeto_id de tarefa via update genérico sem marco_id correspondente.
 * Esta função utilitária valida o payload de update no frontend antes de enviar ao PocketBase.
 */
export function validarPayloadTarefaAntesDeSalvar(payload: {
  origem?: TarefaOrigem
  projeto_id?: string | null
  marco_id?: string | null
}): void {
  const { origem, projeto_id, marco_id } = payload

  // Se informado projeto_id
  if (projeto_id) {
    if (!marco_id) {
      const err: any = new Error('Todo vínculo de tarefa a um projeto exige um marco obrigatório.')
      err.status = 422
      throw err
    }
    if (origem && origem !== 'projeto') {
      const err: any = new Error('Origem da tarefa com projeto_id deve ser "projeto".')
      err.status = 422
      throw err
    }
  } else if (marco_id) {
    // marco_id sem projeto_id
    const err: any = new Error('marco_id não pode ser informado sem projeto_id.')
    err.status = 422
    throw err
  } else if (origem === 'projeto') {
    // origem projeto sem projeto_id
    const err: any = new Error('Tarefa com origem "projeto" exige projeto_id e marco_id.')
    err.status = 422
    throw err
  }
}
