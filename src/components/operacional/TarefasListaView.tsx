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
// LISTA DE TAREFAS · 18/11/2026 (2ª revisão)
//
// DEFEITOS DO PRINT E SUAS CAUSAS REAIS:
//
// (b) STATUS DUPLICADO — a coluna STATUS mostrava um selo e o bloco de AÇÕES
//     tinha outro dropdown com o mesmo texto. Agora existe UM só controle: a
//     própria coluna STATUS é o dropdown. A coluna AÇÕES ficou só com editar /
//     vincular / excluir.
//
// (c) CABEÇALHO FORA DE POSIÇÃO — o cabeçalho era um flex fora do card e as
//     linhas viviam dentro de um card com `px-4`. Todo o conteúdo andava 16px
//     em relação ao topo. Agora cabeçalho e linha usam o MESMO
//     `gridTemplateColumns` e o MESMO padding (px-4).
//
// (e) RECORRÊNCIA — é coluna própria, com cabeçalho e dropdown.
//
// (g) TÍTULO "RECORRÊNCIA" CORTADO — a última coluna era empurrada para fora do
//     container com overflow. Agora a rolagem horizontal envolve cabeçalho E
//     linhas num único bloco, e a largura mínima é a soma exata das colunas.
//
// A coluna AÇÕES estava sem célula (caía num `return` vazio): por isso a
// coluna aparecia no cabeçalho e sem conteúdo na linha.
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
  /** 18/11/2026 — permissão por linha: admin edita/exclui tudo; usuário só as
   *  suas e nunca exclui. Quando não informadas, tudo é permitido (compat). */
  podeEditarTarefa?: (t: any) => boolean
  podeExcluirTarefa?: (t: any) => boolean
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
  podeEditarTarefa,
  podeExcluirTarefa,
}: TarefasListaViewProps) {
  // padrão: sem restrição informada, mantém o comportamento anterior
  const podeEditar = (t: any) => (podeEditarTarefa ? podeEditarTarefa(t) : true)
  const podeExcluir = (t: any) => (podeExcluirTarefa ? podeExcluirTarefa(t) : true)
  const chaveU = String(usuarioKey || 'anon')
  const hoje = new Date().toISOString().slice(0, 10)

  const COLS = [
    { key: 'titulo', label: 'Tarefa', largura: 300, min: 160, ordenavel: true },
    { key: 'prioridade', label: 'Prioridade', largura: 104, min: 90, ordenavel: true },
    { key: 'vinculo', label: 'Vínculo', largura: 100, min: 84, ordenavel: true },
    { key: 'anexo', label: 'Anexo', largura: 70, min: 62, ordenavel: true },
    { key: 'status', label: 'Status', largura: 132, min: 112, ordenavel: true },
    { key: 'prazo', label: 'Prazo', largura: 90, min: 78, ordenavel: true },
    { key: 'responsavel', label: 'Responsável', largura: 140, min: 100, ordenavel: true },
    { key: 'empresa', label: 'Empresa', largura: 112, min: 90, ordenavel: true },
    { key: 'recorrencia', label: 'Recorrência', largura: 116, min: 100, ordenavel: true },
    { key: 'acoes', label: 'Ações', largura: 96, min: 84, ordenavel: false },
  ] as const

  const ESC_COLS = 'tarefas.lista.colunas.v2'
  const ESC_SORT = 'tarefas.lista.sort'

  const [ordem, setOrdem] = useState<string[]>(() => {
    const salvo = lerSalvo(`pge_filtro_v1:${ESC_COLS}:${chaveU}:ordem`, null)
    const todas = COLS.map((c) => c.key) as string[]
    if (salvo && Array.isArray(salvo.v) && salvo.v.length) {
      const validas = salvo.v.filter((k: string) => todas.includes(k))
      for (const k of todas) if (!validas.includes(k)) validas.push(k)
      return validas
    }
    return todas
  })

  const [larguras, setLarguras] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {}
    for (const c of COLS) p[c.key] = c.largura
    const salvo = lerSalvo(`pge_filtro_v1:${ESC_COLS}:${chaveU}:larguras`, null)
    if (salvo && salvo.v && typeof salvo.v === 'object') {
      for (const c of COLS) {
        const n = Number(salvo.v[c.key])
        if (n > 0) p[c.key] = Math.max(c.min, n)
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

  // ---- redimensionar ----
  const arrastandoLarg = useRef<{ key: string; x: number; w: number; min: number } | null>(null)
  const comecarLargura = (ev: React.MouseEvent, key: string, min: number) => {
    ev.preventDefault()
    ev.stopPropagation()
    arrastandoLarg.current = { key, x: ev.clientX, w: larguras[key] || 120, min }
    const mover = (e: MouseEvent) => {
      const d = arrastandoLarg.current
      if (!d) return
      setLarguras((prev) => ({ ...prev, [d.key]: Math.max(d.min, d.w + (e.clientX - d.x)) }))
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

  // ---- reordenar ----
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
    min: number
    ordenavel: boolean
  }>

  // ÚNICA fonte de geometria: cabeçalho e linha usam esta string.
  //
  // 18/11/2026 — DEFEITO (b): "coluna Ações e conteúdo fora do container".
  // CAUSA: todas as colunas eram px fixos. Somadas passavam da largura
  // disponível, então o grid estourava e as ÚLTIMAS colunas (Ações) ficavam
  // fora da área visível — o usuário via o cabeçalho "Ações" cortado.
  //
  // CORREÇÃO: a coluna Tarefa passa a ser elástica — `minmax(<largura>, 1fr)`.
  // Ela absorve a sobra e, quando falta espaço, encolhe até o mínimo. As
  // demais ficam em px (precisam do valor exato para ordenar/medir). Assim o
  // grid sempre cabe no container, e a barra de rolagem só aparece se a soma
  // dos mínimos realmente passar da tela.
  const template = colunas
    .map((c) => {
      const w = larguras[c.key] || c.largura
      return c.key === 'titulo' ? `minmax(${c.min}px, 1fr)` : `${w}px`
    })
    .join(' ')
  const larguraMin =
    colunas.reduce((s, c) => s + (c.key === 'titulo' ? c.min : larguras[c.key] || c.largura), 0) +
    12 * (colunas.length - 1)

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
    // UM único container de rolagem: cabeçalho e linhas rolam juntos, então o
    // cabeçalho nunca sai de cima do dado (defeitos c e g).
    <div className="overflow-x-auto">
      <div style={{ minWidth: larguraMin }}>
        {/* ---------- CABEÇALHO ----------
            mesmo padding horizontal (px-4) e mesmo grid da linha */}
        <div
          className="grid items-center gap-3 rounded-md border-y border-gray-200 bg-gray-50/80 px-4 py-1.5 select-none"
          style={{ gridTemplateColumns: template }}
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
                  'relative flex min-w-0 items-center text-[10px] font-bold uppercase tracking-wider text-gray-500',
                  ord && 'cursor-pointer hover:text-gray-700',
                  arrastandoCol === c.key && 'opacity-40',
                  c.key === 'acoes' && 'justify-end',
                )}
                title={
                  ord
                    ? c.label + ' — clique ordena · arraste move · borda direita redimensiona'
                    : 'Ações — arraste move · borda direita redimensiona'
                }
              >
                <span className="truncate">{c.label}</span>
                {ord &&
                  (sortKey === c.key ? (
                    sortDir === 'asc' ? (
                      <ArrowUp className="ml-1 h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                    ) : (
                      <ArrowDown className="ml-1 h-2.5 w-2.5 shrink-0 text-[#1b5e20]" />
                    )
                  ) : (
                    <ChevronsUpDown className="ml-1 h-2.5 w-2.5 shrink-0 opacity-25" />
                  ))}
                <span
                  onMouseDown={(ev) => comecarLargura(ev, c.key, c.min)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="absolute -right-1.5 top-1/2 h-4 w-3 -translate-y-1/2 cursor-col-resize rounded hover:bg-[#1b5e20]/25"
                  title="Arraste para redimensionar"
                />
              </div>
            )
          })}
        </div>

        {/* ---------- GRUPOS ---------- */}
        <div className="mt-2 space-y-3">
          {GRUPOS.map((grupo) => {
            const lista = porStatus[grupo.key] || []
            const aberto = abertos[grupo.key] ?? true
            return (
              <div key={grupo.key}>
                <button
                  type="button"
                  onClick={() =>
                    setAbertos((p) => ({ ...p, [grupo.key]: !(p[grupo.key] ?? true) }))
                  }
                  className="mb-1.5 flex w-full items-center gap-1.5 py-0.5 text-left select-none"
                >
                  {aberto ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
                    {grupo.label} ({lista.length})
                  </span>
                </button>

                {aberto && (
                  <div className="space-y-1.5">
                    {lista.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-xs text-gray-400">
                        <Inbox className="h-4 w-4 text-gray-300" />
                        Nenhuma tarefa {grupo.label.toLowerCase()}
                      </div>
                    ) : (
                      lista.map((t) => {
                        const p = (t.prioridade_p || 'P2').toUpperCase()
                        const ps = PRIO[p] || PRIO.P2
                        const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
                        const atrasada =
                          prazoIso && prazoIso < hoje && t.status_kanban !== 'concluido'
                        const anexos = Array.isArray(t.anexos)
                          ? t.anexos
                          : t.anexos
                            ? [t.anexos]
                            : []
                        const stKey =
                          t.status_kanban ||
                          (t.status === 'concluida'
                            ? 'concluido'
                            : t.status === 'em_andamento'
                              ? 'em_andamento'
                              : 'a_fazer')
                        const stLabel =
                          STATUS_OPCOES.find((s) => s.key === stKey)?.label || 'A Fazer'
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
                            className="cursor-pointer rounded-xl border border-gray-200/90 bg-white transition-all hover:border-emerald-300/80"
                          >
                            <div
                              className="grid items-center gap-3 px-4 py-2.5"
                              style={{ gridTemplateColumns: template }}
                            >
                              {colunas.map((col) => {
                                // ---- TAREFA ----
                                if (col.key === 'titulo')
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex min-w-0 items-center gap-1.5"
                                    >
                                      <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-gray-900 group-hover:text-[#1B5E20]">
                                        {t.titulo}
                                      </h3>
                                      {proj && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setLinhas((x) => ({ ...x, [t.id]: !x[t.id] }))
                                          }}
                                          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600"
                                          title={abertaLinha ? 'Ocultar marco' : 'Ver marco'}
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

                                // ---- PRIORIDADE ----
                                if (col.key === 'prioridade')
                                  return (
                                    <div
                                      key={col.key}
                                      className="min-w-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            className={cn(
                                              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold hover:brightness-95',
                                              ps.bg,
                                              ps.text,
                                              ps.border,
                                            )}
                                            title="Alterar prioridade"
                                          >
                                            <span className="truncate">{ps.label}</span>
                                            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="start"
                                          className="w-40 bg-white"
                                        >
                                          {(['P1', 'P2', 'P3'] as const).map((k) => (
                                            <DropdownMenuItem
                                              key={k}
                                              onClick={() =>
                                                onAlterarPrioridade && onAlterarPrioridade(t, k)
                                              }
                                              className={cn(
                                                'flex cursor-pointer items-center justify-between text-xs',
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

                                // ---- VÍNCULO ----
                                if (col.key === 'vinculo')
                                  return (
                                    <div key={col.key} className="min-w-0">
                                      <span
                                        className={cn(
                                          'inline-flex truncate rounded border px-1.5 py-0.2 text-[10px] font-semibold',
                                          vinc === 'avulsa' || vinc === 'subtarefa'
                                            ? 'border-gray-200 bg-gray-100 text-gray-600'
                                            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                                        )}
                                        title={'Vínculo: ' + vinc}
                                      >
                                        {vinc}
                                      </span>
                                    </div>
                                  )

                                // ---- ANEXO ----
                                if (col.key === 'anexo')
                                  return (
                                    <div
                                      key={col.key}
                                      className="min-w-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {anexos.length > 0 ? (
                                        <span
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700"
                                          title={anexos.length + ' anexo(s)'}
                                        >
                                          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                          {anexos.length}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-gray-300">—</span>
                                      )}
                                    </div>
                                  )

                                // ---- STATUS — (b) único controle: o dropdown ----
                                if (col.key === 'status')
                                  return (
                                    <div
                                      key={col.key}
                                      className="min-w-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={!podeEditar(t)}
                                            className={cn(
                                              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50',
                                              ETAPA[stKey] || ETAPA.a_fazer,
                                            )}
                                            title={
                                              podeEditar(t)
                                                ? 'Alterar status'
                                                : 'Só o responsável ou o admin pode alterar'
                                            }
                                          >
                                            <span className="truncate">{stLabel}</span>
                                            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="start"
                                          className="w-40 bg-white"
                                        >
                                          {STATUS_OPCOES.map((op) => (
                                            <DropdownMenuItem
                                              key={op.key}
                                              onClick={() =>
                                                onMoverStatus && onMoverStatus(t, op.key)
                                              }
                                              className={cn(
                                                'flex cursor-pointer items-center justify-between text-xs',
                                                stLabel === op.label &&
                                                  'bg-emerald-50 font-bold text-[#1B5E20]',
                                              )}
                                            >
                                              <span>{op.label}</span>
                                              {stLabel === op.label && (
                                                <Check className="h-3.5 w-3.5" />
                                              )}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  )

                                // ---- PRAZO ----
                                if (col.key === 'prazo')
                                  return (
                                    <div key={col.key} className="min-w-0">
                                      <div
                                        className={cn(
                                          'inline-flex items-center gap-1 text-[11.5px] font-semibold tabular-nums',
                                          atrasada
                                            ? 'rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-600'
                                            : 'text-gray-600',
                                        )}
                                      >
                                        <Calendar className="h-3 w-3 shrink-0 text-gray-400" />
                                        {fmtData(t.prazo)}
                                      </div>
                                    </div>
                                  )

                                // ---- RESPONSÁVEL ----
                                if (col.key === 'responsavel')
                                  return (
                                    <div key={col.key} className="min-w-0">
                                      {resp ? (
                                        <span
                                          className="block truncate text-[11.5px] font-medium text-gray-800"
                                          title={resp}
                                        >
                                          {resp}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-gray-400 italic">
                                          Sem responsável
                                        </span>
                                      )}
                                    </div>
                                  )

                                // ---- EMPRESA ----
                                if (col.key === 'empresa')
                                  return (
                                    <div
                                      key={col.key}
                                      className="flex min-w-0 items-center gap-1.5"
                                    >
                                      {t.empresa ? (
                                        <>
                                          <EmpresaIcon
                                            nome={t.empresa}
                                            className="h-4 w-4 shrink-0"
                                          />
                                          <span
                                            className="truncate text-[11.5px] font-medium text-gray-800"
                                            title={t.empresa}
                                          >
                                            {t.empresa}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[11px] text-gray-400 italic">
                                          Sem empresa
                                        </span>
                                      )}
                                    </div>
                                  )

                                // ---- RECORRÊNCIA — (e) com cabeçalho visível ----
                                if (col.key === 'recorrencia')
                                  return (
                                    <div
                                      key={col.key}
                                      className="min-w-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={!podeEditar(t)}
                                            className={cn(
                                              'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] disabled:cursor-not-allowed disabled:opacity-50',
                                              temRec
                                                ? 'border-gray-200 bg-gray-50 font-semibold text-gray-700'
                                                : 'border-transparent text-gray-400',
                                            )}
                                            title={
                                              podeEditar(t)
                                                ? 'Recorrência: ' + rec
                                                : 'Só o responsável ou o admin pode alterar'
                                            }
                                          >
                                            {temRec && (
                                              <Repeat className="h-2.5 w-2.5 shrink-0 opacity-70" />
                                            )}
                                            <span className="truncate">
                                              {temRec ? rec : 'Nenhuma'}
                                            </span>
                                            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="start"
                                          className="w-44 bg-white"
                                        >
                                          {RECORRENCIAS.map((op) => (
                                            <DropdownMenuItem
                                              key={op}
                                              onClick={() =>
                                                onAlterarRecorrencia && onAlterarRecorrencia(t, op)
                                              }
                                              className={cn(
                                                'flex cursor-pointer items-center justify-between text-xs',
                                                rec === op &&
                                                  'bg-emerald-50 font-bold text-[#1B5E20]',
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

                                // ---- AÇÕES — sem dropdown de status (evita duplicata) ----
                                return (
                                  <div
                                    key={col.key}
                                    className="flex items-center justify-end"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                          title="Mais ações"
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-48 bg-white">
                                        {/* 18/11/2026 — Editar só nas próprias
                                            (Admin em todas) */}
                                        <DropdownMenuItem
                                          disabled={!podeEditar(t)}
                                          onClick={() => podeEditar(t) && onAbrirEditar(t)}
                                          className="flex cursor-pointer items-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                                          title={
                                            podeEditar(t)
                                              ? 'Editar tarefa'
                                              : 'Só o responsável ou o admin pode editar'
                                          }
                                        >
                                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                          Editar
                                        </DropdownMenuItem>
                                        {proj ? (
                                          <DropdownMenuItem
                                            onClick={() =>
                                              onDesvincularProjeto && onDesvincularProjeto(t)
                                            }
                                            className="flex cursor-pointer items-center gap-2 text-xs"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                                            Desvincular do projeto
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            onClick={() =>
                                              onVincularProjeto && onVincularProjeto(t)
                                            }
                                            className="flex cursor-pointer items-center gap-2 text-xs text-emerald-700"
                                          >
                                            <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                                            Vincular a projeto
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        {/* 18/11/2026 — excluir é EXCLUSIVO do
                                            Admin (diretiva do dono, item b) */}
                                        <DropdownMenuItem
                                          disabled={!podeExcluir(t)}
                                          onClick={() => podeExcluir(t) && onExcluir(t)}
                                          className="flex cursor-pointer items-center gap-2 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                          title={
                                            podeExcluir(t)
                                              ? 'Excluir tarefa'
                                              : 'Apenas o administrador pode excluir'
                                          }
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
                                className="mx-4 mb-2.5 flex items-center justify-between rounded-lg border-t border-gray-100 bg-emerald-50/40 px-3 py-2 text-xs"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 font-semibold text-emerald-900">
                                    Marco vinculado:
                                  </span>
                                  <span className="truncate font-medium text-emerald-800">
                                    {t.expand?.marco_id?.nome || t.marco_nome || 'não informado'}
                                  </span>
                                </div>
                                {onDesvincularProjeto && (
                                  <button
                                    type="button"
                                    onClick={() => onDesvincularProjeto(t)}
                                    className="ml-2 shrink-0 text-[11px] font-semibold text-amber-700 underline"
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
        </div>
      </div>

      {itens.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">Nenhuma tarefa</p>
          <p className="mt-1 text-xs text-gray-400">Ajuste os filtros ou crie uma nova tarefa</p>
          {onAbrirNova && (
            <button
              type="button"
              onClick={() => onAbrirNova()}
              className="mt-3 rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white"
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
