// Fase 10 (prompt-mestre) — i18n central: PT-BR / EN-US / EN-EU + padrão
// contábil (gerencial BR / GAAP / IFRS). Troca sem reload (contexto React).
// Dicionário cobre os rótulos navegacionais e de módulo mais usados.

export type Idioma = 'pt-BR' | 'en-US' | 'en-EU'
export type PadraoContabil = 'gerencial-br' | 'gaap' | 'ifrs'

export const IDIOMAS: { key: Idioma; label: string; bandeira: string }[] = [
  { key: 'pt-BR', label: 'Português (BR)', bandeira: 'BR' },
  { key: 'en-US', label: 'English (US)', bandeira: 'EUA' },
  { key: 'en-EU', label: 'English (EU)', bandeira: 'UE' },
]

export const PADROES: { key: PadraoContabil; label: string }[] = [
  { key: 'gerencial-br', label: 'Gerencial BR' },
  { key: 'gaap', label: 'US GAAP' },
  { key: 'ifrs', label: 'IFRS' },
]

type Dict = Record<string, string>

const PT: Dict = {
  dashboard: 'Dashboard Executivo',
  financeiro: 'Financeiro & Contábil',
  desempenho: 'Desempenho por Unidade',
  indicadores: 'Indicadores',
  documentos: 'Documentos & Importações',
  tarefas: 'Tarefas & Agenda',
  projetos: 'Projetos',
  atas: 'Atas & Reuniões',
  emails: 'E-mails',
  contratos: 'Contratos',
  powerbi: 'Power BI',
  ia: 'IA Gemini Flash',
  menus: 'Árvore de Menus',
  acessos: 'Controle de Acessos',
  configuracoes: 'Configurações',
  gestao: 'GESTÃO',
  operacao: 'OPERAÇÃO',
  relacionamento: 'RELACIONAMENTO',
  plataforma: 'PLATAFORMA',
  exportar: 'Exportar',
  novo: 'Novo',
  editar: 'Editar',
  excluir: 'Excluir',
  salvar: 'Salvar',
  cancelar: 'Cancelar',
  buscar: 'Buscar...',
  saldo: 'Saldo',
  receita: 'Receita',
  despesa: 'Despesa',
  lucro_liquido: 'Lucro líquido',
  contas_pagar: 'Contas a pagar',
  contas_receber: 'Contas a receber',
}

const EN: Dict = {
  dashboard: 'Executive Dashboard',
  financeiro: 'Finance & Accounting',
  desempenho: 'Performance by Unit',
  indicadores: 'Indicators',
  documentos: 'Documents & Imports',
  tarefas: 'Tasks & Schedule',
  projetos: 'Projects',
  atas: 'Minutes & Meetings',
  emails: 'Emails',
  contratos: 'Contracts',
  powerbi: 'Power BI',
  ia: 'Gemini Flash AI',
  menus: 'Menu Tree',
  acessos: 'Access Control',
  configuracoes: 'Settings',
  gestao: 'MANAGEMENT',
  operacao: 'OPERATIONS',
  relacionamento: 'RELATIONSHIPS',
  plataforma: 'PLATFORM',
  exportar: 'Export',
  novo: 'New',
  editar: 'Edit',
  excluir: 'Delete',
  salvar: 'Save',
  cancelar: 'Cancel',
  buscar: 'Search...',
  saldo: 'Balance',
  receita: 'Revenue',
  despesa: 'Expense',
  lucro_liquido: 'Net income',
  contas_pagar: 'Accounts payable',
  contas_receber: 'Accounts receivable',
}

// EN-EU: variações britânicas/UE leves
const ENEU: Dict = { ...EN, financeiro: 'Finance & Accounting (IFRS)', despesa: 'Expenditure' }

export const DICTS: Record<Idioma, Dict> = {
  'pt-BR': PT,
  'en-US': EN,
  'en-EU': ENEU,
}

export function traduzir(idioma: Idioma, chave: string): string {
  return DICTS[idioma][chave] || DICTS['pt-BR'][chave] || chave
}

// Persistência
const LS_IDIOMA = 'pge_idioma'
const LS_PADRAO = 'pge_padrao_contabil'

export function idiomaSalvo(): Idioma {
  return (localStorage.getItem(LS_IDIOMA) as Idioma) || 'pt-BR'
}

export function padraoSalvo(): PadraoContabil {
  return (localStorage.getItem(LS_PADRAO) as PadraoContabil) || 'gerencial-br'
}

export function salvarIdioma(i: Idioma) {
  localStorage.setItem(LS_IDIOMA, i)
}

export function salvarPadrao(p: PadraoContabil) {
  localStorage.setItem(LS_PADRAO, p)
}
