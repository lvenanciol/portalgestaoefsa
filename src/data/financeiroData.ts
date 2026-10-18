import { CompanyId } from './mockData'

// Fase 4 — Financeiro & Contábil: dados mock tipados (fonte única para
// DRE, Fluxo de Caixa, A/P & A/R, Balancete e Checklist de Fechamento).
// Sem Sankhya na Fase 4 (integração via proxy na Fase 5).

export type ModuloFinanceiro = 'dre' | 'fluxo' | 'ap_ar' | 'balancete' | 'fechamento'

export const MESES_12: { key: string; label: string; short: string; ano: number }[] = [
  { key: 'nov25', label: 'Novembro', short: 'Nov', ano: 2025 },
  { key: 'dez25', label: 'Dezembro', short: 'Dez', ano: 2025 },
  { key: 'jan26', label: 'Janeiro', short: 'Jan', ano: 2026 },
  { key: 'fev26', label: 'Fevereiro', short: 'Fev', ano: 2026 },
  { key: 'mar26', label: 'Março', short: 'Mar', ano: 2026 },
  { key: 'abr26', label: 'Abril', short: 'Abr', ano: 2026 },
  { key: 'mai26', label: 'Maio', short: 'Mai', ano: 2026 },
  { key: 'jun26', label: 'Junho', short: 'Jun', ano: 2026 },
  { key: 'jul26', label: 'Julho', short: 'Jul', ano: 2026 },
  { key: 'ago26', label: 'Agosto', short: 'Ago', ano: 2026 },
  { key: 'set26', label: 'Setembro', short: 'Set', ano: 2026 },
  { key: 'out26', label: 'Outubro', short: 'Out', ano: 2026 },
]

// ---------- DRE ----------
export interface DreLinha {
  nivel: 1 | 2
  conta: string
  label: string
  valores: number[] // R$ mil por mês (12)
}

export const DRE_LINHAS: DreLinha[] = [
  {
    nivel: 1,
    conta: '1',
    label: 'RECEITA OPERACIONAL BRUTA',
    valores: [15400, 16800, 14000, 13100, 14900, 14500, 15400, 15900, 16500, 16900, 19300, 19100],
  },
  {
    nivel: 2,
    conta: '1.1',
    label: 'Deduções da receita',
    valores: [-1240, -1350, -1130, -1060, -1200, -1170, -1240, -1280, -1330, -1370, -1560, -1540],
  },
  {
    nivel: 2,
    conta: '1.2',
    label: 'Receita líquida',
    valores: [14160, 15450, 12870, 12040, 13700, 13330, 14160, 14620, 15170, 15530, 17740, 17560],
  },
  {
    nivel: 2,
    conta: '2',
    label: 'CMV',
    valores: [
      -10840, -11830, -9850, -9220, -10500, -10210, -10840, -11200, -11620, -11890, -13580, -13450,
    ],
  },
  {
    nivel: 1,
    conta: '3',
    label: 'LUCRO BRUTO',
    valores: [3320, 3620, 3020, 2820, 3200, 3120, 3320, 3420, 3550, 3640, 4160, 4110],
  },
  {
    nivel: 2,
    conta: '4',
    label: 'Despesas com vendas',
    valores: [-820, -890, -740, -690, -790, -770, -820, -850, -880, -900, -1030, -1020],
  },
  {
    nivel: 2,
    conta: '5',
    label: 'Despesas administrativas',
    valores: [-560, -610, -510, -470, -540, -530, -560, -580, -600, -610, -700, -690],
  },
  {
    nivel: 2,
    conta: '6',
    label: 'Despesas logísticas',
    valores: [-940, -1020, -850, -790, -900, -880, -940, -970, -1010, -1030, -1180, -1160],
  },
  {
    nivel: 1,
    conta: '7',
    label: 'EBITDA',
    valores: [1000, 1100, 920, 870, 970, 940, 1000, 1020, 1060, 1100, 1250, 1240],
  },
  {
    nivel: 2,
    conta: '8',
    label: 'Depreciações e amortizações',
    valores: [-180, -180, -180, -180, -180, -180, -180, -180, -180, -180, -180, -180],
  },
  {
    nivel: 1,
    conta: '9',
    label: 'LAIR',
    valores: [820, 920, 740, 690, 790, 760, 820, 840, 880, 920, 1070, 1060],
  },
  {
    nivel: 2,
    conta: '10',
    label: 'Provisão IR/CSLL (34%)',
    valores: [-279, -313, -252, -235, -269, -258, -279, -286, -299, -313, -364, -360],
  },
  {
    nivel: 1,
    conta: '11',
    label: 'LUCRO LÍQUIDO',
    valores: [541, 607, 488, 455, 521, 502, 541, 554, 581, 607, 706, 700],
  },
]

