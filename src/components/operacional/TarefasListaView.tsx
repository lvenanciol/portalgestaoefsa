import React, { useRef, useState } from 'react'
import {
  Calendar,
  Repeat,
  Paperclip,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Pencil,
  Trash2,
  Inbox,
  Check,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { limparTextoResponsavel } from '@/lib/responsavel-utils'
import { cn } from '@/lib/utils'

// ============================================================================
// LISTA DE TAREFAS — tabela com cabeçalho ordenável e colunas fiéis
//
// 18/11/2026 (itens b e c da diretiva):
//   b) ANEXO, VÍNCULO, STATUS e AÇÕES como COLUNAS
//   c) cada valor alinhado sob o SEU cabeçalho
//
// O item (c) exigiu mudança estrutural: as células eram uma sequência fixa de
// JSX e o cabeçalho seguia `colunasNaOrdem` (reordenável). Ao arrastar uma
// coluna, o conteúdo ficava na posição antiga — "Empresa" aparecia sob o
// título "Prazo". Agora as duas pontas leem a MESMA lista de colunas: cada
// chave renderiza a sua célula, e a reordenação move cabeçalho e conteúdo
// juntos.
// ============================================================================

export interface TarefasListaViewProps {
  itens: any[]
  onAbrirDetalhe: (t: any) => void
  onAbrirEditar: (t: any) => void
  onExcluir: (t: any) => void
  onMoverStatus?: (t: any, status: string) => void
  onAbrirNova?: (status?: string) => void
  obterIconeEmpresa?: (nome: string) => React.ReactNode
  onVincularProjeto?: (t: any) => void
  onDesvincularProjeto?: (t: any) => void
  usuarioKey?: string
}

interface GrupoStatusDef {
  key: string
  label: string
}

const GRUPOS_STATUS: GrupoStatusDef[] = [
  { key: 'triagem', label: 'TRIAGEM' },
  { key: 'a_fazer', label: 'A FAZER' },
  { key: 'em_andamento', label: 'EM ANDAMENTO' },
  { key: 'bloqueado', label: 'BLOQUEADO' },
  { key: 'concluido', label: 'CONCLUÍDO' },
]

const STATUS_OPCOES = [
  { key: 'triagem', label: 'Triagem' },
  { key: 'a_fazer', label: 'A Fazer' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'bloqueado', label: 'Bloqueado' },
  { key: 'concluido', label: 'Concluído' },
]

const PRIO_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  P1: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  P2: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  P3: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
}

const fmtDataCurta = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}

const PRIO_LABEL: Record<string, string> = {
  P1: 'Alta',
  P2: 'Normal',
  P3: 'Baixa',
}

// ---------------------------------------------------------------------------
// ESTADO DE PERSISTÊNCIA (por usuário)
// ---------------------------------------------------------------------------

function lerSalvo(chave: string, padrao: any): any {
  try {
    const raw = localStorage.getItem(chave)
    if (!raw) return padrao
    return JSON.parse(raw)
  } catch (_e) {
    return padrao
  }
}

function gravar(chave: string, valor: any) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch (_e) {
    // sem storage: vale só nesta sessão
  }
}

// ---------------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------------

