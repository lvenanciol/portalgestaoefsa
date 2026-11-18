import pb from '@/lib/pocketbase/client'
import {
  penDataset,
  type PenDataset,
  type PenCompany,
  type PenObjective,
  type PenKpi,
  type PenInitiative,
  type PenCause,
  type PenRisk,
  type CompanyScopeId,
  type CompanyId,
} from './mock'

// ============================================================================
// FASE 3.1 — CAMADA DE DADOS REAL DO /pen
//
// Contrato: expõe a MESMA interface `PenDataset` do mock. A tela não sabe se
// veio do banco ou do mock — só consome o tipo.
//
// SINCRONIZAÇÃO INCREMENTAL (exigência da fase):
//   · cada coleção pen_* tem `updated` (AutodateField)
//   · guardamos o maior `updated` já visto por coleção+escopo
//   · o próximo carregamento pede SÓ o que mudou:
//        filter: updated > "<ultima marca>" && company_id = "<escopo>"
//   · PROIBIDO full refresh: só há varredura completa quando não existe marca
//     (primeira carga). Depois disso, sempre incremental.
//
// ESTADO POR BLOCO: cada consulta resolve/erre sozinha. Um erro em pen_kpi
// não derruba o Cockpit inteiro — o bloco mostra erro e os outros renderizam.
// ============================================================================

/** Chave de coleção do módulo. */
export type Colecao =
  | 'pen_company'
  | 'pen_cycle'
  | 'pen_objective'
  | 'pen_kpi'
  | 'pen_initiative'
  | 'pen_cause'
  | 'pen_risk'

/** Resultado de um bloco: dado, carregando ou erro — nunca os três. */
export interface Bloco<T> {
  dados: T[]
  carregando: boolean
  erro: string | null
  /** true quando veio do banco; false quando caiu no fallback do mock */
  fonte: 'banco' | 'mock'
}

export function blocoVazio<T>(): Bloco<T> {
  return { dados: [], carregando: true, erro: null, fonte: 'banco' }
}

// ---------------------------------------------------------------------------
// marcas de sincronização (por escopo)
// ---------------------------------------------------------------------------

const PREFIXO = 'pge_pen_sync_v1'

function chaveMarca(c: Colecao, escopo: CompanyScopeId): string {
  return `${PREFIXO}:${c}:${escopo}`
}

function lerMarca(c: Colecao, escopo: CompanyScopeId): string | null {
  try {
    return localStorage.getItem(chaveMarca(c, escopo))
  } catch (_e) {
    return null
  }
}

function gravarMarca(c: Colecao, escopo: CompanyScopeId, valor: string) {
  try {
    localStorage.setItem(chaveMarca(c, escopo), valor)
  } catch (_e) {
    /* sem storage: próxima carga será completa */
  }
}

/** Zera as marcas: força ressincronização completa no próximo load. */
export function invalidarSincronizacao() {
  try {
    const remover: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.indexOf(PREFIXO) === 0) remover.push(k)
    }
    for (const k of remover) localStorage.removeItem(k)
  } catch (_e) {
    /* nada a fazer */
  }
}

// ---------------------------------------------------------------------------
// consulta incremental
// ---------------------------------------------------------------------------

/**
 * Busca uma coleção de forma INCREMENTAL.
 *
 * `escopo === 'all'` não filtra por empresa (o consolidado usa todas).
 * Retorna o que mudou desde a última marca. Nunca faz full refresh depois da
 * primeira carga.
 */
async function buscarIncremental<T extends { id: string; updated: string }>(
  colecao: Colecao,
  escopo: CompanyScopeId,
): Promise<{ itens: T[]; completo: boolean }> {
  const marca = lerMarca(colecao, escopo)

  // filtros: escopo de empresa + marca temporal
  const partes: string[] = []
  if (escopo !== 'all') {
    // pen_company guarda a própria empresa; demais também têm company_id
    partes.push(`company_id = "${escopo}"`)
  }
  if (marca) {
    // incremental: só o que mudou
    partes.push(`updated > "${marca}"`)
  }
  const filtro = partes.join(' && ')

  const opcoes: any = { sort: 'updated' }
  if (filtro) opcoes.filter = filtro

  const registros = await pb.collection(colecao).getFullList(opcoes)

  // atualiza a marca com o maior updated recebido
  let maior = marca || ''
  for (const r of registros as any[]) {
    const u = String(r.updated || '')
    if (u && u > maior) maior = u
  }
  if (maior && maior !== marca) gravarMarca(colecao, escopo, maior)

  return { itens: registros as T[], completo: !marca }
}

// ---------------------------------------------------------------------------
// conversão registro → tipo do contrato
// ---------------------------------------------------------------------------

function num(v: any, padrao: number | null = null): number | null {
  if (v === null || v === undefined || v === '') return padrao
  const n = Number(v)
  return Number.isNaN(n) ? padrao : n
}

