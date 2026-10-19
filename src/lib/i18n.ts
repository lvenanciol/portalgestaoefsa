// COR-2 (19/10) — i18n exaustivo + tradutor de DOM em runtime.
// 3 camadas:
//   1. Dicionário ~200 rótulos (navegação, KPIs, DRE, aging, fluxo, kanban,
//      atas, contratos, e-mails, acessos, configs, tooltips, exports).
//   2. Tradutor de DOM (MutationObserver): ao trocar a bandeira, traduz
//      nós de texto, placeholders, title/aria-label e options em TODA a
//      página — cobre drilldowns, tooltips e textos estáticos das 18 telas
//      sem reload e sem tocar em cada componente.
//   3. Nomenclatura contábil: rótulos financeiros ganham sufixo do padrão
//      ativo (GAAP/IFRS) nos títulos de DRE/Balancete/Fluxo.

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
  // navegação/módulos
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
  parceiros: 'Parceiros & Contatos',
  logomarcas: 'Logomarcas',
  powerbi: 'Power BI',
  ia: 'IA Gemini Flash',
  menus: 'Árvore de Menus',
  acessos: 'Controle de Acessos',
  configuracoes: 'Configurações',
  gestao: 'GESTÃO',
  operacao: 'OPERAÇÃO',
  relacionamento: 'RELACIONAMENTO',
  plataforma: 'PLATAFORMA',
  // ações
  exportar: 'Exportar',
  novo: 'Novo',
  editar: 'Editar',
  excluir: 'Excluir',
  salvar: 'Salvar',
  cancelar: 'Cancelar',
  buscar: 'Buscar...',
  filtrar: 'Filtrar',
  limpar: 'Limpar',
  atualizar: 'Atualizar',
  fechar: 'Fechar',
  abrir: 'Abrir',
  ver_tudo: 'Ver tudo',
  compartilhar: 'Compartilhar',
  enviar: 'Enviar',
  importar: 'Importar',
  baixar: 'Baixar',
  imprimir: 'Imprimir',
  gerar: 'Gerar',
  analisar: 'Analisar',
  resumir: 'Resumir',
  regenerar: 'Regenerar',
  restaurar: 'Restaurar',
  aplicar: 'Aplicar',
  // financeiro — KPIs
  saldo: 'Saldo',
  receita: 'Receita',
  despesa: 'Despesa',
  lucro_liquido: 'Lucro líquido',
  margem_bruta: 'Margem bruta',
  margem_liquida: 'Margem líquida',
  contas_pagar: 'Contas a pagar',
  contas_receber: 'Contas a receber',
  vencido: 'Vencido',
  vencendo: 'Vencendo',
  fluxo_caixa: 'Fluxo de caixa',
  entradas: 'Entradas',
  saidas: 'Saídas',
  saldo_final: 'Saldo final',
  saldo_inicial: 'Saldo inicial',
  // financeiro — DRE/balancete
  dre: 'DRE',
  balancete: 'Balancete',
  conta: 'Conta',
  descricao: 'Descrição',
  debito: 'Débito',
  credito: 'Crédito',
  saldo_devedor: 'Saldo devedor',
  saldo_credor: 'Saldo credor',
  ativo: 'Ativo',
  passivo: 'Passivo',
  receitas: 'Receitas',
  despesas: 'Despesas',
  periodo: 'Período',
  // aging
  faixa: 'Faixa',
  vencidos: 'Vencidos',
  a_vencer: 'A vencer',
  dias_0_30: '0-30 dias',
  dias_31_60: '31-60 dias',
  dias_mais_60: '+60 dias',
  // kanban/tarefas
  a_fazer: 'A Fazer',
  em_andamento: 'Em Andamento',
  bloqueado: 'Bloqueado',
  concluido: 'Concluído',
  prioridade: 'Prioridade',
  prazo: 'Prazo',
  responsavel: 'Responsável',
  tarefa: 'Tarefa',
  subtarefas: 'Subtarefas',
  comentarios: 'Comentários',
  parceiros_responsaveis: 'Parceiros/contatos responsáveis',
  // atas
  pauta: 'Pauta',
  decisoes: 'Decisões',
  participantes: 'Participantes',
  modalidade: 'Modalidade',
  presencial: 'Presencial',
  action_items: 'Action items',
  // projetos
  marco: 'Marco',
  marcos: 'Marcos',
  risco: 'Risco',
  riscos: 'Riscos',
  cronograma: 'Cronograma',
  orcamento: 'Orçamento',
  // contratos
  contrato: 'Contrato',
  vigencia: 'Vigência',
  reajuste: 'Reajuste',
  valor: 'Valor',
  status: 'Status',
  // e-mails
  destinatario: 'Destinatário',
  assunto: 'Assunto',
  mensagem: 'Mensagem',
  // acessos
  usuarios: 'Usuários',
  grupos: 'Grupos',
  permissoes: 'Permissões',
  grupo: 'Grupo',
  empresa: 'Empresa',
  unidade: 'Unidade',
  // configurações
  idioma: 'Idioma',
  padrao_contabil: 'Padrão contábil',
  integracoes: 'Integrações',
  seguranca: 'Segurança',
  // dashboard
  alertas: 'Alertas',
  compromissos: 'Compromissos',
  parecer_ia: 'Parecer com IA',
  top_unidades: 'Top unidades',
  // comum
  carregando: 'Carregando...',
  nenhum_registro: 'Nenhum registro',
  total: 'Total',
  hoje: 'Hoje',
  mes: 'Mês',
  ano: 'Ano',
  sim: 'Sim',
  nao: 'Não',
  // resíduos detectados no e2e (COR-2) — topbar/sidebar/dashboard
  sair: 'Sair',
  ver_alertas: 'Ver alertas',
  abrir_menu: 'Abrir menu',
  menu_usuario: 'Menu do usuário',
  lembrar_me: 'Lembrar-me',
  mostrar_senha: 'Mostrar senha',
  recuperar_senha: 'Recuperar senha',
  entrar: 'Entrar',
  top_unidades_receita: 'Top Unidades por Receita',
  proximos_compromissos: 'Próximos Compromissos',
  alertas_criticos: 'Alertas Críticos',
  pareceres_ia: 'Pareceres IA — Gemini Flash',
  gerar_parecer: 'Gerar parecer',
  agenda: 'Agenda',
  kpis: 'Indicadores-Chave de Desempenho',
  graficos: 'Demonstrativos Gráficos',
  unidades_agenda: 'Unidades e Agenda',
  alertas_ia: 'Alertas e IA',
  // financeiro (tabs/colunas/filtros)
  real_sankhya: 'Real (Sankhya)',
  a_pagar_receber: 'A Pagar & Receber',
  a_pagar: 'A Pagar',
  a_receber: 'A Receber',
  fechamento: 'Fechamento',
  fornecedor: 'Fornecedor',
  documento: 'Documento',
  vencimento: 'Vencimento',
  todas_as_empresas: 'Todas as empresas',
  todos_os_status: 'Todos os status',
  buscar_por: 'Buscar por nome ou documento...',
  parecer_ia_ap: 'Parecer IA — contas a pagar & receber',
  // atas
  nova_ata: 'Nova ata',
  resumir_com_ia: 'Resumir com IA',
  // tarefas
  nova_tarefa: 'Nova tarefa',
  kanban: 'Kanban',
  calendario: 'Calendário',
  // atas/detalhe
  pauta_decisoes: 'Pauta, decisões e action items com dono e prazo',
  // espelho PT dos rótulos compostos (base do dicionário inverso PT→EN)
  'real (sankhya)': 'Real (Sankhya)',
  'carregando dashboard…': 'Carregando dashboard...',
  'carregando dashboard...': 'Carregando dashboard...',
  'buscar por nome ou documento...': 'Buscar por nome ou documento...',
  'contas a pagar & receber': 'Contas a Pagar & Receber',
  'parecer ia — contas a pagar & receber': 'Parecer IA — contas a pagar & receber',
  'pareceres ia — gemini flash': 'Pareceres IA — Gemini Flash',
  'top unidades por receita': 'Top Unidades por Receita',
  'próximos compromissos': 'Próximos Compromissos',
  'alertas críticos': 'Alertas Críticos',
  'gerar parecer': 'Gerar parecer',
  'ver alertas': 'Ver alertas',
  'abrir menu': 'Abrir menu',
  'menu do usuário': 'Menu do usuário',
  'nova ata': 'Nova ata',
  'resumir com ia': 'Resumir com IA',
  'nova tarefa': 'Nova tarefa',
  'todas as empresas': 'Todas as empresas',
  'todos os status': 'Todos os status',
  'a pagar & receber': 'A Pagar & Receber',
  'a pagar': 'A Pagar',
  'a receber': 'A Receber',
  'fluxo de caixa': 'Fluxo de Caixa',
  'contas a pagar': 'Contas a Pagar',
  'contas a receber': 'Contas a Receber',
  'carregando...': 'Carregando...',
  sair: 'Sair',
  entrar: 'Entrar',
  calendário: 'Calendário',
  fechamento: 'Fechamento',
  fornecedor: 'Fornecedor',
  documento: 'Documento',
  vencimento: 'Vencimento',
}