// ---------- FLUXO DE CAIXA ----------
export interface FluxoMes {
  key: string
  label: string
  entradas: number // R$ mil
  saidas: number // R$ mil (valor positivo)
  saldoInicial: number // R$ mil (calculado)
}

const FLUXO_BASE: { key: string; label: string; entradas: number; saidas: number }[] = [
  { key: 'nov25', label: 'Nov/25', entradas: 14200, saidas: 13580 },
  { key: 'dez25', label: 'Dez/25', entradas: 15600, saidas: 14700 },
  { key: 'jan26', label: 'Jan/26', entradas: 13100, saidas: 12800 },
  { key: 'fev26', label: 'Fev/26', entradas: 12200, saidas: 12100 },
  { key: 'mar26', label: 'Mar/26', entradas: 13600, saidas: 13000 },
  { key: 'abr26', label: 'Abr/26', entradas: 13400, saidas: 12900 },
  { key: 'mai26', label: 'Mai/26', entradas: 14100, saidas: 13400 },
  { key: 'jun26', label: 'Jun/26', entradas: 14600, saidas: 13700 },
  { key: 'jul26', label: 'Jul/26', entradas: 15200, saidas: 14300 },
  { key: 'ago26', label: 'Ago/26', entradas: 15700, saidas: 14800 },
  { key: 'set26', label: 'Set/26', entradas: 18100, saidas: 16600 },
  { key: 'out26', label: 'Out/26', entradas: 17800, saidas: 16300 },
]

// saldo inicial de nov/25 = 4200; saldoFinal = saldoInicial + entradas - saidas
export const FLUXO_12: FluxoMes[] = (() => {
  let saldo = 4200
  return FLUXO_BASE.map((m) => {
    const saldoInicial = saldo
    saldo = saldoInicial + m.entradas - m.saidas
    return { ...m, saldoInicial }
  })
})()

// ---------- CONTAS A PAGAR ----------
export interface TituloAP {
  id: string
  fornecedor: string
  documento: string
  categoria:
    | 'Insumos'
    | 'Logística'
    | 'Pessoal'
    | 'Embalagens'
    | 'Energia'
    | 'Serviços'
    | 'Impostos'
  empresa: CompanyId
  emissao: string // ISO
  vencimento: string // ISO
  valor: number // R$
  status: 'aberto' | 'pago'
  pagoEm?: string
}

