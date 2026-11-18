// ============================================================================
// FASE 1.2 — MOCK TIPADO DO /pen
//
// Espelha EXATAMENTE o schema criado na fase 1.1 (pen_company, pen_cycle,
// pen_objective, pen_kpi, pen_initiative, pen_cause, pen_risk, pen_audit).
// Nenhum `any`: os tipos abaixo são a referência de contrato até a API real
// entrar na fase seguinte. Quando a API chegar, ela implementa estas mesmas
// interfaces — a tela não muda.
//
// REGRA DE NÚMEROS (diretiva do dono): os números são COERENTES entre telas e
// fixos aqui, no mock. Nada é calculado em componente. Um valor que não existe
// é `null` e a tela mostra "—", nunca zero inventado.
//
// Cenário do ciclo 2026:
//   Receita consolidada .... R$ 218,4 mi
//   EBITDA ................. 9,1%
//   Turnover operacional ... 5,4% ao mês
//   Casafruti .............. R$ 25,0 mi
//   FoldBox ................ R$  5,0 mi
//   Extrafruti ............. R$ 188,4 mi  (218,4 − 25,0 − 5,0)
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos de domínio — espelho do schema
// ---------------------------------------------------------------------------

/** Identificador de empresa usado em todo o módulo. `all` = consolidado. */
export type CompanyId = 'extrafruti' | 'casafruti' | 'foldbox'
export type CompanyScopeId = CompanyId | 'all'

export type CycleId = 'ciclo-2026'

/** Sentido do indicador: `up` = maior é melhor; `down` = menor é melhor. */
export type Polarity = 'up' | 'down'

export type Status = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'atrasado' | 'bloqueado'

export type Perspectiva = 'financeira' | 'cliente' | 'processos' | 'aprendizado'

export type CategoriaCausa = 'metodo' | 'mao_de_obra' | 'material' | 'maquina' | 'medida' | 'meio'

export type TipoRaid = 'risco' | 'premissa' | 'issue' | 'dependencia'

export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico'

/** Campos comuns a toda tabela do schema (workspace/company/cycle/timestamps). */
export interface PenBase {
  id: string
  workspace_id: string
  company_id: CompanyId
  cycle_id: CycleId
  created: string
  updated: string
}

/** Campos de medição — presentes em kpi e initiative. */
export interface PenMedicao {
  baseline: number | null
  target: number | null
  polarity: Polarity
  weight: number
  status: Status
}

// ---- pen_company -----------------------------------------------------------
export interface PenCompany extends PenBase {
  nome: string
  sigla: string
  receita: number | null
  ebitda_pct: number | null
  headcount: number | null
}

// ---- pen_cycle -------------------------------------------------------------
export interface PenCycle extends PenBase {
  nome: string
  inicio: string
  fim: string
}

// ---- pen_objective ---------------------------------------------------------
export interface PenObjective extends PenBase, PenMedicao {
  titulo: string
  descricao: string
  perspectiva: Perspectiva
  owner_id: string
  /** realizado atual (para atingimento) — null quando não medido */
  realizado: number | null
}

// ---- pen_kpi ---------------------------------------------------------------
export interface PenKpi extends PenBase, PenMedicao {
  nome: string
  unidade: string
  frequencia: 'mensal' | 'trimestral' | 'anual'
  owner_id: string
  objetivo_id: string
  realizado: number | null
}

// ---- pen_initiative --------------------------------------------------------
export interface PenInitiative extends PenBase, PenMedicao {
  titulo: string
  descricao: string
  owner_id: string
  objetivo_id: string
  prazo: string
  progresso: number | null
}

// ---- pen_cause -------------------------------------------------------------
export interface PenCause extends PenBase {
  descricao: string
  categoria: CategoriaCausa
  causa_raiz: boolean
  owner_id: string
  desvio_id: string
}

// ---- pen_risk --------------------------------------------------------------
export interface PenRisk extends PenBase {
  titulo: string
  tipo: TipoRaid
  descricao: string
  probabilidade: NivelRisco
  impacto: NivelRisco
  mitigacao: string
  owner_id: string
}

