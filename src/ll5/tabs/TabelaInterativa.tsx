import { useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
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
}

const LARGURA_MIN = 60

export default function TabelaInterativa({ id, colunas, dados, limite, vazio }: Props) {
  const STORAGE = 'll5_tabela_' + id

  // ordem das colunas + larguras, persistidas
  const [estado, setEstado] = useState<{ ordem: string[]; larguras: Record<string, number> }>(
    () => {
      try {
        const raw = localStorage.getItem(STORAGE)
        if (raw) {
          const p = JSON.parse(raw)
          if (p && Array.isArray(p.ordem)) return p
        }
      } catch (_) {
        // usa o padrão
      }
      return {
        ordem: colunas.map((c) => c.key),
        larguras: Object.fromEntries(colunas.map((c) => [c.key, c.largura || 120])),
      }
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

  // colunas na ordem escolhida (ignora chaves que não existem mais)
  const cols = useMemo(() => {
    const mapa = new Map(colunas.map((c) => [c.key, c]))
    const naOrdem = estado.ordem.map((k) => mapa.get(k)).filter(Boolean) as Coluna[]
    // acrescenta colunas novas que ainda não estavam na preferência
    for (const c of colunas) {
      if (!naOrdem.some((x) => x.key === c.key)) naOrdem.push(c)
    }
    return naOrdem
  }, [colunas, estado.ordem])

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
        } catch (_) {}
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
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] table-fixed">
        <colgroup>
          {cols.map((c) => (
            <col
              key={c.key}
              style={{ width: (estado.larguras[c.key] || c.largura || 120) + 'px' }}
            />
          ))}
        </colgroup>
        <thead className="bg-gray-50/70">
          <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {cols.map((c) => (
              <th
                key={c.key}
                draggable
                onDragStart={() => setArrastandoCol(c.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => soltarEm(c.key)}
                onClick={() => alternarSort(c.key)}
                className={cn(
                  'relative px-3 py-2 select-none cursor-pointer hover:bg-gray-100/70 transition-colors',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  arrastandoCol === c.key && 'opacity-40',
                )}
                title="Clique para ordenar · arraste para reordenar"
              >
                <span className="inline-flex items-center gap-1">
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
            <tr key={row.id || i} className="hover:bg-gray-50/50">
              {cols.map((c) => (
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
  )
}
