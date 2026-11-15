import { useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown, Columns3, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ============================================================================
// TABELA COM ORDENAÇÃO, REDIMENSIONAMENTO E REORDENAÇÃO (15/11/2026)
//
// Componente genérico usado nas duas tabelas da aba Running.
//
//   · clique no cabeçalho       → ordena asc/desc
//   · arrastar a borda direita  → redimensiona a coluna
//   · arrastar o cabeçalho      → reordena a coluna
//
// A personalização é PERSISTIDA por usuário em localStorage, com uma chave por
// tabela — preferência do dono: layout, colunas e ordem ficam por usuário.
// ============================================================================

export interface Coluna {
  /** chave única da coluna */
  key: string
  /** rótulo exibido */
  label: string
  /** largura inicial em px */
  largura?: number
  /** alinhamento */
  align?: 'left' | 'right' | 'center'
  /** valor para ordenação (default: row[key]) */
  valor?: (row: any) => any
  /** render da célula */
  render: (row: any) => React.ReactNode
  /** classe extra na célula */
  className?: string
}

interface Props {
  /** chave de persistência (ex.: 'running.recentes') */
  id: string
  colunas: Coluna[]
  dados: any[]
  /** máximo de linhas (0 = todas) */
  limite?: number
  vazio?: React.ReactNode
  /** f) clique na linha (15/11/2026) — abre o detalhe do registro */
  onLinhaClique?: (row: any) => void
}

// 15/11/2026 — mínimo por coluna calculado do RÓTULO, não um valor fixo.
// Um cabeçalho "DURAÇÃO" com 60px virava "AÇÃO" (o print mostrou isso) e o
// valor "50:42" cortava para "42". Agora o piso é o que o rótulo ocupa.
const LARGURA_MIN = 78

export default function TabelaInterativa({
  id,
  colunas,
  dados,
  limite,
  vazio,
  onLinhaClique,
}: Props) {
  const STORAGE = 'll5_tabela_' + id

  // ordem das colunas + larguras, persistidas
  const [estado, setEstado] = useState<{ ordem: string[]; larguras: Record<string, number> }>(
    () => {
      // padrão a partir das definições atuais
      const padrao = {
        ordem: colunas.map((c) => c.key),
        larguras: Object.fromEntries(colunas.map((c) => [c.key, c.largura || 120])),
      }

      try {
        const raw = localStorage.getItem(STORAGE)
        if (raw) {
          const p = JSON.parse(raw)
          if (p && Array.isArray(p.ordem)) {
            // 15/11/2026 — larguras salvas ANTES desta correção ficaram
            // pequenas demais (colunas cortadas). Pisamos no mínimo atual:
            // se a largura gravada for menor que o piso, usamos o piso.
            const larg: Record<string, number> = {}
            for (const c of colunas) {
              const salva = Number((p.larguras || {})[c.key] || 0)
              const alvo = c.largura || 120
              larg[c.key] = salva > 0 ? Math.max(salva, Math.min(alvo, LARGURA_MIN)) : alvo
            }
            // largura nunca abaixo do piso, nunca abaixo do padrão da coluna
            for (const c of colunas) {
              if (larg[c.key] < LARGURA_MIN) larg[c.key] = Math.max(c.largura || 120, LARGURA_MIN)
            }
            return { ordem: p.ordem, larguras: { ...padrao.larguras, ...larg } }
          }
        }
      } catch (_e) {
        // preferência corrompida: usa o padrão
      }
      return padrao
    },
  )

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' })

  const salvar = (novo: typeof estado) => {
    setEstado(novo)
    try {
      localStorage.setItem(STORAGE, JSON.stringify(novo))
    } catch (_) {
      // sem persistência: segue funcionando
    }
  }

  // (e) colunas OCULTAS — persistidas junto com ordem/larguras
  const [ocultas, setOcultas] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE + '_ocultas')
      if (raw) {
        const p = JSON.parse(raw)
        if (Array.isArray(p)) return p
      }
    } catch (_) {
      // sem preferência: todas visíveis
    }
    return []
  })

  const alternarColuna = (key: string) => {
    setOcultas((prev) => {
      const novo = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        localStorage.setItem(STORAGE + '_ocultas', JSON.stringify(novo))
      } catch (_) {
        // segue sem persistir
      }
      return novo
    })
  }

  // colunas na ordem escolhida (ignora chaves que não existem mais)
  const cols = useMemo(() => {
    const mapa = new Map(colunas.map((c) => [c.key, c]))
    const naOrdem = estado.ordem.map((k) => mapa.get(k)).filter(Boolean) as Coluna[]
    for (const c of colunas) {
      if (!naOrdem.some((x) => x.key === c.key)) naOrdem.push(c)
    }
    return naOrdem
  }, [colunas, estado.ordem])

  // colunas efetivamente renderizadas
  const visiveis = useMemo(() => cols.filter((c) => !ocultas.includes(c.key)), [cols, ocultas])

  const ordenados = useMemo(() => {
    let lista = [...dados]
    if (sort.key) {
      const col = colunas.find((c) => c.key === sort.key)
      const pegar = (row: any) => (col?.valor ? col.valor(row) : row[sort.key as keyof typeof row])
      lista.sort((a, b) => {
        const va = pegar(a)
        const vb = pegar(b)
        // numérico
        if (typeof va === 'number' && typeof vb === 'number') {
          return sort.dir === 'asc' ? va - vb : vb - va
        }
        const sa = String(va ?? '').toLowerCase()
        const sb = String(vb ?? '').toLowerCase()
        return sort.dir === 'asc' ? sa.localeCompare(sb, 'pt-BR') : sb.localeCompare(sa, 'pt-BR')
      })
    }
    return limite && limite > 0 ? lista.slice(0, limite) : lista
  }, [dados, sort, colunas, limite])

  const alternarSort = (key: string) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
  }

  // ---- redimensionar ----
  const arrastandoLargura = useRef<{ key: string; inicioX: number; larguraInicial: number } | null>(
    null,
  )
  const comecarLargura = (e: React.MouseEvent, key: string) => {
    e.preventDefault()
    e.stopPropagation()
    arrastandoLargura.current = {
      key,
      inicioX: e.clientX,
      larguraInicial: estado.larguras[key] || 120,
    }

    const mover = (ev: MouseEvent) => {
      const d = arrastandoLargura.current
      if (!d) return
      const nova = Math.max(LARGURA_MIN, d.larguraInicial + (ev.clientX - d.inicioX))
      setEstado((prev) => ({ ...prev, larguras: { ...prev.larguras, [d.key]: nova } }))
    }
    const soltar = () => {
      document.removeEventListener('mousemove', mover)
      document.removeEventListener('mouseup', soltar)
      arrastandoLargura.current = null
      // persiste ao fim do arrasto
      setEstado((prev) => {
        try {
          localStorage.setItem(STORAGE, JSON.stringify(prev))
        } catch (_e) {
          // localStorage indisponível: a largura vale só nesta sessão
        }
        return prev
      })
    }
    document.addEventListener('mousemove', mover)
    document.addEventListener('mouseup', soltar)
  }

  // ---- reordenar coluna por arrasto ----
  const [arrastandoCol, setArrastandoCol] = useState<string | null>(null)

  const soltarEm = (destino: string) => {
    if (!arrastandoCol || arrastandoCol === destino) return
    const atual = [...estado.ordem]
    const de = atual.indexOf(arrastandoCol)
    const para = atual.indexOf(destino)
    if (de < 0 || para < 0) return
    atual.splice(de, 1)
    atual.splice(para, 0, arrastandoCol)
    salvar({ ...estado, ordem: atual })
    setArrastandoCol(null)
  }

  if (!dados.length && vazio) return <>{vazio}</>

  return (
    <div>
      {/* (e) barra de exibir/ocultar colunas */}
      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-gray-500 hover:text-[#1b5e20] transition-colors"
            >
              <Columns3 className="h-3 w-3" />
              Colunas ({visiveis.length}/{cols.length})
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-white border-gray-200 z-[130] max-h-[320px] overflow-y-auto"
          >
            {cols.map((c) => {
              const ativa = !ocultas.includes(c.key)
              return (
                <DropdownMenuItem
                  key={c.key}
                  onClick={(ev) => {
                    ev.preventDefault()
                    alternarColuna(c.key)
                  }}
                  className="cursor-pointer text-[12px] gap-2"
                >
                  <span
                    className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                      ativa ? 'bg-[#1b5e20] border-[#1b5e20]' : 'border-gray-300 bg-white',
                    )}
                  >
                    {ativa && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span className={cn(ativa ? 'text-gray-800' : 'text-gray-400')}>{c.label}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] table-fixed">
          <colgroup>
            {visiveis.map((c) => (
              <col
                key={c.key}
                style={{ width: (estado.larguras[c.key] || c.largura || 120) + 'px' }}
              />
            ))}
          </colgroup>
          <thead className="bg-gray-50/70">
            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {visiveis.map((c) => (
                <th
                  key={c.key}
                  draggable
                  onDragStart={() => setArrastandoCol(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => soltarEm(c.key)}
                  onClick={() => alternarSort(c.key)}
                  className={cn(
                    'relative px-3 py-2 select-none cursor-pointer hover:bg-gray-100/70 transition-colors overflow-hidden',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    arrastandoCol === c.key && 'opacity-40',
                  )}
                  // 15/11/2026 — o rótulo completo no tooltip: com a coluna
                  // estreita, "DURAÇÃO" aparecia cortado como "AÇÃO".
                  title={c.label + ' — clique para ordenar · arraste para reordenar'}
                >
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {c.label}
                    {sort.key === c.key ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowDown className="h-2.5 w-2.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-2.5 w-2.5 opacity-25" />
                    )}
                  </span>
                  {/* alça de redimensionamento */}
                  <span
                    onMouseDown={(e) => comecarLargura(e, c.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#1b5e20]/30"
                    title="Arraste para redimensionar"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ordenados.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onLinhaClique?.(row)}
                className={cn(
                  'hover:bg-gray-50/50',
                  // b (15/11/2026) — linha com cor diferente quando a sessão
                  // está concluída: leitura imediata do andamento do tratamento.
                  row._concluida && 'bg-emerald-50/40',
                  // f) linha clicável abre o detalhe
                  onLinhaClique && 'cursor-pointer',
                )}
              >
                {visiveis.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2 truncate',
                      c.align === 'right' && 'text-right tabular-nums',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