const EN: Dict = {
  // navegação/módulos
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
  parceiros: 'Partners & Contacts',
  logomarcas: 'Logos',
  powerbi: 'Power BI',
  ia: 'Gemini Flash AI',
  menus: 'Menu Tree',
  acessos: 'Access Control',
  configuracoes: 'Settings',
  gestao: 'MANAGEMENT',
  operacao: 'OPERATIONS',
  relacionamento: 'RELATIONSHIPS',
  plataforma: 'PLATFORM',
  // ações
  exportar: 'Export',
  novo: 'New',
  editar: 'Edit',
  excluir: 'Delete',
  salvar: 'Save',
  cancelar: 'Cancel',
  buscar: 'Search...',
  filtrar: 'Filter',
  limpar: 'Clear',
  atualizar: 'Refresh',
  fechar: 'Close',
  abrir: 'Open',
  ver_tudo: 'View all',
  compartilhar: 'Share',
  enviar: 'Send',
  importar: 'Import',
  baixar: 'Download',
  imprimir: 'Print',
  gerar: 'Generate',
  analisar: 'Analyze',
  resumir: 'Summarize',
  regenerar: 'Regenerate',
  restaurar: 'Restore',
  aplicar: 'Apply',
  // financeiro — KPIs
  saldo: 'Balance',
  receita: 'Revenue',
  despesa: 'Expense',
  lucro_liquido: 'Net income',
  margem_bruta: 'Gross margin',
  margem_liquida: 'Net margin',
  contas_pagar: 'Accounts payable',
  contas_receber: 'Accounts receivable',
  vencido: 'Overdue',
  vencendo: 'Due soon',
  fluxo_caixa: 'Cash flow',
  entradas: 'Inflows',
  saidas: 'Outflows',
  saldo_final: 'Ending balance',
  saldo_inicial: 'Beginning balance',
  // financeiro — DRE/balancete
  dre: 'Income statement',
  balancete: 'Trial balance',
  conta: 'Account',
  descricao: 'Description',
  debito: 'Debit',
  credito: 'Credit',
  saldo_devedor: 'Debit balance',
  saldo_credor: 'Credit balance',
  ativo: 'Assets',
  passivo: 'Liabilities',
  receitas: 'Revenues',
  despesas: 'Expenses',
  periodo: 'Period',
  // aging
  faixa: 'Bucket',
  vencidos: 'Overdue',
  a_vencer: 'To be due',
  dias_0_30: '0-30 days',
  dias_31_60: '31-60 days',
  dias_mais_60: '+60 days',
  // kanban/tarefas
  a_fazer: 'To Do',
  em_andamento: 'In Progress',
  bloqueado: 'Blocked',
  concluido: 'Done',
  prioridade: 'Priority',
  prazo: 'Due date',
  responsavel: 'Owner',
  tarefa: 'Task',
  subtarefas: 'Subtasks',
  comentarios: 'Comments',
  parceiros_responsaveis: 'Responsible partners/contacts',
  // atas
  pauta: 'Agenda',
  decisoes: 'Decisions',
  participantes: 'Attendees',
  modalidade: 'Mode',
  presencial: 'In person',
  action_items: 'Action items',
  // projetos
  marco: 'Milestone',
  marcos: 'Milestones',
  risco: 'Risk',
  riscos: 'Risks',
  cronograma: 'Timeline',
  orcamento: 'Budget',
  // contratos
  contrato: 'Contract',
  vigencia: 'Term',
  reajuste: 'Adjustment',
  valor: 'Amount',
  status: 'Status',
  // e-mails
  destinatario: 'Recipient',
  assunto: 'Subject',
  mensagem: 'Message',
  // acessos
  usuarios: 'Users',
  grupos: 'Groups',
  permissoes: 'Permissions',
  grupo: 'Group',
  empresa: 'Company',
  unidade: 'Unit',
  // configurações
  idioma: 'Language',
  padrao_contabil: 'Accounting standard',
  integracoes: 'Integrations',
  seguranca: 'Security',
  // dashboard
  alertas: 'Alerts',
  compromissos: 'Commitments',
  parecer_ia: 'AI Opinion',
  top_unidades: 'Top units',
  // comum
  carregando: 'Loading...',
  nenhum_registro: 'No records',
  total: 'Total',
  hoje: 'Today',
  mes: 'Month',
  ano: 'Year',
  sim: 'Yes',
  nao: 'No',
  // resíduos detectados no e2e (COR-2) — topbar/sidebar/dashboard
  sair: 'Sign out',
  ver_alertas: 'View alerts',
  abrir_menu: 'Open menu',
  menu_usuario: 'User menu',
  lembrar_me: 'Remember me',
  mostrar_senha: 'Show password',
  recuperar_senha: 'Recover password',
  entrar: 'Sign in',
  top_unidades_receita: 'Top units by revenue',
  proximos_compromissos: 'Upcoming commitments',
  alertas_criticos: 'Critical alerts',
  pareceres_ia: 'AI opinions — Gemini Flash',
  gerar_parecer: 'Generate opinion',
  agenda: 'Schedule',
  kpis: 'Key Performance Indicators',
  graficos: 'Charts',
  unidades_agenda: 'Units & Schedule',
  alertas_ia: 'Alerts & AI',
  // financeiro (tabs/colunas/filtros)
  real_sankhya: 'Actual (Sankhya)',
  a_pagar_receber: 'Payables & Receivables',
  a_pagar: 'Payable',
  a_receber: 'Receivable',
  fechamento: 'Closing',
  fornecedor: 'Vendor',
  documento: 'Document',
  vencimento: 'Due date',
  todas_as_empresas: 'All companies',
  todos_os_status: 'All statuses',
  buscar_por: 'Search by name or document...',
  parecer_ia_ap: 'AI opinion — payables & receivables',
  // atas
  nova_ata: 'New minutes',
  resumir_com_ia: 'Summarize with AI',
  // tarefas
  nova_tarefa: 'New task',
  kanban: 'Kanban',
  calendario: 'Calendar',
  // atas/detalhe
  pauta_decisoes: 'Agenda, decisions and action items with owner and due date',
  // rótulos compostos — casamento exato pelo tradutor de DOM (COR-2)
  'real (sankhya)': 'Actual (Sankhya)',
  'carregando dashboard…': 'Loading dashboard…',
  'carregando dashboard...': 'Loading dashboard…',
  'buscar por nome ou documento...': 'Search by name or document...',
  'contas a pagar & receber': 'Payables & Receivables',
  'parecer ia — contas a pagar & receber': 'AI opinion — payables & receivables',
  'pareceres ia — gemini flash': 'AI opinions — Gemini Flash',
  'top unidades por receita': 'Top units by revenue',
  'próximos compromissos': 'Upcoming commitments',
  'alertas críticos': 'Critical alerts',
  'gerar parecer': 'Generate opinion',
  'ver alertas': 'View alerts',
  'abrir menu': 'Open menu',
  'menu do usuário': 'User menu',
  'nova ata': 'New minutes',
  'resumir com ia': 'Summarize with AI',
  'nova tarefa': 'New task',
  'todas as empresas': 'All companies',
  'todos os status': 'All statuses',
  'a pagar & receber': 'Payables & Receivables',
  'a pagar': 'Payable',
  'a receber': 'Receivable',
  'fluxo de caixa': 'Cash flow',
  'contas a pagar': 'Accounts payable',
  'contas a receber': 'Accounts receivable',
  'carregando...': 'Loading...',
  sair: 'Sign out',
  entrar: 'Sign in',
  calendário: 'Calendar',
  fechamento: 'Closing',
  fornecedor: 'Vendor',
  documento: 'Document',
  vencimento: 'Due date',
}

