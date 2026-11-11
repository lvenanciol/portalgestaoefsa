import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { usePermissoes } from '@/hooks/use-permissoes'
import { menuVisivel, MENU_MODULOS } from '@/services/permissoes-service'

/**
 * Tela de bloqueio amigável para rota sem permissão "ver".
 * Antes, a Sidebar escondia o item do menu, mas digitar a URL na barra de
 * endereço entrava na tela — o gate era apenas visual (cosmético).
 */
function AcessoNegado() {
  const location = useLocation()
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="h-14 w-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-gray-900">Acesso não liberado</h2>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
          Seu grupo de usuários não tem permissão para abrir esta tela.
          <br />
          Se você precisa deste acesso, solicite ao administrador do sistema.
        </p>
        <p className="mt-3 text-[11px] font-mono text-gray-400 break-all">{location.pathname}</p>
      </div>
    </div>
  )
}

/**
 * Guard de rota por permissão.
 * - Sem permissões carregadas: MANTÉM AGUARDANDO (antes liberava — fail-open;
 *   11/11/2026, pedido "só acessar telas concedidas": agora espera o load
 *   terminar e decide com as permissões reais; se nunca chegarem, bloqueia).
 * - Admin: libera tudo.
 * - Demais: exige `ver` no módulo da rota (MENU_MODULOS); se a rota exata não
 *   estiver mapeada, tenta a raiz (ex.: /integracoes/sankhya -> /integracoes).
 * - Rota não mapeada em nenhum nível: NEGA para quem não é Admin.
 *
 * MUDANÇA 11/11/2026 (pedido do dono: "só acessa as telas concedidas ao grupo"):
 * o guard era FAIL-OPEN — rota fora do mapa liberava, e com isso /logomarcas e
 * /integracoes (que faltavam no MENU_MODULOS) entravam por URL digitada em
 * qualquer grupo. Agora é FAIL-CLOSED: sem módulo declarado, sem acesso.
 * Tela nova precisa ser registrada em MENU_MODULOS para valer a alguém que não
 * seja Admin — é o preço consciente de não vazar tela por esquecimento.
 */
export function RotaProtegida({ children }: { children: ReactNode }) {
  const { carregando, permissoes } = usePermissoes()
  const location = useLocation()

  // Enquanto carrega não decidimos nada (evita piscar/bloquear no F5).
  if (carregando) return <>{children}</>
  // Sem permissões não há como provar concessão: nega em vez de liberar.
  if (!permissoes) return <AcessoNegado />
  if (permissoes.grupoNome === 'Admin') return <>{children}</>

  const caminho = location.pathname

  if (Object.prototype.hasOwnProperty.call(MENU_MODULOS, caminho)) {
    return menuVisivel(permissoes, caminho) ? <>{children}</> : <AcessoNegado />
  }

  const raiz = '/' + caminho.split('/').filter(Boolean)[0]
  if (raiz !== caminho && Object.prototype.hasOwnProperty.call(MENU_MODULOS, raiz)) {
    return menuVisivel(permissoes, raiz) ? <>{children}</> : <AcessoNegado />
  }

  return <AcessoNegado />
}
