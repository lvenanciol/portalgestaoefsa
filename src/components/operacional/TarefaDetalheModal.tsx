import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Upload,
  X,
  AlertTriangle,
  Loader2,
  FolderGit2,
  Milestone,
  ScrollText,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { limparTextoResponsavel, obterIniciaisResponsavel } from '@/lib/responsavel-utils'
import {
  vincularTarefaAoProjeto,
  desvincularTarefaDeProjeto,
  listarMarcosProjeto,
  MarcoRegistro,
} from '@/services/tarefas-projetos-service'
import { toast } from '@/hooks/use-toast'

export interface TarefaDetalheModalProps {
  detalhe: any | null
  onClose: () => void
  onEditar: (tarefa: any) => void
  onCompartilhar: (tarefa: any) => void
  onExcluir: (tarefa: any) => void
  onMover: (tarefa: any, novoStatus: string) => Promise<void>
  onSubtarefasAtualizadas?: (tarefa: any) => void
  onVincularProjeto?: (tarefa: any) => void
  onDesvincularProjeto?: (tarefa: any) => void
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
  return obterIniciaisResponsavel(nome)
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
  onVincularProjeto,
  onDesvincularProjeto,
  chatMsgs,
  novoChat,
  setNovoChat,
  chatAnexo,
  setChatAnexo,
  enviarChat,
  chatErro,
}: TarefaDetalheModalProps) {
  const navigate = useNavigate()
  const [expandDescricao, setExpandDescricao] = useState(true)
  const [expandSubtarefas, setExpandSubtarefas] = useState(true)
  const [expandAnexos, setExpandAnexos] = useState(true)
  const [abaLateral, setAbaLateral] = useState<'historico' | 'detalhes'>('detalhes')
  const [painelMobileAberto, setPainelMobileAberto] = useState(false)
  const [novaSub, setNovaSub] = useState('')
  const [subSalvando, setSubSalvando] = useState(false)
  const [anexoErro, setAnexoErro] = useState('')
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  const [midiaPreview, setMidiaPreview] = useState<{
    url: string
    tipo: 'imagem' | 'video'
    nome: string
  } | null>(null)

  // Estados locais para ação atômica Vincular a projeto
  const [modalVincularAberto, setModalVincularAberto] = useState(false)
  const [projetosParaVincular, setProjetosParaVincular] = useState<
    Array<{ id: string; nome: string }>
  >([])
  const [projetoVincularId, setProjetoVincularId] = useState('')
  const [marcosParaVincular, setMarcosParaVincular] = useState<MarcoRegistro[]>([])
  const [marcoVincularId, setMarcoVincularId] = useState('')
  const [carregandoMarcosVincular, setCarregandoMarcosVincular] = useState(false)
  const [salvandoVinculo, setSalvandoVinculo] = useState(false)
  const [erroVinculoModal, setErroVinculoModal] = useState('')

  // Estados locais para ação atômica Desvincular do projeto
  const [modalDesvincularAberto, setModalDesvincularAberto] = useState(false)
  const [salvandoDesvinculo, setSalvandoDesvinculo] = useState(false)

  // Título legível do contrato, ata ou tarefa de origem
  const [vinculoTitulo, setVinculoTitulo] = useState<string>('')

  // Carrega título de contrato/ata/tarefa quando aplicável
  useEffect(() => {
    let ativo = true
    if (!detalhe) return

    const vt = String(detalhe.vinculo_tipo || '')
      .trim()
      .toLowerCase()
    const vid = detalhe.vinculo_id

    if (vt === 'contrato' && vid) {
      pb.collection('contratos')
        .getOne(vid, { fields: 'id,titulo,parte' })
        .then((res: any) => {
          if (ativo) {
            setVinculoTitulo(
              res.titulo ? `${res.titulo}${res.parte ? ` — ${res.parte}` : ''}` : `Contrato ${vid}`,
            )
          }
        })
        .catch(() => {
          if (ativo) setVinculoTitulo(`Contrato ${vid}`)
        })
    } else if (vt === 'ata' && vid) {
      pb.collection('atas')
        .getOne(vid, { fields: 'id,titulo' })
        .then((res: any) => {
          if (ativo) setVinculoTitulo(res.titulo || `Ata ${vid}`)
        })
        .catch(() => {
          if (ativo) setVinculoTitulo(`Ata ${vid}`)
        })
    } else if (vt === 'tarefa' && vid) {
      pb.collection('tarefas')
        .getOne(vid, { fields: 'id,titulo' })
        .then((res: any) => {
          if (ativo) setVinculoTitulo(res.titulo || `Tarefa ${vid}`)
        })
        .catch(() => {
          if (ativo) setVinculoTitulo(`Tarefa ${vid}`)
        })
    } else {
      setVinculoTitulo('')
    }

    return () => {
      ativo = false
    }
  }, [detalhe])

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

  const handleUploadAnexoDireto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    setAnexoErro('')
    const LIMITE = 25 * 1024 * 1024 // 25MB
    const validos: File[] = []
    for (const f of files) {
      if (f.size > LIMITE) {
        setAnexoErro(`O arquivo "${f.name}" excede o limite máximo permitido de 25MB.`)
      } else {
        validos.push(f)
      }
    }
    if (validos.length === 0) return

    setEnviandoAnexo(true)
    try {
      const fd = new FormData()
      for (const f of validos) {
        fd.append('anexos', f)
      }
      await pb.collection('tarefas').update(detalhe.id, fd)
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      if (onSubtarefasAtualizadas) onSubtarefasAtualizadas(upd)
    } catch (err: any) {
      console.error('Falha ao enviar anexo:', err)
      setAnexoErro('Falha ao enviar anexo. Verifique o arquivo e tente novamente.')
    } finally {
      setEnviandoAnexo(false)
    }
  }

  const handleRemoverAnexoDireto = async (nomeArquivo: string) => {
    if (enviandoAnexo) return
    setEnviandoAnexo(true)
    setAnexoErro('')
    try {
      const fd = new FormData()
      fd.append('anexos-', nomeArquivo)
      await pb.collection('tarefas').update(detalhe.id, fd)
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      if (onSubtarefasAtualizadas) onSubtarefasAtualizadas(upd)
    } catch (err) {
      console.error('Falha ao remover anexo:', err)
      setAnexoErro('Falha ao remover anexo.')
    } finally {
      setEnviandoAnexo(false)
    }
  }

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
  const responsavelNome = detalhe.responsavel
    ? limparTextoResponsavel(detalhe.responsavel)
    : 'Não definido'
  const iniciaisResp = detalhe.responsavel ? getIniciais(detalhe.responsavel) : '—'

  // Identificação do Vínculo de Origem (PROMPT 7)
  const ehProjeto =
    detalhe.origem === 'projeto' || detalhe.vinculo_tipo === 'projeto' || !!detalhe.projeto_id

  const tipoVinculo: 'projeto' | 'contrato' | 'ata' | 'tarefa' | 'nenhum' = ehProjeto
    ? 'projeto'
    : detalhe.vinculo_tipo === 'contrato'
      ? 'contrato'
      : detalhe.vinculo_tipo === 'ata'
        ? 'ata'
        : detalhe.vinculo_tipo === 'tarefa'
          ? 'tarefa'
          : 'nenhum'

  // Dados do projeto e marco quando vínculo = projeto
  const projetoId =
    detalhe.projeto_id || (detalhe.vinculo_tipo === 'projeto' ? detalhe.vinculo_id : '')
  const nomeProjeto =
    detalhe.expand?.projeto_id?.nome ||
    detalhe.projeto_nome ||
    (projetoId ? `Projeto ${projetoId}` : '')

  const marcoId = detalhe.marco_id || ''
  const nomeMarco =
    detalhe.expand?.marco_id?.nome || detalhe.marco_nome || (marcoId ? `Marco ${marcoId}` : '')

  const vinculoLabel =
    tipoVinculo === 'projeto'
      ? `Projeto: ${nomeProjeto || projetoId || 'Sim'}`
      : tipoVinculo === 'contrato'
        ? `Contrato: ${vinculoTitulo || detalhe.vinculo_id || 'Sim'}`
        : tipoVinculo === 'ata'
          ? `Ata: ${vinculoTitulo || detalhe.vinculo_id || 'Sim'}`
          : tipoVinculo === 'tarefa'
            ? `Subtarefa: ${vinculoTitulo || detalhe.vinculo_id || 'Sim'}`
            : 'Nenhum'

  const recorrenciaLabel =
    detalhe.recorrencia && detalhe.recorrencia !== 'Nenhuma' ? detalhe.recorrencia : 'Nenhuma'

  // Navegações de links de vínculo
  const irParaProjeto = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (projetoId) {
      navigate(`/projetos/${projetoId}`)
      onClose()
    }
  }

  const irParaMarco = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (projetoId) {
      navigate(`/projetos/${projetoId}?tab=marcos`)
      onClose()
    }
  }

  const irParaContrato = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate('/contratos')
    onClose()
  }

  const irParaAta = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate('/atas')
    onClose()
  }

  const irParaTarefaOrigem = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (detalhe.vinculo_id) {
      navigate(`/tarefas?busca=${encodeURIComponent(vinculoTitulo || detalhe.vinculo_id)}`)
      onClose()
    }
  }

  // Ações de vincular / desvincular
  const handleAbrirVincular = async () => {
    if (onVincularProjeto) {
      onVincularProjeto(detalhe)
      return
    }
    setProjetoVincularId('')
    setMarcoVincularId('')
    setMarcosParaVincular([])
    setErroVinculoModal('')
    setModalVincularAberto(true)
    try {
      const projs = await pb
        .collection('projetos')
        .getFullList<{ id: string; nome: string }>({ sort: 'nome', fields: 'id,nome' })
      setProjetosParaVincular(projs)
    } catch (err) {
      console.error('Erro ao listar projetos para vincular:', err)
    }
  }

  const handleSelecionarProjeto = async (pId: string) => {
    setProjetoVincularId(pId)
    setMarcoVincularId('')
    setErroVinculoModal('')
    if (!pId) {
      setMarcosParaVincular([])
      return
    }
    setCarregandoMarcosVincular(true)
    try {
      const ms = await listarMarcosProjeto(pId)
      setMarcosParaVincular(ms)
    } catch (err) {
      console.error('Erro ao listar marcos:', err)
      setMarcosParaVincular([])
    } finally {
      setCarregandoMarcosVincular(false)
    }
  }

  const handleConfirmarVinculo = async () => {
    if (!projetoVincularId) {
      setErroVinculoModal('Selecione um projeto para continuar.')
      return
    }
    if (!marcoVincularId) {
      setErroVinculoModal('Escolha o marco para concluir o vínculo com o projeto.')
      return
    }
    setSalvandoVinculo(true)
    setErroVinculoModal('')
    try {
      await vincularTarefaAoProjeto({
        tarefaId: detalhe.id,
        projetoId: projetoVincularId,
        marcoId: marcoVincularId,
      })
      toast({
        title: 'Tarefa vinculada ao projeto',
        description: 'A tarefa agora faz parte do projeto e conta no cálculo de progresso.',
      })
      setModalVincularAberto(false)
      const upd = await pb.collection('tarefas').getOne(detalhe.id, {
        expand: 'projeto_id,marco_id',
      })
      if (onSubtarefasAtualizadas) {
        onSubtarefasAtualizadas(upd)
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao vincular tarefa ao projeto.'
      if (msg.includes('chk_tarefa_marco_obrigatorio') || msg.includes('marco')) {
        setErroVinculoModal('Selecione um marco para esta tarefa.')
      } else if (msg.includes('pertence')) {
        setErroVinculoModal('O marco escolhido não pertence a este projeto. Escolha outro marco.')
      } else if (msg.includes('cancelado')) {
        setErroVinculoModal('Este marco foi cancelado. Escolha um marco ativo.')
      } else {
        setErroVinculoModal(msg)
      }
    } finally {
      setSalvandoVinculo(false)
    }
  }

  const handleAbrirDesvincular = () => {
    if (onDesvincularProjeto) {
      onDesvincularProjeto(detalhe)
      return
    }
    setModalDesvincularAberto(true)
  }

  const handleConfirmarDesvinculo = async () => {
    setSalvandoDesvinculo(true)
    try {
      await desvincularTarefaDeProjeto(detalhe.id)
      toast({
        title: 'Tarefa desvinculada',
        description: 'A tarefa agora é avulsa e deixou de contar no progresso do projeto.',
      })
      setModalDesvincularAberto(false)
      const upd = await pb.collection('tarefas').getOne(detalhe.id, {
        expand: 'projeto_id,marco_id',
      })
      if (onSubtarefasAtualizadas) {
        onSubtarefasAtualizadas(upd)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao desvincular',
        description: err?.message || 'Não foi possível desvincular a tarefa do projeto.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoDesvinculo(false)
    }
  }

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
          <main className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 space-y-5 min-w-0 bg-white">
            {/* ========================================================= */}
            {/* Campo informativo de vínculo no topo da ficha (PROMPT 7)  */}
            {/* ========================================================= */}
            <section className="p-3.5 sm:p-4 rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Vínculo
                  </span>

                  {/* Badges de tipo */}
                  {tipoVinculo === 'projeto' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <FolderGit2 className="h-3 w-3 text-emerald-700" />
                      <span>Projeto</span>
                    </span>
                  )}
                  {tipoVinculo === 'contrato' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200">
                      <FileText className="h-3 w-3 text-emerald-700" />
                      <span>Contrato</span>
                    </span>
                  )}
                  {tipoVinculo === 'ata' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200">
                      <ScrollText className="h-3 w-3 text-emerald-700" />
                      <span>Ata</span>
                    </span>
                  )}
                  {tipoVinculo === 'tarefa' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                      <ListTodo className="h-3 w-3 text-gray-600" />
                      <span>Subtarefa</span>
                    </span>
                  )}
                  {tipoVinculo === 'nenhum' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                      <Link2 className="h-3 w-3 text-gray-500" />
                      <span>Avulsa (Nenhum)</span>
                    </span>
                  )}
                </div>

                {/* Ações: Vincular a projeto / Desvincular do projeto */}
                <div className="shrink-0 flex items-center gap-2">
                  {tipoVinculo === 'projeto' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAbrirDesvincular}
                      className="h-7 px-2.5 text-xs font-medium text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 shadow-2xs flex items-center gap-1.5"
                      title="Desvincular esta tarefa do projeto"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Desvincular do projeto</span>
                    </Button>
                  ) : tipoVinculo === 'contrato' ||
                    tipoVinculo === 'ata' ||
                    tipoVinculo === 'nenhum' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAbrirVincular}
                      className="h-7 px-2.5 text-xs font-semibold text-[#1B5E20] border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 hover:text-[#0F3D13] shadow-2xs flex items-center gap-1.5"
                      title="Vincular esta tarefa a um projeto com marco obrigatório"
                    >
                      <Link2 className="h-3.5 w-3.5 text-[#1B5E20]" />
                      <span>Vincular a projeto</span>
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Se Vínculo = Projeto: projeto e marco como LINKS clicáveis */}
              {tipoVinculo === 'projeto' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1.5 border-t border-gray-200/70">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-gray-500 shrink-0 font-medium">Projeto:</span>
                    <button
                      type="button"
                      onClick={irParaProjeto}
                      className="inline-flex items-center gap-1 font-semibold text-[#1B5E20] hover:underline truncate"
                      title="Abrir detalhe do projeto"
                    >
                      <span className="truncate">{nomeProjeto || 'Projeto vinculado'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-emerald-700" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-gray-500 shrink-0 font-medium">Marco:</span>
                    <button
                      type="button"
                      onClick={irParaMarco}
                      className="inline-flex items-center gap-1 font-semibold text-gray-800 hover:text-[#1B5E20] hover:underline truncate"
                      title="Ver marco no cronograma do projeto"
                    >
                      <Milestone className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{nomeMarco || 'Marco vinculado'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Se Vínculo = Contrato / Ata / Tarefa / Nenhum */
                <div className="space-y-1 pt-1.5 border-t border-gray-200/70 text-xs">
                  {tipoVinculo === 'contrato' && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-500 shrink-0 font-medium">
                        Contrato de origem:
                      </span>
                      <button
                        type="button"
                        onClick={irParaContrato}
                        className="inline-flex items-center gap-1 font-semibold text-[#1B5E20] hover:underline truncate"
                        title="Ir para Contratos"
                      >
                        <span className="truncate">
                          {vinculoTitulo || detalhe.vinculo_id || 'Contrato'}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-emerald-700" />
                      </button>
                    </div>
                  )}

                  {tipoVinculo === 'ata' && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-500 shrink-0 font-medium">Ata de reunião:</span>
                      <button
                        type="button"
                        onClick={irParaAta}
                        className="inline-flex items-center gap-1 font-semibold text-[#1B5E20] hover:underline truncate"
                        title="Ir para Atas"
                      >
                        <span className="truncate">
                          {vinculoTitulo || detalhe.vinculo_id || 'Ata'}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-emerald-700" />
                      </button>
                    </div>
                  )}

                  {tipoVinculo === 'tarefa' && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-500 shrink-0 font-medium">Tarefa pai:</span>
                      <button
                        type="button"
                        onClick={irParaTarefaOrigem}
                        className="inline-flex items-center gap-1 font-semibold text-gray-800 hover:text-[#1B5E20] hover:underline truncate"
                        title="Buscar tarefa pai"
                      >
                        <span className="truncate">
                          {vinculoTitulo || detalhe.vinculo_id || 'Tarefa pai'}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                      </button>
                    </div>
                  )}

                  {tipoVinculo === 'nenhum' && (
                    <p className="text-gray-600">
                      Tarefa avulsa sem vínculo com contrato, ata ou projeto.
                    </p>
                  )}

                  {/* Linha exata de 11px cinza (PROMPT 7) */}
                  <p className="text-[11px] text-gray-500">
                    Esta tarefa não entra no progresso de projetos.
                  </p>
                </div>
              )}
            </section>

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

            {/* Seção ANEXOS recolhível com upload de foto/vídeo/documento */}
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
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B5E20] hover:text-[#0F3D13] cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Adicionar foto/vídeo</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf,.docx,.xlsx,.txt,.csv,audio/*"
                      className="hidden"
                      disabled={enviandoAnexo}
                      onChange={handleUploadAnexoDireto}
                    />
                  </label>
                  <span className="text-xs text-gray-400">
                    {anexosLista.length} anexo{anexosLista.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {anexoErro && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                  {anexoErro}
                </div>
              )}

              {expandAnexos && (
                <div>
                  {anexosLista.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-1.5">
                      <p>Nenhum anexo nesta tarefa.</p>
                      <label className="text-[#1B5E20] font-semibold underline hover:text-[#0F3D13] cursor-pointer">
                        Clique aqui para anexar uma foto ou vídeo
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*,application/pdf,.docx,.xlsx,.txt,.csv,audio/*"
                          className="hidden"
                          disabled={enviandoAnexo}
                          onChange={handleUploadAnexoDireto}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {anexosLista.map((nome, i) => {
                        const url = pb.files.getURL(detalhe, nome)
                        const ext = nome.split('.').pop()?.toLowerCase() || ''
                        const ehImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
                        const ehVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'avi', 'mkv'].includes(
                          ext,
                        )

                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50/70 border border-gray-200 hover:border-[#1B5E20] hover:bg-white transition-all group"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (ehImg) {
                                  setMidiaPreview({ url, tipo: 'imagem', nome })
                                } else if (ehVideo) {
                                  setMidiaPreview({ url, tipo: 'video', nome })
                                } else {
                                  window.open(url, '_blank')
                                }
                              }}
                              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                              title={
                                ehImg
                                  ? 'Visualizar foto'
                                  : ehVideo
                                    ? 'Assistir vídeo'
                                    : 'Visualizar anexo'
                              }
                            >
                              {ehImg ? (
                                <img
                                  src={url}
                                  alt={nome}
                                  className="h-10 w-10 rounded object-cover shrink-0 border border-gray-200"
                                />
                              ) : ehVideo ? (
                                <div className="h-10 w-10 rounded bg-purple-50 text-purple-700 border border-purple-200 flex flex-col items-center justify-center shrink-0">
                                  <VideoIcon className="h-5 w-5" />
                                  <span className="text-[8px] font-bold uppercase">
                                    {ext.slice(0, 3)}
                                  </span>
                                </div>
                              ) : (
                                <div className="h-10 w-10 rounded bg-emerald-50 text-[#1B5E20] border border-emerald-100 flex items-center justify-center shrink-0 font-bold text-[10px]">
                                  {ext.slice(0, 4).toUpperCase() || 'FILE'}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {ehImg && (
                                    <span className="text-[9px] font-bold px-1 rounded bg-emerald-100 text-[#1B5E20]">
                                      FOTO
                                    </span>
                                  )}
                                  {ehVideo && (
                                    <span className="text-[9px] font-bold px-1 rounded bg-purple-100 text-purple-800">
                                      VÍDEO
                                    </span>
                                  )}
                                  <p className="text-xs font-semibold text-gray-800 group-hover:text-[#1B5E20] truncate">
                                    {nome}
                                  </p>
                                </div>
                                <p className="text-[10px] text-gray-400">
                                  {ehImg
                                    ? 'Clique para ver foto'
                                    : ehVideo
                                      ? 'Clique para reproduzir vídeo'
                                      : 'Clique para abrir'}
                                </p>
                              </div>
                            </button>

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
                              <button
                                type="button"
                                onClick={() => handleRemoverAnexoDireto(nome)}
                                disabled={enviandoAnexo}
                                className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Remover anexo"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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
                <div className="py-1 border-b border-gray-100 text-gray-600 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Link2 className="h-3.5 w-3.5 text-gray-400" /> Vínculo
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditar(detalhe)}
                      className="flex items-center gap-1 text-gray-800 font-medium hover:text-[#1B5E20] hover:underline max-w-[170px] truncate"
                      title="Editar vínculo"
                    >
                      <span className="truncate">
                        {tipoVinculo === 'projeto'
                          ? 'Projeto'
                          : tipoVinculo === 'contrato'
                            ? 'Contrato'
                            : tipoVinculo === 'ata'
                              ? 'Ata'
                              : tipoVinculo === 'tarefa'
                                ? 'Subtarefa'
                                : 'Avulsa'}
                      </span>
                      <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
                    </button>
                  </div>

                  {tipoVinculo === 'projeto' ? (
                    <div className="pl-5 text-[11px] space-y-0.5 text-gray-500">
                      <div className="truncate">
                        Proj:{' '}
                        <button
                          type="button"
                          onClick={irParaProjeto}
                          className="text-[#1B5E20] font-medium hover:underline"
                        >
                          {nomeProjeto || 'Projeto'}
                        </button>
                      </div>
                      <div className="truncate">
                        Marco:{' '}
                        <button
                          type="button"
                          onClick={irParaMarco}
                          className="text-gray-700 font-medium hover:underline"
                        >
                          {nomeMarco || 'Marco'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-5 text-[11px] text-gray-500">
                      <p>Esta tarefa não entra no progresso de projetos.</p>
                    </div>
                  )}
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

        {/* ========================================================= */}
        {/* Diálogo atômico: Vincular tarefa a projeto (Prompt 7)      */}
        {/* ========================================================= */}
        <Dialog open={modalVincularAberto} onOpenChange={setModalVincularAberto}>
          <DialogContent className="bg-white max-w-md p-6 rounded-xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900">
                Vincular tarefa a projeto
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs">
              <p className="text-gray-600">
                Ao vincular a tarefa <strong className="text-gray-900">"{detalhe.titulo}"</strong> a
                um projeto, ela passa a contar no progresso do projeto e precisa obrigatoriamente
                estar associada a um marco.
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-700">
                  Projeto <span className="text-red-500">*</span>
                </Label>
                <Select value={projetoVincularId} onValueChange={handleSelecionarProjeto}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Selecione o projeto" />
                  </SelectTrigger>
                  <SelectContent className="bg-white max-h-56">
                    {projetosParaVincular.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {projetoVincularId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">
                    Marco <span className="text-red-500">*</span>
                  </Label>
                  {carregandoMarcosVincular ? (
                    <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1B5E20]" />
                      <span>Carregando marcos do projeto...</span>
                    </div>
                  ) : marcosParaVincular.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                      Este projeto ainda não possui marcos cadastrados. Crie um marco no projeto
                      antes de vincular esta tarefa.
                    </div>
                  ) : (
                    <Select
                      value={marcoVincularId}
                      onValueChange={(v) => {
                        setMarcoVincularId(v)
                        setErroVinculoModal('')
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs bg-white">
                        <SelectValue placeholder="Selecione o marco" />
                      </SelectTrigger>
                      <SelectContent className="bg-white max-h-56">
                        {marcosParaVincular.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {erroVinculoModal && (
                <p role="alert" className="text-xs text-red-600 font-medium">
                  {erroVinculoModal}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalVincularAberto(false)}
                disabled={salvandoVinculo}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmarVinculo}
                disabled={salvandoVinculo || !projetoVincularId || !marcoVincularId}
                className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs font-semibold"
              >
                {salvandoVinculo ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Confirmar vínculo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========================================================= */}
        {/* Diálogo atômico: Desvincular do projeto (Prompt 7)         */}
        {/* ========================================================= */}
        <Dialog open={modalDesvincularAberto} onOpenChange={setModalDesvincularAberto}>
          <DialogContent className="bg-white max-w-sm p-6 rounded-xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-amber-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Desvincular do projeto
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-[13px] text-gray-700 leading-relaxed">
              Esta tarefa deixará de contar no progresso do projeto{' '}
              <strong className="text-gray-900 font-semibold">{nomeProjeto || 'vinculado'}</strong>.
              Confirmar?
            </div>
            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalDesvincularAberto(false)}
                disabled={salvandoDesvinculo}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmarDesvinculo}
                disabled={salvandoDesvinculo}
                className="h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                {salvandoDesvinculo ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : null}
                Confirmar desvinculação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