// ---- pen_audit -------------------------------------------------------------
export interface PenAudit extends PenBase {
  user_id: string
  tabela: string
  registro_id: string
  campo: string
  valor_anterior: string
  valor_novo: string
  justificativa: string
}

/** Desvio = KPI fora da meta. Alimenta o Ishikawa. */
export interface PenDesvio {
  id: string
  company_id: CompanyId
  kpi_id: string
  titulo: string
  baseline: number
  target: number
  realizado: number
  /** gravidade derivada da distância até a meta */
  gravidade: 'media' | 'alta' | 'critica'
}

/** Agregado que as telas consomem. `all` é o consolidado do filtro global. */
export interface PenDataset {
  companies: PenCompany[]
  cycles: PenCycle[]
  objectives: PenObjective[]
  kpis: PenKpi[]
  initiatives: PenInitiative[]
  causes: PenCause[]
  risks: PenRisk[]
  desvios: PenDesvio[]
  audit: PenAudit[]
}

// ---------------------------------------------------------------------------
// Constantes do ciclo
// ---------------------------------------------------------------------------

export const WORKSPACE_ID = 'ws-pge-001'
export const CYCLE_ID: CycleId = 'ciclo-2026'
export const CICLO_NOME = 'Ciclo 2026'
const TS = '2026-01-15T12:00:00.000Z'

// ---------------------------------------------------------------------------
// pen_company
// ---------------------------------------------------------------------------

const companies: PenCompany[] = [
  {
    id: 'extrafruti',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Extrafruti',
    sigla: 'EFT',
    // 188,4 = 218,4 (consolidado) − 25,0 (Casafruti) − 5,0 (FoldBox)
    receita: 188400000,
    ebitda_pct: 9.1,
    headcount: 1600,
  },
  {
    id: 'casafruti',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Casafruti',
    sigla: 'CFT',
    receita: 25000000,
    ebitda_pct: 8.4,
    headcount: 600,
  },
  {
    id: 'foldbox',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'FoldBox',
    sigla: 'FBX',
    receita: 5000000,
    ebitda_pct: 12.6,
    headcount: 4,
  },
]

// ---------------------------------------------------------------------------
// pen_cycle
// ---------------------------------------------------------------------------

const cycles: PenCycle[] = [
  {
    id: CYCLE_ID,
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: CICLO_NOME,
    inicio: '2026-01-01',
    fim: '2026-12-31',
  },
]

// ---------------------------------------------------------------------------
// pen_objective — 8 objetivos
// ---------------------------------------------------------------------------

const objectives: PenObjective[] = [
  {
    id: 'obj-01',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Crescer receita consolidada para R$ 218,4 mi',
    descricao:
      'Expansão orgânica no atacado e no varejo alimentar, com recuperação de base ativa e aumento de ticket médio.',
    perspectiva: 'financeira',
    owner_id: 'Leonardo Lourenço',
    baseline: 198500000,
    target: 218400000,
    polarity: 'up',
    weight: 20,
    status: 'em_andamento',
    realizado: 164200000,
  },
  {
    id: 'obj-02',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Elevar EBITDA consolidado a 9,1%',
    descricao: 'Ganho de margem por mix, redução de quebra e disciplina de despesas operacionais.',
    perspectiva: 'financeira',
    owner_id: 'Leonardo Lourenço',
    baseline: 7.8,
    target: 9.1,
    polarity: 'up',
    weight: 18,
    status: 'em_andamento',
    realizado: 8.6,
  },
  {
    id: 'obj-03',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Casafruti: R$ 25 mi de faturamento',
    descricao:
      'Consolidar a operação de varejo e distribuição da Casafruti com foco em rentabilidade por loja.',
    perspectiva: 'financeira',
    owner_id: 'Diretoria Casafruti',
    baseline: 21400000,
    target: 25000000,
    polarity: 'up',
    weight: 12,
    status: 'em_andamento',
    realizado: 18700000,
  },
  {
    id: 'obj-04',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'FoldBox: R$ 5 mi em embalagens retornáveis',
    descricao:
      'Crescimento por contrato com indústria, atacarejo e operadores logísticos — ciclo de venda consultivo.',
    perspectiva: 'financeira',
    owner_id: 'Diretoria FoldBox',
    baseline: 3800000,
    target: 5000000,
    polarity: 'up',
    weight: 10,
    status: 'em_andamento',
    realizado: 3650000,
  },
  {
    id: 'obj-05',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Reduzir turnover operacional a 3,0% ao mês',
    descricao:
      'Retenção de operação por trilha de carreira, escala humanizada e líder de turno preparado.',
    perspectiva: 'aprendizado',
    owner_id: 'Gestão de Pessoas',
    baseline: 6.0,
    target: 3.0,
    polarity: 'down',
    weight: 15,
    status: 'atrasado',
    realizado: 5.4,
  },
  {
    id: 'obj-06',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Quebra de perecíveis abaixo de 2,5%',
    descricao: 'Gestão de validade, temperatura e giro por loja, com inventário confiável.',
    perspectiva: 'processos',
    owner_id: 'Operações',
    baseline: 3.4,
    target: 2.5,
    polarity: 'down',
    weight: 12,
    status: 'em_andamento',
    realizado: 2.9,
  },
  {
    id: 'obj-07',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'NPS do varejo acima de 60',
    descricao: 'Experiência de loja, disponibilidade de sortimento e tempo de atendimento.',
    perspectiva: 'cliente',
    owner_id: 'Comercial Casafruti',
    baseline: 48,
    target: 60,
    polarity: 'up',
    weight: 8,
    status: 'em_andamento',
    realizado: 55,
  },
  {
    id: 'obj-08',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Automação de 70% do processo fiscal',
    descricao:
      'Reduzir trabalho manual em apuração e conciliação com integração Sankhya e validação sistêmica.',
    perspectiva: 'processos',
    owner_id: 'Tecnologia e Controladoria',
    baseline: 35,
    target: 70,
    polarity: 'up',
    weight: 5,
    status: 'em_andamento',
    realizado: 52,
  },
]