// EN-EU: variações britânicas/UE + nomenclatura IFRS
const ENEU: Dict = {
  ...EN,
  financeiro: 'Finance & Accounting (IFRS)',
  despesa: 'Expenditure',
  balancete: 'Trial balance (IFRS)',
  dre: 'Income statement (IFRS)',
  contas_receber: 'Trade receivables',
  contas_pagar: 'Trade payables',
  saldo: 'Closing balance',
  entradas: 'Receipts',
  saidas: 'Payments',
}

export const DICTS: Record<Idioma, Dict> = {
  'pt-BR': PT,
  'en-US': EN,
  'en-EU': ENEU,
}

export function traduzir(idioma: Idioma, chave: string): string {
  return DICTS[idioma][chave] || DICTS['pt-BR'][chave] || chave
}

// COR-2b: headers de exportação CSV/XLSX pelo dicionário — as páginas passam
// CHAVES csv_* e recebem os rótulos no idioma ativo (pt-BR devolve o rótulo PT).
export function csvHeader(idioma: Idioma, chaves: string[]): string[] {
  return chaves.map((k) => DICTS[idioma][k] || DICTS['pt-BR'][k] || k)
}

// ---------- COR-2: tradutor de DOM em runtime ----------
// Traduz nós de texto/placeholder/title/aria-label usando o dicionário
// INVERSO (PT → idioma alvo). Roda ao trocar a bandeira e em novos nós
// (MutationObserver) — cobre drilldowns, tooltips, dialogs e exports.

