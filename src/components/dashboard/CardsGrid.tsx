import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GripVertical, EyeOff, RotateCcw } from 'lucide-react'

// ============================================================================
// GRID DE CARDS PERSONALIZÁVEL — 18/11/2026
//
// DIRETIVA DO DONO (Dashboard executivo):
//   a) permitir ocultar cards
//   b) permitir reorganizar os cards com clique e arrasto
//
// PREFERÊNCIA POR USUÁRIO: a ordem e os cards ocultos são salvos no
// localStorage com uma chave que inclui o id do usuário — cada pessoa tem o
// seu layout, como no PGE "Desempenho Unidades". Não vai para o banco: é
// preferência de interface, não dado de negócio.
//
// COMO USA:
//   <CardsGrid usuarioId={user.id} cards={[{id:'kpis', node:<Kpis/>, className:'lg:col-span-3'}, ...]} />
//
// O arrasto usa HTML5 nativo (draggable) — sem biblioteca nova. Funciona com
// mouse; no toque, os botões ↑/↓ (nas ações do card) fazem o mesmo.
// ============================================================================

export interface CardDef {
  /** chave estável — muda-la faz o layout salvo do usuário "esquecer" o card */
  id: string
  titulo: string
  node: ReactNode
  /** classes de span no grid (ex.: 'lg:col-span-2') */
  className?: string
}

interface Props {
  usuarioId: string
  cards: CardDef[]
  /** classes do container */
  className?: string
}

interface Layout {
  ordem: string[]
  ocultos: string[]
}

function chaveStorage(usuarioId: string) {
  return `pge_dashboard_layout_v1::${usuarioId || 'anon'}`
}

function carregarLayout(usuarioId: string, idsValidos: string[]): Layout {
  const padrao: Layout = { ordem: idsValidos, ocultos: [] }
  try {
    const raw = localStorage.getItem(chaveStorage(usuarioId))
    if (!raw) return padrao
    const p = JSON.parse(raw) as Partial<Layout>
    // Reconcilia: descarta ids que não existem mais e acrescenta os novos
    // no fim, para um card novo nunca ficar invisível por causa de layout velho.
    const ordemSalva = Array.isArray(p.ordem) ? p.ordem.filter((x) => idsValidos.includes(x)) : []
    const faltando = idsValidos.filter((id) => !ordemSalva.includes(id))
    const ocultos = Array.isArray(p.ocultos) ? p.ocultos.filter((x) => idsValidos.includes(x)) : []
    return { ordem: [...ordemSalva, ...faltando], ocultos }
  } catch {
    return padrao
  }
}