export const TITULOS_AP: TituloAP[] = [
  {
    id: 'ap-1',
    fornecedor: 'Frigorífico Vale Verde',
    documento: 'NF 88412',
    categoria: 'Insumos',
    empresa: 'extrafruti',
    emissao: '2026-10-02',
    vencimento: '2026-11-01',
    valor: 428000,
    status: 'aberto',
  },
  {
    id: 'ap-2',
    fornecedor: 'Logística Norte',
    documento: 'NF 2210',
    categoria: 'Logística',
    empresa: 'extrafruti',
    emissao: '2026-10-05',
    vencimento: '2026-10-24',
    valor: 186400,
    status: 'aberto',
  },
  {
    id: 'ap-3',
    fornecedor: 'Embalagens Sul',
    documento: 'NF 5517',
    categoria: 'Embalagens',
    empresa: 'foldbox',
    emissao: '2026-10-08',
    vencimento: '2026-11-07',
    valor: 97300,
    status: 'aberto',
  },
  {
    id: 'ap-4',
    fornecedor: 'Casafruti Distribuição',
    documento: 'NF 3312',
    categoria: 'Insumos',
    empresa: 'casafruti',
    emissao: '2026-10-10',
    vencimento: '2026-10-28',
    valor: 154200,
    status: 'aberto',
  },
  {
    id: 'ap-5',
    fornecedor: 'Energia ES',
    documento: 'Fatura 10/26',
    categoria: 'Energia',
    empresa: 'extrafruti',
    emissao: '2026-10-01',
    vencimento: '2026-10-15',
    valor: 62800,
    status: 'aberto',
  },
  {
    id: 'ap-6',
    fornecedor: 'Receita Federal',
    documento: 'DARF 1980',
    categoria: 'Impostos',
    empresa: 'extrafruti',
    emissao: '2026-10-10',
    vencimento: '2026-10-20',
    valor: 214900,
    status: 'aberto',
  },
  {
    id: 'ap-7',
    fornecedor: 'Folha de Pagamento Out/26',
    documento: 'FOLHA-OUT',
    categoria: 'Pessoal',
    empresa: 'extrafruti',
    emissao: '2026-10-05',
    vencimento: '2026-10-30',
    valor: 896000,
    status: 'aberto',
  },
  {
    id: 'ap-8',
    fornecedor: 'Serviços TI Cloud',
    documento: 'NF 908',
    categoria: 'Serviços',
    empresa: 'foldbox',
    emissao: '2026-09-28',
    vencimento: '2026-10-12',
    valor: 31500,
    status: 'pago',
    pagoEm: '2026-10-11',
  },
  {
    id: 'ap-9',
    fornecedor: 'Fretes Express',
    documento: 'CT-e 7741',
    categoria: 'Logística',
    empresa: 'casafruti',
    emissao: '2026-09-20',
    vencimento: '2026-10-04',
    valor: 42800,
    status: 'pago',
    pagoEm: '2026-10-03',
  },
  {
    id: 'ap-10',
    fornecedor: 'Insumos Tropicais',
    documento: 'NF 6120',
    categoria: 'Insumos',
    empresa: 'extrafruti',
    emissao: '2026-08-15',
    vencimento: '2026-09-14',
    valor: 132700,
    status: 'aberto',
  },
  {
    id: 'ap-11',
    fornecedor: 'Manutenção Frota',
    documento: 'NF 445',
    categoria: 'Serviços',
    empresa: 'extrafruti',
    emissao: '2026-07-30',
    vencimento: '2026-08-29',
    valor: 58900,
    status: 'aberto',
  },
  {
    id: 'ap-12',
    fornecedor: 'Aluguel CD Serra',
    documento: 'CT 2026-10',
    categoria: 'Logística',
    empresa: 'extrafruti',
    emissao: '2026-10-01',
    vencimento: '2026-10-10',
    valor: 240000,
    status: 'aberto',
  },
]

// ---------- CONTAS A RECEBER ----------
export interface TituloAR {
  id: string
  cliente: string
  documento: string
  empresa: CompanyId
  emissao: string
  vencimento: string
  valor: number
  status: 'aberto' | 'recebido'
  recebidoEm?: string
}

