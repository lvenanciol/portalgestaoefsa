import pb from '@/lib/pocketbase/client'

export interface SankhyaSnapshotDados {
  empresas?: [number, string][]
  fat?: [string, number, number][] // [MES 'YYYY-MM', CODEMP, TOT]
  ap_mensal?: [string, number, number][] // [MES, TOT, N]
  ar_mensal?: [string, number, number][] // [MES, TOT, N]
  ap_aging?: [string, number, number][] // [FAIXA, TOT, N]
  ar_aging?: [string, number, number][] // [FAIXA, TOT, N]
  ap_top?: [string, number][]
  ar_top?: [string, number][]
  fluxo?: [string, number, number][] // [MES, ENT, SAI]
  ap_por_empresa?: [string, string, number][] // [CODEMP, RAZAOABREV, TOT]
  ar_por_empresa?: [string, string, number][] // [CODEMP, RAZAOABREV, TOT]
}

export interface SankhyaDashboardCacheResponse {
  ok: boolean
  vazio?: boolean
  status?: string
  gerado_em?: string | null
  ultima_watermark?: string | null
  dados?: SankhyaSnapshotDados
  falhas?: string[]
  erro?: string
  mensagem?: string
}

export interface MonthlyRevenueEmpresas {
  month: string // "2026-10"
  monthShort: string // "Out/26"
  extrafruti: number // em milhões
  casafruti: number // em milhões
  foldbox: number // em milhões
  total: number // em milhões
}

export interface ExpenseSegmentItem {
  name: string
  value: number
  percentage: number
  color: string
}

export interface TopEmpresaItem {
  name: string
  value: number // total em reais
  color?: string
}

export interface ProcessedDashboardData {
  fonte: 'real' | 'vazio' | 'erro'
  geradoEm: string | null
  geradoEmFormatado: string
  // Faturamento e comparativos
  fat12m: number // em reais
  fatUltimoMes: number // em reais
  fatMesAnterior: number // em reais
  deltaFat: number | null // percentual vs mês anterior
  ultimoMesLabel: string // ex: "Out/26"
  // Títulos
  arTotal: number // em reais
  apTotal: number // em reais
  arVencido: number // em reais
  apVencido: number // em reais
  // Séries
  monthlyRevenues: MonthlyRevenueEmpresas[]
  topEmpresas: TopEmpresaItem[]
  arAging: ExpenseSegmentItem[]
  apAging: ExpenseSegmentItem[]
  temDadosEmpresaSelecionada: boolean
}

/**
 * Normaliza string para comparação (sem acento, minúsculo, sem pontuação)
 */
function norm(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Identifica a qual empresa do PGE um registro da TSIEMP (CODEMP, RAZAOABREV) pertence.
 * Categorias: 'extrafruti' | 'casafruti' | 'foldbox' | 'outro'
 */
export function classificarEmpresaSankhya(
  codEmp: number,
  razaoAbrev: string,
): 'extrafruti' | 'casafruti' | 'foldbox' | 'outro' {
  const r = norm(razaoAbrev)
  if (r.includes('casafruti')) return 'casafruti'
  if (r.includes('foldbox')) return 'foldbox'
  if (
    r.includes('extrafruti') ||
    r.includes('efp') ||
    r.includes('efl') ||
    r.includes('viana') ||
    r.includes('efgroup') ||
    r.includes('tre - ef')
  ) {
    return 'extrafruti'
  }
  // Mapeamentos específicos por código se necessário
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 31].includes(codEmp)) return 'extrafruti'
  if ([18, 19, 22, 23, 24].includes(codEmp)) return 'casafruti'
  if ([20].includes(codEmp)) return 'foldbox'
  return 'outro'
}

/**
 * Busca o snapshot mais recente do Sankhya armazenado no PocketBase
 */
