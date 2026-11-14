import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { MOCK_DATA, CriticalAlert } from '@/data/mockData'

// Ajustes PGE — T1: empresas REAIS do banco (coleção empresas), seleção
// persistida e compartilhada por sidebar (logo) e topbar (dados/números).

export interface EmpresaApp {
  id: string
  nome: string
  cor: string
  cnpj: string
}

/** Período global (mês/ano) usado pelo filtro do topbar. */
export interface PeriodoApp {
  mes: number // 1..12
  ano: number
}

interface AppContextType {
  selectedCompany: string // id da empresa no banco ('' = consolidado)
  setSelectedCompany: (id: string) => void
  // 15/11/2026 — filtro de período GLOBAL.
  // Antes o topbar mostrava uma lista FIXA de 3 meses (Ago/Set/Out-2026)
  // escrita no código, sem estado e sem efeito: "só aparecem 3 meses".
  // Agora a lista é gerada (18 meses até o mês corrente) e a seleção é
  // compartilhada e persistida por usuário.
  periodo: PeriodoApp
  setPeriodo: (p: PeriodoApp) => void
  periodosDisponiveis: PeriodoApp[]
  empresas: EmpresaApp[]
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  sidebarCollapsed: boolean // SDB-d: sidebar oculta no desktop (persistido)
  toggleSidebarCollapsed: () => void
  criticalAlerts: CriticalAlert[]
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const LS_EMPRESA = 'pge_empresa_sel'
const LS_SIDEBAR_COLLAPSED = 'pge_sidebar_collapsed'
const LS_PERIODO = 'pge_periodo'

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

/**
 * 15/11/2026 — janela de meses do seletor de período.
 * 18 meses: cobre o ano corrente + o anterior, o suficiente para comparar
 * com o mesmo período do ano passado (A.A.) sem virar uma lista infinita.
 */
function gerarPeriodos(qtd = 18): PeriodoApp[] {
  const hoje = new Date()
  const out: PeriodoApp[] = []
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    out.push({ mes: d.getMonth() + 1, ano: d.getFullYear() })
  }
  return out
}

/** "Out/2026" */
export function rotuloPeriodo(p: PeriodoApp): string {
  return (MESES_CURTOS[p.mes - 1] || String(p.mes)) + '/' + p.ano
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<EmpresaApp[]>([])
  const [selectedCompany, setSelectedCompanyState] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_EMPRESA) || ''
    } catch (_) {
      return ''
    }
  })
  // período global — default = mês corrente; persiste por usuário
  const periodosDisponiveis = React.useMemo(() => gerarPeriodos(18), [])
  const [periodo, setPeriodoState] = useState<PeriodoApp>(() => {
    try {
      const raw = localStorage.getItem(LS_PERIODO)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && typeof p.mes === 'number' && typeof p.ano === 'number') return p
      }
    } catch (_) {
      /* localStorage indisponível — cai no mês corrente */
    }
    const h = new Date()
    return { mes: h.getMonth() + 1, ano: h.getFullYear() }
  })
  const setPeriodo = (p: PeriodoApp) => {
    setPeriodoState(p)
    try {
      localStorage.setItem(LS_PERIODO, JSON.stringify(p))
    } catch (_) {
      /* localStorage indisponível — segue sem persistir */
    }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  // SDB-d: colapso da sidebar no desktop — persistido em localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_SIDEBAR_COLLAPSED) === '1'
    } catch (_) {
      return false
    }
  })
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const novo = !prev
      try {
        localStorage.setItem(LS_SIDEBAR_COLLAPSED, novo ? '1' : '0')
      } catch (_) {
        /* localStorage indisponível — segue sem persistir */
      }
      return novo
    })
  }

  useEffect(() => {
    ;(async () => {
      try {
        const r = await pb.collection('empresas').getFullList({ sort: 'nome' })
        setEmpresas(
          (r as any[]).map((e) => ({
            id: e.id,
            nome: e.nome,
            cor: e.cor || '#1B5E20',
            cnpj: e.cnpj || '',
          })),
        )
      } catch (_) {
        setEmpresas([])
      }
    })()
  }, [])

  const setSelectedCompany = (id: string) => {
    setSelectedCompanyState(id)
    try {
      localStorage.setItem(LS_EMPRESA, id)
    } catch (_) {
      /* localStorage indisponível — segue sem persistir */
    }
  }

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <AppContext.Provider
      value={{
        selectedCompany,
        setSelectedCompany,
        periodo,
        setPeriodo,
        periodosDisponiveis,
        empresas,
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        sidebarCollapsed,
        toggleSidebarCollapsed,
        criticalAlerts: MOCK_DATA.criticalAlerts,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
