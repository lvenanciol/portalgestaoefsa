export type CompanyId = 'extrafruti' | 'casafruti' | 'foldbox'

export interface CompanyInfo {
  id: CompanyId
  name: string
  color: string
  dotColor: string
}

export interface KPI {
  id: string
  label: string
  value: string
  numericValue: number
  unit?: string
  delta: string
  deltaType: 'positive' | 'negative'
  deltaLabel?: string
  iconName: 'dollar-sign' | 'chart-line' | 'percent' | 'alert-triangle' | 'clock' | 'users'
  description?: string
}

export interface MonthlyRevenue {
  month: string
  monthShort: string
  extrafruti: number
  casafruti: number
  foldbox: number
  total: number
}

export interface MarginPoint {
  month: string
  margem: number
}

export interface ExpenseSegment {
  name: string
  value: number
  percentage: number
  color: string
}

export interface CriticalAlert {
  id: string
  title: string
  description: string
  timeAgo: string
  severity: 'critical' | 'warning'
  company?: string
}

export interface Commitment {
  id: string
  day: string
  monthShort: string
  title: string
  company: string
  companyColor: string
}

export interface MockDataset {
  companies: CompanyInfo[]
  kpisByCompany: Record<CompanyId, KPI[]>
  monthlyRevenues: MonthlyRevenue[]
  marginSeries: MarginPoint[]
  expenseComposition: ExpenseSegment[]
  criticalAlerts: CriticalAlert[]
  commitments: Commitment[]
}

export const COMPANIES: CompanyInfo[] = [
  { id: 'extrafruti', name: 'Extrafruti', color: '#1B5E20', dotColor: 'bg-[#1B5E20]' },
  { id: 'casafruti', name: 'Casafruti', color: '#0F3D13', dotColor: 'bg-[#0F3D13]' },
  { id: 'foldbox', name: 'FoldBox', color: '#F59E0B', dotColor: 'bg-[#F59E0B]' },
]

