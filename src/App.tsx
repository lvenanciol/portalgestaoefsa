import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InicioPage from './pages/InicioPage'
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
import Ll5SaudePage from './pages/Ll5SaudePage'
import Ll5AuditoriaPage from './pages/Ll5AuditoriaPage'
import { Ll5Provider } from '@/ll5/Ll5Context'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'

// FASE 0 — módulo /pen (Plano Estratégico). Shell próprio, independente do
// Layout principal: sidebar escura fixa, topbar com filtro global e telas
// vazias nesta fase.
import PenShell from './pen/PenShell'
import PenCockpitPage from './pen/pages/PenCockpitPage'
import PenComponentsPage from './pen/pages/PenComponentsPage'
// 2.2 — Norte Estratégico implementado em arquivo próprio
import PenNortePage from './pen/pages/PenNortePage'
// 2.3 — Diagnóstico de Ambiente (somente leitura)
import PenDiagnosticoPage from './pen/pages/PenDiagnosticoPage'
// 2.4 — Ishikawa (causa e efeito)
import PenIshikawaPage from './pen/pages/PenIshikawaPage'
// 2.5 — BSC (consome objetivo/KPI/iniciativa do banco)
import PenBscPage from './pen/pages/PenBscPage'
import {
  PenCincoW2hPage,
  PenAcompanhamentoPage,
  PenGovernancaPage,
} from './pen/pages/PenTelasVazias'

// Fase 3 — Rotas protegidas por autenticação; /login pública.

const AppRoutes = () => {
  const { isAuthenticated } = useAuth()
  // 12/11/2026 (TAREFA ALERTAS): o destino real de "/" e /login depende das
  // permissões do grupo (com dashboard → "/", sem → /inicio ou primeira tela
  // concedida — caso do Suprimentos → Tarefas & Agenda). Como as permissões
  // chegam de forma assíncrona, pós-login cai em "/" e o RotaProtegida da rota
  // inicial resolve o destino certo quando o load terminar.
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      {/* PÚBLICA: o e-mail de redefinição aponta para /reset-password (placeholder
          {RESET_URL}) e a rota não existia — o link caía no NotFound. Quem chega
          aqui ainda não tem sessão, por isso NÃO fica dentro do ProtectedRoute. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* ============ FASE 0 — MÓDULO /pen (Plano Estratégico) ============
          Fica DENTRO do ProtectedRoute (exige sessão) mas FORA do Layout:
          o módulo tem shell próprio com sidebar escura e topbar, conforme a
          especificação da fundação. As 9 rotas abaixo são o Portão 0:
          8 telas + a vitrine de componentes. */}
      <Route
        element={
          <ProtectedRoute>
            <PenShell />
          </ProtectedRoute>
        }
      >
        {/* Cada rota passa pelo MESMO guard do resto do portal (fail-closed):
            o módulo 'plano-estrategico' está registrado em MENU_MODULOS. */}
        {/* 2.1 — o Cockpit tem rota própria (/pen/cockpit); /pen redireciona
            para ela para não existirem duas URLs da mesma tela. */}
        <Route path="/pen" element={<Navigate to="/pen/cockpit" replace />} />
        <Route
          path="/pen/cockpit"
          element={
            <RotaProtegida>
              <PenCockpitPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/components"
          element={
            <RotaProtegida>
              <PenComponentsPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/norte"
          element={
            <RotaProtegida>
              <PenNortePage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/diagnostico"
          element={
            <RotaProtegida>
              <PenDiagnosticoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/ishikawa"
          element={
            <RotaProtegida>
              <PenIshikawaPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/bsc"
          element={
            <RotaProtegida>
              <PenBscPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/5w2h"
          element={
            <RotaProtegida>
              <PenCincoW2hPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/acompanhamento"
          element={
            <RotaProtegida>
              <PenAcompanhamentoPage />
            </RotaProtegida>
          }
        />
        <Route
          path="/pen/governanca"
          element={
            <RotaProtegida>
              <PenGovernancaPage />
            </RotaProtegida>
          }
        />
      </Route>

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
        {/* TELA DEFAULT (/inicio): dashboard reduzido p/ grupos SEM permissão
            de Dashboard Executivo — Próximos Compromissos + Alertas Críticos
            filtrados pela participação do usuário (alertas-service). */}
        <Route
          path="/inicio"
          element={
            <RotaProtegida>
              <InicioPage />
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

        {/* ================= LL5 — assuntos pessoais do titular =================
            Seção nova dentro do PGE. O Ll5Provider resolve o papel (admin x
            membro) e o owner dos dados; o isolamento real está no repositório
            (src/ll5/repo.ts), não na UI. */}
        <Route
          path="/ll5/saude"
          element={
            <RotaProtegida>
              <Ll5Provider>
                <Ll5SaudePage />
              </Ll5Provider>
            </RotaProtegida>
          }
        />
        <Route
          path="/ll5/auditoria"
          element={
            <RotaProtegida>
              <Ll5Provider>
                <Ll5AuditoriaPage />
              </Ll5Provider>
            </RotaProtegida>
          }
        />
        <Route path="/ll5" element={<Navigate to="/ll5/saude" replace />} />
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
