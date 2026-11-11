import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RotaProtegida } from '@/components/RotaProtegida'
import Index from './pages/Index'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ControleAcessos from './pages/ControleAcessos'
import FinanceiroPage from './pages/FinanceiroPage'
import DesempenhoPage from './pages/DesempenhoPage'
import DocumentosPage from './pages/operacional/DocumentosPage'
import TarefasPage from './pages/operacional/TarefasKanbanPage'
import ProjetosPage from './pages/operacional/ProjetosBoardPage'
import ProjetoDetalhePage from './pages/operacional/ProjetoDetalhePage'
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
import EmailIntegracaoPage from './pages/integracoes/EmailIntegracaoPage'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'

// Fase 3 — Rotas protegidas por autenticação; /login pública.

const AppRoutes = () => {
  const { isAuthenticated } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      {/* PÚBLICA: o e-mail de redefinição aponta para /reset-password (placeholder
          {RESET_URL}) e a rota não existia — o link caía no NotFound. Quem chega
          aqui ainda não tem sessão, por isso NÃO fica dentro do ProtectedRoute. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Cada rota embrulhada em RotaProtegida: esconder o item da Sidebar não
            bastava — digitar a URL na barra de endereço entrava na tela.
            O guard exige a permissão "ver" do módulo correspondente. */}
        <Route
          path="/"
          element={
            <RotaProtegida>
              <Index />
            </RotaProtegida>
          }
        />
        <Route
          path="/financeiro"
          element={
            <RotaProtegida>
              <FinanceiroPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/desempenho"
          element={
            <RotaProtegida>
              <DesempenhoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/documentos"
          element={
            <RotaProtegida>
              <DocumentosPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/tarefas"
          element={
            <RotaProtegida>
              <TarefasPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/projetos"
          element={
            <RotaProtegida>
              <ProjetosPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/projetos/:id"
          element={
            <RotaProtegida>
              <ProjetoDetalhePage />
            </RotaProtegida>
          }
        />
        <Route
          path="/atas"
          element={
            <RotaProtegida>
              <AtasPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/emails"
          element={
            <RotaProtegida>
              <EmailsPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/contratos"
          element={
            <RotaProtegida>
              <ContratosPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/indicadores"
          element={
            <RotaProtegida>
              <IndicadoresPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/ia"
          element={
            <RotaProtegida>
              <IaPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/power-bi"
          element={
            <RotaProtegida>
              <PowerBiPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/menus"
          element={
            <RotaProtegida>
              <MenusPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/parceiros"
          element={
            <RotaProtegida>
              <ParceirosPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/logomarcas"
          element={
            <RotaProtegida>
              <LogomarcasPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/integracoes"
          element={
            <RotaProtegida>
              <StatusIntegracoesPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/integracoes/sankhya"
          element={
            <RotaProtegida>
              <SankhyaIntegracaoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/integracoes/whatsapp"
          element={
            <RotaProtegida>
              <WhatsAppIntegracaoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/integracoes/email"
          element={
            <RotaProtegida>
              <EmailIntegracaoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <RotaProtegida>
              <ConfiguracoesPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/acessos"
          element={
            <RotaProtegida>
              <ControleAcessos />
            </RotaProtegida>
          }
        />
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
