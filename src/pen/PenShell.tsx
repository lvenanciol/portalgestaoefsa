import { useEffect, useState, createContext, useContext } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Compass,
  Stethoscope,
  GitBranch,
  Target,
  ListChecks,
  TrendingUp,
  ShieldCheck,
  Menu,
  X,
  Building2,
  CalendarRange,
  ArrowLeft,
} from 'lucide-react'
import { PEN } from '@/pen/tokens'
import { cn } from '@/lib/utils'

// ============================================================================
// FASE 0.1 — SHELL DO MÓDULO /pen
//
// Estrutura fixa: sidebar escura + topbar + área de conteúdo clara.
// Os 8 destinos são as telas do plano; todas nascem VAZIAS nesta fase.
//
// O seletor de empresa e de ciclo é GLOBAL: vive no contexto do shell e é
// consumido por qualquer tela abaixo, para que filtro e conteúdo não
// divergirem entre telas.
// ============================================================================

export const PEN_EMPRESAS = ['Todas', 'Extrafruti', 'Casafruti', 'FoldBox'] as const
export const PEN_CICLOS = ['Ciclo 2026'] as const

export type PenEmpresa = (typeof PEN_EMPRESAS)[number]
export type PenCiclo = (typeof PEN_CICLOS)[number]

interface PenContexto {
  empresa: PenEmpresa
  setEmpresa: (e: PenEmpresa) => void
  ciclo: PenCiclo
  setCiclo: (c: PenCiclo) => void
}

const PenCtx = createContext<PenContexto>({
  empresa: 'Todas',
  setEmpresa: () => {},
  ciclo: 'Ciclo 2026',
  setCiclo: () => {},
})

/** Hook de leitura do filtro global — usado pelas telas do módulo. */
export function usePenFiltro() {
  return useContext(PenCtx)
}

const ITENS = [
  { rota: '/pen', label: 'Cockpit', Icone: LayoutDashboard, fim: true },
  { rota: '/pen/norte', label: 'Norte', Icone: Compass, fim: false },
  { rota: '/pen/diagnostico', label: 'Diagnóstico', Icone: Stethoscope, fim: false },
  { rota: '/pen/ishikawa', label: 'Ishikawa', Icone: GitBranch, fim: false },
  { rota: '/pen/bsc', label: 'BSC', Icone: Target, fim: false },
  { rota: '/pen/5w2h', label: '5W2H', Icone: ListChecks, fim: false },
  { rota: '/pen/acompanhamento', label: 'Acompanhamento', Icone: TrendingUp, fim: false },
  { rota: '/pen/governanca', label: 'Governança', Icone: ShieldCheck, fim: false },
] as const

const LARGURA_SIDEBAR = 232

export default function PenShell() {
  const [empresa, setEmpresa] = useState<PenEmpresa>('Todas')
  const [ciclo, setCiclo] = useState<PenCiclo>('Ciclo 2026')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const local = useLocation()

  // fecha o drawer ao navegar (abaixo de 1024px)
  useEffect(() => {
    setDrawerAberto(false)
  }, [local.pathname])

  // trava o scroll do corpo enquanto o drawer cobre a tela
  useEffect(() => {
    if (drawerAberto) {
      const anterior = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = anterior
      }
    }
  }, [drawerAberto])

  const titulo =
    ITENS.find((i) => (i.fim ? local.pathname === i.rota : local.pathname.startsWith(i.rota)))
      ?.label || 'Cockpit'

  const sidebar = (
    <div
      className="flex h-full flex-col"
      style={{ width: LARGURA_SIDEBAR, background: PEN.sidebar }}
    >
      {/* marca */}
      <div className="flex items-center gap-2.5 px-4" style={{ height: 60 }}>
        <div
          className="flex items-center justify-center text-[13px] font-extrabold"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: PEN.acento,
            color: '#FFFFFF',
          }}
        >
          PE
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>
            Plano Estratégico
          </p>
          <p className="truncate text-[10px] leading-tight" style={{ color: PEN.sidebarTexto }}>
            Grupo Extrafruti
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerAberto(false)}
          className="ml-auto rounded p-1 lg:hidden"
          style={{ color: PEN.sidebarTexto }}
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {ITENS.map(({ rota, label, Icone, fim }) => (
          <NavLink
            key={rota}
            to={rota}
            end={fim}
            className={({ isActive }) =>
              cn(
                'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                isActive ? 'font-semibold' : 'hover:bg-white/5',
              )
            }
            style={({ isActive }) => ({
              background: isActive ? PEN.sidebarAtivo : 'transparent',
              color: isActive ? PEN.sidebarTextoAtivo : PEN.sidebarTexto,
            })}
          >
            <Icone className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 18/11/2026 — volta ao portal. Sem isto o /pen é um beco sem saída:
          o shell tem menu próprio e não há caminho de volta às telas do PGE. */}
      <NavLink
        to="/"
        className="mx-2 mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/5"
        style={{ color: PEN.sidebarTexto }}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">Voltar ao portal</span>
      </NavLink>

      <div
        className="px-4 py-3 text-[10px] leading-relaxed"
        style={{ color: PEN.sidebarTexto, borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        Fase 0 · Fundação
      </div>
    </div>
  )

  return (
    <PenCtx.Provider value={{ empresa, setEmpresa, ciclo, setCiclo }}>
      <div
        className="flex min-h-screen"
        style={{ background: PEN.conteudo, fontFamily: PEN.fonte }}
      >
        {/* sidebar fixa (desktop) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</aside>

        {/* drawer (abaixo de 1024px) */}
        {drawerAberto && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setDrawerAberto(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 shadow-2xl">{sidebar}</div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:ml-[232px]">
          {/* topbar */}
          <header
            className="sticky top-0 z-20 flex items-center gap-3 px-3 sm:px-5"
            style={{
              height: 60,
              background: PEN.topbar,
              borderBottom: `1px solid ${PEN.borda}`,
            }}
          >
            <button
              type="button"
              onClick={() => setDrawerAberto(true)}
              className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" style={{ color: PEN.texto }} />
            </button>

            <h1
              className="truncate text-[15px] font-bold sm:text-[16px]"
              style={{ color: PEN.texto }}
            >
              {titulo}
            </h1>

            <div className="ml-auto flex items-center gap-2">
              <label className="hidden items-center gap-1.5 sm:flex" title="Empresa">
                <Building2 className="h-3.5 w-3.5" style={{ color: PEN.textoSecundario }} />
                <select
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value as PenEmpresa)}
                  className="h-8 cursor-pointer rounded-lg border bg-white px-2 text-[12px] font-medium focus:outline-none"
                  style={{ borderColor: PEN.borda, color: PEN.texto, borderRadius: 8 }}
                >
                  {PEN_EMPRESAS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5" title="Ciclo">
                <CalendarRange className="h-3.5 w-3.5" style={{ color: PEN.textoSecundario }} />
                <select
                  value={ciclo}
                  onChange={(e) => setCiclo(e.target.value as PenCiclo)}
                  className="h-8 cursor-pointer rounded-lg border bg-white px-2 text-[12px] font-medium focus:outline-none"
                  style={{ borderColor: PEN.borda, color: PEN.texto, borderRadius: 8 }}
                >
                  {PEN_CICLOS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          {/* conteúdo */}
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5">
            <Outlet />
          </main>
        </div>
      </div>
    </PenCtx.Provider>
  )
}
