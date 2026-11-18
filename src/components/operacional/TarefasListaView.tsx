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
// LISTA DE TAREFAS — 18/11/2026
//
// (a) PRIORIDADE é dropdown na linha
// (b) STATUS sem duplicata: a coluna exibe, o dropdown de AÇÕES altera
// (c) cada valor sob o SEU cabeçalho — células geradas por `colunasNaOrdem`
// (d) AÇÕES é coluna real: reordena e redimensiona (não ordena: não há critério)
// (e) RECORRÊNCIA é coluna própria com dropdown
// ============================================================================

export interface TarefasListaViewProps {
  itens: any[]
  onAbrirDetalhe: (t: any) => void
  onAbrirEditar: (t: any) => void
  onExcluir: (t: any) => void
  onMoverStatus?: (t: any, status: string) => void
  onAlterarPrioridade?: (t: any, prioridade: string) => void
  onAlterarRecorrencia?: (t: any, recorrencia: string) => void
  onAbrirNova?: (status?: string) => void
  obterIconeEmpresa?: (nome: string) => React.ReactNode
  onVincularProjeto?: (t: any) => void
  onDesvincularProjeto?: (t: any) => void
  usuarioKey?: string
}

const GRUPOS = [
  { key: 'triagem', label: 'TRIAGEM' },
  { key: 'a_fazer', label: 'A FAZER' },
  { key: 'em_andamento', label: 'EM ANDAMENTO' },
  { key: 'bloqueado', label: 'BLOQUEADO' },
  { key: 'concluido', label: 'CONCLUÍDO' },
]

const STATUS_OPCOES = [
  { key: 'a_fazer', label: 'A Fazer' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'bloqueado', label: 'Bloqueado' },
  { key: 'concluido', label: 'Concluído' },
]

const PRIO: Record<string, { bg: string; text: string; border: string; label: string }> = {
  P1: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', label: 'Alta' },
  P2: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'Normal' },
  P3: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Baixa' },
}

const ETAPA: Record<string, string> = {
  triagem: 'bg-amber-50 text-amber-800 border-amber-200',
  a_fazer: 'bg-gray-100 text-gray-700 border-gray-200',
  em_andamento: 'bg-blue-50 text-blue-700 border-blue-200',
  bloqueado: 'bg-red-50 text-red-700 border-red-200',
  concluido: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const RECORRENCIAS = [
  'Nenhuma',
  'Diária',
  'Semanal',
  'Mensal',
  'Bimestral',
  'Trimestral',
  'Semestral',
  'Anual',
]

const fmtData = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}

function lerSalvo(chave: string, padrao: any): any {
  try {
    const raw = localStorage.getItem(chave)
    return raw ? JSON.parse(raw) : padrao
  } catch (_e) {
    return padrao
  }
}

function gravar(chave: string, valor: any) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch (_e) {
    /* sem storage */
  }
}