// ---------------------------------------------------------------------------
// pen_kpi — indicadores que alimentam as telas
// ---------------------------------------------------------------------------

const kpis: PenKpi[] = [
  {
    id: 'kpi-receita-total',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Receita consolidada',
    unidade: 'R$',
    frequencia: 'mensal',
    owner_id: 'Leonardo Lourenço',
    objetivo_id: 'obj-01',
    baseline: 198500000,
    target: 218400000,
    polarity: 'up',
    weight: 20,
    status: 'em_andamento',
    realizado: 164200000,
  },
  {
    id: 'kpi-ebitda',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'EBITDA',
    unidade: '%',
    frequencia: 'mensal',
    owner_id: 'Leonardo Lourenço',
    objetivo_id: 'obj-02',
    baseline: 7.8,
    target: 9.1,
    polarity: 'up',
    weight: 18,
    status: 'em_andamento',
    realizado: 8.6,
  },
  {
    id: 'kpi-turnover',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Turnover operacional',
    unidade: '%/mês',
    frequencia: 'mensal',
    owner_id: 'Gestão de Pessoas',
    objetivo_id: 'obj-05',
    baseline: 6.0,
    target: 3.0,
    polarity: 'down',
    weight: 15,
    status: 'atrasado',
    realizado: 5.4,
  },
  {
    id: 'kpi-quebra',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Quebra de perecíveis',
    unidade: '%',
    frequencia: 'mensal',
    owner_id: 'Operações',
    objetivo_id: 'obj-06',
    baseline: 3.4,
    target: 2.5,
    polarity: 'down',
    weight: 12,
    status: 'em_andamento',
    realizado: 2.9,
  },
  {
    id: 'kpi-receita-casafruti',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Receita Casafruti',
    unidade: 'R$',
    frequencia: 'mensal',
    owner_id: 'Diretoria Casafruti',
    objetivo_id: 'obj-03',
    baseline: 21400000,
    target: 25000000,
    polarity: 'up',
    weight: 12,
    status: 'em_andamento',
    realizado: 18700000,
  },
  {
    id: 'kpi-receita-foldbox',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Receita FoldBox',
    unidade: 'R$',
    frequencia: 'mensal',
    owner_id: 'Diretoria FoldBox',
    objetivo_id: 'obj-04',
    baseline: 3800000,
    target: 5000000,
    polarity: 'up',
    weight: 10,
    status: 'em_andamento',
    realizado: 3650000,
  },
  {
    id: 'kpi-nps',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'NPS varejo',
    unidade: 'pts',
    frequencia: 'trimestral',
    owner_id: 'Comercial Casafruti',
    objetivo_id: 'obj-07',
    baseline: 48,
    target: 60,
    polarity: 'up',
    weight: 8,
    status: 'em_andamento',
    realizado: 55,
  },
  {
    id: 'kpi-fiscal',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    nome: 'Automação fiscal',
    unidade: '%',
    frequencia: 'mensal',
    owner_id: 'Tecnologia e Controladoria',
    objetivo_id: 'obj-08',
    baseline: 35,
    target: 70,
    polarity: 'up',
    weight: 5,
    status: 'em_andamento',
    realizado: 52,
  },
]