export function CardsGrid({ usuarioId, cards, className = '' }: Props) {
  const ids = useMemo(() => cards.map((c) => c.id), [cards])
  const [layout, setLayout] = useState<Layout>(() => carregarLayout(usuarioId, ids))
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [menuAberto, setMenuAberto] = useState(false)

  // recarrega quando troca de usuário
  useEffect(() => {
    setLayout(carregarLayout(usuarioId, ids))
  }, [usuarioId, ids])

  const salvar = useCallback(
    (novo: Layout) => {
      setLayout(novo)
      try {
        localStorage.setItem(chaveStorage(usuarioId), JSON.stringify(novo))
      } catch {
        /* storage cheio/indisponível: layout vale só nesta sessão */
      }
    },
    [usuarioId],
  )

  const moverPara = (origem: string, destino: string) => {
    if (!origem || !destino || origem === destino) return
    const ordem = [...layout.ordem]
    const i = ordem.indexOf(origem)
    const j = ordem.indexOf(destino)
    if (i < 0 || j < 0) return
    ordem.splice(i, 1)
    ordem.splice(j, 0, origem)
    salvar({ ...layout, ordem })
  }

  const moverCima = (id: string) => {
    const i = layout.ordem.indexOf(id)
    if (i <= 0) return
    const ordem = [...layout.ordem]
    ;[ordem[i - 1], ordem[i]] = [ordem[i], ordem[i - 1]]
    salvar({ ...layout, ordem })
  }

  const moverBaixo = (id: string) => {
    const i = layout.ordem.indexOf(id)
    if (i < 0 || i >= layout.ordem.length - 1) return
    const ordem = [...layout.ordem]
    ;[ordem[i + 1], ordem[i]] = [ordem[i], ordem[i + 1]]
    salvar({ ...layout, ordem })
  }

  const alternarOculto = (id: string) => {
    const ocultos = layout.ocultos.includes(id)
      ? layout.ocultos.filter((x) => x !== id)
      : [...layout.ocultos, id]
    salvar({ ...layout, ocultos })
  }

  const restaurar = () => salvar({ ordem: ids, ocultos: [] })

  const visiveis = layout.ordem
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c && !layout.ocultos.includes(c.id))

  const ocultosDefs = cards.filter((c) => layout.ocultos.includes(c.id))

  return (
    <div className="relative">
      {/* Barra de personalização */}
      <div className="flex items-center justify-end gap-2 mb-2">
        {layout.ocultos.length > 0 && (
          <span className="text-[11px] text-gray-500 mr-auto">
            {layout.ocultos.length} card(s) oculto(s)
          </span>
        )}
        <button
          type="button"
          onClick={() => setMenuAberto((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
          title="Escolher quais cards aparecem"
        >
          <EyeOff className="h-3.5 w-3.5" />
          Cards
        </button>
        {(layout.ocultos.length > 0 || layout.ordem.join(',') !== ids.join(',')) && (
          <button
            type="button"
            onClick={restaurar}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            title="Voltar ao layout original"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        )}
      </div>

      {/* Painel de cards ocultos */}
      {menuAberto && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-xl border border-gray-200 bg-white shadow-xl p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Mostrar no dashboard
          </p>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {cards.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!layout.ocultos.includes(c.id)}
                  onChange={() => alternarOculto(c.id)}
                  className="h-3.5 w-3.5 accent-[#1B5E20]"
                />
                <span className="flex-1 truncate">{c.titulo}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            className="mt-2 w-full rounded-md bg-[#1B5E20] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0F3D13]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Grid */}
      <div className={className}>
        {visiveis.map((c) => (
          <div
            key={c.id}
            className={
              (c.className || '') +
              ' group relative transition-all ' +
              (sobre === c.id ? 'ring-2 ring-[#1B5E20]/40 rounded-xl' : '') +
              (arrastando === c.id ? ' opacity-40' : '')
            }
            onDragOver={(e) => {
              e.preventDefault()
              if (sobre !== c.id) setSobre(c.id)
            }}
            onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              const origem = e.dataTransfer.getData('text/plain') || arrastando
              setSobre(null)
              setArrastando(null)
              if (origem) moverPara(origem, c.id)
            }}
          >
            {/* Alça de arrasto + ações do card (aparecem no hover) */}
            <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setArrastando(c.id)
                }}
                onDragEnd={() => {
                  setArrastando(null)
                  setSobre(null)
                }}
                className="h-6 w-6 rounded-md bg-white/95 border border-gray-200 text-gray-400 hover:text-gray-700 inline-flex items-center justify-center cursor-grab active:cursor-grabbing"
                title="Arraste para reorganizar"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moverCima(c.id)}
                className="h-6 w-6 rounded-md bg-white/95 border border-gray-200 text-gray-400 hover:text-gray-700 text-[11px] font-bold"
                title="Mover para cima"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moverBaixo(c.id)}
                className="h-6 w-6 rounded-md bg-white/95 border border-gray-200 text-gray-400 hover:text-gray-700 text-[11px] font-bold"
                title="Mover para baixo"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => alternarOculto(c.id)}
                className="h-6 w-6 rounded-md bg-white/95 border border-gray-200 text-gray-400 hover:text-red-600 inline-flex items-center justify-center"
                title={'Ocultar "' + c.titulo + '"'}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>

            {c.node}
          </div>
        ))}
      </div>

      {/* Cards ocultos: sempre há como trazê-los de volta */}
      {ocultosDefs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-400">Ocultos:</span>
          {ocultosDefs.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarOculto(c.id)}
              className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-[#1B5E20] hover:text-[#1B5E20]"
              title={'Mostrar "' + c.titulo + '"'}
            >
              + {c.titulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
