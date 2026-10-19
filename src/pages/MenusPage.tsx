import { useEffect, useState } from 'react'
import { ListTree, Loader2, RefreshCw, GripVertical } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBotoes } from '@/services/botoes-service'
import { MENU_MODULOS } from '@/services/permissoes-service'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// Fase 11 — Árvore de Menus: visualiza a árvore de navegação do portal
// (coleção menus, seed Fase 2) com seção/ordem/rota/ativo e o módulo de
// permissão associado. Ativo editável admin (toggle imediato).

interface MenuItem {
  id: string
  titulo: string
  rota: string
  secao: string
  ordem: number
  icone: string
  ativo: boolean
}

export default function MenusPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const isAdmin = user?.grupoNome === 'Admin' || user?.grupo_id === ''

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('menus').getFullList({ sort: 'secao,ordem' })
      setItens(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const toggleAtivo = async (item: MenuItem) => {
    try {
      await pb.send('/backend/v1/menus/toggle', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, ativo: !item.ativo }),
      })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const secoes = Array.from(new Set(itens.map((i) => i.secao)))

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ListTree className="h-6 w-6 text-[#1B5E20]" />
            Árvore de Menus
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Estrutura de navegação do portal — seções, ordem, rotas e visibilidade
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} className="h-9">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
        </div>
      ) : (
        <div className="space-y-4">
          {secoes.map((sec) => (
            <div
              key={sec}
              className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  {sec}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {itens
                  .filter((i) => i.secao === sec)
                  .map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                      <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                      <span className="text-[11px] font-bold text-gray-400 tabular-nums w-6">
                        {i.ordem}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-900">{i.titulo}</div>
                        <div className="text-[11px] text-gray-400">
                          {i.rota || '—'}
                          {MENU_MODULOS[i.rota] ? ' · módulo: ' + MENU_MODULOS[i.rota] : ''}
                        </div>
                      </div>
                      <Switch
                        checked={i.ativo}
                        onCheckedChange={() => pode('menus', 'toggle_ativo') && toggleAtivo(i)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {!isAdmin && (
            <p className="text-[11px] text-gray-400">
              Alterações de visibilidade são registradas; em grupos não-admin o toggle pode ser
              restrito pelo sistema.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
