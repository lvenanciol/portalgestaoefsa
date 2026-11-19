import { useEffect, useState, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { carregarPermissoes, permissoesCache, Permissoes, can } from '@/services/permissoes-service'

// Fase 9 — Controle de acesso por BOTÃO (fail-open).
// Registry central: a matriz BOTÕES (Controle de Acessos) e os gates das
// telas leem da MESMA fonte — nunca drift. Botão sem restrição = SEMPRE
// visível. Admin bypass total. Estado vive em grupos_permissao.permissoes
// (JSONB) na chave "botoes": { screen_key: [button_keys ocultos] }.

export interface BotaoDef {
  key: string
  label: string
}

export interface TelaBotoes {
  key: string
  label: string
  buttons: BotaoDef[]
}

// Registry — atualizar aqui ao adicionar gates em novas telas.
export const BUTTON_GATES: TelaBotoes[] = [
  {
    key: 'dashboard',
    label: 'Dashboard Executivo',
    buttons: [{ key: 'exportar', label: 'Exportar' }],
  },
  {
    key: 'financeiro',
    label: 'Financeiro & Contábil',
    buttons: [
      { key: 'exportar_csv', label: 'Exportar CSV (DRE/Fluxo/A-P-R/Balancete)' },
      { key: 'importar', label: 'Importar demonstrativo (Balancete/DRE)' },
    ],
  },
  {
    key: 'acessos',
    label: 'Controle de Acessos',
    buttons: [
      { key: 'novo_usuario', label: 'Novo Usuário' },
      { key: 'editar_usuario', label: 'Editar usuário (linha)' },
      { key: 'alternar_ativo', label: 'Ativar/Inativar usuário (switch)' },
      { key: 'auditoria', label: 'Trilha de Auditoria' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos & Importações',
    buttons: [
      { key: 'novo', label: 'Novo documento' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'tarefas',
    label: 'Tarefas',
    buttons: [
      { key: 'novo', label: 'Nova tarefa' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'projetos',
    label: 'Projetos',
    buttons: [
      { key: 'novo', label: 'Novo projeto' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'atas',
    label: 'Atas & Reuniões',
    buttons: [
      { key: 'novo', label: 'Nova ata' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'emails',
    label: 'E-mails',
    buttons: [{ key: 'exportar_csv', label: 'Exportar CSV' }],
  },
  {
    key: 'contratos',
    label: 'Contratos',
    buttons: [
      { key: 'novo', label: 'Novo contrato' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'indicadores',
    label: 'Indicadores',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados' }],
  },
  {
    key: 'ia',
    label: 'IA Gemini Flash',
    buttons: [{ key: 'gerar', label: 'Gerar análise' }],
  },
  {
    key: 'power-bi',
    label: 'Power BI',
    buttons: [{ key: 'configurar', label: 'Configurar relatório' }],
  },
  {
    key: 'menus',
    label: 'Árvore de Menus',
    buttons: [{ key: 'toggle_ativo', label: 'Ativar/desativar item (switch)' }],
  },
  {
    key: 'desempenho',
    label: 'Desempenho por Unidade',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados' }],
  },
  {
    key: 'financeiro_real',
    label: 'Financeiro — aba Real (Sankhya)',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados (aba Real)' }],
  },
  // ======================================================================
  // 19/11/2026 — TELAS DE "PLANO ESTRATÉGICO" E "LL5" NA MATRIZ
  //
  // DIRETIVA DO DONO: "as telas criadas nas seções LL5 e Plano Estratégico
  // não estão na tela Controle de Acessos para definir permissões".
  //
  // CAUSA: esta lista (BUTTON_GATES) é o REGISTRY que a tela Controle de
  // Acessos lê para montar a matriz. As telas do /pen foram criadas com
  // MODULOS_COM_MATRIZ (permissões) mas nunca entraram AQUI — então a matriz
  // não tinha a linha delas para marcar/desmarcar. A LL5 tem coleções e
  // rotas mas nunca teve linha nenhuma.
  //
  // Efeito colateral que isso revelou: /pen constava como "tem matriz" no
  // serviço de permissões, e o fallback concedia ver/criar/editar/excluir a
  // qualquer grupo com matriz configurada — exatamente o que o dono não
  // quer para tela nova. Com a linha aqui, a matriz passa a ser o controle
  // real e a concessão deixa de ser implícita.
  // ======================================================================
  {
    key: 'plano-estrategico',
    label: 'Plano Estratégico (/pen)',
    buttons: [
      { key: 'novo', label: 'Criar (objetivos, KPIs, iniciativas, riscos)' },
      { key: 'editar', label: 'Editar (metas, progresso, causas)' },
      { key: 'excluir', label: 'Excluir' },
      { key: 'exportar', label: 'Exportar PDF' },
    ],
  },
  {
    key: 'll5-saude',
    label: 'LL5 — Saúde & Tratamentos',
    buttons: [
      { key: 'novo', label: 'Nova sessão / tratamento' },
      { key: 'editar', label: 'Editar' },
      { key: 'excluir', label: 'Excluir' },
      { key: 'sincronizar', label: 'Sincronizar Garmin / importar' },
      { key: 'parecer_ia', label: 'Gerar parecer com IA' },
    ],
  },
  {
    key: 'll5-running',
    label: 'LL5 — Running',
    buttons: [
      { key: 'novo', label: 'Nova atividade' },
      { key: 'editar', label: 'Editar' },
      { key: 'excluir', label: 'Excluir' },
      { key: 'sincronizar', label: 'Sincronizar Garmin' },
    ],
  },
  {
    key: 'll5-gym',
    label: 'LL5 — GYM',
    buttons: [
      { key: 'novo', label: 'Nova sessão de academia' },
      { key: 'editar', label: 'Editar' },
      { key: 'excluir', label: 'Excluir' },
      { key: 'sincronizar', label: 'Importar treino' },
    ],
  },
  {
    key: 'll5-auditoria',
    label: 'LL5 — Auditoria',
    buttons: [
      { key: 'exportar_csv', label: 'Exportar CSV' },
      { key: 'visualizar', label: 'Ver registros de acesso' },
    ],
  },
]

// botoesOcultos(p) → Record<screen, string[]>
export function botoesOcultos(p: Permissoes | null): Record<string, string[]> {
  if (!p || !p.permissoes) return {}
  const b = (p.permissoes as Record<string, unknown>)['botoes']
  if (!b || typeof b !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(b as Record<string, unknown>)) {
    const v = (b as Record<string, unknown>)[k]
    if (Array.isArray(v)) out[k] = v.map(String)
  }
  return out
}

// podeVerBotao(screenKey, buttonKey).
// 11/11/2026 (pedido "só exibir telas e botões com permissão"): era fail-open —
// enquanto as permissões carregavam (ou se nunca chegassem) TODO botão aparecia.
// Agora: sem permissões carregadas o botão fica OCULTO (fail-closed); Admin
// bypass; os demais só veem se a tela for do grupo e o botão não estiver oculto.
export function podeVerBotao(p: Permissoes | null, screenKey: string, buttonKey: string): boolean {
  if (!p) return false // sem permissões carregadas → fail-closed (antes liberava)
  if (p.grupoNome === 'Admin') return true
  const modulo = TELA_MODULO[screenKey]
  if (modulo && !can(p, modulo, 'ver')) return false
  const oc = botoesOcultos(p)
  return !(oc[screenKey] || []).includes(buttonKey)
}

// ---------------------------------------------------------------------------
// 11/11/2026 — GATE ÚNICO (botão + matriz CRUD + módulo).
//
// Antes cada tela combinava as três fontes na mão (ou esquecia uma): o admin
// desmarcava "Editar" na matriz, ou escondia o botão, e o botão continuava na
// tela porque só uma das fontes era lida. Aqui a decisão é UMA:
//
//   tela pertence ao grupo (módulo com 'ver')
//     E o botão não está oculto (permissoes.botoes[tela])
//     E a matriz CRUD não revogou a operação (crud_<tela>_<acao>:off)
//
// chave do botão  → ação da matriz
//   novo          → criar
//   editar        → editar
//   excluir       → excluir
//   (exportar_csv, atualizar, gerar… NÃO têm coluna na matriz: só o toggle)
export const TELA_MODULO: Record<string, string> = {
  dashboard: 'dashboard-executivo',
  financeiro: 'financeiro-contabil',
  financeiro_real: 'financeiro-contabil',
  desempenho: 'desempenho-unidade',
  indicadores: 'indicadores',
  documentos: 'documentos-importacoes',
  tarefas: 'tarefas-agenda',
  projetos: 'projetos',
  atas: 'atas-reunioes',
  emails: 'emails',
  contratos: 'contratos',
  'power-bi': 'power-bi',
  ia: 'ia-gemini',
  menus: 'arvore-menus',
  acessos: 'controle-acessos',
  configuracoes: 'configuracoes',
  // 19/11/2026 — telas novas da matriz (Plano Estratégico e LL5). Sem esta
  // ligação, marcar/desmarcar na tela não teria módulo correspondente e o
  // gate cairia no fail-closed do podeVerBotao.
  'plano-estrategico': 'plano-estrategico',
  'll5-saude': 'll5-saude',
  'll5-running': 'll5-running',
  'll5-gym': 'll5-gym',
  'll5-auditoria': 'll5-auditoria',
}

const ACOES_CRUD: Record<string, string> = {
  novo: 'criar',
  editar: 'editar',
  excluir: 'excluir',
  ver: 'ver',
}

// podeOperacao(p, 'atas', 'editar') — três fontes em uma resposta.
export function podeOperacao(p: Permissoes | null, tela: string, chaveBotao: string): boolean {
  // 11/11/2026: fail-closed também aqui — sem permissões carregadas, nega.
  if (!p) return false
  if (p.grupoNome === 'Admin') return true
  // 1) a tela está concedida ao grupo?
  const modulo = TELA_MODULO[tela]
  if (modulo && !can(p, modulo, 'ver')) return false
  // 2) o toggle do botão está ligado?
  if (!podeVerBotao(p, tela, chaveBotao)) return false
  // 3) a matriz CRUD não revogou a operação?
  const acao = ACOES_CRUD[chaveBotao]
  if (acao && modulo && !can(p, modulo, acao)) return false
  return true
}

// Hook: carrega permissões (cache 5min) e expõe pode(screen, btn).
export function useBotoes() {
  const [p, setP] = useState<Permissoes | null>(permissoesCache())
  const [, setTick] = useState(0)

  useEffect(() => {
    carregarPermissoes().then((r) => {
      setP(r)
      setTick((t) => t + 1)
    })
  }, [])

  const pode = useCallback(
    (screenKey: string, buttonKey: string) => podeVerBotao(p, screenKey, buttonKey),
    [p],
  )
  return { pode, permissoes: p }
}

/**
 * Gate por TELA — a forma recomendada nas telas novas.
 *   const { podeAcao } = useGate('atas')
 *   {podeAcao('novo') && <Button>Nova ata</Button>}
 * Combina módulo + toggle do botão + matriz CRUD (ver podeOperacao).
 */
export function useGate(tela: string) {
  const [p, setP] = useState<Permissoes | null>(permissoesCache())

  useEffect(() => {
    let ativo = true
    carregarPermissoes().then((r) => {
      if (ativo) setP(r)
    })
    return () => {
      ativo = false
    }
  }, [])

  const podeAcao = useCallback((chaveBotao: string) => podeOperacao(p, tela, chaveBotao), [p, tela])
  return { podeAcao, permissoes: p }
}

// Salva os botões ocultos de um grupo (via hook backend admin-only).
export async function salvarBotoesGrupo(grupoId: string, botoes: Record<string, string[]>) {
  await pb.send('/backend/v1/botoes/salvar', {
    method: 'POST',
    body: JSON.stringify({ grupo_id: grupoId, botoes }),
  })
}

// Lê os botões ocultos já configurados de um grupo (direto da coleção).
export async function lerBotoesGrupo(grupoId: string): Promise<Record<string, string[]>> {
  const g = await pb.collection('grupos_permissao').getOne(grupoId)
  let perm: Record<string, unknown> | null = null
  try {
    perm = typeof g.permissoes === 'string' ? JSON.parse(g.permissoes) : g.permissoes
  } catch (_) {
    perm = null
  }
  const b = perm && (perm as Record<string, unknown>)['botoes']
  if (!b || typeof b !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(b as Record<string, unknown>)) {
    const v = (b as Record<string, unknown>)[k]
    if (Array.isArray(v)) out[k] = v.map(String)
  }
  return out
}
