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
import DocumentosPage from './pages/operacional/DocumentosPage'
import TarefasPage from './pages/operacional/TarefasPage'
import ProjetosPage from './pages/operacional/ProjetosPage'
import AtasPage from './pages/operacional/AtasPage'
import EmailsPage from './pages/operacional/EmailsPage'
import ContratosPage from './pages/operacional/ContratosPage'
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