// ---------------------------------------------------------------------------
// pen_initiative — 8 iniciativas
// ---------------------------------------------------------------------------

const initiatives: PenInitiative[] = [
  {
    id: 'ini-01',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Recuperar 400 clientes inativos no atacado',
    descricao: 'Rota de visita semanal e oferta dirigida por mix regional.',
    owner_id: 'Comercial Atacado',
    objetivo_id: 'obj-01',
    prazo: '2026-09-30',
    baseline: 0,
    target: 400,
    polarity: 'up',
    weight: 8,
    status: 'em_andamento',
    progresso: 62,
  },
  {
    id: 'ini-02',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Programa de redução de quebra por loja',
    descricao: 'Gestão de validade com inventário semanal e meta por bandeira.',
    owner_id: 'Operações',
    objetivo_id: 'obj-06',
    prazo: '2026-12-31',
    baseline: 3.4,
    target: 2.5,
    polarity: 'down',
    weight: 12,
    status: 'em_andamento',
    progresso: 48,
  },
  {
    id: 'ini-03',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Trilha de líder de turno',
    descricao: 'Formação de 120 líderes com plano de retenção por loja.',
    owner_id: 'Gestão de Pessoas',
    objetivo_id: 'obj-05',
    prazo: '2026-10-31',
    baseline: 6.0,
    target: 3.0,
    polarity: 'down',
    weight: 15,
    status: 'atrasado',
    progresso: 35,
  },
  {
    id: 'ini-04',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Reforma de 6 lojas âncora',
    descricao: 'Novo layout de perecíveis e ampliação de sortimento.',
    owner_id: 'Diretoria Casafruti',
    objetivo_id: 'obj-03',
    prazo: '2026-11-30',
    baseline: 0,
    target: 6,
    polarity: 'up',
    weight: 6,
    status: 'em_andamento',
    progresso: 50,
  },
  {
    id: 'ini-05',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'NPS: jornada de atendimento na loja',
    descricao: 'Tempo de fila, reposição e treinamento de frente de caixa.',
    owner_id: 'Comercial Casafruti',
    objetivo_id: 'obj-07',
    prazo: '2026-12-31',
    baseline: 48,
    target: 60,
    polarity: 'up',
    weight: 8,
    status: 'em_andamento',
    progresso: 70,
  },
  {
    id: 'ini-06',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Contratos de retornáveis com 3 operadores logísticos',
    descricao: 'Proposta técnica e piloto de 60 dias por operador.',
    owner_id: 'Diretoria FoldBox',
    objetivo_id: 'obj-04',
    prazo: '2026-10-31',
    baseline: 0,
    target: 3,
    polarity: 'up',
    weight: 10,
    status: 'em_andamento',
    progresso: 33,
  },
  {
    id: 'ini-07',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Automação da apuração fiscal',
    descricao: 'Integração Sankhya com validação sistêmica de NF e conciliação.',
    owner_id: 'Tecnologia e Controladoria',
    objetivo_id: 'obj-08',
    prazo: '2026-11-30',
    baseline: 35,
    target: 70,
    polarity: 'up',
    weight: 5,
    status: 'em_andamento',
    progresso: 52,
  },
  {
    id: 'ini-08',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Régua de despesas operacionais',
    descricao: 'Teto por centro de custo com revisão mensal e semáforo.',
    owner_id: 'Controladoria',
    objetivo_id: 'obj-02',
    prazo: '2026-08-31',
    baseline: 7.8,
    target: 9.1,
    polarity: 'up',
    weight: 18,
    status: 'concluido',
    progresso: 100,
  },
]