export const TITULOS_AR: TituloAR[] = [
  {
    id: 'ar-1',
    cliente: 'Rede Supermercados BH',
    documento: 'NF 15220',
    empresa: 'extrafruti',
    emissao: '2026-10-06',
    vencimento: '2026-11-05',
    valor: 612400,
    status: 'aberto',
  },
  {
    id: 'ar-2',
    cliente: 'Atacado Frutas Centro',
    documento: 'NF 15221',
    empresa: 'extrafruti',
    emissao: '2026-10-08',
    vencimento: '2026-10-29',
    valor: 388600,
    status: 'aberto',
  },
  {
    id: 'ar-3',
    cliente: 'Varejo Fresh Market',
    documento: 'NF 15222',
    empresa: 'extrafruti',
    emissao: '2026-10-12',
    vencimento: '2026-11-11',
    valor: 204900,
    status: 'aberto',
  },
  {
    id: 'ar-4',
    cliente: 'Distribuidora Capixaba',
    documento: 'NF 15223',
    empresa: 'extrafruti',
    emissao: '2026-10-14',
    vencimento: '2026-11-13',
    valor: 176300,
    status: 'aberto',
  },
  {
    id: 'ar-5',
    cliente: 'Rede Atacadista PR',
    documento: 'NF 15224',
    empresa: 'extrafruti',
    emissao: '2026-09-25',
    vencimento: '2026-10-25',
    valor: 295800,
    status: 'aberto',
  },
  {
    id: 'ar-6',
    cliente: 'Hortifruti Online',
    documento: 'NF 15225',
    empresa: 'casafruti',
    emissao: '2026-10-10',
    vencimento: '2026-11-09',
    valor: 88400,
    status: 'aberto',
  },
  {
    id: 'ar-7',
    cliente: 'Empório Serra',
    documento: 'NF 15226',
    empresa: 'casafruti',
    emissao: '2026-10-01',
    vencimento: '2026-10-31',
    valor: 62100,
    status: 'aberto',
  },
  {
    id: 'ar-8',
    cliente: 'Lojas FoldBox BR',
    documento: 'NF 15227',
    empresa: 'foldbox',
    emissao: '2026-10-09',
    vencimento: '2026-11-08',
    valor: 142500,
    status: 'aberto',
  },
  {
    id: 'ar-9',
    cliente: 'Rede Supermercados BH',
    documento: 'NF 15180',
    empresa: 'extrafruti',
    emissao: '2026-09-02',
    vencimento: '2026-10-02',
    valor: 542000,
    status: 'recebido',
    recebidoEm: '2026-10-02',
  },
  {
    id: 'ar-10',
    cliente: 'Atacado Frutas Centro',
    documento: 'NF 15181',
    empresa: 'extrafruti',
    emissao: '2026-08-28',
    vencimento: '2026-09-27',
    valor: 318400,
    status: 'aberto',
  },
  {
    id: 'ar-11',
    cliente: 'Varejo Fresh Market',
    documento: 'NF 15182',
    empresa: 'extrafruti',
    emissao: '2026-08-10',
    vencimento: '2026-09-09',
    valor: 261900,
    status: 'aberto',
  },
  {
    id: 'ar-12',
    cliente: 'Distribuidora Capixaba',
    documento: 'NF 15183',
    empresa: 'extrafruti',
    emissao: '2026-08-05',
    vencimento: '2026-09-04',
    valor: 154700,
    status: 'aberto',
  },
]

// ---------- BALANCETE ----------
export interface BalanceteLinha {
  conta: string
  nome: string
  saldoAnterior: number
  debitos: number
  creditos: number
  saldoAtual: number
}