export async function buscarSankhyaDashboardCache(): Promise<SankhyaDashboardCacheResponse> {
  try {
    const res = await pb.send('/backend/v1/sankhya/dashboard-cache', { method: 'GET' })
    return res as SankhyaDashboardCacheResponse
  } catch (err: any) {
    // Fallback secundário: ler diretamente da coleção sankhya_cache se a rota falhar
    try {
      const rec = await pb.collection('sankhya_cache').getFirstListItem("chave = 'financeiro'")
      const payload = typeof rec.payload === 'string' ? JSON.parse(rec.payload) : rec.payload || {}
      return {
        ok: true,
        vazio: false,
        status: rec.status,
        gerado_em: rec.gerado_em || rec.updated,
        dados: payload.dados || {},
        falhas: payload.falhas || [],
      }
    } catch (err2) {
      return {
        ok: false,
        vazio: true,
        erro: String(err?.message || err),
      }
    }
  }
}

const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

function formatarMesAno(mesStr: string): string {
  // mesStr formato "YYYY-MM"
  if (!mesStr || mesStr.length < 7) return mesStr || ''
  const partes = mesStr.split('-')
  const ano = partes[0]
  const mesIdx = parseInt(partes[1], 10) - 1
  const mesNome = MESES_CURTOS[mesIdx] || partes[1]
  return `${mesNome}/${ano.slice(2)}`
}

export function formatarDataHoraBR(isoStr?: string | null): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr.replace(' ', 'T'))
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (_) {
    return isoStr
  }
}

/**
 * Processa os dados brutos do Sankhya para os formatos esperados no Dashboard Executivo,
 * aplicando o filtro da empresa selecionada ('', 'extrafruti', 'casafruti', 'foldbox').
 */