let PT_INVERSO: Record<string, string> | null = null

function dicionarioInverso(): Record<string, string> {
  if (PT_INVERSO) return PT_INVERSO
  const inv: Record<string, string> = {}
  for (const chave of Object.keys(PT)) {
    const pt = PT[chave]
    const alvo = EN[chave]
    if (pt && alvo && pt !== alvo) inv[pt.toLowerCase()] = alvo
  }
  PT_INVERSO = inv
  return inv
}

// COR-2: frases para passada de SUBSTRING — rótulos dentro de frases longas
// (ex.: subtítulo "...balancete e fechamento — Real (Sankhya)", badge
// "Real (Sankhya) + Importação"). Só termos inequívocos (≥8 chars ou
// expressões multi-palavra) com borda de palavra.
const FRASES_SUBST: [string, string][] = [
  ['parecer ia — contas a pagar & receber', 'AI opinion — payables & receivables'],
  ['pareceres ia — gemini flash', 'AI opinions — Gemini Flash'],
  ['contas a pagar & receber', 'Payables & Receivables'],
  ['a pagar & receber', 'Payables & Receivables'],
  ['top unidades por receita', 'Top units by revenue'],
  ['próximos compromissos', 'Upcoming commitments'],
  ['alertas críticos', 'Critical alerts'],
  ['buscar por nome ou documento', 'Search by name or document'],
  ['carregando dashboard', 'Loading dashboard'],
  ['todas as empresas', 'All companies'],
  ['todos os status', 'All statuses'],
  ['gerar parecer', 'Generate opinion'],
  ['resumir com ia', 'Summarize with AI'],
  ['menu do usuário', 'User menu'],
  ['ver alertas', 'View alerts'],
  ['abrir menu', 'Open menu'],
  ['real (sankhya)', 'Actual (Sankhya)'],
  ['fluxo de caixa', 'Cash flow'],
  ['contas a pagar', 'Accounts payable'],
  ['contas a receber', 'Accounts receivable'],
  ['nova tarefa', 'New task'],
  ['nova ata', 'New minutes'],
  ['importação', 'Import'],
  ['balancete', 'Trial balance'],
  ['fechamento', 'Closing'],
  ['vencimento', 'Due date'],
  ['fornecedor', 'Vendor'],
  ['documento', 'Document'],
  ['calendário', 'Calendar'],
  ['carregando', 'Loading'],
  ['débito', 'Debit'],
  ['crédito', 'Credit'],
]