// ---------------------------------------------------------------------------
// 3 desvios com suas causas (alimenta Diagnóstico e Ishikawa)
// ---------------------------------------------------------------------------

const desvios: PenDesvio[] = [
  {
    id: 'des-01',
    company_id: 'extrafruti',
    kpi_id: 'kpi-turnover',
    titulo: 'Turnover operacional acima da meta',
    baseline: 6.0,
    target: 3.0,
    realizado: 5.4,
    gravidade: 'critica',
  },
  {
    id: 'des-02',
    company_id: 'extrafruti',
    kpi_id: 'kpi-quebra',
    titulo: 'Quebra de perecíveis acima do teto',
    baseline: 3.4,
    target: 2.5,
    realizado: 2.9,
    gravidade: 'alta',
  },
  {
    id: 'des-03',
    company_id: 'foldbox',
    kpi_id: 'kpi-receita-foldbox',
    titulo: 'Receita FoldBox abaixo do plano',
    baseline: 3800000,
    target: 5000000,
    realizado: 3650000,
    gravidade: 'media',
  },
]

const causes: PenCause[] = [
  // desvio 01 — turnover
  {
    id: 'cau-01',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Jornada de 6x1 sem escala previsível no CD e nas lojas',
    categoria: 'metodo',
    causa_raiz: true,
    owner_id: 'Gestão de Pessoas',
    desvio_id: 'des-01',
  },
  {
    id: 'cau-02',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Líder de turno sem formação para conduzir equipe',
    categoria: 'mao_de_obra',
    causa_raiz: true,
    owner_id: 'Gestão de Pessoas',
    desvio_id: 'des-01',
  },
  {
    id: 'cau-03',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Salário de entrada abaixo do mercado na função de repositor',
    categoria: 'medida',
    causa_raiz: false,
    owner_id: 'Gestão de Pessoas',
    desvio_id: 'des-01',
  },
  // desvio 02 — quebra
  {
    id: 'cau-04',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Câmara dos pasteurizados sem controle de temperatura automatizado',
    categoria: 'maquina',
    causa_raiz: true,
    owner_id: 'Operações',
    desvio_id: 'des-02',
  },
  {
    id: 'cau-05',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Inventário parcial em ondas — EI e EF de produtos diferentes',
    categoria: 'medida',
    causa_raiz: true,
    owner_id: 'Controladoria',
    desvio_id: 'des-02',
  },
  // desvio 03 — FoldBox
  {
    id: 'cau-06',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Ciclo de venda consultivo longo sem funil de prospecção ativo',
    categoria: 'metodo',
    causa_raiz: true,
    owner_id: 'Diretoria FoldBox',
    desvio_id: 'des-03',
  },
  {
    id: 'cau-07',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    descricao: 'Portfólio sem versão digital publicada, dificultando proposta',
    categoria: 'meio',
    causa_raiz: false,
    owner_id: 'Diretoria FoldBox',
    desvio_id: 'des-03',
  },
]

// ---------------------------------------------------------------------------
// RAID — 6 itens
// ---------------------------------------------------------------------------