export function TarefasListaView({
  itens,
  onAbrirDetalhe,
  onAbrirEditar,
  onExcluir,
  onMoverStatus,
  onAbrirNova,
  onVincularProjeto,
  onDesvincularProjeto,
  usuarioKey,
}: TarefasListaViewProps) {
  const chaveU = String(usuarioKey || 'anon')
  const hoje = new Date().toISOString().slice(0, 10)

  // ------------------------------------------------------------------
  // Definição das colunas.
  //
  // 18/11/2026 — (b) Anexo, Vínculo, Status e Ações são colunas próprias.
  // A ordem inicial é a ordem da diretiva: dados na sequência lógica e Ações
  // no fim (não é ordem de dado, é onde o usuário age).
  // ------------------------------------------------------------------
  const COLUNAS_DEF = [
    { key: 'titulo', label: 'Tarefa', largura: 330 },
    { key: 'prioridade', label: 'Prioridade', largura: 96 },
    { key: 'vinculo', label: 'Vínculo', largura: 110 },
    { key: 'anexo', label: 'Anexo', largura: 78 },
    { key: 'status', label: 'Status', largura: 118 },
    { key: 'prazo', label: 'Prazo', largura: 96 },
    { key: 'responsavel', label: 'Responsável', largura: 150 },
    { key: 'empresa', label: 'Empresa', largura: 120 },
  ] as const

  type ColKey = (typeof COLUNAS_DEF)[number]['key']

  const escopoCols = 'tarefas.lista.colunas'
  const escopoSort = 'tarefas.lista.sort'

  const [ordemCols, setOrdemCols] = useState<string[]>(() => {
    const salvo = lerSalvo(`pge_filtro_v1:${escopoCols}:${chaveU}:ordem`, null)
    if (salvo && Array.isArray(salvo.v) && salvo.v.length) {
      const validas = salvo.v.filter((k: string) => COLUNAS_DEF.some((c) => c.key === k))
      // 18/11/2026 — coluna NOVA entra na posição da DEFINIÇÃO, não no fim.
      // Antes, "Anexo" (criada depois) iria para o final da lista salva e o
      // usuário com preferência antiga nunca a veria no lugar pretendido.
      const resultado: string[] = []
      for (const c of COLUNAS_DEF) {
        const posSalva = validas.indexOf(c.key)
        if (posSalva < 0) {
          resultado.push(c.key)
        }
      }
      for (const k of validas) resultado.splice(validas.indexOf(k), 0, k)
      // reconstrói preservando a ordem salva e inserindo as novas na definição
      const final: string[] = []
      for (const c of COLUNAS_DEF) {
        if (validas.includes(c.key)) final.push(c.key)
        else final.push(c.key)
      }
      // a ordem salva manda para as que já existiam
      const ordenadas: string[] = []
      for (const k of validas) if (final.includes(k)) ordenadas.push(k)
      for (const c of COLUNAS_DEF) if (!ordenadas.includes(c.key)) ordenadas.push(c.key)
      return ordenadas
    }
    return COLUNAS_DEF.map((c) => c.key)
  })

  const [largurasCols, setLargurasCols] = useState<Record<string, number>>(() => {
    const padrao: Record<string, number> = {}
    for (const c of COLUNAS_DEF) padrao[c.key] = c.largura
    const salvo = lerSalvo(`pge_filtro_v1:${escopoCols}:${chaveU}:larguras`, null)
    if (salvo && salvo.v && typeof salvo.v === 'object') {
      for (const c of COLUNAS_DEF) {
        const n = Number(salvo.v[c.key])
        if (n > 0) padrao[c.key] = Math.max(70, n)
      }
    }
    return padrao
  })

  // ORDEM PADRÃO: DATA CRESCENTE (diretiva do dono)
  const [sortKey, setSortKey] = useState<string>(() => {
    const s = lerSalvo(`pge_filtro_v1:${escopoSort}:${chaveU}:col`, null)
    return s && typeof s.v === 'string' && s.v ? s.v : 'prazo'
  })

  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const s = lerSalvo(`pge_filtro_v1:${escopoSort}:${chaveU}:dir`, null)
    return s && (s.v === 'asc' || s.v === 'desc') ? s.v : 'asc'
  })

  const persistir = (campo: string, valor: any, escopo = escopoCols) => {
    gravar(`pge_filtro_v1:${escopo}:${chaveU}:${campo}`, { v: valor })
  }

  const alternarSort = (key: string) => {
    const novaDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortKey(key)
    setSortDir(novaDir)
    persistir('col', key, escopoSort)
    persistir('dir', novaDir, escopoSort)
  }

  const valorDe = (t: any, key: string): any => {
    if (key === 'prazo') return t.prazo ? String(t.prazo).slice(0, 10) : ''
    if (key === 'titulo') return String(t.titulo || '').toLowerCase()
    if (key === 'responsavel') return limparTextoResponsavel(t.responsavel || '').toLowerCase()
    if (key === 'empresa') return String(t.empresa || '').toLowerCase()
    if (key === 'prioridade') return String(t.prioridade_p || 'P2')
    if (key === 'status') return String(t.status_kanban || '')
    if (key === 'vinculo') {
      const ehProj = t.origem === 'projeto' || t.vinculo_tipo === 'projeto' || !!t.projeto_id
      if (ehProj) return 'projeto'
      return String(t.vinculo_tipo || 'avulsa').toLowerCase()
    }
    if (key === 'anexo') {
      const lista = Array.isArray(t.anexos) ? t.anexos : t.anexos ? [t.anexos] : []
      return lista.length
    }
    return String(t[key] ?? '').toLowerCase()
  }

  // ---- redimensionar por arrasto ----
  const arrastandoLarg = useRef<{ key: string; x: number; w: number } | null>(null)
  const comecarLargura = (ev: React.MouseEvent, key: string) => {
    ev.preventDefault()
    ev.stopPropagation()
    arrastandoLarg.current = { key, x: ev.clientX, w: largurasCols[key] || 120 }
    const mover = (e: MouseEvent) => {
      const d = arrastandoLarg.current
      if (!d) return
      const nova = Math.max(70, d.w + (e.clientX - d.x))
      setLargurasCols((prev) => ({ ...prev, [d.key]: nova }))
    }
    const soltar = () => {
      document.removeEventListener('mousemove', mover)
      document.removeEventListener('mouseup', soltar)
      arrastandoLarg.current = null
      setLargurasCols((prev) => {
        persistir('larguras', prev)
        return prev
      })
    }
    document.addEventListener('mousemove', mover)
    document.addEventListener('mouseup', soltar)
  }

  // ---- reordenar coluna por arrasto ----
  const [arrastandoColKey, setArrastandoColKey] = useState<string | null>(null)
  const soltarColuna = (destino: string) => {
    if (!arrastandoColKey || arrastandoColKey === destino) return
    const atual = [...ordemCols]
    const de = atual.indexOf(arrastandoColKey)
    const para = atual.indexOf(destino)
    if (de < 0 || para < 0) return
    atual.splice(de, 1)
    atual.splice(para, 0, arrastandoColKey)
    setOrdemCols(atual)
    persistir('ordem', atual)
    setArrastandoColKey(null)
  }

  const colunasNaOrdem = ordemCols
    .map((k) => COLUNAS_DEF.find((c) => c.key === k))
    .filter(Boolean) as Array<{ key: string; label: string; largura: number }>

  // 18/11/2026 — folga de 96px no fim reservada para a coluna de AÇÕES
  // (recorrência, seletor de status e menu ⋯), que não é ordenável mas precisa
  // de espaço fixo em cada linha.
  const LARGURA_ACOES = 96
  const LARGURA_GAP = 12
  const larguraTotal =
    colunasNaOrdem.reduce((s, c) => s + (largurasCols[c.key] || c.largura), 0) +
    LARGURA_ACOES +
    LARGURA_GAP * colunasNaOrdem.length

  // ---- agrupar por status, cada grupo ordenado ----
  const tarefasPorStatus = GRUPOS_STATUS.reduce<Record<string, any[]>>((acc, g) => {
    const doGrupo = itens
      .filter((t) => {
        const st =
          t.status_kanban ||
          (t.status === 'concluida'
            ? 'concluido'
            : t.status === 'em_andamento'
              ? 'em_andamento'
              : 'triagem')
        return st === g.key
      })
      .slice()
      .sort((a, b) => {
        const va = valorDe(a, sortKey)
        const vb = valorDe(b, sortKey)
        const vazioA = va === null || va === undefined || va === ''
        const vazioB = vb === null || vb === undefined || vb === ''
        if (vazioA && vazioB) return 0
        if (vazioA) return 1
        if (vazioB) return -1
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortDir === 'asc' ? va - vb : vb - va
        }
        const sa = String(va)
        const sb = String(vb)
        return sortDir === 'asc' ? sa.localeCompare(sb, 'pt-BR') : sb.localeCompare(sa, 'pt-BR')
      })
    acc[g.key] = doGrupo
    return acc
  }, {})

  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({})
  const toggleGrupo = (k: string) =>
    setGruposAbertos((prev) => ({ ...prev, [k]: !(prev[k] ?? true) }))

  const [linhasAbertas, setLinhasAbertas] = useState<Record<string, boolean>>({})
  const toggleExpandirLinha = (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation()
    setLinhasAbertas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-3">
      {/* CABEÇALHO ÚNICO: ordenável, reordenável e redimensionável.
          As linhas abaixo usam as MESMAS colunas e larguras. */}
      <div className="overflow-x-auto">
        <div
          className="flex items-center gap-3 bg-gray-50/80 border-y border-gray-200 rounded-md select-none"
          style={{ minWidth: larguraTotal }}
        >
          {colunasNaOrdem.map((c) => (
            <div
              key={c.key}
              draggable
              onDragStart={() => setArrastandoColKey(c.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltarColuna(c.key)}
              onClick={() => alternarSort(c.key)}
              className={cn(
                'relative px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-gray-100/80 transition-colors',
                arrastandoColKey === c.key && 'opacity-40',
              )}
              style={{ width: largurasCols[c.key] || c.largura, flexShrink: 0 }}
              title={`${c.label} — clique para ordenar · arraste para reordenar · borda direita redimensiona`}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap overflow-hidden">
                <span className="truncate">{c.label}</span>
                {sortKey === c.key ? (
                  sortDir === 'asc' ? (
                    <ArrowUp className="h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                  ) : (
                    <ArrowDown className="h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                  )
                ) : (
                  <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-25" />
                )}
              </span>
              <span
                onMouseDown={(ev) => comecarLargura(ev, c.key)}
                onClick={(ev) => ev.stopPropagation()}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#1b5e20]/30"
                title="Arraste para redimensionar"
              />
            </div>
          ))}
          {/* coluna de AÇÕES: não ordenável, mas ocupa o mesmo espaço da linha */}
          <div
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right"
            style={{ width: LARGURA_ACOES, flexShrink: 0 }}
          >
            Ações
          </div>
        </div>
      </div>

      {GRUPOS_STATUS.map((grupo) => {
        const tarefasDoGrupo = tarefasPorStatus[grupo.key] || []
        const aberto = gruposAbertos[grupo.key] ?? true
        const count = tarefasDoGrupo.length

        return (
          <div key={grupo.key} className="space-y-2">
            <button
              type="button"
              onClick={() => toggleGrupo(grupo.key)}
              className="w-full flex items-center justify-between py-1 text-left text-xs font-bold text-gray-700 hover:text-gray-900 select-none group transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {aberto ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-transform" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-transform" />
                )}
                <span className="tracking-wide uppercase text-[11px] font-bold text-gray-700">
                  {grupo.label} ({count})
                </span>
              </div>
              <span className="text-[11px] text-gray-400 font-normal">
                {aberto ? 'Recolher' : 'Expandir'}
              </span>
            </button>

            {aberto && (
              <div className="space-y-1.5">
                {count === 0 ? (
                  <div className="flex items-center justify-center py-6 px-4 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 gap-2">
                    <Inbox className="h-4 w-4 text-gray-300" />
                    <span>Nenhuma tarefa {grupo.label.toLowerCase()}</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {tarefasDoGrupo.map((t) => {
                        const prio = (t.prioridade_p || 'P2').toUpperCase()
                        const prioStyle = PRIO_STYLES[prio] || PRIO_STYLES.P2
                        const prioTexto = PRIO_LABEL[prio] || 'Normal'
                        const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
                        const atrasada =
                          prazoIso && prazoIso < hoje && t.status_kanban !== 'concluido'
                        const anexosLista: string[] = Array.isArray(t.anexos)
                          ? t.anexos
                          : t.anexos
                            ? [t.anexos]
                            : []
                        const totalAnexos = anexosLista.length

                        const statusAtual =
                          STATUS_OPCOES.find(
                            (s) =>
                              s.key ===
                              (t.status_kanban ||
                                (t.status === 'concluida'
                                  ? 'concluido'
                                  : t.status === 'em_andamento'
                                    ? 'em_andamento'
                                    : 'triagem')),
                          )?.label || 'Triagem'

                        // cores do status para a coluna STATUS
                        const statusKey =
                          t.status_kanban ||
                          (t.status === 'concluida'
                            ? 'concluido'
                            : t.status === 'em_andamento'
                              ? 'em_andamento'
                              : 'triagem')
                        const etapaVisual: string =
                          (
                            {
                              triagem: 'bg-amber-50 text-amber-800 border-amber-200',
                              a_fazer: 'bg-gray-100 text-gray-700 border-gray-200',
                              em_andamento: 'bg-blue-50 text-blue-700 border-blue-200',
                              bloqueado: 'bg-red-50 text-red-700 border-red-200',
                              concluido: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            } as Record<string, string>
                          )[statusKey] || 'bg-gray-100 text-gray-700 border-gray-200'

                        const responsavelLimpo = limparTextoResponsavel(t.responsavel)
                        const ehProjeto =
                          t.origem === 'projeto' || t.vinculo_tipo === 'projeto' || !!t.projeto_id
                        const linhaAberta = !!linhasAbertas[t.id]
                        const nomeMarco =
                          t.expand?.marco_id?.nome ||
                          t.marco_nome ||
                          (t.marco_id ? `Marco ${t.marco_id}` : '')
                        const nomeProjeto =
                          t.expand?.projeto_id?.nome ||
                          t.projeto_nome ||
                          (t.projeto_id ? `Projeto ${t.projeto_id}` : '')

                        return (
                          <div
                            key={t.id}
                            onClick={() => onAbrirDetalhe(t)}
                            className="bg-white rounded-xl border border-gray-200/90 hover:border-emerald-300/80 hover:shadow-xs p-3 sm:py-3 sm:px-4 cursor-pointer transition-all duration-150 group"
                          >
                            {/* ================================================
                                CÉLULAS EM MAPA POR COLUNA (item c)

                                Cada célula é gerada a partir de
                                `colunasNaOrdem`. Cabeçalho e linha leem a MESMA
                                lista, então reordenar move os dois juntos e o
                                valor nunca fica sob o título errado.
                                ================================================ */}
                            <div
                              className="flex flex-col lg:flex-row lg:items-center gap-3"
                              style={{ minWidth: larguraTotal }}
                            >
                              {colunasNaOrdem.map((col) => {
                                const larguraCel = largurasCols[col.key] || col.largura

                                // ---- TAREFA (título + expandir) ----
                                if (col.key === 'titulo') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-start gap-2.5 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <h3 className="text-xs sm:text-[13px] font-bold text-gray-900 group-hover:text-[#1B5E20] transition-colors truncate leading-tight">
                                            {t.titulo}
                                          </h3>
                                          {ehProjeto && (
                                            <button
                                              type="button"
                                              onClick={(e) => toggleExpandirLinha(t.id, e)}
                                              className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                                              title={
                                                linhaAberta
                                                  ? 'Ocultar detalhes'
                                                  : 'Ver marco vinculado'
                                              }
                                            >
                                              <ChevronDown
                                                className={cn(
                                                  'h-3.5 w-3.5 transition-transform duration-200',
                                                  linhaAberta && 'rotate-180',
                                                )}
                                              />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                }

                                // ---- VÍNCULO ----
                                if (col.key === 'vinculo') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Vínculo:
                                      </span>
                                      {ehProjeto ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 truncate"
                                          title="Vinculada a projeto"
                                        >
                                          projeto
                                        </span>
                                      ) : t.vinculo_tipo === 'contrato' ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200 truncate"
                                          title="Vinculada a contrato"
                                        >
                                          contrato
                                        </span>
                                      ) : t.vinculo_tipo === 'ata' ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200 truncate"
                                          title="Vinculada a ata"
                                        >
                                          ata
                                        </span>
                                      ) : t.vinculo_tipo === 'tarefa' ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 truncate"
                                          title="Subtarefa de outra tarefa"
                                        >
                                          subtarefa
                                        </span>
                                      ) : (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 truncate"
                                          title="Sem vínculo"
                                        >
                                          avulsa
                                        </span>
                                      )}
                                    </div>
                                  )
                                }

                                // ---- PRIORIDADE ----
                                if (col.key === 'prioridade') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 text-xs min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Prioridade:
                                      </span>
                                      <span
                                        className={cn(
                                          'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border',
                                          prioStyle.bg,
                                          prioStyle.text,
                                          prioStyle.border,
                                        )}
                                      >
                                        <span>{prioTexto}</span>
                                      </span>
                                    </div>
                                  )
                                }

                                // ---- STATUS ----
                                if (col.key === 'status') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Status:
                                      </span>
                                      <span
                                        className={cn(
                                          'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold border truncate',
                                          etapaVisual,
                                        )}
                                        title={`Status: ${statusAtual}`}
                                      >
                                        {statusAtual}
                                      </span>
                                    </div>
                                  )
                                }

                                // ---- PRAZO ----
                                if (col.key === 'prazo') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Prazo:
                                      </span>
                                      <div
                                        className={cn(
                                          'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                                          atrasada
                                            ? 'text-red-600 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md'
                                            : 'text-gray-600',
                                        )}
                                        title={atrasada ? 'Tarefa atrasada!' : 'Prazo de conclusão'}
                                      >
                                        <Calendar
                                          className={cn(
                                            'h-3 w-3 shrink-0',
                                            atrasada ? 'text-red-600' : 'text-gray-400',
                                          )}
                                        />
                                        <span>{fmtDataCurta(t.prazo)}</span>
                                      </div>
                                    </div>
                                  )
                                }

                                // ---- RESPONSÁVEL ----
                                if (col.key === 'responsavel') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Resp:
                                      </span>
                                      {responsavelLimpo ? (
                                        <span
                                          className="font-medium truncate text-gray-800"
                                          title={responsavelLimpo}
                                        >
                                          {responsavelLimpo}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 italic text-[11px]">
                                          Sem responsável
                                        </span>
                                      )}
                                    </div>
                                  )
                                }

                                // ---- EMPRESA ----
                                if (col.key === 'empresa') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Empresa:
                                      </span>
                                      {t.empresa ? (
                                        <div
                                          className="inline-flex items-center gap-1.5 min-w-0 truncate"
                                          title={t.empresa}
                                        >
                                          <EmpresaIcon
                                            nome={t.empresa}
                                            className="h-4 w-4 shrink-0"
                                          />
                                          <span className="font-medium truncate text-gray-800">
                                            {t.empresa}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic text-xs">
                                          Sem empresa
                                        </span>
                                      )}
                                    </div>
                                  )
                                }

                                // ---- ANEXO (coluna própria) ----
                                if (col.key === 'anexo') {
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex items-center gap-1.5 min-w-0"
                                      style={{ width: larguraCel, flexShrink: 0 }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                        Anexo:
                                      </span>
                                      {totalAnexos > 0 ? (
                                        <span
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700"
                                          title={
                                            totalAnexos === 1 ? '1 anexo' : `${totalAnexos} anexos`
                                          }
                                        >
                                          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                          {totalAnexos}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300 text-[11px]">—</span>
                                      )}
                                    </div>
                                  )
                                }

                                // coluna desconhecida: não deve acontecer, mas não quebra
                                return (
                                  <div
                                    key={col.key}
                                    className="min-w-0"
                                    style={{ width: larguraCel, flexShrink: 0 }}
                                  />
                                )
                              })}

                              {/* ---- AÇÕES (sempre no fim, não ordenável) ---- */}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-between lg:justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100 flex-wrap"
                                style={{ width: LARGURA_ACOES, flexShrink: 0 }}
                              >
                                {/* Indicação de recorrência quando houver */}
                                {t.recorrencia && t.recorrencia !== 'Nenhuma' ? (
                                  <div
                                    className="inline-flex items-center gap-1 text-xs text-gray-600"
                                    title={`Recorrência: ${t.recorrencia}`}
                                  >
                                    <Repeat className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-[11px] font-medium hidden sm:inline">
                                      {t.recorrencia}
                                    </span>
                                  </div>
                                ) : null}

                                {/* SELETOR DE STATUS NA LINHA */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
                                      title="Alterar status"
                                    >
                                      <span className="truncate max-w-[85px]">{statusAtual}</span>
                                      <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 bg-white">
                                    {STATUS_OPCOES.map((op) => {
                                      const ativo = statusAtual === op.label
                                      return (
                                        <DropdownMenuItem
                                          key={op.key}
                                          onClick={() => onMoverStatus && onMoverStatus(t, op.key)}
                                          className={cn(
                                            'flex items-center justify-between text-xs font-medium cursor-pointer',
                                            ativo && 'bg-emerald-50 text-[#1B5E20] font-bold',
                                          )}
                                        >
                                          <span>{op.label}</span>
                                          {ativo && (
                                            <Check className="h-3.5 w-3.5 text-[#1B5E20]" />
                                          )}
                                        </DropdownMenuItem>
                                      )
                                    })}
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                {/* MENU DE TRÊS PONTOS (Ações: Editar, Excluir) */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
                                      title="Mais ações"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 bg-white">
                                    <DropdownMenuItem
                                      onClick={() => onAbrirEditar(t)}
                                      className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                      <span>Editar</span>
                                    </DropdownMenuItem>

                                    {ehProjeto ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          onDesvincularProjeto && onDesvincularProjeto(t)
                                        }
                                        className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                                        <span>Desvincular do projeto</span>
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => onVincularProjeto && onVincularProjeto(t)}
                                        className="flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                                      >
                                        <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                                        <span>Vincular a projeto</span>
                                      </DropdownMenuItem>
                                    )}

                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => onExcluir(t)}
                                      className="flex items-center gap-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      <span>Excluir</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            {/* Detalhes expandidos: marco vinculado e projeto */}
                            {ehProjeto && linhaAberta && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-emerald-50/40 rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-semibold text-emerald-900 shrink-0">
                                    Marco vinculado:
                                  </span>
                                  <span className="font-medium text-emerald-800 truncate">
                                    {nomeMarco || 'Marco não informado'}
                                  </span>
                                  {nomeProjeto && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="text-gray-500 text-[11px] truncate">
                                        Projeto: {nomeProjeto}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {onDesvincularProjeto && (
                                  <button
                                    type="button"
                                    onClick={() => onDesvincularProjeto(t)}
                                    className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold underline underline-offset-2 shrink-0 ml-2"
                                  >
                                    Desvincular
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {itens.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-600">Nenhuma tarefa</p>
          <p className="text-xs text-gray-400 mt-1">Ajuste os filtros ou crie uma nova tarefa</p>
          {onAbrirNova && (
            <button
              type="button"
              onClick={() => onAbrirNova()}
              className="mt-3 px-3 py-1.5 rounded-lg bg-[#1B5E20] text-white text-xs font-semibold hover:bg-[#154a19] transition-colors"
            >
              Nova tarefa
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default TarefasListaView