function txt(v: any, padrao = ''): string {
  return v === null || v === undefined ? padrao : String(v)
}

function paraCompany(r: any): PenCompany {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    nome: txt(r.nome),
    sigla: txt(r.sigla),
    receita: num(r.receita),
    ebitda_pct: num(r.ebitda_pct),
    headcount: num(r.headcount),
  }
}

function paraObjective(r: any): PenObjective {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    titulo: txt(r.titulo),
    descricao: txt(r.descricao),
    perspectiva: txt(r.perspectiva, 'financeira') as any,
    owner_id: txt(r.owner_id),
    baseline: num(r.baseline),
    target: num(r.target),
    polarity: (txt(r.polarity, 'up') === 'down' ? 'down' : 'up') as any,
    weight: num(r.weight, 0) as number,
    status: txt(r.status, 'em_andamento') as any,
    realizado: num(r.realizado),
  }
}

function paraKpi(r: any): PenKpi {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    nome: txt(r.nome),
    unidade: txt(r.unidade),
    frequencia: txt(r.frequencia, 'mensal') as any,
    owner_id: txt(r.owner_id),
    objetivo_id: txt(r.objetivo_id),
    baseline: num(r.baseline),
    target: num(r.target),
    polarity: (txt(r.polarity, 'up') === 'down' ? 'down' : 'up') as any,
    weight: num(r.weight, 0) as number,
    status: txt(r.status, 'em_andamento') as any,
    realizado: num(r.realizado),
  }
}

function paraInitiative(r: any): PenInitiative {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    titulo: txt(r.titulo),
    descricao: txt(r.descricao),
    owner_id: txt(r.owner_id),
    objetivo_id: txt(r.objetivo_id),
    prazo: txt(r.prazo),
    baseline: num(r.baseline),
    target: num(r.target),
    polarity: (txt(r.polarity, 'up') === 'down' ? 'down' : 'up') as any,
    weight: num(r.weight, 0) as number,
    status: txt(r.status, 'em_andamento') as any,
    progresso: num(r.progresso),
  }
}

function paraCause(r: any): PenCause {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    descricao: txt(r.descricao),
    categoria: txt(r.categoria, 'metodo') as any,
    causa_raiz: r.causa_raiz === true,
    owner_id: txt(r.owner_id),
    desvio_id: txt(r.desvio_id),
  }
}

function paraRisk(r: any): PenRisk {
  return {
    id: r.id,
    workspace_id: txt(r.workspace_id),
    company_id: txt(r.company_id) as CompanyId,
    cycle_id: txt(r.cycle_id, 'ciclo-2026') as any,
    created: txt(r.created),
    updated: txt(r.updated),
    titulo: txt(r.titulo),
    tipo: txt(r.tipo, 'risco') as any,
    descricao: txt(r.descricao),
    probabilidade: txt(r.probabilidade, 'medio') as any,
    impacto: txt(r.impacto, 'medio') as any,
    mitigacao: txt(r.mitigacao),
    owner_id: txt(r.owner_id),
  }
}

// ---------------------------------------------------------------------------
// carregamento por bloco
// ---------------------------------------------------------------------------

export interface PenDados {
  companies: Bloco<PenCompany>
  objectives: Bloco<PenObjective>
  kpis: Bloco<PenKpi>
  initiatives: Bloco<PenInitiative>
  causes: Bloco<PenCause>
  risks: Bloco<PenRisk>
}

function mensagemErro(e: any): string {
  return String(
    e?.response?.data?.message || e?.response?.message || e?.message || 'Falha ao carregar',
  )
}

/**
 * Carrega um bloco. Se o banco falhar, cai no mock daquele bloco e marca
 * `fonte: 'mock'` — a tela mostra aviso, não tela vazia.
 */
async function carregarBloco<T>({
  colecao,
  escopo,
  quandoVazio,
  converter,
  mock,
}: {
  colecao: Colecao
  escopo: CompanyScopeId
  quandoVazio: (itens: any[]) => boolean
  converter: (r: any) => T
  mock: () => T[]
}): Promise<Bloco<T>> {
  try {
    const { itens, completo } = await buscarIncremental<any>(colecao, escopo)

    // primeira carga e banco vazio → fallback explícito para o mock
    if (completo && quandoVazio(itens)) {
      return { dados: mock(), carregando: false, erro: null, fonte: 'mock' }
    }

    return { dados: itens.map(converter), carregando: false, erro: null, fonte: 'banco' }
  } catch (e) {
    return {
      dados: mock(),
      carregando: false,
      erro: mensagemErro(e),
      fonte: 'mock',
    }
  }
}

/**
 * Carrega todos os blocos do /pen em paralelo, cada um independente.
 * Um erro num bloco não impede os outros.
 */