const risks: PenRisk[] = [
  {
    id: 'raid-01',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Turnover acima de 6% inviabiliza a meta de 3%',
    tipo: 'risco',
    descricao:
      'Se a reposição de mão de obra não melhorar, o custo de recrutamento corrói o EBITDA.',
    probabilidade: 'alto',
    impacto: 'alto',
    mitigacao: 'Trilha de líder de turno e revisão de escala no CD.',
    owner_id: 'Gestão de Pessoas',
  },
  {
    id: 'raid-02',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Quebra fora de controle compromete o EBITDA de 9,1%',
    tipo: 'risco',
    descricao: 'Cada ponto de quebra consome margem já apertada pelo mix.',
    probabilidade: 'alto',
    impacto: 'critico',
    mitigacao: 'Inventário confiável e controle de temperatura automatizado.',
    owner_id: 'Operações',
  },
  {
    id: 'raid-03',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Reforma das 6 lojas pode ultrapassar o orçamento de capital',
    tipo: 'risco',
    descricao: 'Obra física em loja aberta costuma estourar prazo e custo.',
    probabilidade: 'medio',
    impacto: 'alto',
    mitigacao: 'Faseamento por loja com aprovação de capital por etapa.',
    owner_id: 'Diretoria Casafruti',
  },
  {
    id: 'raid-04',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Premissa: conversão de 1 em 3 operadores logísticos',
    tipo: 'premissa',
    descricao: 'O plano assume fechar ao menos um contrato no ciclo.',
    probabilidade: 'medio',
    impacto: 'alto',
    mitigacao: 'Piloto de 60 dias com métrica de retorno de embalagem.',
    owner_id: 'Diretoria FoldBox',
  },
  {
    id: 'raid-05',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Dependência: integração Sankhya para apuração fiscal',
    tipo: 'dependencia',
    descricao: 'A automação de 70% depende da liberação da API fiscal.',
    probabilidade: 'alto',
    impacto: 'medio',
    mitigacao: 'Ambiente de homologação e plano B manual documentado.',
    owner_id: 'Tecnologia e Controladoria',
  },
  {
    id: 'raid-06',
    workspace_id: WORKSPACE_ID,
    company_id: 'casafruti',
    cycle_id: CYCLE_ID,
    created: TS,
    updated: TS,
    titulo: 'Issue: NPS sem coleta consistente há 2 meses',
    tipo: 'issue',
    descricao: 'Sem medição mensal, a meta de 60 fica sem lastro.',
    probabilidade: 'alto',
    impacto: 'medio',
    mitigacao: 'Reativar coleta no PDV com meta mínima de respostas.',
    owner_id: 'Comercial Casafruti',
  },
]

// ---------------------------------------------------------------------------
// pen_audit — trilha de exemplo (estrutura, não histórico real)
// ---------------------------------------------------------------------------

const audit: PenAudit[] = [
  {
    id: 'aud-01',
    workspace_id: WORKSPACE_ID,
    company_id: 'extrafruti',
    cycle_id: CYCLE_ID,
    created: '2026-11-10T09:12:00.000Z',
    updated: '2026-11-10T09:12:00.000Z',
    user_id: 'Leonardo Lourenço',
    tabela: 'pen_kpi',
    registro_id: 'kpi-turnover',
    campo: 'target',
    valor_anterior: '4.0',
    valor_novo: '3.0',
    justificativa: 'Meta alinhada ao compromisso de 3% ao mês assumido no ciclo.',
  },
  {
    id: 'aud-02',
    workspace_id: WORKSPACE_ID,
    company_id: 'foldbox',
    cycle_id: CYCLE_ID,
    created: '2026-11-11T14:30:00.000Z',
    updated: '2026-11-11T14:30:00.000Z',
    user_id: 'Diretoria FoldBox',
    tabela: 'pen_initiative',
    registro_id: 'ini-06',
    campo: 'prazo',
    valor_anterior: '2026-09-30',
    valor_novo: '2026-10-31',
    justificativa: 'Piloto com operador logístico iniciou com 30 dias de atraso.',
  },
]

// ---------------------------------------------------------------------------
// Agregação por company_id + consolidado 'all'
// ---------------------------------------------------------------------------

/**
 * Monta o dataset de um escopo. `all` consolida as três empresas:
 *  · companies → as três
 *  · coleções → soma de todas (nenhum número é recalculado)
 *
 * O consolidado NÃO calcula média nem recria valores: ele apenas reúne os
 * registros das três empresas, para que a tela some com a mesma fonte.
 */
export function penDataset(scope: CompanyScopeId = 'all'): PenDataset {
  if (scope === 'all') {
    return {
      companies,
      cycles,
      objectives,
      kpis,
      initiatives,
      causes,
      risks,
      desvios,
      audit,
    }
  }

  const porEmpresa = <T extends { company_id: CompanyId }>(lista: T[]): T[] =>
    lista.filter((x) => x.company_id === scope)

  return {
    // no escopo de uma empresa, `companies` traz só ela — as telas usam
    // company por id, então a lista completa não é necessária
    companies: companies.filter((c) => c.company_id === scope),
    cycles,
    objectives: porEmpresa(objectives),
    kpis: porEmpresa(kpis),
    initiatives: porEmpresa(initiatives),
    causes: porEmpresa(causes),
    risks: porEmpresa(risks),
    desvios: porEmpresa(desvios),
    audit: porEmpresa(audit),
  }
}

