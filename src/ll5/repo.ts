import pb from '@/lib/pocketbase/client'

// ============================================================================
// LL5 — REPOSITÓRIO COM ISOLAMENTO POR OWNER (15/11/2026)
//
// ESTE ARQUIVO É A FRONTEIRA DE SEGURANÇA DOS DADOS PESSOAIS.
//
// Regra do briefing: "a filtragem por owner_id deve estar na CAMADA DE DADOS,
// nunca apenas na UI". Por isso TODA leitura passa por aqui e aplica o filtro
// de dono ANTES de devolver qualquer linha. Um componente de tela não tem
// acesso ao cliente do PocketBase para listar dados LL5 — se tentar, recebe
// uma lista já recortada.
//
// Papéis:
//   admin  → vê tudo de todos os owners (único que cria/edita/exclui abas)
//   membro → vê apenas o que é dele
//
// O filtro é aplicado DUAS vezes de propósito:
//   1. no `filter` enviado ao PocketBase (para não trafegar dado alheio);
//   2. no `.filter()` em memória (defesa em profundidade: se a regra do banco
//      mudar por engano, o recorte continua valendo no cliente).
// ============================================================================

export type Role = 'admin' | 'membro_familia'

export interface Ator {
  id: string
  email: string
  nome: string
  role: Role
}

/** Monta o ator a partir do authStore + perfil de permissões. */
export function atorAtual(user: any, grupoNome?: string | null): Ator {
  return {
    id: String(user?.id || ''),
    email: String(user?.email || '').toLowerCase(),
    nome: String(user?.name || user?.email || 'Usuário'),
    role: grupoNome === 'Admin' ? 'admin' : 'membro_familia',
  }
}

/** Dono efetivo dos dados: o admin pode escolher; o membro é sempre ele mesmo. */
export function ownerEfetivo(ator: Ator, ownerEscolhido?: string | null): string {
  if (ator.role === 'admin') return ownerEscolhido || ator.id
  return ator.id
}

/**
 * Filtro de isolamento. Público para os testes exercitarem direto.
 * - admin sem owner escolhido: lista tudo (sem cláusula de owner)
 * - admin com owner escolhido: apenas aquele owner
 * - membro: SEMPRE apenas o próprio id, ignorando qualquer parâmetro
 */
export function filtroOwner(ator: Ator, ownerEscolhido?: string | null): string {
  if (ator.role === 'admin') {
    return ownerEscolhido ? `owner_id = "${ownerEscolhido}"` : ''
  }
  // membro: o parâmetro é DESCARTADO de propósito
  return `owner_id = "${ator.id}"`
}

/** Lista registros aplicando o isolamento. */
export async function listar(
  colecao: string,
  ator: Ator,
  opts: {
    ownerEscolhido?: string | null
    filtroExtra?: string
    sort?: string
    expand?: string
  } = {},
): Promise<any[]> {
  const partes: string[] = []
  const fOwner = filtroOwner(ator, opts.ownerEscolhido)
  if (fOwner) partes.push(fOwner)
  if (opts.filtroExtra) partes.push('(' + opts.filtroExtra + ')')

  const filtro = partes.join(' && ')

  let linhas: any[] = []
  try {
    linhas = await pb.collection(colecao).getFullList({
      filter: filtro,
      sort: opts.sort || '-created',
      expand: opts.expand,
    })
  } catch (e) {
    console.error('[ll5/repo] falha ao listar ' + colecao + ':', e)
    return []
  }

  // defesa em profundidade — recorte em memória
  if (ator.role !== 'admin') {
    return linhas.filter((r: any) => String(r.owner_id || '') === ator.id)
  }
  if (opts.ownerEscolhido) {
    return linhas.filter((r: any) => String(r.owner_id || '') === opts.ownerEscolhido)
  }
  return linhas
}

/** Cria um registro carimbando owner/created_by. */
export async function criar(
  colecao: string,
  ator: Ator,
  dados: Record<string, any>,
  ownerEscolhido?: string | null,
): Promise<any> {
  const owner = ownerEfetivo(ator, ownerEscolhido)
  const payload = {
    ...dados,
    owner_id: owner,
    created_by: ator.email,
    updated_by: ator.email,
  }
  const rec = await pb.collection(colecao).create(payload)

  // created_by ≠ owner_id → registra no log de auditoria (regra do briefing)
  if (ator.email && owner && String(rec.owner_id) !== ator.id) {
    await registrarLog({
      ator,
      acao: 'escrita',
      entidade: colecao,
      entidadeId: rec.id,
      ownerAlvo: owner,
      detalhe: 'Admin lançou registro para outro proprietário',
    })
  }
  return rec
}

/** Atualiza carimbando updated_by e validando o dono antes de gravar. */
export async function atualizar(
  colecao: string,
  ator: Ator,
  id: string,
  dados: Record<string, any>,
): Promise<any> {
  const atual = await pb.collection(colecao).getOne(id)
  if (ator.role !== 'admin' && String(atual.owner_id) !== ator.id) {
    throw new Error('Sem permissão para alterar registro de outro proprietário.')
  }
  return pb.collection(colecao).update(id, { ...dados, updated_by: ator.email })
}

/** Exclusão lógica (soft delete) — preserva histórico. */
export async function excluirLogico(colecao: string, ator: Ator, id: string): Promise<void> {
  const atual = await pb.collection(colecao).getOne(id)
  if (ator.role !== 'admin' && String(atual.owner_id) !== ator.id) {
    throw new Error('Sem permissão para excluir registro de outro proprietário.')
  }
  await pb.collection(colecao).update(id, {
    deletado_em: new Date().toISOString(),
    updated_by: ator.email,
  })
  await registrarLog({
    ator,
    acao: 'exclusao',
    entidade: colecao,
    entidadeId: id,
    ownerAlvo: String(atual.owner_id || ''),
  })
}

/** Exclusão física, apenas admin. */
export async function excluirFisico(colecao: string, ator: Ator, id: string): Promise<void> {
  if (ator.role !== 'admin') throw new Error('Apenas administradores podem excluir de vez.')
  await pb.collection(colecao).delete(id)
}

// ---------------------------------------------------------------- auditoria
export async function registrarLog(params: {
  ator: Ator
  acao: 'leitura' | 'escrita' | 'exclusao' | 'geracao_parecer' | 'exportacao'
  entidade: string
  entidadeId?: string
  ownerAlvo?: string
  camposSensiveis?: string
  detalhe?: string
}): Promise<void> {
  try {
    await pb.collection('ll5_access_log').create({
      ator_id: params.ator.id,
      ator_role: params.ator.role,
      acao: params.acao,
      entidade: params.entidade,
      entidade_id: params.entidadeId || '',
      owner_id_alvo: params.ownerAlvo || '',
      campos_sensiveis: params.camposSensiveis || '',
      detalhe: params.detalhe || '',
    })
  } catch (e) {
    // log é best-effort: nunca bloqueia a operação do usuário
    console.warn('[ll5/repo] falha ao registrar log:', e)
  }
}

/** O admin registra leitura de parecer alheio. */
export async function registrarLeituraParecer(
  ator: Ator,
  reportId: string,
  ownerAlvo: string,
): Promise<void> {
  if (ator.role !== 'admin') return
  if (String(ownerAlvo) === ator.id) return
  await registrarLog({
    ator,
    acao: 'leitura',
    entidade: 'll5_ai_reports',
    entidadeId: reportId,
    ownerAlvo,
    detalhe: 'Admin leu parecer de outro proprietário',
  })
}
