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
// 18/11/2026 — diretiva da tela de tarefas (modo lista):
//   (a) PRIORIDADE é dropdown na linha (era só um selo de leitura)
//   (b) STATUS sem duplicata: a coluna mostra o valor, o dropdown de Ações
//       altera — o badge repetido saiu
//   (c) cada valor alinhado sob o SEU cabeçalho
//   (d) AÇÕES é coluna real: reordena e redimensiona (não ordena, porque não
//       há critério de ordem para um conjunto de botões)
//   (e) RECORRÊNCIA é coluna própria, com dropdown
//
// O item (c) exigiu mudança estrutural: as células eram uma sequência fixa de
// JSX e o cabeçalho segue `colunasNaOrdem` (reordenável por arrasto). Ao mover
// uma coluna, o conteúdo ficava na posição antiga — "Empresa" aparecia sob o
// título "Prazo". Agora as duas pontas leem a MESMA lista: cada chave rende a
// sua célula e a reordenação move cabeçalho e conteúdo juntos.
// ============================================================================

export interface TarefasListaViewProps {
  itens: any[]
  onAbrirDetalhe: (t: any) => void
  onAbrirEditar: (t: any) => void
  onExcluir: (t: any) => void
  onMoverStatus?: (t: any, status: string) => void
  /** (a) prioridade editável por dropdown na linha */
  onAlterarPrioridade?: (t: any, prioridade: string) => void
  /** (e) recorrência editável na linha */
  onAlterarRecorrencia?: (t: any, recorrencia: string) => void
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

// ---------------------------------------------------------------------------
// PERSISTÊNCIA (por usuário)
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
  onAlterarPrioridade,
  onAlterarRecorrencia,
  onAbrirNova,
  onVincularProjeto,
  onDesvincularProjeto,
  usuarioKey,
}: TarefasListaViewProps) {
  const chaveU = String(usuarioKey || 'anon')
  const hoje = new Date().toISOString().slice(0, 10)

  // ------------------------------------------------------------------
  // COLUNAS
  //
  // A ordem aqui é a ordem INICIAL. `acoes` e `recorrencia` entraram na lista,
  // então têm cabeçalho, largura e posição iguais às demais — é o que corrige
  // o "Ações travada" e transforma Recorrência em coluna.
  // ------------------------------------------------------------------
  const COLUNAS_DEF = [
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

  const escopoCols = 'tarefas.lista.colunas'
  const escopoSort = 'tarefas.lista.sort'

  const [ordemCols, setOrdemCols] = useState<string[]>(() => {
    const salvo = lerSalvo(`pge_filtro_v1:${escopoCols}:${chaveU}:ordem`, null)
    if (salvo && Array.isArray(salvo.v) && salvo.v.length) {
      const validas = salvo.v.filter((k: string) => COLUNAS_DEF.some((c) => c.key === k))
      // a ordem salva manda para as que já existiam; as novas entram na
      // posição da DEFINIÇÃO (não no fim)
      const ordenadas: string[] = []
      for (const k of validas) ordenadas.push(k)
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
    if (key === 'recorrencia') return String(t.recorrencia || 'Nenhuma').toLowerCase()
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
    .filter(Boolean) as Array<{
    key: string
    label: string
    largura: number
    ordenavel: boolean
  }>

  const LARGURA_GAP = 12
  const larguraTotal =
    colunasNaOrdem.reduce((s, c) => s + (largurasCols[c.key] || c.largura), 0) +
    LARGURA_GAP * (colunasNaOrdem.length - 1)

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