export const BALANCETE_OUT26: BalanceteLinha[] = [
  {
    conta: '1',
    nome: 'ATIVO',
    saldoAnterior: 2412000,
    debitos: 896000,
    creditos: 0,
    saldoAtual: 3308000,
  },
  {
    conta: '1.1',
    nome: 'Ativo Circulante',
    saldoAnterior: 1620000,
    debitos: 612000,
    creditos: 0,
    saldoAtual: 2232000,
  },
  {
    conta: '1.1.01',
    nome: 'Caixa e Equivalentes',
    saldoAnterior: 842000,
    debitos: 0,
    creditos: 0,
    saldoAtual: 842000,
  },
  {
    conta: '1.1.02',
    nome: 'Contas a Receber',
    saldoAnterior: 980000,
    debitos: 612000,
    creditos: 0,
    saldoAtual: 1592000,
  },
  {
    conta: '1.1.03',
    nome: 'Estoques',
    saldoAnterior: 612000,
    debitos: 0,
    creditos: 0,
    saldoAtual: 612000,
  },
  {
    conta: '1.2',
    nome: 'Ativo Não Circulante',
    saldoAnterior: 792000,
    debitos: 284000,
    creditos: 0,
    saldoAtual: 1076000,
  },
  {
    conta: '1.2.01',
    nome: 'Imobilizado',
    saldoAnterior: 792000,
    debitos: 284000,
    creditos: 0,
    saldoAtual: 1076000,
  },
  {
    conta: '2',
    nome: 'PASSIVO',
    saldoAnterior: 1486000,
    debitos: 0,
    creditos: 612000,
    saldoAtual: 2098000,
  },
  {
    conta: '2.1',
    nome: 'Passivo Circulante',
    saldoAnterior: 920000,
    debitos: 0,
    creditos: 612000,
    saldoAtual: 1532000,
  },
  {
    conta: '2.1.01',
    nome: 'Fornecedores',
    saldoAnterior: 612000,
    debitos: 0,
    creditos: 428000,
    saldoAtual: 1040000,
  },
  {
    conta: '2.1.02',
    nome: 'Obrigações Trabalhistas',
    saldoAnterior: 308000,
    debitos: 0,
    creditos: 184000,
    saldoAtual: 492000,
  },
  {
    conta: '2.2',
    nome: 'Passivo Não Circulante',
    saldoAnterior: 566000,
    debitos: 0,
    creditos: 0,
    saldoAtual: 566000,
  },
  {
    conta: '2.2.01',
    nome: 'Empréstimos LP',
    saldoAnterior: 566000,
    debitos: 0,
    creditos: 0,
    saldoAtual: 566000,
  },
  {
    conta: '3',
    nome: 'PATRIMÔNIO LÍQUIDO',
    saldoAnterior: 926000,
    debitos: 0,
    creditos: 284000,
    saldoAtual: 1210000,
  },
  {
    conta: '3.1',
    nome: 'Capital Social',
    saldoAnterior: 700000,
    debitos: 0,
    creditos: 0,
    saldoAtual: 700000,
  },
  {
    conta: '3.2',
    nome: 'Lucros Acumulados',
    saldoAnterior: 226000,
    debitos: 0,
    creditos: 284000,
    saldoAtual: 510000,
  },
]

// ---------- CHECKLIST DE FECHAMENTO ----------
export interface ChecklistItem {
  id: string
  ordem: number
  tarefa: string
  responsavel: string
  prazoDia: number // dia do mês de fechamento
  status: 'pendente' | 'em_andamento' | 'concluido' | 'bloqueado'
}

export const CHECKLIST_FECHAMENTO: ChecklistItem[] = [
  {
    id: 'ck-1',
    ordem: 1,
    tarefa: 'Conciliação bancária',
    responsavel: 'Financeiro',
    prazoDia: 3,
    status: 'concluido',
  },
  {
    id: 'ck-2',
    ordem: 2,
    tarefa: 'Conciliação de contas a pagar/receber',
    responsavel: 'Financeiro',
    prazoDia: 4,
    status: 'concluido',
  },
  {
    id: 'ck-3',
    ordem: 3,
    tarefa: 'Provisões (férias, 13º, encargos)',
    responsavel: 'RH',
    prazoDia: 5,
    status: 'em_andamento',
  },
  {
    id: 'ck-4',
    ordem: 4,
    tarefa: 'Depreciações e amortizações',
    responsavel: 'Contabilidade',
    prazoDia: 6,
    status: 'pendente',
  },
  {
    id: 'ck-5',
    ordem: 5,
    tarefa: 'Apropriação de custos por unidade',
    responsavel: 'Contabilidade',
    prazoDia: 6,
    status: 'em_andamento',
  },
  {
    id: 'ck-6',
    ordem: 6,
    tarefa: 'Conferência de estoques',
    responsavel: 'Operações',
    prazoDia: 7,
    status: 'bloqueado',
  },
  {
    id: 'ck-7',
    ordem: 7,
    tarefa: 'Provisão de impostos',
    responsavel: 'Fiscal',
    prazoDia: 8,
    status: 'pendente',
  },
  {
    id: 'ck-8',
    ordem: 8,
    tarefa: 'Revisão da DRE gerencial',
    responsavel: 'Controladoria',
    prazoDia: 9,
    status: 'pendente',
  },
  {
    id: 'ck-9',
    ordem: 9,
    tarefa: 'Aprovação do fechamento (diretoria)',
    responsavel: 'Diretoria',
    prazoDia: 10,
    status: 'pendente',
  },
  {
    id: 'ck-10',
    ordem: 10,
    tarefa: 'Publicação do relatório',
    responsavel: 'Controladoria',
    prazoDia: 10,
    status: 'pendente',
  },
]