export const MOCK_DATA: MockDataset = {
  companies: COMPANIES,
  kpisByCompany: {
    extrafruti: [
      {
        id: 'fat-ytd',
        label: 'FATURAMENTO YTD',
        value: 'R$ 48,2M',
        numericValue: 48.2,
        delta: '+12,4%',
        deltaType: 'positive',
        iconName: 'dollar-sign',
        description: 'vs. mesmo período do ano anterior',
      },
      {
        id: 'ebitda',
        label: 'EBITDA',
        value: 'R$ 6,8M',
        numericValue: 6.8,
        delta: '+8,1%',
        deltaType: 'positive',
        iconName: 'chart-line',
        description: 'Margem EBITDA de 14,1%',
      },
      {
        id: 'margem-bruta',
        label: 'MARGEM BRUTA',
        value: '32,5%',
        numericValue: 32.5,
        delta: '+1,2 p.p.',
        deltaType: 'positive',
        iconName: 'percent',
        description: 'Alvo orçamentário: 31,8%',
      },
      {
        id: 'recebivel-vencido',
        label: 'RECEBÍVEL VENCIDO',
        value: 'R$ 1,4M',
        numericValue: 1.4,
        delta: '+6,3%',
        deltaType: 'negative',
        iconName: 'alert-triangle',
        description: 'Inadimplência líquida de 2,9%',
      },
      {
        id: 'pagar-30d',
        label: 'PAGAR 30D',
        value: 'R$ 2,1M',
        numericValue: 2.1,
        delta: '-3,1%',
        deltaType: 'positive',
        iconName: 'clock',
        description: 'Redução de passivo circulante',
      },
      {
        id: 'turnover',
        label: 'TURNOVER',
        value: '4,8%',
        numericValue: 4.8,
        delta: '-0,5 p.p.',
        deltaType: 'positive',
        iconName: 'users',
        description: 'Rotatividade no centro de distribuição',
      },
    ],
    casafruti: [
      {
        id: 'fat-ytd',
        label: 'FATURAMENTO YTD',
        value: 'R$ 29,4M',
        numericValue: 29.4,
        delta: '+9,6%',
        deltaType: 'positive',
        iconName: 'dollar-sign',
        description: 'vs. mesmo período do ano anterior',
      },
      {
        id: 'ebitda',
        label: 'EBITDA',
        value: 'R$ 4,1M',
        numericValue: 4.1,
        delta: '+6,4%',
        deltaType: 'positive',
        iconName: 'chart-line',
        description: 'Margem EBITDA de 13,9%',
      },
      {
        id: 'margem-bruta',
        label: 'MARGEM BRUTA',
        value: '34,1%',
        numericValue: 34.1,
        delta: '+0,8 p.p.',
        deltaType: 'positive',
        iconName: 'percent',
        description: 'Alvo orçamentário: 33,5%',
      },
      {
        id: 'recebivel-vencido',
        label: 'RECEBÍVEL VENCIDO',
        value: 'R$ 820K',
        numericValue: 0.82,
        delta: '+4,1%',
        deltaType: 'negative',
        iconName: 'alert-triangle',
        description: 'Inadimplência líquida de 2,7%',
      },
      {
        id: 'pagar-30d',
        label: 'PAGAR 30D',
        value: 'R$ 1,3M',
        numericValue: 1.3,
        delta: '-2,4%',
        deltaType: 'positive',
        iconName: 'clock',
        description: 'Fluxo fornecedores hortifrúti',
      },
      {
        id: 'turnover',
        label: 'TURNOVER',
        value: '5,2%',
        numericValue: 5.2,
        delta: '-0,3 p.p.',
        deltaType: 'positive',
        iconName: 'users',
        description: 'Rotatividade equipes de loja',
      },
    ],
    foldbox: [
      {
        id: 'fat-ytd',
        label: 'FATURAMENTO YTD',
        value: 'R$ 16,8M',
        numericValue: 16.8,
        delta: '+15,2%',
        deltaType: 'positive',
        iconName: 'dollar-sign',
        description: 'vs. mesmo período do ano anterior',
      },
      {
        id: 'ebitda',
        label: 'EBITDA',
        value: 'R$ 2,4M',
        numericValue: 2.4,
        delta: '+11,8%',
        deltaType: 'positive',
        iconName: 'chart-line',
        description: 'Margem EBITDA de 14,3%',
      },
      {
        id: 'margem-bruta',
        label: 'MARGEM BRUTA',
        value: '31,2%',
        numericValue: 31.2,
        delta: '+1,6 p.p.',
        deltaType: 'positive',
        iconName: 'percent',
        description: 'Alvo orçamentário: 30,0%',
      },
      {
        id: 'recebivel-vencido',
        label: 'RECEBÍVEL VENCIDO',
        value: 'R$ 490K',
        numericValue: 0.49,
        delta: '+2,8%',
        deltaType: 'negative',
        iconName: 'alert-triangle',
        description: 'Inadimplência líquida de 2,9%',
      },
      {
        id: 'pagar-30d',
        label: 'PAGAR 30D',
        value: 'R$ 780K',
        numericValue: 0.78,
        delta: '-4,2%',
        deltaType: 'positive',
        iconName: 'clock',
        description: 'Matéria-prima e embalagens',
      },
      {
        id: 'turnover',
        label: 'TURNOVER',
        value: '3,9%',
        numericValue: 3.9,
        delta: '-0,8 p.p.',
        deltaType: 'positive',
        iconName: 'users',
        description: 'Rotatividade na manufatura',
      },
    ],
  },
  monthlyRevenues: [
    {
      month: 'Janeiro',
      monthShort: 'Jan',
      extrafruti: 3.8,
      casafruti: 2.3,
      foldbox: 1.3,
      total: 7.4,
    },
    {
      month: 'Fevereiro',
      monthShort: 'Fev',
      extrafruti: 3.7,
      casafruti: 2.2,
      foldbox: 1.2,
      total: 7.1,
    },
    {
      month: 'Março',
      monthShort: 'Mar',
      extrafruti: 3.9,
      casafruti: 2.4,
      foldbox: 1.3,
      total: 7.6,
    },
    {
      month: 'Abril',
      monthShort: 'Abr',
      extrafruti: 4.0,
      casafruti: 2.4,
      foldbox: 1.4,
      total: 7.8,
    },
    { month: 'Maio', monthShort: 'Mai', extrafruti: 4.1, casafruti: 2.5, foldbox: 1.4, total: 8.0 },
    {
      month: 'Junho',
      monthShort: 'Jun',
      extrafruti: 3.9,
      casafruti: 2.4,
      foldbox: 1.3,
      total: 7.6,
    },
    {
      month: 'Julho',
      monthShort: 'Jul',
      extrafruti: 4.2,
      casafruti: 2.5,
      foldbox: 1.5,
      total: 8.2,
    },
    {
      month: 'Agosto',
      monthShort: 'Ago',
      extrafruti: 4.3,
      casafruti: 2.6,
      foldbox: 1.5,
      total: 8.4,
    },
    {
      month: 'Setembro',
      monthShort: 'Set',
      extrafruti: 4.0,
      casafruti: 2.5,
      foldbox: 1.4,
      total: 7.9,
    },
    {
      month: 'Outubro',
      monthShort: 'Out',
      extrafruti: 4.4,
      casafruti: 2.7,
      foldbox: 1.6,
      total: 8.7,
    },
    {
      month: 'Novembro',
      monthShort: 'Nov',
      extrafruti: 4.6,
      casafruti: 2.8,
      foldbox: 1.7,
      total: 9.1,
    },
    {
      month: 'Dezembro',
      monthShort: 'Dez',
      extrafruti: 5.1,
      casafruti: 3.1,
      foldbox: 1.9,
      total: 10.1,
    },
  ],
  marginSeries: [
    { month: 'Jan', margem: 31.4 },
    { month: 'Fev', margem: 31.8 },
    { month: 'Mar', margem: 32.0 },
    { month: 'Abr', margem: 31.9 },
    { month: 'Mai', margem: 32.2 },
    { month: 'Jun', margem: 32.5 },
    { month: 'Jul', margem: 32.3 },
    { month: 'Ago', margem: 32.7 },
    { month: 'Set', margem: 32.4 },
    { month: 'Out', margem: 32.9 },
    { month: 'Nov', margem: 33.1 },
    { month: 'Dez', margem: 32.5 },
  ],
  expenseComposition: [
    { name: 'Custo de Mercadorias', value: 54, percentage: 54, color: '#1B5E20' },
    { name: 'Logística & Frete', value: 18, percentage: 18, color: '#F59E0B' },
    { name: 'Folha de Pagamento', value: 20, percentage: 20, color: '#0F3D13' },
    { name: 'Outras Despesas Op.', value: 8, percentage: 8, color: '#D1D5DB' },
  ],
  criticalAlerts: [
    {
      id: 'alt-1',
      title: 'Inadimplência Rede Super Sul',
      description: 'Duplicata de R$ 340k vencida há mais de 15 dias com pedido de prorrogação.',
      timeAgo: 'há 2h',
      severity: 'critical',
      company: 'Extrafruti',
    },
    {
      id: 'alt-2',
      title: 'Atraso Frete Refrigerado ES-RJ',
      description: 'Carga de perecíveis retida por manutenção mecânica na BR-101.',
      timeAgo: 'há 4h',
      severity: 'critical',
      company: 'Logística',
    },
    {
      id: 'alt-3',
      title: 'Divergência Contábil FoldBox',
      description: 'Conciliação de inventário de embalagens kraft com desvio de 3,2%.',
      timeAgo: 'há 6h',
      severity: 'warning',
      company: 'FoldBox',
    },
  ],
  commitments: [
    {
      id: 'com-1',
      day: '12',
      monthShort: 'fev',
      title: 'Comitê Financeiro Extrafruti — Fechamento Mensal',
      company: 'Extrafruti',
      companyColor: '#1B5E20',
    },
    {
      id: 'com-2',
      day: '15',
      monthShort: 'fev',
      title: 'Renegociação de Fornecedores de Hortifrúti',
      company: 'Casafruti',
      companyColor: '#0F3D13',
    },
    {
      id: 'com-3',
      day: '18',
      monthShort: 'fev',
      title: 'Auditoria de Estoque & Linha Cartonagem',
      company: 'FoldBox',
      companyColor: '#F59E0B',
    },
    {
      id: 'com-4',
      day: '22',
      monthShort: 'fev',
      title: 'Reunião de Diretoria Executiva do Grupo',
      company: 'Grupo',
      companyColor: '#1B5E20',
    },
  ],
}