let SUBST: { re: RegExp; alvo: string }[] | null = null

function frasesSubst(): { re: RegExp; alvo: string }[] {
  if (SUBST) return SUBST
  SUBST = FRASES_SUBST.map(([pt, en]) => ({
    re: new RegExp(
      '(^|[^\\p{L}])' + pt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^\\p{L}]|$)',
      'giu',
    ),
    alvo: en,
  }))
  return SUBST
}

function traduzirTexto(texto: string, idioma: Idioma): string {
  if (idioma === 'pt-BR') return texto
  const inv = dicionarioInverso()
  const t = texto.trim()
  const alvo = inv[t.toLowerCase()]
  if (alvo) {
    // preserva capitalização original (primeira letra maiúscula)
    if (t[0] === t[0]?.toUpperCase()) return alvo[0].toUpperCase() + alvo.slice(1)
    return alvo.toLowerCase()
  }
  // passada de substrings: frases conhecidas dentro de nós longos
  let out = texto
  for (const s of frasesSubst()) {
    out = out.replace(s.re, (m: string, pre: string) => {
      const corpo = m.slice(pre.length)
      return (
        pre +
        (corpo[0] === corpo[0].toUpperCase() ? s.alvo[0].toUpperCase() + s.alvo.slice(1) : s.alvo)
      )
    })
  }
  return out
}

