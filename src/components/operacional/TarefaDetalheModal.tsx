import { useState } from 'react'
import {
  ArrowLeft,
  Pencil,
  Share2,
  MoreHorizontal,
  Trash2,
  Calendar,
  Repeat,
  ChevronDown,
  ChevronRight,
  Plus,
  Paperclip,
  Send,
  Building2,
  User,
  Link2,
  Clock,
  Flag,
  ListTodo,
  ExternalLink,
  Download,
  SlidersHorizontal,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'

export interface TarefaDetalheModalProps {
  detalhe: any | null
  onClose: () => void
  onEditar: (tarefa: any) => void
  onCompartilhar: (tarefa: any) => void
  onExcluir: (tarefa: any) => void
  onMover: (tarefa: any, novoStatus: string) => Promise<void>
  onSubtarefasAtualizadas?: (tarefa: any) => void
  chatMsgs: any[]
  novoChat: string
  setNovoChat: (v: string) => void
  chatAnexo: File | null
  setChatAnexo: (f: File | null) => void
  enviarChat: () => Promise<void>
  chatErro?: string
}

const ETAPAS = [
  { key: 'triagem', label: 'Triagem', short: 'Triagem' },
  { key: 'a_fazer', label: 'A Fazer', short: 'A Fazer' },
  { key: 'em_andamento', label: 'Em Andamento', short: 'Andamento' },
  { key: 'bloqueado', label: 'Bloqueado', short: 'Bloqueado' },
  { key: 'concluido', label: 'Concluído', short: 'Concluído' },
]

function getIniciais(nome?: string): string {
  if (!nome || !nome.trim()) return '—'
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fmtDataCurta(s?: string): string {
  if (!s) return '—'
  const clean = String(s).slice(0, 10).split('-')
  if (clean.length === 3) {
    return `${clean[2]}/${clean[1]}`
  }
  return s
}

function fmtDataCompleta(s?: string): string {
  if (!s) return 'Não definido'
  const clean = String(s).slice(0, 10).split('-')
  if (clean.length === 3) {
    return `${clean[2]}/${clean[1]}/${clean[0]}`
  }
  return s
}

export function TarefaDetalheModal({
  detalhe,
  onClose,
  onEditar,
  onCompartilhar,
  onExcluir,
  onMover,
  onSubtarefasAtualizadas,
  chatMsgs,
  novoChat,
  setNovoChat,
  chatAnexo,
  setChatAnexo,
  enviarChat,
  chatErro,
}: TarefaDetalheModalProps) {
  const [expandDescricao, setExpandDescricao] = useState(true)
  const [expandSubtarefas, setExpandSubtarefas] = useState(true)
  const [expandAnexos, setExpandAnexos] = useState(true)
  const [abaLateral, setAbaLateral] = useState<'historico' | 'detalhes'>('detalhes')
  const [painelMobileAberto, setPainelMobileAberto] = useState(false)
  const [novaSub, setNovaSub] = useState('')
  const [subSalvando, setSubSalvando] = useState(false)

  if (!detalhe) return null

  const subs: { t: string; ok: boolean }[] = Array.isArray(detalhe.subtarefas)
    ? detalhe.subtarefas
    : (() => {
        try {
          return JSON.parse(detalhe.subtarefas || '[]')
        } catch (_) {
          return []
        }
      })()

  const concluidasCount = subs.filter((s) => s.ok).length
  const totalSubs = subs.length

  const anexosLista: string[] = Array.isArray(detalhe.anexos)
    ? detalhe.anexos
    : detalhe.anexos
      ? [detalhe.anexos]
      : []

  const handleToggleSub = async (idx: number) => {
    if (subSalvando) return
    setSubSalvando(true)
    const clone = [...subs]
    clone[idx] = { ...clone[idx], ok: !clone[idx].ok }
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(clone) })
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      if (onSubtarefasAtualizadas) onSubtarefasAtualizadas(upd)
    } catch (err) {
      console.error('Falha ao atualizar subtarefa:', err)
    } finally {
      setSubSalvando(false)
    }
  }

  const handleAddSub = async () => {
    if (!novaSub.trim() || subSalvando) return
    setSubSalvando(true)
    const clone = [...subs, { t: novaSub.trim(), ok: false }]
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(clone) })
      setNovaSub('')
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      if (onSubtarefasAtualizadas) onSubtarefasAtualizadas(upd)
    } catch (err) {
      console.error('Falha ao adicionar subtarefa:', err)
    } finally {
      setSubSalvando(false)
    }
  }

  const prioridadeNome = detalhe.prioridade_p || 'P2'
  const prioridadeLabel =
    prioridadeNome === 'P1' ? 'P1 — Alta' : prioridadeNome === 'P3' ? 'P3 — Baixa' : 'P2 — Normal'

  const statusAtual = detalhe.status_kanban || 'triagem'
  const etapaAtualObj = ETAPAS.find((e) => e.key === statusAtual) || ETAPAS[0]

  const nomeEmpresa = detalhe.empresa || 'Geral'
  const responsavelNome = detalhe.responsavel || 'Não definido'
  const iniciaisResp = getIniciais(responsavelNome)
  const vinculoLabel =
    detalhe.vinculo_tipo && detalhe.vinculo_id
      ? `${detalhe.vinculo_tipo}: ${detalhe.vinculo_id}`
      : 'Nenhum'
  const recorrenciaLabel =
    detalhe.recorrencia && detalhe.recorrencia !== 'Nenhuma' ? detalhe.recorrencia : 'Nenhuma'

  return (
    <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-[96vw] xl:max-w-7xl w-full h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden bg-white rounded-xl border border-gray-200/90 shadow-2xl flex flex-col focus:outline-none">
        {/* ========================================================= */}
        {/* ZONA 1 — Barra Superior Enxuta                            */}
        {/* ========================================================= */}
        <header className="px-5 sm:px-6 py-3.5 border-b border-gray-200/80 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
              title="Voltar"
              aria-label="Voltar para a lista de tarefas"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <span className="hover:text-gray-700 cursor-pointer" onClick={onClose}>
                  Tarefas
                </span>
                <span className="text-gray-300">/</span>
                <span className="inline-flex items-center gap-1.5 text-gray-700 font-semibold truncate">
                  {detalhe.empresa ? (
                    <EmpresaIcon nome={detalhe.empresa} className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  <span className="truncate">{nomeEmpresa}</span>
                </span>
              </div>
              <h2
                className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight truncate leading-tight"
                title={detalhe.titulo}
              >
                {detalhe.titulo}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Botão de alternar painel lateral no mobile */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPainelMobileAberto((v) => !v)}
              className="h-8 px-2.5 text-xs text-gray-700 border-gray-200 lg:hidden flex items-center gap-1.5"
              title="Ver propriedades e chat"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#1B5E20]" />
              <span className="hidden sm:inline">Propriedades</span>
            </Button>

            {/* Ações principais do topo: Editar (primário verde), Compartilhar, menu ⋯ */}
            <Button
              type="button"
              onClick={() => onEditar(detalhe)}
              className="h-8 px-3.5 text-xs font-semibold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Editar</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => onCompartilhar(detalhe)}
              className="h-8 px-3 text-xs font-medium text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-xs hidden sm:inline-flex items-center gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5 text-gray-600" />
              <span>Compartilhar</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  title="Mais ações"
                  aria-label="Mais opções"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white">
                <DropdownMenuItem
                  onClick={() => onCompartilhar(detalhe)}
                  className="sm:hidden flex items-center gap-2 text-xs font-medium cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5 text-gray-500" />
                  <span>Compartilhar</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onExcluir(detalhe)}
                  className="flex items-center gap-2 text-xs font-medium text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  <span>Excluir tarefa</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ========================================================= */}
        {/* CORPO: ZONA 2 (Principal ~2/3) + ZONA 3 (Lateral ~1/3)     */}
        {/* ========================================================= */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {/* ------------------------------------------------------- */}
          {/* ZONA 2 — Coluna Principal                               */}
          {/* ------------------------------------------------------- */}
          <main className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 space-y-6 min-w-0 bg-white">
            {/* Linha única de etiquetas compactas sem quebrar */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 text-xs text-gray-700 scrollbar-none flex-nowrap">
              {/* Prioridade */}
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold shrink-0 border',
                  prioridadeNome === 'P1'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : prioridadeNome === 'P2'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-gray-100 text-gray-700 border-gray-200',
                )}
              >
                {prioridadeLabel}
              </span>

              {/* Responsável com avatar */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-50 border border-gray-200 text-gray-800 shrink-0 max-w-[200px]">
                <span className="h-4 w-4 rounded-full bg-emerald-700 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                  {iniciaisResp}
                </span>
                <span className="truncate" title={responsavelNome}>
                  {responsavelNome}
                </span>
              </span>

              {/* Prazo */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-50 border border-gray-200 text-gray-700 shrink-0">
                <Calendar className="h-3.5 w-3.5 text-gray-500" />
                <span>Prazo: {fmtDataCurta(detalhe.prazo)}</span>
              </span>

              {/* Recorrência */}
              {recorrenciaLabel !== 'Nenhuma' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                  <Repeat className="h-3 w-3 text-emerald-700" />
                  <span>Recorrente {recorrenciaLabel.toLowerCase()}</span>
                </span>
              )}
            </div>

            {/* Seletor contínuo de 4 etapas horizontais */}
            <div className="w-full">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {ETAPAS.map((etapa, idx) => {
                  const ativa = etapa.key === statusAtual
                  return (
                    <div
                      key={etapa.key}
                      className="flex items-center gap-2 shrink-0 flex-1 min-w-[120px]"
                    >
                      <button
                        type="button"
                        onClick={() => onMover(detalhe, etapa.key)}
                        className={cn(
                          'w-full py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center truncate',
                          ativa
                            ? 'bg-[#1B5E20] text-white border-[#1B5E20] shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300',
                        )}
                        title={`Mudar para etapa ${etapa.label}`}
                      >
                        <span className="hidden sm:inline">{etapa.label}</span>
                        <span className="sm:hidden">{etapa.short}</span>
                      </button>
                      {idx < ETAPAS.length - 1 && (
                        <span className="text-gray-300 text-sm font-semibold select-none">→</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Seção DESCRIÇÃO recolhível */}
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setExpandDescricao((v) => !v)}
                className="w-full flex items-center justify-between text-left text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-800 py-1"
              >
                <span className="flex items-center gap-1.5">
                  DESCRIÇÃO
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150',
                      !expandDescricao && '-rotate-90',
                    )}
                  />
                </span>
              </button>

              {expandDescricao && (
                <div
                  onClick={() => onEditar(detalhe)}
                  className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/60 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer text-[13px] text-gray-700 leading-relaxed min-h-[72px]"
                  title="Clique para editar a descrição"
                >
                  {detalhe.descricao ? (
                    <p className="whitespace-pre-wrap">{detalhe.descricao}</p>
                  ) : (
                    <p className="text-gray-400 italic">
                      Detalhes ou orientações sobre a tarefa... (clique para adicionar)
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Seção SUBTAREFAS recolhível */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between py-1">
                <button
                  type="button"
                  onClick={() => setExpandSubtarefas((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-800"
                >
                  <span>SUBTAREFAS</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150',
                      !expandSubtarefas && '-rotate-90',
                    )}
                  />
                </button>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="tabular-nums">
                    {concluidasCount} de {totalSubs} concluídas
                  </span>
                </div>
              </div>

              {expandSubtarefas && (
                <div className="p-4 rounded-xl border border-dashed border-gray-200 bg-white space-y-3">
                  {subs.length === 0 ? (
                    <div className="py-6 flex flex-col items-center justify-center text-center text-gray-400">
                      <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center mb-1.5 text-gray-400 border border-gray-100">
                        <ListTodo className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-medium text-gray-500">Nenhuma subtarefa ainda</p>
                      <p className="text-[11px] text-gray-400">Adicione itens na caixa abaixo</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {subs.map((s, idx) => (
                        <label
                          key={idx}
                          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50/80 transition-colors cursor-pointer border border-transparent hover:border-gray-200 text-[13px] text-gray-800"
                        >
                          <input
                            type="checkbox"
                            checked={!!s.ok}
                            onChange={() => handleToggleSub(idx)}
                            disabled={subSalvando}
                            className="mt-0.5 h-4 w-4 rounded accent-[#1B5E20] cursor-pointer"
                          />
                          <span
                            className={cn(
                              'leading-snug break-words flex-1',
                              s.ok && 'line-through text-gray-400',
                            )}
                          >
                            {s.t}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Campo Nova subtarefa... com botão + verde funcional */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleAddSub()
                    }}
                    className="flex items-center gap-2 pt-1"
                  >
                    <Input
                      value={novaSub}
                      onChange={(e) => setNovaSub(e.target.value)}
                      placeholder="Nova subtarefa..."
                      className="h-9 text-xs bg-gray-50/80 border-gray-200 focus:bg-white"
                      disabled={subSalvando}
                    />
                    <Button
                      type="submit"
                      disabled={!novaSub.trim() || subSalvando}
                      className="h-9 w-9 p-0 bg-[#1B5E20] hover:bg-[#0F3D13] text-white rounded-lg shrink-0 flex items-center justify-center shadow-xs"
                      title="Adicionar subtarefa"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              )}
            </section>

            {/* Seção ANEXOS recolhível */}
            <section className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <button
                  type="button"
                  onClick={() => setExpandAnexos((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-800"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>ANEXOS</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150',
                      !expandAnexos && '-rotate-90',
                    )}
                  />
                </button>
                <span className="text-xs text-gray-400">
                  {anexosLista.length} anexo{anexosLista.length !== 1 ? 's' : ''}
                </span>
              </div>

              {expandAnexos && (
                <div>
                  {anexosLista.length === 0 ? (
                    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/60 text-center text-xs text-gray-400">
                      Nenhum anexo nesta tarefa.{' '}
                      <button
                        type="button"
                        onClick={() => onEditar(detalhe)}
                        className="text-[#1B5E20] font-semibold underline hover:text-[#0F3D13] ml-1"
                      >
                        Clique em Editar para adicionar
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {anexosLista.map((nome, i) => {
                        const url = pb.files.getURL(detalhe, nome)
                        const ext = nome.split('.').pop()?.toLowerCase() || ''
                        const ehImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)

                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50/70 border border-gray-200 hover:border-[#1B5E20] hover:bg-white transition-all group"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2.5 min-w-0 flex-1"
                              title="Visualizar anexo"
                            >
                              {ehImg ? (
                                <img
                                  src={url}
                                  alt={nome}
                                  className="h-9 w-9 rounded object-cover shrink-0 border border-gray-200"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded bg-emerald-50 text-[#1B5E20] border border-emerald-100 flex items-center justify-center shrink-0 font-bold text-[10px]">
                                  {ext.slice(0, 4).toUpperCase() || 'FILE'}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-800 group-hover:text-[#1B5E20] truncate">
                                  {nome}
                                </p>
                                <p className="text-[10px] text-gray-400">Clique para abrir</p>
                              </div>
                            </a>

                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-[#1B5E20] hover:bg-emerald-50 transition-colors"
                                title="Abrir em nova aba"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={url}
                                download={nome}
                                className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                title="Baixar arquivo"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </main>

          {/* ------------------------------------------------------- */}
          {/* ZONA 3 — Painel Lateral Direito Fixo (~1/3)              */}
          {/* ------------------------------------------------------- */}
          <aside
            className={cn(
              'w-full sm:w-80 lg:w-96 border-l border-gray-200/80 bg-[#F9FAFB] flex flex-col shrink-0 overflow-hidden',
              'lg:static lg:flex',
              painelMobileAberto
                ? 'fixed inset-y-0 right-0 z-40 shadow-2xl flex max-w-[90vw]'
                : 'hidden lg:flex',
            )}
          >
            {/* PARTE SUPERIOR: PROPRIEDADES */}
            <div className="p-4 sm:p-5 border-b border-gray-200/80 bg-white">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  PROPRIEDADES
                </span>
                <button
                  type="button"
                  onClick={() => onEditar(detalhe)}
                  className="text-[11px] text-[#1B5E20] font-semibold hover:underline"
                >
                  Editar tudo
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                {/* Empresa */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Building2 className="h-3.5 w-3.5 text-gray-400" /> Empresa
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1.5 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline max-w-[170px] truncate"
                    title="Editar empresa"
                  >
                    {detalhe.empresa ? (
                      <EmpresaIcon nome={detalhe.empresa} className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                    <span className="truncate">{nomeEmpresa}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Responsável */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <User className="h-3.5 w-3.5 text-gray-400" /> Responsável
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline max-w-[170px] truncate"
                    title="Editar responsável"
                  >
                    <span className="truncate">{responsavelNome}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Vínculo */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Link2 className="h-3.5 w-3.5 text-gray-400" /> Vínculo
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline max-w-[170px] truncate"
                    title="Editar vínculo"
                  >
                    <span className="truncate">{vinculoLabel}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Prazo */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Clock className="h-3.5 w-3.5 text-gray-400" /> Prazo
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline"
                    title="Editar prazo"
                  >
                    <span>{fmtDataCompleta(detalhe.prazo)}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Recorrência */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Repeat className="h-3.5 w-3.5 text-gray-400" /> Recorrência
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline"
                    title="Editar recorrência"
                  >
                    <span>{recorrenciaLabel}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Prioridade */}
                <div className="flex items-center justify-between py-1 border-b border-gray-100 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Flag className="h-3.5 w-3.5 text-gray-400" /> Prioridade
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline"
                    title="Editar prioridade"
                  >
                    <span>{prioridadeNome}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <ListTodo className="h-3.5 w-3.5 text-gray-400" /> Status
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditar(detalhe)}
                    className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline"
                    title="Editar status"
                  >
                    <span>{etapaAtualObj.label}</span>
                    <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>
                </div>
              </div>
            </div>

            {/* PARTE INFERIOR: ABAS HISTÓRICO / CHAT (DETALHES) */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#F9FAFB]">
              {/* Abas */}
              <div className="flex items-center border-b border-gray-200 bg-white px-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setAbaLateral('historico')}
                  className={cn(
                    'py-2.5 px-3 text-xs font-semibold border-b-2 transition-all -mb-[1px]',
                    abaLateral === 'historico'
                      ? 'border-[#1B5E20] text-[#1B5E20]'
                      : 'border-transparent text-gray-500 hover:text-gray-800',
                  )}
                >
                  Histórico
                </button>
                <button
                  type="button"
                  onClick={() => setAbaLateral('detalhes')}
                  className={cn(
                    'py-2.5 px-3 text-xs font-semibold border-b-2 transition-all -mb-[1px]',
                    abaLateral === 'detalhes'
                      ? 'border-[#1B5E20] text-[#1B5E20]'
                      : 'border-transparent text-gray-500 hover:text-gray-800',
                  )}
                >
                  Chat / Mensagens
                </button>
              </div>

              {/* Conteúdo da aba Histórico */}
              {abaLateral === 'historico' && (
                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs text-gray-600">
                  <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-1">
                    <p className="font-semibold text-gray-800">Criada</p>
                    <p className="text-gray-500 text-[11px]">
                      {fmtDataCompleta(detalhe.created)} por {detalhe.criado_por || 'Sistema'}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-1">
                    <p className="font-semibold text-gray-800">Última atualização</p>
                    <p className="text-gray-500 text-[11px]">{fmtDataCompleta(detalhe.updated)}</p>
                  </div>
                  {chatMsgs.length > 0 && (
                    <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-1">
                      <p className="font-semibold text-gray-800">Interações de chat</p>
                      <p className="text-gray-500 text-[11px]">
                        {chatMsgs.length} mensagem(ns) registrada(s) na tarefa.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo da aba Chat (Versão A) */}
              {abaLateral === 'detalhes' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Lista de mensagens ou Estado vazio */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-2">
                    {chatMsgs.length === 0 ? (
                      <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center text-gray-400 py-6">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mb-2 text-gray-400">
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.75"
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-gray-500">Sem mensagens ainda</p>
                        <p className="text-[11px] text-gray-400">
                          Envie um comentário ou anexo abaixo
                        </p>
                      </div>
                    ) : (
                      chatMsgs.map((c: any) => {
                        const meu = c.autor === pb.authStore.record?.email
                        return (
                          <div
                            key={c.id}
                            className={cn('flex', meu ? 'justify-end' : 'justify-start')}
                          >
                            <div
                              className={cn(
                                'max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-xs',
                                meu
                                  ? 'bg-[#1B5E20] text-white'
                                  : 'bg-white border border-gray-200 text-gray-800',
                              )}
                            >
                              {!meu && (
                                <div className="text-[10px] font-bold text-gray-500 mb-0.5">
                                  {c.autor || 'Usuário'}
                                  {c.autor_tipo === 'parceiro' ? ' · parceiro' : ''}
                                </div>
                              )}
                              {c.texto && <div className="whitespace-pre-wrap">{c.texto}</div>}
                              {c.anexo && (
                                <a
                                  href={pb.files.getURL(c, c.anexo)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    'mt-1 inline-flex items-center gap-1 text-[11px] underline',
                                    meu ? 'text-emerald-100' : 'text-emerald-700',
                                  )}
                                >
                                  <Paperclip className="h-3 w-3" /> {String(c.anexo).slice(0, 24)}
                                </a>
                              )}
                              <div
                                className={cn(
                                  'text-[9px] mt-0.5',
                                  meu ? 'text-emerald-100/70' : 'text-gray-400',
                                )}
                              >
                                {String(c.created).slice(11, 16)}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Feedback de erro do chat */}
                  {chatErro && (
                    <div className="px-4 py-1 text-[11px] text-red-600 bg-red-50 border-t border-red-100">
                      {chatErro}
                    </div>
                  )}

                  {/* Preview de anexo selecionado */}
                  {chatAnexo && (
                    <div className="px-4 py-1.5 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
                      <span className="flex items-center gap-1 truncate font-medium">
                        <Paperclip className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                        <span className="truncate">{chatAnexo.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setChatAnexo(null)}
                        className="text-gray-400 hover:text-gray-700 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Campo fixo na base do painel: "Mensagem ou atualização..." + anexo + botão circular verde */}
                  <div className="p-3 bg-white border-t border-gray-200 shrink-0">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        enviarChat()
                      }}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={novoChat}
                        onChange={(e) => setNovoChat(e.target.value)}
                        placeholder="Mensagem ou atualização..."
                        className="h-10 text-xs bg-gray-50 border-gray-200 rounded-lg focus:bg-white"
                      />
                      <label
                        className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer text-gray-500 transition-colors"
                        title="Anexar arquivo à mensagem"
                      >
                        <Paperclip className="h-4 w-4" />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf,.docx,.xlsx,.txt,.csv,audio/*,video/*"
                          onChange={(e) => setChatAnexo(e.target.files?.[0] || null)}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!novoChat.trim() && !chatAnexo}
                        className="h-10 w-10 shrink-0 rounded-full bg-[#1B5E20] hover:bg-[#0F3D13] disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-xs transition-colors"
                        title="Enviar mensagem"
                      >
                        <Send className="h-4 w-4 ml-0.5" />
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