export function processarDadosDashboard(
  dadosBrutos?: SankhyaSnapshotDados,
  empresaFiltroNome?: string, // '', 'Extrafruti', 'Casafruti', 'FoldBox'
  geradoEm?: string | null,
): ProcessedDashboardData {
  if (!dadosBrutos) {
    return {
      fonte: 'vazio',
      geradoEm: null,
      geradoEmFormatado: '',
      fat12m: 0,
      fatUltimoMes: 0,
      fatMesAnterior: 0,
      deltaFat: null,
      ultimoMesLabel: '',
      arTotal: 0,
      apTotal: 0,
      arVencido: 0,
      apVencido: 0,
      monthlyRevenues: [],
      topEmpresas: [],
      arAging: [],
      apAging: [],
      temDadosEmpresaSelecionada: false,
    }
  }

  // Mapear CODEMP -> Nome TSIEMP e Categoria PGE
  const mapaEmpresas = new Map<
    number,
    { nome: string; categoria: 'extrafruti' | 'casafruti' | 'foldbox' | 'outro' }
  >()
  ;(dadosBrutos.empresas || []).forEach(([cod, nome]) => {
    mapaEmpresas.set(Number(cod), {
      nome: String(nome),
      categoria: classificarEmpresaSankhya(Number(cod), String(nome)),
    })
  })

  // Identificar categoria do filtro selecionado
  const catFiltro: 'todos' | 'extrafruti' | 'casafruti' | 'foldbox' = (() => {
    const n = norm(empresaFiltroNome || '')
    if (n.includes('casafruti')) return 'casafruti'
    if (n.includes('foldbox')) return 'foldbox'
    if (n.includes('extrafruti')) return 'extrafruti'
    return 'todos'
  })()

  // Função para verificar se um CODEMP passa no filtro
  const passaFiltro = (codEmp: number) => {
    if (catFiltro === 'todos') return true
    const info = mapaEmpresas.get(codEmp)
    if (!info) return false
    return info.categoria === catFiltro
  }

  // 1. FATURAMENTO MENSAL E SÉRIES 12M
  // fat: [MES 'YYYY-MM', CODEMP, TOT]
  const fatPorMesEmpresa = new Map<
    string,
    { extrafruti: number; casafruti: number; foldbox: number; filtradoTotal: number }
  >()
  const fatPorMesFiltrado = new Map<string, number>()
  let temDadosFiltrados = false

  ;(dadosBrutos.fat || []).forEach(([mes, codEmp, tot]) => {
    const cod = Number(codEmp)
    const valor = Number(tot) || 0
    const info = mapaEmpresas.get(cod)
    const cat = info ? info.categoria : classificarEmpresaSankhya(cod, '')

    if (!fatPorMesEmpresa.has(mes)) {
      fatPorMesEmpresa.set(mes, { extrafruti: 0, casafruti: 0, foldbox: 0, filtradoTotal: 0 })
    }
    const mesObj = fatPorMesEmpresa.get(mes)!
    if (cat === 'extrafruti') mesObj.extrafruti += valor
    if (cat === 'casafruti') mesObj.casafruti += valor
    if (cat === 'foldbox') mesObj.foldbox += valor

    if (passaFiltro(cod)) {
      mesObj.filtradoTotal += valor
      fatPorMesFiltrado.set(mes, (fatPorMesFiltrado.get(mes) || 0) + valor)
      temDadosFiltrados = true
    }
  })

  // Ordenar meses cronologicamente
  const mesesOrdenados = Array.from(fatPorMesEmpresa.keys()).sort()
  // Limitar aos últimos 12 meses se houver mais
  const ultimos12Meses = mesesOrdenados.slice(-12)

  const monthlyRevenues: MonthlyRevenueEmpresas[] = ultimos12Meses.map((mes) => {
    const obj = fatPorMesEmpresa.get(mes) || {
      extrafruti: 0,
      casafruti: 0,
      foldbox: 0,
      filtradoTotal: 0,
    }
    return {
      month: mes,
      monthShort: formatarMesAno(mes),
      extrafruti: Number((obj.extrafruti / 1_000_000).toFixed(2)),
      casafruti: Number((obj.casafruti / 1_000_000).toFixed(2)),
      foldbox: Number((obj.foldbox / 1_000_000).toFixed(2)),
      total: Number((obj.filtradoTotal / 1_000_000).toFixed(2)),
    }
  })

  // Faturamento 12m consolidado filtrado
  const fat12m = ultimos12Meses.reduce((acc, mes) => acc + (fatPorMesFiltrado.get(mes) || 0), 0)

  // Último mês e mês anterior para cálculo de delta
  const ultimoMesKey = ultimos12Meses.length > 0 ? ultimos12Meses[ultimos12Meses.length - 1] : ''
  const mesAnteriorKey = ultimos12Meses.length > 1 ? ultimos12Meses[ultimos12Meses.length - 2] : ''
  const fatUltimoMes = ultimoMesKey ? fatPorMesFiltrado.get(ultimoMesKey) || 0 : 0
  const fatMesAnterior = mesAnteriorKey ? fatPorMesFiltrado.get(mesAnteriorKey) || 0 : 0
  const deltaFat =
    fatMesAnterior > 0 ? ((fatUltimoMes - fatMesAnterior) / fatMesAnterior) * 100 : null
  const ultimoMesLabel = ultimoMesKey ? formatarMesAno(ultimoMesKey) : ''

  // 2. TOP UNIDADES / EMPRESAS (ranking por faturamento 12m)
  const fatAcumuladoPorCod = new Map<number, number>()
  ;(dadosBrutos.fat || []).forEach(([mes, codEmp, tot]) => {
    if (ultimos12Meses.includes(mes)) {
      const cod = Number(codEmp)
      if (passaFiltro(cod)) {
        fatAcumuladoPorCod.set(cod, (fatAcumuladoPorCod.get(cod) || 0) + (Number(tot) || 0))
      }
    }
  })

  const CORES_TOP = ['#1B5E20', '#2E7D32', '#388E3C', '#4CAF50', '#81C784', '#F59E0B']
  const topEmpresas: TopEmpresaItem[] = Array.from(fatAcumuladoPorCod.entries())
    .map(([cod, tot]) => {
      const info = mapaEmpresas.get(cod)
      return {
        name: info?.nome || `Unidade ${cod}`,
        value: tot,
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item, idx) => ({ ...item, color: CORES_TOP[idx % CORES_TOP.length] }))

  // 3. CONTAS A RECEBER E A PAGAR (AGING E TOTAIS)
  // ap_por_empresa: [CODEMP, RAZAOABREV, TOT]
  // ar_por_empresa: [CODEMP, RAZAOABREV, TOT]
  let arTotal = 0
  let apTotal = 0

  if (catFiltro === 'todos') {
    arTotal = (dadosBrutos.ar_mensal || []).reduce((acc, r) => acc + (Number(r[1]) || 0), 0)
    apTotal = (dadosBrutos.ap_mensal || []).reduce((acc, r) => acc + (Number(r[1]) || 0), 0)
  } else {
    // Quando filtrado por empresa específica, usa ap_por_empresa e ar_por_empresa
    ;(dadosBrutos.ar_por_empresa || []).forEach(([codStr, razao, tot]) => {
      const cod = Number(codStr)
      if (passaFiltro(cod)) arTotal += Number(tot) || 0
    })
    ;(dadosBrutos.ap_por_empresa || []).forEach(([codStr, razao, tot]) => {
      const cod = Number(codStr)
      if (passaFiltro(cod)) apTotal += Number(tot) || 0
    })
  }

  // Aging A/R e A/P
  // O aging do Sankhya (ap_aging, ar_aging) foi consolidado globalmente na query SQL.
  // Se estiver filtrado por empresa, se o consolidado geral tiver proporção, exibimos a distribuição.
  const rotulosAging: Record<string, string> = {
    vencido: 'Vencido',
    '0-30d': 'A vencer 30d',
    '31-60d': '31–60d',
    '+60d': '+60d',
  }
  const coresAging: Record<string, string> = {
    vencido: '#DC2626',
    '0-30d': '#1B5E20',
    '31-60d': '#F59E0B',
    '+60d': '#EA580C',
  }

  const parseAging = (
    buckets?: [string, number, number][],
    valorTotalRef?: number,
  ): ExpenseSegmentItem[] => {
    if (!buckets || buckets.length === 0) return []
    const totalGlobal = buckets.reduce((a, b) => a + (Number(b[1]) || 0), 0) || 1
    const totalFinal =
      valorTotalRef !== undefined && valorTotalRef > 0 ? valorTotalRef : totalGlobal

    return buckets.map((b) => {
      const valorGlobal = Number(b[1]) || 0
      const pct = Math.round((valorGlobal / totalGlobal) * 100)
      const valorEfetivo =
        valorTotalRef !== undefined && valorTotalRef > 0
          ? (valorGlobal / totalGlobal) * valorTotalRef
          : valorGlobal
      return {
        name: rotulosAging[b[0]] || b[0],
        value: valorEfetivo,
        percentage: pct,
        color: coresAging[b[0]] || '#9CA3AF',
      }
    })
  }

  const arAging = parseAging(dadosBrutos.ar_aging, catFiltro === 'todos' ? undefined : arTotal)
  const apAging = parseAging(dadosBrutos.ap_aging, catFiltro === 'todos' ? undefined : apTotal)

  // Vencidos
  const arVencidoItem = (dadosBrutos.ar_aging || []).find((b) => b[0] === 'vencido')
  const apVencidoItem = (dadosBrutos.ap_aging || []).find((b) => b[0] === 'vencido')
  const totalArGlobal =
    (dadosBrutos.ar_aging || []).reduce((a, b) => a + (Number(b[1]) || 0), 0) || 1
  const totalApGlobal =
    (dadosBrutos.ap_aging || []).reduce((a, b) => a + (Number(b[1]) || 0), 0) || 1

  let arVencido = arVencidoItem ? Number(arVencidoItem[1]) || 0 : 0
  let apVencido = apVencidoItem ? Number(apVencidoItem[1]) || 0 : 0

  if (catFiltro !== 'todos') {
    arVencido = (arVencido / totalArGlobal) * arTotal
    apVencido = (apVencido / totalApGlobal) * apTotal
  }

  return {
    fonte: 'real',
    geradoEm: geradoEm || null,
    geradoEmFormatado: formatarDataHoraBR(geradoEm),
    fat12m,
    fatUltimoMes,
    fatMesAnterior,
    deltaFat,
    ultimoMesLabel,
    arTotal,
    apTotal,
    arVencido,
    apVencido,
    monthlyRevenues,
    topEmpresas,
    arAging,
    apAging,
    temDadosEmpresaSelecionada:
      catFiltro === 'todos' || temDadosFiltrados || arTotal > 0 || apTotal > 0,
  }
}