function traduzirArvore(raiz: Element | Document, idioma: Idioma) {
  if (idioma === 'pt-BR') return
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  const nos: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) {
    const t = (n as Text).wholeText || ''
    if (t.trim().length > 1 && t.trim().length < 400) nos.push(n as Text)
  }
  for (const no of nos) {
    const novo = traduzirTexto(no.textContent || '', idioma)
    if (novo !== no.textContent) no.textContent = novo
  }
  // placeholders e atributos
  const els = raiz.querySelectorAll('input, textarea')
  els.forEach((el) => {
    const ph = el.getAttribute('placeholder')
    if (ph) {
      const novo = traduzirTexto(ph, idioma)
      if (novo !== ph) el.setAttribute('placeholder', novo)
    }
  })
  const titulos = raiz.querySelectorAll('[title], [aria-label]')
  titulos.forEach((el) => {
    for (const attr of ['title', 'aria-label']) {
      const v = el.getAttribute(attr)
      if (v) {
        const novo = traduzirTexto(v, idioma)
        if (novo !== v) el.setAttribute(attr, novo)
      }
    }
  })
}

let observer: MutationObserver | null = null
let idiomaAtivo: Idioma = 'pt-BR'

export function aplicarIdiomaNoDOM(idioma: Idioma) {
  idiomaAtivo = idioma
  traduzirArvore(document.body, idioma)
  if (observer) observer.disconnect()
  if (idioma === 'pt-BR') return
  observer = new MutationObserver((mutacoes) => {
    for (const m of mutacoes) {
      m.addedNodes.forEach((no) => {
        if (no.nodeType === 1) traduzirArvore(no as Element, idiomaAtivo)
        else if (no.nodeType === 3) {
          const t = (no as Text).wholeText || ''
          if (t.trim().length > 1 && t.trim().length < 80) {
            const novo = traduzirTexto(t, idiomaAtivo)
            if (novo !== t) (no as Text).textContent = novo
          }
        }
      })
      if (m.type === 'attributes' && m.attributeName) {
        const el = m.target as Element
        const v = el.getAttribute(m.attributeName)
        if (v) {
          const novo = traduzirTexto(v, idiomaAtivo)
          if (novo !== v) el.setAttribute(m.attributeName, novo)
        }
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
  })
}

// ---------- nomenclatura contábil (GAAP/IFRS) ----------
// Sufixo do padrão ativo para títulos de DRE/Balancete/Fluxo e exports.
export function sufixoPadrao(p: PadraoContabil): string {
  if (p === 'gaap') return ' (US GAAP)'
  if (p === 'ifrs') return ' (IFRS)'
  return ''
}

// ---------- Persistência ----------
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