export async function carregarPen(escopo: CompanyScopeId = 'all'): Promise<PenDados> {
  const base = penDataset(escopo)

  const [companies, objectives, kpis, initiatives, causes, risks] = await Promise.all([
    carregarBloco({
      colecao: 'pen_company',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraCompany,
      mock: () => base.companies,
    }),
    carregarBloco({
      colecao: 'pen_objective',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraObjective,
      mock: () => base.objectives,
    }),
    carregarBloco({
      colecao: 'pen_kpi',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraKpi,
      mock: () => base.kpis,
    }),
    carregarBloco({
      colecao: 'pen_initiative',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraInitiative,
      mock: () => base.initiatives,
    }),
    carregarBloco({
      colecao: 'pen_cause',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraCause,
      mock: () => base.causes,
    }),
    carregarBloco({
      colecao: 'pen_risk',
      escopo,
      quandoVazio: (i) => i.length === 0,
      converter: paraRisk,
      mock: () => base.risks,
    }),
  ])

  return { companies, objectives, kpis, initiatives, causes, risks }
}

// ---------------------------------------------------------------------------
// indicadores derivados do dado REAL (mesmos campos do mock)
// ---------------------------------------------------------------------------

export interface TopoReal {
  receita: number | null
  receitaMeta: number | null
  ebitda: number | null
  ebitdaMeta: number | null
  turnover: number | null
  turnoverMeta: number | null
  iniNoPrazo: number
  iniTotal: number
}

const META_RECEITA: Record<CompanyScopeId, number> = {
  all: 218400000,
  extrafruti: 188400000,
  casafruti: 25000000,
  foldbox: 5000000,
}

/** Calcula os 4 KPIs do Cockpit a partir dos blocos carregados. */
export function topoDosDados(d: PenDados): TopoReal {
  const empresas = d.companies.dados
  const receita = empresas.reduce<number | null>(
    (s, c) => (s === null ? (c.receita ?? 0) : s + (c.receita ?? 0)),
    null,
  )

  const eb = d.kpis.dados.find((k) => k.nome.toLowerCase().indexOf('ebitda') >= 0)
  const to = d.kpis.dados.find((k) => k.nome.toLowerCase().indexOf('turnover') >= 0)

  const total = d.initiatives.dados.length
  const noPrazo = d.initiatives.dados.filter((i) => i.status !== 'atrasado').length

  return {
    receita,
    receitaMeta: META_RECEITA.all,
    ebitda: eb?.realizado ?? null,
    ebitdaMeta: eb?.target ?? null,
    turnover: to?.realizado ?? null,
    turnoverMeta: to?.target ?? null,
    iniNoPrazo: noPrazo,
    iniTotal: total,
  }
}

/**
 * Progresso de execução por empresa, a partir do dado carregado.
 *
 * 18/11/2026 — DEFEITO ENCONTRADO COM A TELA NO AR: a versão anterior somava
 * 50% de objetivos + 50% de iniciativas por CONTAGEM, o que dava 80% à
 * Extrafruti sem nenhuma iniciativa concluída — número que não se explicava e
 * ainda pintava o semáforo de "Crítico". Agora pondera pelo `weight` real de
 * cada item (e usa 1 quando não houver peso), então "em execução" pesa o que
 * aquele objetivo vale no plano.
 */
export function progressoDosDados(d: PenDados, companyId: CompanyId): number {
  const objs = d.objectives.dados.filter((o) => o.company_id === companyId)
  const inis = d.initiatives.dados.filter((i) => i.company_id === companyId)
  if (objs.length === 0 && inis.length === 0) return 0

  const peso = (x: { weight: number }) => Number(x.weight) || 1
  const avancado = (s: string) => s === 'concluido' || s === 'em_andamento'

  const pesoTotal = objs.reduce((s, x) => s + peso(x), 0) + inis.reduce((s, x) => s + peso(x), 0)
  if (pesoTotal === 0) return 0

  const pesoOk =
    objs.filter((o) => avancado(o.status)).reduce((s, x) => s + peso(x), 0) +
    inis.filter((i) => avancado(i.status)).reduce((s, x) => s + peso(x), 0)

  return Math.round((pesoOk / pesoTotal) * 1000) / 10
}

/** Registra uma exportação em pen_audit (exigência da Fase 3.2). */
export async function registrarExportacao(
  tela: string,
  formato: string,
  escopo: string,
  usuario: string,
): Promise<void> {
  try {
    await pb.collection('pen_audit').create({
      workspace_id: String((pb.authStore.record as any)?.workspace_id || 'ws-pge-001'),
      company_id: '',
      cycle_id: 'ciclo-2026',
      user_id: usuario,
      tabela: 'exportacao',
      registro_id: tela,
      campo: 'formato',
      valor_anterior: '',
      valor_novo: `${formato} · ${escopo}`,
      justificativa: `Exportação de ${tela} (${formato}) para o escopo ${escopo}`,
      status: 'registrado',
    })
  } catch (_e) {
    // o registro de auditoria é importante, mas não pode impedir a exportação
  }
}
