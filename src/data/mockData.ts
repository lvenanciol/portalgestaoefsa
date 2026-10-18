export type CompanyId = 'extrafruti' | 'casafruti' | 'foldbox'

export interface CompanyInfo {
  id: CompanyId
  name: string
  color: string
}

export interface KPI {
  id: string
  label: string
  value: string
  numericValue: number
  delta: string
  deltaType: 'positive' | 'negative'
  iconName: 'dollar-sign' | 'chart-line' | 'percent' | 'alert-triangle' | 'clock' | 'users'
}

export interface MonthlyRevenue {
  month: string
  monthShort: string
  extrafruti: number
  casafruti: number
}

export interface MarginPoint {
  month: string
  extrafruti: number
  casafruti: number
}

export interface ExpenseSegment {
  name: string
  value: number
  percentage: number
  color: string
}

export interface UnitRevenue {
  name: string
  value: number
}

export interface CriticalAlert {
  id: string
  title: string
  description: string
  detail: string
  severity: 'critical' | 'warning'
}

export interface Commitment {
  id: string
  day: string
  monthShort: string
  title: string
  time: string
  location: string
}

export interface MockDataset {
  companies: CompanyInfo[]
  kpis: KPI[]
  monthlyRevenues: MonthlyRevenue[]
  marginSeries: MarginPoint[]
  expenseComposition: ExpenseSegment[]
  expenseTotal: string
  topUnits: UnitRevenue[]
  criticalAlerts: CriticalAlert[]
  commitments: Commitment[]
}

export const COMPANIES: CompanyInfo[] = [
  { id: 'extrafruti', name: 'Extrafruti', color: '#1B5E20' },
  { id: 'casafruti', name: 'Casafruti', color: '#F59E0B' },
  { id: 'foldbox', name: 'FoldBox', color: '#0F3D13' },
]