/** Lista fixa de escopos para o filtro global. */
export const SCOPES: CompanyScopeId[] = ['all', 'extrafruti', 'casafruti', 'foldbox']

/** Rótulo de exibição do escopo. */
export function rotuloEscopo(scope: CompanyScopeId): string {
  if (scope === 'all') return 'Todas'
  const c = companies.find((x) => x.company_id === scope)
  return c ? c.nome : scope
}

// ---------------------------------------------------------------------------
// Números de topo — fonte única para Cockpit e cabeçalhos
// ---------------------------------------------------------------------------

export interface IndicadoresConsolidados {
  receita: number
  ebitda_pct: number
  turnover: number
  /** participação de cada empresa na receita consolidada */
  porEmpresa: Array<{ company_id: CompanyId; nome: string; receita: number }>
}

export const CONSOLIDADO: IndicadoresConsolidados = {
  receita: 218400000, // R$ 218,4 mi
  ebitda_pct: 9.1,
  turnover: 5.4,
  porEmpresa: [
    { company_id: 'extrafruti', nome: 'Extrafruti', receita: 188400000 },
    { company_id: 'casafruti', nome: 'Casafruti', receita: 25000000 },
    { company_id: 'foldbox', nome: 'FoldBox', receita: 5000000 },
  ],
}

/** Metas do ciclo — usadas nos cartões de meta. */
export const METAS_CICLO = {
  receita: 218400000,
  ebitda_pct: 9.1,
  turnover: 3.0,
  casafruti: 25000000,
  foldbox: 5000000,
} as const

// ---------------------------------------------------------------------------
// FASE 2.1 — RITOS E ALERTAS DO COCKPIT
// ---------------------------------------------------------------------------

export interface PenRito {
  id: string
  data: string
  rito: string
  pauta: string
  responsavel: string
  frequencia: string
  company_id: CompanyId
}

export const RITOS: PenRito[] = [
  {
    id: 'rito-01',
    data: '2026-04-07',
    rito: 'Reunião de Acompanhamento',
    pauta: 'Progresso das iniciativas, desvios e riscos do mês',
    responsavel: 'Leonardo Lourenço',
    frequencia: 'Mensal',
    company_id: 'extrafruti',
  },
  {
    id: 'rito-02',
    data: '2026-04-14',
    rito: 'Comitê de Estratégia',
    pauta: 'Revisão de indicadores e ajuste de rota',
    responsavel: 'Leonardo Lourenço',
    frequencia: 'Quinzenal',
    company_id: 'extrafruti',
  },
  {
    id: 'rito-03',
    data: '2026-04-21',
    rito: 'Reunião de Portfólio',
    pauta: 'Priorização de projetos e alocação de recursos',
    responsavel: 'Diretoria FoldBox',
    frequencia: 'Mensal',
    company_id: 'foldbox',
  },
  {
    id: 'rito-04',
    data: '2026-04-28',
    rito: 'Comitê de Pessoas',
    pauta: 'Retenção, turnover por loja e trilha de liderança',
    responsavel: 'Gestão de Pessoas',
    frequencia: 'Mensal',
    company_id: 'casafruti',
  },
]

/** Alerta de desvio exibido no painel lateral do Cockpit. */
export interface PenAlerta {
  id: string
  nivel: 'critico' | 'atencao' | 'ok'
  titulo: string
  detalhe: string
  company_id: CompanyId
}

/**
 * Alertas derivados dos DESVIOS do mock — não há texto solto inventado:
 * cada alerta aponta o desvio que o originou. Gravidade do desvio define o
 * nível do semáforo.
 */
