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

interface AppContextType {
  selectedCompany: string // id da empresa no banco ('' = consolidado)
  setSelectedCompany: (id: string) => void
  empresas: EmpresaApp[]
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  criticalAlerts: CriticalAlert[]
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const LS_EMPRESA = 'pge_empresa_sel'

export function AppProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<EmpresaApp[]>([])
  const [selectedCompany, setSelectedCompanyState] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_EMPRESA) || ''
    } catch (_) {
      return ''
    }
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    } catch (_) {}
  }

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <AppContext.Provider
      value={{
        selectedCompany,
        setSelectedCompany,
        empresas,
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
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