// SPEC mockup (fonte única): valores exatos
export const MOCK_DATA: MockDataset = {
  companies: COMPANIES,
  kpis: [
    {
      id: 'fat-ytd',
      label: 'FATURAMENTO YTD',
      value: 'R$ 187,4M',
      numericValue: 187.4,
      delta: '12,3%',
      deltaType: 'positive',
      iconName: 'dollar-sign',
    },
    {
      id: 'ebitda',
      label: 'EBITDA',
      value: 'R$ 21,6M',
      numericValue: 21.6,
      delta: '8,1%',
      deltaType: 'positive',
      iconName: 'chart-line',
    },
    {
      id: 'margem-bruta',
      label: 'MARGEM BRUTA',
      value: '23,4%',
      numericValue: 23.4,
      delta: '0,6 p.p.',
      deltaType: 'positive',
      iconName: 'percent',
    },
    {
      id: 'recebivel-vencido',
      label: 'RECEBÍVEL VENCIDO',
      value: 'R$ 8,2M',
      numericValue: 8.2,
      delta: '',
      deltaType: 'negative',
      iconName: 'alert-triangle',
    },
    {
      id: 'pagar-30d',
      label: 'PAGAR 30D',
      value: 'R$ 12,7M',
      numericValue: 12.7,
      delta: '',
      deltaType: 'negative',
      iconName: 'clock',
    },
    {
      id: 'turnover',
      label: 'TURNOVER MÊS',
      value: '4,2%',
      numericValue: 4.2,
      delta: '',
      deltaType: 'negative',
      iconName: 'users',
    },
  ],
  monthlyRevenues: [
    { month: 'Novembro', monthShort: 'Nov', extrafruti: 12.8, casafruti: 2.6 },
    { month: 'Dezembro', monthShort: 'Dez', extrafruti: 13.9, casafruti: 2.9 },
    { month: 'Janeiro', monthShort: 'Jan', extrafruti: 11.6, casafruti: 2.4 },
    { month: 'Fevereiro', monthShort: 'Fev', extrafruti: 10.9, casafruti: 2.2 },
    { month: 'Março', monthShort: 'Mar', extrafruti: 12.4, casafruti: 2.5 },
    { month: 'Abril', monthShort: 'Abr', extrafruti: 11.9, casafruti: 2.6 },
    { month: 'Maio', monthShort: 'Mai', extrafruti: 12.7, casafruti: 2.7 },
    { month: 'Junho', monthShort: 'Jun', extrafruti: 13.1, casafruti: 2.8 },
    { month: 'Julho', monthShort: 'Jul', extrafruti: 13.6, casafruti: 2.9 },
    { month: 'Agosto', monthShort: 'Ago', extrafruti: 13.9, casafruti: 3.0 },
    { month: 'Setembro', monthShort: 'Set', extrafruti: 16.2, casafruti: 3.1 },
    { month: 'Outubro', monthShort: 'Out', extrafruti: 15.9, casafruti: 3.2 },
  ],
  marginSeries: [
    { month: 'Nov', extrafruti: 22.8, casafruti: 26.4 },
    { month: 'Dez', extrafruti: 23.1, casafruti: 26.8 },
    { month: 'Jan', extrafruti: 22.5, casafruti: 26.1 },
    { month: 'Fev', extrafruti: 22.2, casafruti: 25.8 },
    { month: 'Mar', extrafruti: 22.9, casafruti: 26.5 },
    { month: 'Abr', extrafruti: 23.0, casafruti: 26.7 },
    { month: 'Mai', extrafruti: 23.2, casafruti: 27.0 },
    { month: 'Jun', extrafruti: 23.4, casafruti: 27.2 },
    { month: 'Jul', extrafruti: 23.1, casafruti: 26.9 },
    { month: 'Ago', extrafruti: 23.6, casafruti: 27.4 },
    { month: 'Set', extrafruti: 23.8, casafruti: 27.6 },
    { month: 'Out', extrafruti: 23.4, casafruti: 27.2 },
  ],
  expenseComposition: [
    { name: 'Logística', value: 18.0, percentage: 42, color: '#1B5E20' },
    { name: 'Pessoal', value: 9.4, percentage: 22, color: '#F59E0B' },
    { name: 'Comercial', value: 6.4, percentage: 15, color: '#FBBF24' },
    { name: 'Administrativo', value: 4.7, percentage: 11, color: '#3B82F6' },
    { name: 'Outros', value: 4.3, percentage: 10, color: '#9CA3AF' },
  ],
  expenseTotal: 'R$ 42,8M',
  topUnits: [
    { name: 'SP - Capital', value: 48.2 },
    { name: 'RJ - Grande Rio', value: 32.7 },
    { name: 'MG - BH', value: 24.1 },
    { name: 'PR - Curitiba', value: 18.8 },
    { name: 'RS - Porto Alegre', value: 14.3 },
  ],
  criticalAlerts: [
    {
      id: 'alt-1',
      title: 'Contrato vence em 30 dias',
      description: 'Fornecedor: Logística Norte',
      detail: '18/11/2026',
      severity: 'critical',
    },
    {
      id: 'alt-2',
      title: 'KPI abaixo da meta',
      description: 'Margem Bruta (unidade SP)',
      detail: '-2,4 p.p.',
      severity: 'warning',
    },
    {
      id: 'alt-3',
      title: '5 tarefas atrasadas',
      description: 'Projetos em andamento',
      detail: '',
      severity: 'critical',
    },
  ],
  commitments: [
    {
      id: 'com-1',
      day: '21',
      monthShort: 'Out',
      title: 'Reunião de Resultados',
      time: '10:00 - 11:30',
      location: 'Online',
    },
    {
      id: 'com-2',
      day: '23',
      monthShort: 'Out',
      title: 'Assembleia de Acionistas',
      time: '14:00 - 16:00',
      location: 'Sede',
    },
    {
      id: 'com-3',
      day: '27',
      monthShort: 'Out',
      title: 'Entrega de Relatório Financeiro',
      time: '09:00 - 10:00',
      location: 'Online',
    },
    {
      id: 'com-4',
      day: '29',
      monthShort: 'Out',
      title: 'Reunião Comercial',
      time: '15:00 - 17:00',
      location: 'Sede',
    },
  ],
}