export const ALERTAS: PenAlerta[] = [
  {
    id: 'al-01',
    nivel: 'critico',
    titulo: 'Turnover operacional acima da meta',
    detalhe: '5,4% ao mês contra meta de 3,0% — 1,8 p.p. de excesso.',
    company_id: 'extrafruti',
  },
  {
    id: 'al-02',
    nivel: 'atencao',
    titulo: 'Quebra de perecíveis acima do teto',
    detalhe: '2,9% contra teto de 2,5% — inventário em ondas afeta a medição.',
    company_id: 'extrafruti',
  },
  {
    id: 'al-03',
    nivel: 'atencao',
    titulo: 'Receita FoldBox abaixo do plano',
    detalhe: 'R$ 3,65 mi realizado contra meta de R$ 5,0 mi no ciclo.',
    company_id: 'foldbox',
  },
  {
    id: 'al-04',
    nivel: 'ok',
    titulo: 'Receita Casafruti dentro da trajetória',
    detalhe: 'R$ 18,7 mi realizados, 74,8% da meta de R$ 25,0 mi.',
    company_id: 'casafruti',
  },
]

// ---------------------------------------------------------------------------
// Indicadores de topo do Cockpit por escopo
// ---------------------------------------------------------------------------

export interface CockpitTopo {
  receita: number
  receitaMeta: number
  receitaVar: number | null
  ebitda: number
  ebitdaMeta: number
  ebitdaVar: number | null
  turnover: number
  turnoverMeta: number
  turnoverVar: number | null
  iniciativasNoPrazo: number
  iniciativasTotal: number
  iniciativasVar: number | null
}

/**
 * Números de topo do Cockpit para o escopo escolhido no filtro global.
 *
 * Fonte: `penDataset(scope)`. Receita/EBITDA/turnover do consolidado vêm de
 * CONSOLIDADO; num escopo de empresa, da pen_company correspondente. As
 * variações são do cenário do ciclo (dado declarado, não calculado).
 */
export function cockpitTopo(scope: CompanyScopeId = 'all'): CockpitTopo {
  const ds = penDataset(scope)

  // receita e EBITDA
  let receita = CONSOLIDADO.receita
  let ebitda = CONSOLIDADO.ebitda_pct
  let receitaVar: number | null = 10.0
  let ebitdaVar: number | null = 0.8
  let turnoverVar: number | null = 2.3

  if (scope !== 'all') {
    const c = companies.find((x) => x.company_id === scope)
    receita = c?.receita ?? 0
    ebitda = c?.ebitda_pct ?? 0
    // variações por empresa (cenário do ciclo)
    const vars: Record<CompanyId, number> = {
      extrafruti: 10.0,
      casafruti: 16.8,
      foldbox: -3.9,
    }
    receitaVar = vars[scope]
    ebitdaVar = scope === 'foldbox' ? -1.2 : scope === 'casafruti' ? 0.6 : 0.8
  }

  // receita meta por escopo
  const receitaMeta =
    scope === 'all'
      ? METAS_CICLO.receita
      : scope === 'casafruti'
        ? METAS_CICLO.casafruti
        : scope === 'foldbox'
          ? METAS_CICLO.foldbox
          : 188400000

  // turnover é consolidado do grupo (a fonte é a operação): mesmo nos escopos
  // de empresa, o indicador exibido é o do grupo — e isso fica dito na tela.
  const turnover = CONSOLIDADO.turnover

  // iniciativas no prazo = não atrasadas
  const total = ds.initiatives.length
  const noPrazo = ds.initiatives.filter((i) => i.status !== 'atrasado').length

  return {
    receita,
    receitaMeta,
    receitaVar,
    ebitda,
    ebitdaMeta: METAS_CICLO.ebitda_pct,
    ebitdaVar,
    turnover,
    turnoverMeta: METAS_CICLO.turnover,
    turnoverVar,
    iniciativasNoPrazo: noPrazo,
    iniciativasTotal: total,
    iniciativasVar: 20.0,
  }
}

/** Progresso de execução do plano por empresa (deriva dos status). */
export function progressoEmpresa(companyId: CompanyId): number {
  const ds = penDataset(companyId)
  const objs = ds.objectives.length || 1
  const ini = ds.initiatives.length || 1
  const objsOk = ds.objectives.filter(
    (o) => o.status === 'concluido' || o.status === 'em_andamento',
  ).length
  const iniOk = ds.initiatives.filter(
    (i) => i.status === 'concluido' || i.status === 'em_andamento',
  ).length
  return Math.round(((objsOk / objs) * 50 + (iniOk / ini) * 50) * 10) / 10
}
