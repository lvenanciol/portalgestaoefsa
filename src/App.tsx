import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Index from './pages/Index'
import Login from './pages/Login'
import ControleAcessos from './pages/ControleAcessos'
import FinanceiroPage from './pages/FinanceiroPage'
import DesempenhoPage from './pages/DesempenhoPage'
import DocumentosPage from './pages/operacional/DocumentosImportacoesPage'
import TarefasPage from './pages/operacional/TarefasKanbanPage'
import ProjetosPage from './pages/operacional/ProjetosBoardPage'
import AtasPage from './pages/operacional/AtasReunioesPage'
import EmailsPage from './pages/operacional/EmailsPage'
import ContratosPage from './pages/operacional/ContratosPage'
import IndicadoresPage from './pages/operacional/IndicadoresCatalogoPage'
import IaPage from './pages/IaCentroPage'
import PowerBiPage from './pages/PowerBiPage'
import MenusPage from './pages/MenusCrudPage'
import ConfiguracoesPage from './pages/ConfiguracoesCompletaPage'
import ParceirosPage from './pages/ParceirosPage'
import LogomarcasPage from './pages/LogomarcasPage'
import StatusIntegracoesPage from './pages/integracoes/StatusIntegracoesPage'
import SankhyaIntegracaoPage from './pages/integracoes/SankhyaPage'
import WhatsAppIntegracaoPage from './pages/integracoes/WhatsAppPage'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'

// Fase 3 — Rotas protegidas por autenticação; /login pública.

const AppRoutes = () => {
  const { isAuthenticated } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Index />} />
        <Route path="/financeiro" element={<FinanceiroPage />} />
        <Route path="/desempenho" element={<DesempenhoPage />} />
        <Route path="/documentos" element={<DocumentosPage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route path="/projetos" element={<ProjetosPage />} />
        <Route path="/atas" element={<AtasPage />} />
        <Route path="/emails" element={<EmailsPage />} />
        <Route path="/contratos" element={<ContratosPage />} />
        <Route path="/indicadores" element={<IndicadoresPage />} />
        <Route path="/ia" element={<IaPage />} />
        <Route path="/power-bi" element={<PowerBiPage />} />
        <Route path="/menus" element={<MenusPage />} />
        <Route path="/parceiros" element={<ParceirosPage />} />
        <Route path="/logomarcas" element={<LogomarcasPage />} />
        <Route path="/integracoes" element={<StatusIntegracoesPage />} />
        <Route path="/integracoes/sankhya" element={<SankhyaIntegracaoPage />} />
        <Route path="/integracoes/whatsapp" element={<WhatsAppIntegracaoPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/acessos" element={<ControleAcessos />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