export function TarefasListaView({
  itens,
  onAbrirDetalhe,
  onAbrirEditar,
  onExcluir,
  onMoverStatus,
  onAlterarPrioridade,
  onAlterarRecorrencia,
  onAbrirNova,
  onVincularProjeto,
  onDesvincularProjeto,
  usuarioKey,
}: TarefasListaViewProps) {
  const chaveU = String(usuarioKey || 'anon')
  const hoje = new Date().toISOString().slice(0, 10)

  // (d) `acoes` está nesta lista: tem cabeçalho, largura e posição.
  // (e) `recorrencia` idem.
  const COLS = [
    { key: 'titulo', label: 'Tarefa', largura: 320, ordenavel: true },
    { key: 'prioridade', label: 'Prioridade', largura: 110, ordenavel: true },
    { key: 'vinculo', label: 'Vínculo', largura: 105, ordenavel: true },
    { key: 'anexo', label: 'Anexo', largura: 74, ordenavel: true },
    { key: 'status', label: 'Status', largura: 120, ordenavel: true },
    { key: 'prazo', label: 'Prazo', largura: 92, ordenavel: true },
    { key: 'responsavel', label: 'Responsável', largura: 145, ordenavel: true },
    { key: 'empresa', label: 'Empresa', largura: 115, ordenavel: true },
    { key: 'recorrencia', label: 'Recorrência', largura: 110, ordenavel: true },
    { key: 'acoes', label: 'Ações', largura: 118, ordenavel: false },
  ] as const

  const ESC_COLS = 'tarefas.lista.colunas'
  const ESC_SORT = 'tarefas.lista.sort'

  const [ordem, setOrdem] = useState<string[]>(() => {
    const salvo = lerSalvo(`pge_filtro_v1:${ESC_COLS}:${chaveU}:ordem`, null)
    if (salvo && Array.isArray(salvo.v) && salvo.v.length) {
      const validas = salvo.v.filter((k: string) => COLS.some((c) => c.key === k))
      const out: string[] = []
      for (const k of validas) out.push(k)
      for (const c of COLS) if (!out.includes(c.key)) out.push(c.key)
      return out
    }
    return COLS.map((c) => c.key)
  })

  const [larguras, setLarguras] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {}
    for (const c of COLS) p[c.key] = c.largura
    const salvo = lerSalvo(`pge_filtro_v1:${ESC_COLS}:${chaveU}:larguras`, null)
    if (salvo && salvo.v && typeof salvo.v === 'object') {
      for (const c of COLS) {
        const n = Number(salvo.v[c.key])
        if (n > 0) p[c.key] = Math.max(70, n)
      }
    }
    return p
  })

  const [sortKey, setSortKey] = useState<string>(() => {
    const s = lerSalvo(`pge_filtro_v1:${ESC_SORT}:${chaveU}:col`, null)
    return s && typeof s.v === 'string' && s.v ? s.v : 'prazo'
  })
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const s = lerSalvo(`pge_filtro_v1:${ESC_SORT}:${chaveU}:dir`, null)
    return s && (s.v === 'asc' || s.v === 'desc') ? s.v : 'asc'
  })

  const persistir = (campo: string, valor: any, escopo = ESC_COLS) =>
    gravar(`pge_filtro_v1:${escopo}:${chaveU}:${campo}`, { v: valor })

  const alternarSort = (key: string) => {
    const dir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortKey(key)
    setSortDir(dir)
    persistir('col', key, ESC_SORT)
    persistir('dir', dir, ESC_SORT)
  }

  const valorDe = (t: any, key: string): any => {
    if (key === 'prazo') return t.prazo ? String(t.prazo).slice(0, 10) : ''
    if (key === 'titulo') return String(t.titulo || '').toLowerCase()
    if (key === 'responsavel') return limparTextoResponsavel(t.responsavel || '').toLowerCase()
    if (key === 'empresa') return String(t.empresa || '').toLowerCase()
    if (key === 'prioridade') return String(t.prioridade_p || 'P2')
    if (key === 'status') return String(t.status_kanban || '')
    if (key === 'recorrencia') return String(t.recorrencia || 'Nenhuma').toLowerCase()
    if (key === 'vinculo') {
      const proj = t.origem === 'projeto' || t.vinculo_tipo === 'projeto' || !!t.projeto_id
      return proj ? 'projeto' : String(t.vinculo_tipo || 'avulsa').toLowerCase()
    }
    if (key === 'anexo') {
      const l = Array.isArray(t.anexos) ? t.anexos : t.anexos ? [t.anexos] : []
      return l.length
    }
    return String(t[key] ?? '').toLowerCase()
  }

  const arrastandoLarg = useRef<{ key: string; x: number; w: number } | null>(null)
  const comecarLargura = (ev: React.MouseEvent, key: string) => {
    ev.preventDefault()
    ev.stopPropagation()
    arrastandoLarg.current = { key, x: ev.clientX, w: larguras[key] || 120 }
    const mover = (e: MouseEvent) => {
      const d = arrastandoLarg.current
      if (!d) return
      setLarguras((prev) => ({ ...prev, [d.key]: Math.max(70, d.w + (e.clientX - d.x)) }))
    }
    const soltar = () => {
      document.removeEventListener('mousemove', mover)
      document.removeEventListener('mouseup', soltar)
      arrastandoLarg.current = null
      setLarguras((prev) => {
        persistir('larguras', prev)
        return prev
      })
    }
    document.addEventListener('mousemove', mover)
    document.addEventListener('mouseup', soltar)
  }

  const [arrastandoCol, setArrastandoCol] = useState<string | null>(null)
  const soltarColuna = (destino: string) => {
    if (!arrastandoCol || arrastandoCol === destino) return
    const atual = [...ordem]
    const de = atual.indexOf(arrastandoCol)
    const para = atual.indexOf(destino)
    if (de < 0 || para < 0) return
    atual.splice(de, 1)
    atual.splice(para, 0, arrastandoCol)
    setOrdem(atual)
    persistir('ordem', atual)
    setArrastandoCol(null)
  }

  const colunas = ordem.map((k) => COLS.find((c) => c.key === k)).filter(Boolean) as Array<{
    key: string
    label: string
    largura: number
    ordenavel: boolean
  }>

  const larguraTotal =
    colunas.reduce((s, c) => s + (larguras[c.key] || c.largura), 0) + 12 * (colunas.length - 1)

  const porStatus = GRUPOS.reduce<Record<string, any[]>>((acc, g) => {
    acc[g.key] = itens
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
        const ea = va === null || va === undefined || va === ''
        const eb = vb === null || vb === undefined || vb === ''
        if (ea && eb) return 0
        if (ea) return 1
        if (eb) return -1
        if (typeof va === 'number' && typeof vb === 'number')
          return sortDir === 'asc' ? va - vb : vb - va
        return sortDir === 'asc'
          ? String(va).localeCompare(String(vb), 'pt-BR')
          : String(vb).localeCompare(String(va), 'pt-BR')
      })
    return acc
  }, {})

  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [linhas, setLinhas] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div
          className="flex items-center gap-3 bg-gray-50/80 border-y border-gray-200 rounded-md select-none"
          style={{ minWidth: larguraTotal }}
        >
          {colunas.map((c) => {
            const ord = c.ordenavel !== false
            return (
              <div
                key={c.key}
                draggable
                onDragStart={() => setArrastandoCol(c.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => soltarColuna(c.key)}
                onClick={() => ord && alternarSort(c.key)}
                className={cn(
                  'relative px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 transition-colors',
                  ord && 'cursor-pointer hover:bg-gray-100/80',
                  arrastandoCol === c.key && 'opacity-40',
                  c.key === 'acoes' && 'text-right',
                )}
                style={{ width: larguras[c.key] || c.largura, flexShrink: 0 }}
                title={
                  c.key === 'acoes'
                    ? 'Ações — arraste para reordenar · borda direita redimensiona'
                    : c.label + ' — clique ordena · arraste reordena'
                }
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap overflow-hidden">
                  <span className="truncate">{c.label}</span>
                  {ord &&
                    (sortKey === c.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                      ) : (
                        <ArrowDown className="h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-25" />
                    ))}
                </span>
                <span
                  onMouseDown={(ev) => comecarLargura(ev, c.key)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#1b5e20]/30"
                  title="Arraste para redimensionar"
                />
              </div>
            )
          })}
        </div>
      </div>

      {GRUPOS.map((grupo) => {
        const lista = porStatus[grupo.key] || []
        const aberto = abertos[grupo.key] ?? true
        return (
          <div key={grupo.key} className="space-y-2">
            <button
              type="button"
              onClick={() => setAbertos((p) => ({ ...p, [grupo.key]: !(p[grupo.key] ?? true) }))}
              className="w-full flex items-center justify-between py-1 text-left select-none"
            >
              <div className="flex items-center gap-1.5">
                {aberto ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span className="uppercase text-[11px] font-bold text-gray-700">
                  {grupo.label} ({lista.length})
                </span>
              </div>
              <span className="text-[11px] text-gray-400">{aberto ? 'Recolher' : 'Expandir'}</span>
            </button>

            {aberto && (
              <div className="space-y-2">
                {lista.length === 0 ? (
                  <div className="flex items-center justify-center py-6 px-4 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 gap-2">
                    <Inbox className="h-4 w-4 text-gray-300" />
                    <span>Nenhuma tarefa {grupo.label.toLowerCase()}</span>
                  </div>
                ) : (
                  lista.map((t) => {
                    const p = (t.prioridade_p || 'P2').toUpperCase()
                    const ps = PRIO[p] || PRIO.P2
                    const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
                    const atrasada = prazoIso && prazoIso < hoje && t.status_kanban !== 'concluido'
                    const anexos = Array.isArray(t.anexos) ? t.anexos : t.anexos ? [t.anexos] : []
                    const stKey =
                      t.status_kanban ||
                      (t.status === 'concluida'
                        ? 'concluido'
                        : t.status === 'em_andamento'
                          ? 'em_andamento'
                          : 'a_fazer')
                    const stLabel = STATUS_OPCOES.find((s) => s.key === stKey)?.label || 'A Fazer'
                    const resp = limparTextoResponsavel(t.responsavel)
                    const proj =
                      t.origem === 'projeto' || t.vinculo_tipo === 'projeto' || !!t.projeto_id
                    const abertaLinha = !!linhas[t.id]
                    const rec = String(t.recorrencia || 'Nenhuma')
                    const temRec = rec !== 'Nenhuma'
                    const vinc = proj
                      ? 'projeto'
                      : t.vinculo_tipo === 'contrato'
                        ? 'contrato'
                        : t.vinculo_tipo === 'ata'
                          ? 'ata'
                          : t.vinculo_tipo === 'tarefa'
                            ? 'subtarefa'
                            : 'avulsa'

                    return (
                      <div
                        key={t.id}
                        onClick={() => onAbrirDetalhe(t)}
                        className="bg-white rounded-xl border border-gray-200/90 hover:border-emerald-300/80 p-3 sm:py-3 sm:px-4 cursor-pointer transition-all group"
                      >
                        <div
                          className="flex flex-col lg:flex-row lg:items-center gap-3"
                          style={{ minWidth: larguraTotal }}
                        >
                          {colunas.map((col) => {
                            const w = larguras[col.key] || col.largura
                            const cx = { width: w, flexShrink: 0 as const }

                            if (col.key === 'titulo')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-start gap-2 min-w-0"
                                  style={cx}
                                >
                                  <h3 className="min-w-0 flex-1 text-xs sm:text-[13px] font-bold text-gray-900 group-hover:text-[#1B5E20] truncate">
                                    {t.titulo}
                                  </h3>
                                  {proj && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setLinhas((x) => ({ ...x, [t.id]: !x[t.id] }))
                                      }}
                                      className="text-gray-400 hover:text-gray-600 p-0.5"
                                      title={abertaLinha ? 'Ocultar' : 'Ver marco'}
                                    >
                                      <ChevronDown
                                        className={cn(
                                          'h-3.5 w-3.5 transition-transform',
                                          abertaLinha && 'rotate-180',
                                        )}
                                      />
                                    </button>
                                  )}
                                </div>
                              )

                            if (col.key === 'vinculo')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Vínculo:
                                  </span>
                                  <span
                                    className={cn(
                                      'inline-flex px-1.5 py-0.2 rounded text-[10px] font-semibold border truncate',
                                      vinc === 'avulsa' || vinc === 'subtarefa'
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200',
                                    )}
                                  >
                                    {vinc}
                                  </span>
                                </div>
                              )

                            if (col.key === 'prioridade')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Prior.:
                                  </span>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border hover:brightness-95',
                                          ps.bg,
                                          ps.text,
                                          ps.border,
                                        )}
                                        title="Alterar prioridade"
                                      >
                                        {ps.label}
                                        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-40 bg-white">
                                      {(['P1', 'P2', 'P3'] as const).map((k) => (
                                        <DropdownMenuItem
                                          key={k}
                                          onClick={() =>
                                            onAlterarPrioridade && onAlterarPrioridade(t, k)
                                          }
                                          className={cn(
                                            'flex items-center justify-between text-xs cursor-pointer',
                                            p === k && 'bg-emerald-50 font-bold text-[#1B5E20]',
                                          )}
                                        >
                                          <span>
                                            {PRIO[k].label} ({k})
                                          </span>
                                          {p === k && <Check className="h-3.5 w-3.5" />}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )

                            if (col.key === 'anexo')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Anexo:
                                  </span>
                                  {anexos.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                                      <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                      {anexos.length}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-[11px]">—</span>
                                  )}
                                </div>
                              )

                            if (col.key === 'status')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Status:
                                  </span>
                                  <span
                                    className={cn(
                                      'inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold border truncate',
                                      ETAPA[stKey] || ETAPA.a_fazer,
                                    )}
                                    title={'Status: ' + stLabel}
                                  >
                                    {stLabel}
                                  </span>
                                </div>
                              )

                            if (col.key === 'prazo')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Prazo:
                                  </span>
                                  <div
                                    className={cn(
                                      'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                                      atrasada
                                        ? 'text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md'
                                        : 'text-gray-600',
                                    )}
                                  >
                                    <Calendar className="h-3 w-3 shrink-0 text-gray-400" />
                                    {fmtData(t.prazo)}
                                  </div>
                                </div>
                              )

                            if (col.key === 'responsavel')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0"
                                  style={cx}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Resp.:
                                  </span>
                                  {resp ? (
                                    <span className="font-medium truncate" title={resp}>
                                      {resp}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 italic text-[11px]">
                                      Sem responsável
                                    </span>
                                  )}
                                </div>
                              )

                            if (col.key === 'empresa')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0"
                                  style={cx}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Empresa:
                                  </span>
                                  {t.empresa ? (
                                    <div className="inline-flex items-center gap-1.5 min-w-0">
                                      <EmpresaIcon nome={t.empresa} className="h-4 w-4 shrink-0" />
                                      <span className="font-medium truncate">{t.empresa}</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 italic">Sem empresa</span>
                                  )}
                                </div>
                              )

                            if (col.key === 'recorrencia')
                              return (
                                <div
                                  key={col.key}
                                  className="flex items-center gap-1.5 min-w-0"
                                  style={cx}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden">
                                    Recorr.:
                                  </span>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border',
                                          temRec
                                            ? 'font-semibold text-gray-700 bg-gray-50 border-gray-200'
                                            : 'text-gray-400 border-transparent',
                                        )}
                                        title="Alterar recorrência"
                                      >
                                        {temRec && (
                                          <Repeat className="h-3 w-3 shrink-0 opacity-70" />
                                        )}
                                        <span className="truncate">{rec}</span>
                                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-44 bg-white">
                                      {RECORRENCIAS.map((op) => (
                                        <DropdownMenuItem
                                          key={op}
                                          onClick={() =>
                                            onAlterarRecorrencia && onAlterarRecorrencia(t, op)
                                          }
                                          className={cn(
                                            'flex items-center justify-between text-xs cursor-pointer',
                                            rec === op && 'bg-emerald-50 font-bold text-[#1B5E20]',
                                          )}
                                        >
                                          <span>{op}</span>
                                          {rec === op && <Check className="h-3.5 w-3.5" />}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )

                            // (d) AÇÕES — coluna real; o dropdown de status é o
                            // ÚNICO controle de alteração de status (item b)
                            return (
                              <div
                                key={col.key}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 shrink-0 mt-2 pt-2 border-t border-gray-100 lg:mt-0 lg:pt-0 lg:border-t-0 lg:justify-end"
                                style={cx}
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1"
                                      title="Alterar status"
                                    >
                                      <span className="truncate max-w-[62px]">{stLabel}</span>
                                      <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 bg-white">
                                    {STATUS_OPCOES.map((op) => (
                                      <DropdownMenuItem
                                        key={op.key}
                                        onClick={() => onMoverStatus && onMoverStatus(t, op.key)}
                                        className={cn(
                                          'flex items-center justify-between text-xs cursor-pointer',
                                          stLabel === op.label &&
                                            'bg-emerald-50 font-bold text-[#1B5E20]',
                                        )}
                                      >
                                        <span>{op.label}</span>
                                        {stLabel === op.label && <Check className="h-3.5 w-3.5" />}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center shrink-0"
                                      title="Mais ações"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 bg-white">
                                    <DropdownMenuItem
                                      onClick={() => onAbrirEditar(t)}
                                      className="flex items-center gap-2 text-xs cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                      Editar
                                    </DropdownMenuItem>
                                    {proj ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          onDesvincularProjeto && onDesvincularProjeto(t)
                                        }
                                        className="flex items-center gap-2 text-xs cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                                        Desvincular do projeto
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => onVincularProjeto && onVincularProjeto(t)}
                                        className="flex items-center gap-2 text-xs text-emerald-700 cursor-pointer"
                                      >
                                        <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                                        Vincular a projeto
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => onExcluir(t)}
                                      className="flex items-center gap-2 text-xs text-red-600 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )
                          })}
                        </div>

                        {proj && abertaLinha && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs bg-emerald-50/40 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-emerald-900 shrink-0">
                                Marco vinculado:
                              </span>
                              <span className="font-medium text-emerald-800 truncate">
                                {t.expand?.marco_id?.nome || t.marco_nome || 'não informado'}
                              </span>
                              {t.expand?.projeto_id?.nome && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-gray-500 text-[11px] truncate">
                                    Projeto: {t.expand.projeto_id.nome}
                                  </span>
                                </>
                              )}
                            </div>
                            {onDesvincularProjeto && (
                              <button
                                type="button"
                                onClick={() => onDesvincularProjeto(t)}
                                className="text-[11px] text-amber-700 font-semibold underline shrink-0 ml-2"
                              >
                                Desvincular
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
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
              className="mt-3 px-3 py-1.5 rounded-lg bg-[#1B5E20] text-white text-xs font-semibold"
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
