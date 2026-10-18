import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AppProvider } from '@/context/AppContext'

export default function Layout() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#F3F4F6] text-[#111827] flex">
        {/* Sidebar desktop (fixa à esquerda, 260px) + drawer mobile */}
        <Sidebar />

        {/* Área principal: empurrada 260px no desktop para acomodar a sidebar fixa */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-[260px]">
          {/* Topbar sticky no topo */}
          <Topbar />

          {/* Conteúdo rolável da página */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AppProvider>
  )
}
