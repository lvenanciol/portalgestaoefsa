import React, { createContext, useContext, useState, ReactNode } from 'react'
import { CompanyId, MOCK_DATA, CriticalAlert } from '@/data/mockData'

interface AppContextType {
  selectedCompany: CompanyId
  setSelectedCompany: (company: CompanyId) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  criticalAlerts: CriticalAlert[]
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyId>('extrafruti')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <AppContext.Provider
      value={{
        selectedCompany,
        setSelectedCompany,
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
