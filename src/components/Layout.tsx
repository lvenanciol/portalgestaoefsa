import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AppProvider, useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

export default function Layout() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#F3F4F6] text-[#111827] flex">
        <SidebarWithCollapse />
        <MainArea />
      </div>
    </AppProvider>
  )
}

// SDB-d: sidebar colapsável — o conteúdo principal ocupa o espaço liberado
// (padding-left animado de 260px → 0) e o estado persiste em localStorage.
function SidebarWithCollapse() {
  return <Sidebar />
}

function MainArea() {
  const { sidebarCollapsed } = useApp()
  return (
    <div
      className={cn(
        'flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ease-in-out',
        sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-[260px]',
      )}
    >
      {/* Topbar sticky no topo */}
      <Topbar />

      {/* Conteúdo rolável da página */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
