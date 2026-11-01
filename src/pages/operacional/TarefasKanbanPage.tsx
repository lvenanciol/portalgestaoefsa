import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Kanban,
  Plus,
  Loader2,
  Calendar,
  AlertTriangle,
  X,
  MessageSquare,
  ListChecks,
  Mic,
  Share2,
  Mail,
  Paperclip,
  Trash2,
  Leaf,
  Pencil,
  List,
  Users as UsersIcon,
  FilterX,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Check,
  Eye,
  Download,
  ChevronDown,
  Repeat,
  Search,
  Inbox,
  Lock,
  Play,
  CheckCircle2,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { TarefasListaView } from '@/components/operacional/TarefasListaView'
import { TarefasCalendarioView } from '@/components/operacional/TarefasCalendarioView'
import { ParceiroCadastroDialog } from '@/components/operacional/ParceiroCadastroDialog'
import { TarefaDetalheModal } from '@/components/operacional/TarefaDetalheModal'
import { TarefaFormDialog } from '@/components/operacional/TarefaFormDialog'
import { EmpresaIcon, useEmpresaLogos } from '@/components/common/EmpresaIcon'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useApp } from '@/context/AppContext'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 7 (prompt-mestre) — Tarefas & Agenda: kanban 4 colunas (A Fazer,
// Em Andamento, Bloqueado, Concluído), prioridade P1-P3, subtarefas,
// comentários, vínculo, calendário mensal com criação rápida e widget
// "Compromissos de hoje" + alertas de atraso.

const COLUNAS = [
  { key: 'triagem', label: 'TRIAGEM' },
  { key: 'a_fazer', label: 'A Fazer' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'bloqueado', label: 'Bloqueado' },
  { key: 'concluido', label: 'Concluído' },
]

const PRIO_COR: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-amber-100 text-amber-700',
  P3: 'bg-gray-100 text-gray-600',
}

const fmtData = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}

export default function TarefasKanbanPage() {
  const { user } = useAuth()
  const { empresas, selectedCompany } = useApp()
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('__default__')
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [vista, setVista] = useState<'lista' | 'kanban' | 'calendario'>('kanban')
  const [filtroRapido, setFiltroRapido] = useState<
    'todos' | 'hoje' | 'semana' | 'atrasadas' | 'minhas'
  >('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [excluindoTarefa, setExcluindoTarefa] = useState<any | null>(null)
  const [excluindoEmAndamento, setExcluindoEmAndamento] = useState(false)
  const [form, setForm] = useState<any>({})
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([])
  const [anexosExistentes, setAnexosExistentes] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [arrastandoTarefa, setArrastandoTarefa] = useState<any | null>(null)
  const [colunaHover, setColunaHover] = useState<string | null>(null)

  // Filtros de cabeçalho: Período da agenda (dataRange) e Parceiros & Contatos (multisseleção)
  const [filtroPeriodo, setFiltroPeriodo] = useState<{ from?: Date; to?: Date } | undefined>(
    undefined,
  )
  const [filtroParceiros, setFiltroParceiros] = useState<string[]>([])
  const [parceiros, setParceiros] = useState<any[]>([])
  const [dialogErro, setDialogErro] = useState('')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [novoParceiroModalAberto, setNovoParceiroModalAberto] = useState(false)
  const [novoChat, setNovoChat] = useState('')
  const [chatAnexo, setChatAnexo] = useState<File | null>(null)
  const [chatMsgs, setChatMsgs] = useState<any[]>([])
  const [chatErro, setChatErro] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [mesRef, setMesRef] = useState(() => new Date().toISOString().slice(0, 7))
  const { obterIconeEmpresa } = useEmpresaLogos()

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('tarefas').getFullList({ sort: '-created' })
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

  // Empresa ativa para filtro: se não foi trocada manualmente no dropdown local, usa a da sidebar
  const empresaFiltroAtiva = useMemo(() => {
    if (filtroEmpresa !== '__default__') {
      return filtroEmpresa // 'todas' ou id ou nome
    }
    // Default: empresa selecionada na sidebar
    if (selectedCompany) {
      const empSidebar = empresas.find((e) => e.id === selectedCompany)
      return empSidebar?.nome || 'todas'
    }
    return 'todas'
  }, [filtroEmpresa, selectedCompany, empresas])

  // Itens filtrados pela empresa selecionada (ou todas), período da agenda e parceiros/contatos
  const itensFiltrados = useMemo(() => {
    const norm = (s: any) =>
      String(s || '')
        .trim()
        .toLowerCase()

    return itens.filter((t) => {
      // 1. Filtro de Empresa (inclui tratamento para empresa "CPF" e "todas")
      if (empresaFiltroAtiva && empresaFiltroAtiva !== 'todas') {
        if (norm(t.empresa) !== norm(empresaFiltroAtiva)) {
          return false
        }
      }

      // 2. Filtro de Período da Agenda (prazo da tarefa entre from e to)
      if (filtroPeriodo?.from || filtroPeriodo?.to) {
        if (!t.prazo) return false
        const prazoStr = String(t.prazo).slice(0, 10)
        if (filtroPeriodo.from) {
          const fromStr = filtroPeriodo.from.toISOString().slice(0, 10)
          if (prazoStr < fromStr) return false
        }
        if (filtroPeriodo.to) {
          const toStr = filtroPeriodo.to.toISOString().slice(0, 10)
          if (prazoStr > toStr) return false
        }
      }

      // 3. Filtro de Parceiros & Contatos (responsável OU parceiros vinculados)
      if (filtroParceiros.length > 0) {
        let tParceiroIds: string[] = []
        try {
          tParceiroIds = Array.isArray(t.parceiros) ? t.parceiros : JSON.parse(t.parceiros || '[]')
        } catch (_) {
          tParceiroIds = []
        }

        const respTrim = norm(t.responsavel)
        const match = filtroParceiros.some((pid) => {
          if (tParceiroIds.includes(pid)) return true
          const pObj = parceiros.find((p) => p.id === pid)
          if (pObj && pObj.nome && norm(pObj.nome) === respTrim) return true
          return false
        })
        if (!match) return false
      }

      return true
    })
  }, [itens, empresaFiltroAtiva, filtroPeriodo, filtroParceiros, parceiros])

  const hoje = new Date().toISOString().slice(0, 10)

  // Início e fim da semana corrente (segunda a domingo)
  const [inicioSemanaStr, fimSemanaStr] = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const diffToSegunda = (day + 6) % 7
    const seg = new Date(d)
    seg.setDate(d.getDate() - diffToSegunda)
    const dom = new Date(seg)
    dom.setDate(seg.getDate() + 6)
    return [seg.toISOString().slice(0, 10), dom.toISOString().slice(0, 10)]
  }, [])

  // Contadores globais do conjunto filtrado por empresa / período
  const contadores = useMemo(() => {
    const totalHoje = itensFiltrados.filter(
      (t) => t.prazo && String(t.prazo).slice(0, 10) === hoje,
    ).length
    const totalAtrasadas = itensFiltrados.filter(
      (t) => t.status_kanban !== 'concluido' && t.prazo && String(t.prazo).slice(0, 10) < hoje,
    ).length
    const totalSemResp = itensFiltrados.filter(
      (t) => !t.responsavel || !String(t.responsavel).trim(),
    ).length
    const totalEmAndamento = itensFiltrados.filter((t) => t.status_kanban === 'em_andamento').length

    return {
      hoje: totalHoje,
      atrasadas: totalAtrasadas,
      semResponsavel: totalSemResp,
      emAndamento: totalEmAndamento,
    }
  }, [itensFiltrados, hoje])

  // Itens para a lista após aplicar busca por texto e filtro rápido
  const itensLista = useMemo(() => {
    return itensFiltrados.filter((t) => {
      // Filtro de busca por texto
      if (buscaTexto.trim()) {
        const q = buscaTexto.trim().toLowerCase()
        const matchTitulo = String(t.titulo || '')
          .toLowerCase()
          .includes(q)
        const matchResp = String(t.responsavel || '')
          .toLowerCase()
          .includes(q)
        const matchEmp = String(t.empresa || '')
          .toLowerCase()
          .includes(q)
        const matchDesc = String(t.descricao || '')
          .toLowerCase()
          .includes(q)
        if (!matchTitulo && !matchResp && !matchEmp && !matchDesc) return false
      }

      // Filtro rápido
      const prazoStr = t.prazo ? String(t.prazo).slice(0, 10) : ''
      if (filtroRapido === 'hoje') {
        if (prazoStr !== hoje) return false
      } else if (filtroRapido === 'semana') {
        if (!prazoStr || prazoStr < inicioSemanaStr || prazoStr > fimSemanaStr) return false
      } else if (filtroRapido === 'atrasadas') {
        if (!prazoStr || prazoStr >= hoje || t.status_kanban === 'concluido') return false
      } else if (filtroRapido === 'minhas') {
        const uNome = (user?.name || '').trim().toLowerCase()
        const resp = (t.responsavel || '').trim().toLowerCase()
        if (!uNome || !resp || !resp.includes(uNome.split(' ')[0])) return false
      }

      return true
    })
  }, [itensFiltrados, buscaTexto, filtroRapido, hoje, inicioSemanaStr, fimSemanaStr, user])

  const atrasadas = itensFiltrados.filter(
    (t) => t.status_kanban !== 'concluido' && t.prazo && String(t.prazo).slice(0, 10) < hoje,
  )
  const deHoje = itensFiltrados.filter((t) => t.prazo && String(t.prazo).slice(0, 10) === hoje)

  // T2: abre o detalhe e carrega o histórico (chat)
  const abrirDetalhe = (t: any) => {
    setDetalhe(t)
    carregarChat(t.id)
  }

  const mover = async (t: any, novo: string) => {
    // Atualização otimista imediata para que contadores e colunas reajam na hora
    const statusAntigo = t.status_kanban || 'triagem'
    if (statusAntigo === novo) return

    setItens((prev) =>
      prev.map((item) =>
        item.id === t.id
          ? {
              ...item,
              status_kanban: novo,
              status:
                novo === 'concluido'
                  ? 'concluida'
                  : novo === 'em_andamento'
                    ? 'em_andamento'
                    : 'pendente',
            }
          : item,
      ),
    )

    try {
      await pb.collection('tarefas').update(t.id, {
        status_kanban: novo,
        status:
          novo === 'concluido'
            ? 'concluida'
            : novo === 'em_andamento'
              ? 'em_andamento'
              : 'pendente',
      })
      await carregar()
    } catch (e) {
      setErro(String(e))
      await carregar()
    }
  }

  const abrirNova = (statusPadrao: string = 'triagem') => {
    setForm({
      titulo: '',
      responsavel: '',
      prazo: '',
      recorrencia: 'Nenhuma',
      prioridade_p: 'P2',
      status_kanban: statusPadrao,
      descricao: '',
      vinculo_tipo: '',
      vinculo_id: '',
      empresa: empresaFiltroAtiva !== 'todas' ? empresaFiltroAtiva : '',
      parceiro_ids: [],
    })
    setArquivosNovos([])
    setAnexosExistentes([])
    setDialogErro('')
    setEditando(null)
    setDialog(true)
  }

  const abrirEditar = (t: any) => {
    let parceiroIds: string[] = []
    try {
      parceiroIds = Array.isArray(t.parceiros) ? t.parceiros : JSON.parse(t.parceiros || '[]')
    } catch (_) {
      parceiroIds = []
    }
    const listaExistente: string[] = Array.isArray(t.anexos) ? t.anexos : t.anexos ? [t.anexos] : []
    setForm({
      titulo: t.titulo || '',
      responsavel: t.responsavel || '',
      prazo: t.prazo ? String(t.prazo).slice(0, 10) : '',
      recorrencia: t.recorrencia || 'Nenhuma',
      prioridade_p:
        t.prioridade_p || (t.prioridade === 'alta' ? 'P1' : t.prioridade === 'baixa' ? 'P3' : 'P2'),
      status_kanban:
        t.status_kanban ||
        (t.status === 'concluida'
          ? 'concluido'
          : t.status === 'em_andamento'
            ? 'em_andamento'
            : 'triagem'),
      descricao: t.descricao || '',
      vinculo_tipo: t.vinculo_tipo || '',
      vinculo_id: t.vinculo_id || '',
      empresa: t.empresa || '',
      parceiro_ids: parceiroIds,
    })
    setArquivosNovos([])
    setAnexosExistentes(listaExistente)
    setDialogErro('')
    setEditando(t)
    setDetalhe(null)
    setDialog(true)
  }

  // T2a: abertura de chamado por ÁUDIO — Web Speech API com fallback gracioso MediaRecorder
  const [ouvindo, setOuvindo] = useState(false)
  const [processandoAudio, setProcessandoAudio] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [estruturando, setEstruturando] = useState(false)
  const recRef = useRef<any>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])

  const carregarParceiros = async () => {
    try {
      const r = await pb
        .collection('parceiros')
        .getFullList({ sort: 'nome', filter: 'ativo = true' })
      setParceiros(r as any[])
    } catch (_) {
      setParceiros([])
    }
  }

  useEffect(() => {
    carregarParceiros()
  }, [])

  const confirmarExclusao = async () => {
    if (!excluindoTarefa) return
    setExcluindoEmAndamento(true)
    try {
      await pb.collection('tarefas').delete(excluindoTarefa.id)
      setExcluindoTarefa(null)
      if (detalhe && detalhe.id === excluindoTarefa.id) {
        setDetalhe(null)
      }
      await carregar()
    } catch (e) {
      setErro('Falha ao excluir tarefa: ' + String(e))
    } finally {
      setExcluindoEmAndamento(false)
    }
  }

  const pararOuvir = () => {
    try {
      if (recRef.current) {
        recRef.current.onend = null
        recRef.current.onerror = null
        recRef.current.stop()
      }
    } catch (_) {
      /* noop */
    }
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop()
      }
    } catch (_) {
      /* noop */
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setOuvindo(false)
  }

  // Cleanup de gravação ao desmontar ou fechar diálogo
  useEffect(() => {
    return () => {
      pararOuvir()
    }
  }, [])

  const transcreverAudioBlob = async (blob: Blob) => {
    setProcessandoAudio(true)
    try {
      // Converte Blob para base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string
          const b64 = res.split(',')[1] || ''
          resolve(b64)
        }
        reader.onerror = reject
      })
      reader.readAsDataURL(blob)
      const b64 = await base64Promise

      const mime = blob.type || 'audio/webm'
      const r = (await pb.send('/backend/v1/ia/transcrever', {
        method: 'POST',
        body: JSON.stringify({ audio_base64: b64, mime }),
      })) as any
      const texto = r.texto || r.transcricao || ''
      if (texto) {
        setTranscricao((prev) => (prev ? prev + ' ' + texto : texto).trim())
        toast({
          title: 'Áudio transcrito com sucesso',
          description: 'Clique em "Preencher com IA" para organizar os campos da tarefa.',
        })
      } else {
        toast({
          title: 'Transcrição vazia',
          description: 'A IA não identificou fala clara no áudio gravado. Tente novamente.',
          variant: 'destructive',
        })
      }
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao transcrever')
      toast({
        title: 'Falha na transcrição do áudio',
        description: msg.includes('GEMINI_API_KEY')
          ? 'Chave de IA para transcrição não configurada. Use o reconhecimento nativo do Chrome ou digite o texto.'
          : 'Não foi possível transcrever o áudio gravado.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAudio(false)
    }
  }

  const iniciarGravacaoMediaRecorder = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast({
        title: 'Microfone indisponível',
        description:
          'Seu navegador não possui suporte a captura de áudio ou a página não está em contexto seguro (HTTPS).',
        variant: 'destructive',
      })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaChunksRef.current = []

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          mediaChunksRef.current.push(ev.data)
        }
      }

      mr.onstop = async () => {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop())
          mediaStreamRef.current = null
        }
        const mime = mr.mimeType || 'audio/webm'
        const audioBlob = new Blob(mediaChunksRef.current, { type: mime })
        if (audioBlob.size > 0) {
          await transcreverAudioBlob(audioBlob)
        }
      }

      mr.onerror = (ev: any) => {
        setOuvindo(false)
        toast({
          title: 'Erro na gravação',
          description: String(ev?.error || 'Falha no gravador de áudio.'),
          variant: 'destructive',
        })
      }

      mr.start()
      mediaRecRef.current = mr
      setOuvindo(true)
      toast({
        title: 'Gravando áudio...',
        description: 'Fale sua tarefa. Ao terminar, clique em "Parar" para transcrever.',
      })
    } catch (err: any) {
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        toast({
          title: 'Permissão de microfone negada',
          description:
            'Permita o acesso ao microfone nas permissões do navegador (ícone de cadeado na barra de endereços).',
          variant: 'destructive',
        })
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toast({
          title: 'Nenhum microfone encontrado',
          description: 'Conecte um microfone ao dispositivo para gravar.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Erro ao acessar microfone',
          description: String(err?.message || err),
          variant: 'destructive',
        })
      }
    }
  }

  const toggleOuvir = async () => {
    // Se já estiver gravando, para a gravação
    if (ouvindo) {
      pararOuvir()
      return
    }

    // Limpa transcrição anterior para nova gravação
    setTranscricao('')

    const SR =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null

    // Caminho 1: Web Speech API suportada
    if (SR) {
      // Solicita permissão prévia explícita no getUserMedia para dar feedback claro se for negada
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          probeStream.getTracks().forEach((t) => t.stop())
        } catch (err: any) {
          const name = err?.name || ''
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            toast({
              title: 'Permissão de microfone negada',
              description:
                'Permita o acesso ao microfone nas configurações do navegador (ícone de cadeado na barra de endereços).',
              variant: 'destructive',
            })
            return
          }
          if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            toast({
              title: 'Nenhum microfone encontrado',
              description: 'Conecte um microfone para gravar.',
              variant: 'destructive',
            })
            return
          }
          // Outros erros: prossegue para tentar SR diretamente
        }
      }

      try {
        const rec = new SR()
        rec.lang = 'pt-BR'
        rec.continuous = true
        rec.interimResults = true

        rec.onstart = () => {
          setOuvindo(true)
          toast({
            title: 'Gravando voz...',
            description: 'Fale sua tarefa. O texto será reconhecido automaticamente.',
          })
        }

        rec.onresult = (ev: any) => {
          let tFinal = ''
          let tInterim = ''
          for (let i = 0; i < ev.results.length; i++) {
            const item = ev.results[i]
            if (item.isFinal) {
              tFinal += item[0].transcript + ' '
            } else {
              tInterim += item[0].transcript + ' '
            }
          }
          const total = (tFinal + tInterim).trim()
          if (total) {
            setTranscricao(total)
          }
        }

        rec.onerror = (ev: any) => {
          const errCode = ev.error || ''
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            toast({
              title: 'Permissão de microfone negada',
              description:
                'O acesso ao microfone foi negado. Habilite nas configurações do navegador.',
              variant: 'destructive',
            })
          } else if (errCode === 'no-speech') {
            // Silêncio temporário — não é erro fatal, apenas notifica se fechar
          } else if (errCode === 'network') {
            toast({
              title: 'Erro de conexão no reconhecimento de voz',
              description:
                'O serviço de reconhecimento do navegador não conseguiu se conectar. Tentando gravador de áudio...',
              variant: 'destructive',
            })
            // Fallback para gravação via MediaRecorder
            pararOuvir()
            iniciarGravacaoMediaRecorder()
            return
          } else {
            toast({
              title: 'Erro no reconhecimento de voz',
              description: `Código: ${errCode || 'desconhecido'}.`,
              variant: 'destructive',
            })
          }
          setOuvindo(false)
        }

        rec.onend = () => {
          setOuvindo(false)
        }

        recRef.current = rec
        rec.start()
        return
      } catch (err: any) {
        // Falha ao instanciar ou iniciar Web Speech API: tenta MediaRecorder
        console.warn('SpeechRecognition falhou ao iniciar, usando fallback MediaRecorder:', err)
      }
    }

    // Caminho 2: Fallback gracioso com MediaRecorder + backend de transcrição
    if (typeof MediaRecorder !== 'undefined') {
      await iniciarGravacaoMediaRecorder()
      return
    }

    // Caminho 3: Nenhuma API de áudio suportada
    toast({
      title: 'Navegador incompatível',
      description:
        'Seu navegador não suporta Web Speech API nem gravação de mídia. Recomendamos o Google Chrome, Edge ou Safari atualizados.',
      variant: 'destructive',
    })
  }

  const estruturarVoz = async () => {
    if (!transcricao.trim()) return
    setEstruturando(true)
    try {
      const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
        method: 'POST',
        body: JSON.stringify({ alvo: 'tarefa', texto: transcricao }),
      })) as any
      const e = r.estrutura || {}
      setForm((f: any) => ({
        ...f,
        titulo: e.titulo || f.titulo,
        descricao: e.descricao || f.descricao,
        responsavel: e.responsavel || f.responsavel,
        prazo: e.prazo || f.prazo,
        prioridade_p: e.prioridade_p || f.prioridade_p,
        empresa: e.empresa || f.empresa,
      }))
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setEstruturando(false)
    }
  }

  // T2c: compartilhar tarefa com parceiro
  const [compartilhar, setCompartilhar] = useState<any | null>(null) // {tarefa, parceiros[]}
  const compartilharTarefa = async (tarefa: any, canal: string) => {
    const pid = compartilhar?.parceiroId
    if (!pid) return
    try {
      const r = (await pb.send('/backend/v1/tarefas/compartilhar', {
        method: 'POST',
        body: JSON.stringify({ canal, parceiro_id: pid, tarefa_id: tarefa.id }),
      })) as any
      if (r.canal === 'whatsapp' && r.link) {
        window.open(r.link, '_blank')
      } else if (r.ok) {
        setErro('')
        alert('Tarefa enviada por e-mail ao parceiro.')
      }
      setCompartilhar(null)
    } catch (e) {
      setErro(String(e))
    }
  }

  const abrirCompartilhar = (t: any) => {
    // parceiros vinculados à tarefa (ids em t.parceiros JSONB)
    let ids: string[] = []
    try {
      ids = Array.isArray(t.parceiros) ? t.parceiros : JSON.parse(t.parceiros || '[]')
    } catch (_) {
      ids = []
    }
    const vinc = parceiros.filter((p) => ids.includes(p.id))
    if (vinc.length === 0) {
      setErro('Tarefa sem parceiro vinculado — edite a tarefa e vincule um parceiro/contato.')
      return
    }
    setCompartilhar({ tarefa: t, parceiros: vinc, parceiroId: vinc[0]?.id })
  }

  const salvar = async (isRascunho = false, fraseCapturaIa?: string) => {
    setDialogErro('')
    // Validação de título
    if (!form.titulo || !form.titulo.trim()) {
      setDialogErro('Por favor, informe o título da tarefa.')
      toast({
        title: 'Título obrigatório',
        description: 'Preencha o campo Título antes de salvar.',
        variant: 'destructive',
      })
      return
    }

    // T2b: parceiro(s) responsável(is)
    // Se nenhum parceiro foi explicitamente selecionado no dropdown multi-select mas há um responsável preenchido:
    let idsParceiros: string[] = Array.isArray(form.parceiro_ids) ? [...form.parceiro_ids] : []
    if (idsParceiros.length === 0 && form.responsavel) {
      const respTrim = String(form.responsavel).trim().toLowerCase()
      const match = parceiros.find(
        (p) =>
          String(p.nome || '')
            .trim()
            .toLowerCase() === respTrim ||
          respTrim.includes(
            String(p.nome || '')
              .trim()
              .toLowerCase(),
          ),
      )
      if (match) {
        idsParceiros = [match.id]
      }
    }

    // Se não for rascunho, exige parceiro responsável obrigatório
    if (!isRascunho && idsParceiros.length === 0) {
      const msgAviso =
        'Vincule pelo menos um parceiro/contato responsável no campo abaixo antes de salvar.'
      setDialogErro(msgAviso)
      toast({
        title: 'Parceiro/Contato obrigatório',
        description: msgAviso,
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const fd = new FormData()
      fd.append('titulo', form.titulo.trim())
      fd.append('responsavel', form.responsavel || '')
      if (form.prazo) {
        fd.append('prazo', form.prazo + ' 00:00:00.000Z')
      } else {
        fd.append('prazo', '')
      }
      fd.append('recorrencia', form.recorrencia || 'Nenhuma')
      fd.append('prioridade_p', form.prioridade_p || 'P2')
      fd.append('status_kanban', form.status_kanban || 'triagem')
      fd.append('descricao', form.descricao || '')
      fd.append('vinculo_tipo', form.vinculo_tipo || '')
      fd.append('vinculo_id', form.vinculo_id || '')
      fd.append('empresa', form.empresa || '')
      fd.append('parceiros', JSON.stringify(idsParceiros))
      fd.append(
        'prioridade',
        form.prioridade_p === 'P1' ? 'alta' : form.prioridade_p === 'P2' ? 'media' : 'baixa',
      )
      fd.append(
        'status',
        form.status_kanban === 'concluido'
          ? 'concluida'
          : form.status_kanban === 'em_andamento'
            ? 'em_andamento'
            : 'pendente',
      )

      if (editando) {
        // Se editando, manter apenas os anexos já existentes que não foram removidos pelo usuário
        const originais: string[] = Array.isArray(editando.anexos)
          ? editando.anexos
          : editando.anexos
            ? [editando.anexos]
            : []
        const removidos = originais.filter((nome) => !anexosExistentes.includes(nome))
        for (const rem of removidos) {
          fd.append('anexos-', rem)
        }
      }

      // Adiciona novos arquivos selecionados
      for (const arq of arquivosNovos) {
        fd.append('anexos', arq)
      }

      let tarefaGravadaId = ''
      if (editando) {
        tarefaGravadaId = editando.id
        await pb.collection('tarefas').update(editando.id, fd)
        toast({
          title: isRascunho ? 'Rascunho salvo' : 'Tarefa atualizada',
          description: `A tarefa "${form.titulo.trim()}" foi salva com sucesso.`,
        })
      } else {
        fd.append('criado_por', user?.email || '')
        const novaTarefa = await pb.collection('tarefas').create(fd)
        tarefaGravadaId = novaTarefa.id
        toast({
          title: isRascunho ? 'Rascunho salvo' : 'Tarefa criada com sucesso',
          description: `A tarefa "${form.titulo.trim()}" foi ${isRascunho ? 'salva como rascunho' : 'adicionada'} com sucesso.`,
        })
      }

      // Se a tarefa foi montada com apoio da captura por IA, registrar no histórico da tarefa
      if (fraseCapturaIa && fraseCapturaIa.trim() && tarefaGravadaId) {
        try {
          const textoHistorico = `Tarefa criada via captura por IA: «${fraseCapturaIa.trim()}»`
          const chatFd = new FormData()
          chatFd.append('tarefa_id', tarefaGravadaId)
          chatFd.append('autor', user?.email || 'Assistente IA')
          chatFd.append('autor_tipo', 'ia')
          chatFd.append('texto', textoHistorico)
          await pb.collection('tarefas_chat').create(chatFd)
        } catch (chatErr) {
          console.warn('Não foi possível gravar no tarefas_chat (best-effort):', chatErr)
        }

        try {
          await pb.send('/backend/v1/auditoria', {
            method: 'POST',
            body: JSON.stringify({
              acao: 'ia_captura_tarefa',
              modulo: 'tarefas',
              detalhe: `Tarefa "${form.titulo.trim()}" montada via captura por IA: «${fraseCapturaIa.trim()}»`,
            }),
          })
        } catch (_) {
          /* best-effort */
        }
      }

      setDialog(false)
      setDialogErro('')
      setArquivosNovos([])
      setAnexosExistentes([])
      await carregar()
    } catch (e: any) {
      console.error('Erro ao salvar tarefa:', e)
      const errDetalhe =
        e?.response?.message ||
        (e?.response?.data ? JSON.stringify(e.response.data) : '') ||
        e?.message ||
        String(e)
      const msgAmigavel = `Falha ao salvar tarefa: ${errDetalhe}`
      setDialogErro(msgAmigavel)
      setErro(msgAmigavel)
      toast({
        title: 'Erro ao salvar tarefa',
        description: msgAmigavel,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // T2: chat da tarefa — carrega histórico + envia mensagem c/ anexo opcional
  const carregarChat = async (tarefaId: string) => {
    setChatErro('')
    try {
      const r = await pb
        .collection('tarefas_chat')
        .getFullList({ filter: 'tarefa_id = "' + tarefaId + '"', sort: 'created' })
      setChatMsgs(r as any[])
    } catch (e) {
      setChatErro('Histórico indisponível: ' + String(e).slice(0, 60))
      setChatMsgs([])
    }
  }

  const enviarChat = async () => {
    if (!detalhe || (!novoChat.trim() && !chatAnexo)) return
    setChatErro('')
    try {
      const fd = new FormData()
      fd.append('tarefa_id', detalhe.id)
      fd.append('autor', user?.email || '')
      fd.append('autor_tipo', 'portal')
      if (novoChat.trim()) fd.append('texto', novoChat.trim())
      if (chatAnexo) fd.append('anexo', chatAnexo)
      await pb.collection('tarefas_chat').create(fd)
      // auditoria (best-effort)
      try {
        await pb.send('/backend/v1/auditoria', {
          method: 'POST',
          body: JSON.stringify({
            acao: 'criar_registro',
            modulo: 'tarefas_chat',
            detalhe: 'Chat em "' + (detalhe.titulo || '') + '"',
          }),
        })
      } catch (_) {
        /* best-effort */
      }
      setNovoChat('')
      setChatAnexo(null)
      await carregarChat(detalhe.id)
    } catch (e) {
      setChatErro('Falha ao enviar: ' + String(e).slice(0, 80))
    }
  }

  const addSub = async () => {
    if (!detalhe || !novaSub.trim()) return
    const lista = Array.isArray(detalhe.subtarefas)
      ? detalhe.subtarefas
      : JSON.parse(detalhe.subtarefas || '[]')
    lista.push({ t: novaSub, ok: false })
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(lista) })
      setNovaSub('')
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      setDetalhe(upd)
    } catch (e) {
      setErro(String(e))
    }
  }

  const toggleSub = async (idx: number) => {
    if (!detalhe) return
    const lista = Array.isArray(detalhe.subtarefas)
      ? detalhe.subtarefas
      : JSON.parse(detalhe.subtarefas || '[]')
    lista[idx].ok = !lista[idx].ok
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(lista) })
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      setDetalhe(upd)
    } catch (e) {
      setErro(String(e))
    }
  }

  // calendário do mês
  const diasMes = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number)
    const primeiro = new Date(y, m - 1, 1)
    const dias = new Date(y, m, 0).getDate()
    const offset = (primeiro.getDay() + 6) % 7 // semana começa segunda
    const cells: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= dias; d++) {
      cells.push(`${mesRef}-${String(d).padStart(2, '0')}`)
    }
    return cells
  }, [mesRef])

  const tarefasPorDia = (dia: string) =>
    itensFiltrados.filter((t) => String(t.prazo || '').slice(0, 10) === dia)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      {/* BARRA SUPERIOR: Apenas Título + Subtítulo */}
      <div className="pb-3 border-b border-gray-200/80">
        <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <span className="text-[#1B5E20] text-xl font-bold tracking-tight select-none">|'|</span>{' '}
          Tarefas & Agenda
        </h1>
        <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
          Arraste os cartões para mudar a fase
        </p>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* FAIXA DE CONTADORES: Hoje, Atrasadas, Sem responsável, Em andamento */}
      <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
        <button
          type="button"
          onClick={() => setFiltroRapido((f) => (f === 'hoje' ? 'todos' : 'hoje'))}
          className={cn(
            'inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors cursor-pointer py-0.5 px-1 rounded',
            filtroRapido === 'hoje' && 'font-bold text-[#1B5E20] bg-emerald-50',
          )}
        >
          <span>Hoje</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
            {contadores.hoje}
          </span>
        </button>
        <span className="text-gray-300">·</span>
        <button
          type="button"
          onClick={() => setFiltroRapido((f) => (f === 'atrasadas' ? 'todos' : 'atrasadas'))}
          className={cn(
            'inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors cursor-pointer py-0.5 px-1 rounded',
            filtroRapido === 'atrasadas' && 'font-bold text-red-700 bg-red-50',
          )}
        >
          <span>Atrasadas</span>
          <span
            className={cn(
              'px-1.5 py-0.2 rounded-full text-[11px] font-bold',
              contadores.atrasadas > 0
                ? 'bg-red-100 text-red-700 font-bold'
                : 'bg-gray-100 text-gray-700',
            )}
          >
            {contadores.atrasadas}
          </span>
        </button>
        <span className="text-gray-300">·</span>
        <div className="inline-flex items-center gap-1.5 py-0.5 px-1 text-gray-500">
          <span>Sem responsável</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
            {contadores.semResponsavel}
          </span>
        </div>
        <span className="text-gray-300">·</span>
        <div className="inline-flex items-center gap-1.5 py-0.5 px-1 text-gray-500">
          <span>Em andamento</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
            {contadores.emAndamento}
          </span>
        </div>
      </div>

      {/* UMA ÚNICA LINHA DE FILTROS: Busca · Filtros rápidos (Todos, Hoje, Semana, Atrasadas, Minhas) · Botão agrupado de visão (Lista ▾ / Board ▾ / Calendário ▾) · Período ▾ · Empresa ▾ · Nova tarefa */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
          {/* Campo de busca */}
          <div className="relative w-full sm:w-56 lg:w-64">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Buscar tarefa..."
              className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-gray-200 rounded-full text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]/40 transition-colors shadow-2xs"
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtros rápidos: Todos, Hoje, Semana, Atrasadas, Minhas */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setFiltroRapido('todos')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                filtroRapido === 'todos'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroRapido((f) => (f === 'hoje' ? 'todos' : 'hoje'))}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                filtroRapido === 'hoje'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
              )}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setFiltroRapido((f) => (f === 'semana' ? 'todos' : 'semana'))}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                filtroRapido === 'semana'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setFiltroRapido((f) => (f === 'atrasadas' ? 'todos' : 'atrasadas'))}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                filtroRapido === 'atrasadas'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
              )}
            >
              Atrasadas
            </button>
            <button
              type="button"
              onClick={() => setFiltroRapido((f) => (f === 'minhas' ? 'todos' : 'minhas'))}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                filtroRapido === 'minhas'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
              )}
            >
              Minhas
            </button>
          </div>

          {/* Botão agrupado de visão: posicionado À DIREITA de "Minhas", exibe o modo atual ("Lista ▾", "Board ▾" ou "Calendário ▾") */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 shadow-2xs inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 cursor-pointer"
                title="Alternar modo de visualização"
              >
                {vista === 'lista' && <List className="h-3.5 w-3.5 text-gray-600" />}
                {vista === 'kanban' && <Kanban className="h-3.5 w-3.5 text-[#1B5E20]" />}
                {vista === 'calendario' && <Calendar className="h-3.5 w-3.5 text-gray-600" />}
                <span>
                  {vista === 'lista' ? 'Lista' : vista === 'kanban' ? 'Board' : 'Calendário'}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 bg-white">
              <DropdownMenuItem
                onClick={() => setVista('lista')}
                className={cn(
                  'text-xs font-medium cursor-pointer flex items-center justify-between',
                  vista === 'lista' && 'bg-emerald-50 text-[#1B5E20] font-bold',
                )}
              >
                <div className="flex items-center gap-2">
                  <List className="h-3.5 w-3.5" />
                  <span>Lista</span>
                </div>
                {vista === 'lista' && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setVista('kanban')}
                className={cn(
                  'text-xs font-medium cursor-pointer flex items-center justify-between',
                  vista === 'kanban' && 'bg-emerald-50 text-[#1B5E20] font-bold',
                )}
              >
                <div className="flex items-center gap-2">
                  <Kanban className="h-3.5 w-3.5" />
                  <span>Board</span>
                </div>
                {vista === 'kanban' && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setVista('calendario')}
                className={cn(
                  'text-xs font-medium cursor-pointer flex items-center justify-between',
                  vista === 'calendario' && 'bg-emerald-50 text-[#1B5E20] font-bold',
                )}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Calendário</span>
                </div>
                {vista === 'calendario' && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Dropdown "Período ▾" */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 shadow-2xs inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 cursor-pointer',
                  (filtroPeriodo?.from || filtroPeriodo?.to) &&
                    'border-[#1B5E20] text-[#1B5E20] bg-emerald-50/50 font-semibold',
                )}
                title="Seletor de período"
              >
                <Calendar className="h-3.5 w-3.5 text-gray-500" />
                <span>
                  {filtroPeriodo?.from
                    ? filtroPeriodo.to
                      ? `${filtroPeriodo.from.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })} — ${filtroPeriodo.to.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}`
                      : `A partir de ${filtroPeriodo.from.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}`
                    : 'Período'}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white" align="start">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900">Período</div>
                  <div className="text-[11px] text-gray-500">Selecione início e fim</div>
                </div>
                {filtroPeriodo?.from && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiltroPeriodo(undefined)}
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <CalendarPicker
                mode="range"
                selected={filtroPeriodo as any}
                onSelect={(range: any) => setFiltroPeriodo(range)}
                numberOfMonths={1}
                className="rounded-md"
              />
            </PopoverContent>
          </Popover>

          {/* Dropdown "Empresa ▾" */}
          <Select value={empresaFiltroAtiva} onValueChange={(v) => setFiltroEmpresa(v)}>
            <SelectTrigger
              className="h-9 min-w-[150px] max-w-[200px] bg-white border-gray-200 text-xs font-medium text-gray-800 shadow-2xs focus:ring-[#1B5E20] rounded-lg"
              aria-label="Filtro de empresa"
            >
              <div className="flex items-center gap-1.5 truncate">
                {empresaFiltroAtiva !== 'todas' ? (
                  <EmpresaIcon nome={empresaFiltroAtiva} className="h-3.5 w-3.5" />
                ) : (
                  <UsersIcon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                )}
                <span className="truncate">
                  {empresaFiltroAtiva === 'todas' ? 'Todas as empresas' : empresaFiltroAtiva}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent align="start" className="w-[200px] bg-white">
              <SelectItem value="todas">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <span>Todas as empresas</span>
                </div>
              </SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.nome}>
                  <div className="flex items-center gap-2">
                    <EmpresaIcon nome={e.nome} className="h-4 w-4" />
                    <span>{e.nome}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Botão Nova tarefa */}
          <Button
            onClick={() => abrirNova('triagem')}
            className="h-9 px-3.5 text-xs font-semibold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        </div>

        {/* Limpar filtros ativos se houver */}
        {(buscaTexto ||
          filtroRapido !== 'todos' ||
          filtroPeriodo?.from ||
          empresaFiltroAtiva !== 'todas') && (
          <button
            type="button"
            onClick={() => {
              setBuscaTexto('')
              setFiltroRapido('todos')
              setFiltroPeriodo(undefined)
              setFiltroEmpresa('todas')
            }}
            className="text-xs text-gray-500 hover:text-red-600 font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <X className="h-3 w-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Vista: Lista (Tabela com colunas ordenáveis ao clique, reorganizáveis e redimensionáveis por arrasto) */}
      {vista === 'lista' && (
        <TarefasListaView
          itens={itensLista}
          onAbrirDetalhe={abrirDetalhe}
          onAbrirEditar={abrirEditar}
          onExcluir={(t) => setExcluindoTarefa(t)}
          onMoverStatus={mover}
          onAbrirNova={abrirNova}
          obterIconeEmpresa={obterIconeEmpresa}
        />
      )}

      {/* Vista: Kanban — 5 colunas (Triagem âmbar, A Fazer com limite 5, Em Andamento, Bloqueado vermelho, Concluído verde) */}
      {vista === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 items-start">
          {COLUNAS.map((col) => {
            const isTriagem = col.key === 'triagem'
            const isAFazer = col.key === 'a_fazer'
            const isBloqueado = col.key === 'bloqueado'
            const isConcluido = col.key === 'concluido'
            const isEmAndamento = col.key === 'em_andamento'
            const isOver = colunaHover === col.key && arrastandoTarefa?.status_kanban !== col.key

            const cards = itensFiltrados.filter((t) => (t.status_kanban || 'triagem') === col.key)

            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (colunaHover !== col.key) setColunaHover(col.key)
                }}
                onDragLeave={(e) => {
                  // Só limpa se estiver saindo da coluna de fato
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (colunaHover === col.key) setColunaHover(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setColunaHover(null)
                  const id = e.dataTransfer.getData('text/plain')
                  const tarefaArrastada = itens.find((t) => t.id === id) || arrastandoTarefa
                  if (tarefaArrastada && tarefaArrastada.status_kanban !== col.key) {
                    mover(tarefaArrastada, col.key)
                  }
                  setArrastandoTarefa(null)
                }}
                className={cn(
                  'rounded-2xl transition-all flex flex-col',
                  isTriagem
                    ? 'bg-[#FFF9EC] border-2 border-amber-300 shadow-xs'
                    : 'bg-gray-50/70 border border-gray-200/80',
                  isOver && 'ring-2 ring-[#1B5E20] border-[#1B5E20] bg-emerald-50/30 shadow-md',
                )}
              >
                {/* Cabeçalho da coluna */}
                <div
                  className={cn(
                    'p-3.5 border-b',
                    isTriagem ? 'border-amber-200/70' : 'border-gray-200/60',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isTriagem && (
                        <div className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                          <Inbox className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {isAFazer && (
                        <div className="w-5 h-5 rounded-md bg-gray-200/60 text-gray-600 flex items-center justify-center shrink-0">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {isEmAndamento && (
                        <div className="w-5 h-5 rounded-md bg-blue-100/60 text-blue-600 flex items-center justify-center shrink-0">
                          <Play className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {isBloqueado && (
                        <div className="w-5 h-5 rounded-md bg-red-100/60 text-red-600 flex items-center justify-center shrink-0">
                          <Lock className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {isConcluido && (
                        <div className="w-5 h-5 rounded-md bg-emerald-100/60 text-emerald-600 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </div>
                      )}

                      <span
                        className={cn(
                          'text-xs font-bold tracking-tight truncate',
                          isTriagem && 'text-amber-900',
                          isAFazer && 'text-gray-800',
                          isEmAndamento && 'text-blue-700',
                          isBloqueado && 'text-red-700',
                          isConcluido && 'text-emerald-700',
                        )}
                      >
                        {col.label}
                      </span>

                      {/* Chip visual "Limite 5" na coluna A Fazer */}
                      {isAFazer && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-gray-200/80 text-gray-600">
                          limite 5
                        </span>
                      )}

                      {/* Contador âmbar destacado em Triagem */}
                      {isTriagem && (
                        <span className="text-[11px] font-bold px-2 py-0.2 rounded-full bg-amber-500 text-white shadow-2xs">
                          {cards.length}
                        </span>
                      )}
                    </div>

                    {/* Contador discreto nas outras colunas e menu opcional */}
                    {!isTriagem && (
                      <span className="text-xs font-bold text-gray-400 tabular-nums">
                        {cards.length}
                      </span>
                    )}

                    {isTriagem && (
                      <button
                        type="button"
                        onClick={() => abrirNova('triagem')}
                        className="text-amber-700/60 hover:text-amber-900 p-0.5 rounded transition-colors"
                        title="Nova tarefa na Triagem"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Linha de apoio exclusiva da Triagem */}
                  {isTriagem && (
                    <p className="text-[11px] text-amber-800/80 mt-1.5 leading-tight font-medium">
                      Tarefas novas — defina responsável e prazo
                    </p>
                  )}
                </div>

                {/* Lista de cartões */}
                <div className="p-2.5 space-y-2.5 flex-1 min-h-[360px] flex flex-col justify-between">
                  <div className="space-y-2.5">
                    {/* Indicador visual de destino do drop no topo quando arrastando */}
                    {isOver && (
                      <div className="h-14 rounded-xl border-2 border-dashed border-[#1B5E20] bg-emerald-50/60 flex items-center justify-center text-xs font-semibold text-[#1B5E20] animate-pulse">
                        Solte para mover para {col.label}
                      </div>
                    )}

                    {cards.map((t) => {
                      const anexosCount = Array.isArray(t.anexos)
                        ? t.anexos.length
                        : t.anexos
                          ? 1
                          : 0
                      const semResponsavel = !t.responsavel || !t.responsavel.trim()
                      const semPrazo = !t.prazo || !t.prazo.trim()
                      const temRecorrencia = t.recorrencia && t.recorrencia !== 'Nenhuma'

                      const iniciaisResponsavel = (t.responsavel || '')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w: string) => w[0].toUpperCase())
                        .join('')

                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', t.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setArrastandoTarefa(t)
                          }}
                          onDragEnd={() => {
                            setArrastandoTarefa(null)
                            setColunaHover(null)
                          }}
                          onClick={() => abrirDetalhe(t)}
                          className={cn(
                            'group bg-white rounded-xl border border-gray-200/90 p-3 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none',
                            arrastandoTarefa?.id === t.id && 'opacity-40 scale-95 border-dashed',
                          )}
                        >
                          {/* 1ª Linha: Prioridade (P1/P2/P3), Empresa (com ícone EmpresaIcon) e Menu de 3 pontos */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0.5 rounded',
                                  PRIO_COR[t.prioridade_p || 'P3'],
                                )}
                              >
                                {t.prioridade_p || 'P3'}
                              </span>

                              {t.empresa ? (
                                <div className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 truncate">
                                  <EmpresaIcon nome={t.empresa} className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{t.empresa}</span>
                                </div>
                              ) : null}
                            </div>

                            {/* Menu de três pontos: Mudar Status, Editar, Excluir (sem lixeira direta no cartão) */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors opacity-70 group-hover:opacity-100 focus:opacity-100"
                                  title="Opções do cartão"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-48 bg-white"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                  Mudar status
                                </div>
                                {COLUNAS.map((destino) => (
                                  <DropdownMenuItem
                                    key={destino.key}
                                    onClick={() => mover(t, destino.key)}
                                    className={cn(
                                      'text-xs font-medium cursor-pointer flex items-center justify-between',
                                      (t.status_kanban || 'triagem') === destino.key &&
                                        'bg-emerald-50 text-[#1B5E20] font-bold',
                                    )}
                                  >
                                    <span>{destino.label}</span>
                                    {(t.status_kanban || 'triagem') === destino.key && (
                                      <Check className="h-3 w-3 text-[#1B5E20]" />
                                    )}
                                  </DropdownMenuItem>
                                ))}

                                <div className="my-1 border-t border-gray-100" />

                                <DropdownMenuItem
                                  onClick={() => abrirEditar(t)}
                                  className="text-xs font-medium cursor-pointer flex items-center gap-2 text-gray-700"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                  <span>Editar tarefa</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => setExcluindoTarefa(t)}
                                  className="text-xs font-medium cursor-pointer flex items-center gap-2 text-red-600 focus:text-red-700 focus:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  <span>Excluir tarefa</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Título: em até 2 linhas */}
                          <h4 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 mb-2.5">
                            {t.titulo}
                          </h4>

                          {/* Base do cartão: Responsável com avatar + Prazo com ícone de calendário */}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-600 mb-1.5 flex-wrap">
                            {/* Responsável com avatar ou aviso destacado em âmbar */}
                            {semResponsavel ? (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 font-medium text-[11px]">
                                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                <span>Sem responsável</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-emerald-700 text-white font-bold text-[9px] flex items-center justify-center shrink-0 shadow-2xs">
                                  {iniciaisResponsavel || 'U'}
                                </div>
                                <span className="text-gray-700 font-medium truncate max-w-[120px]">
                                  {t.responsavel}
                                </span>
                              </div>
                            )}

                            {/* Prazo com ícone de calendário ou aviso destacado em âmbar */}
                            {semPrazo ? (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 font-medium text-[11px]">
                                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                <span>Sem prazo</span>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'inline-flex items-center gap-1 text-[11px] tabular-nums shrink-0',
                                  String(t.prazo).slice(0, 10) < hoje &&
                                    t.status_kanban !== 'concluido'
                                    ? 'text-red-600 font-bold'
                                    : 'text-gray-500 font-medium',
                                )}
                              >
                                <Calendar className="h-3 w-3 text-gray-400 shrink-0" />
                                <span>{fmtData(t.prazo)}</span>
                              </div>
                            )}
                          </div>

                          {/* Linha complementar de tags: Recorrência e Anexos */}
                          {(temRecorrencia || anexosCount > 0) && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100/80 flex-wrap">
                              {temRecorrencia && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Repeat className="h-2.5 w-2.5" />
                                  <span>{t.recorrencia}</span>
                                </span>
                              )}

                              {anexosCount > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium ml-auto"
                                  title={`${anexosCount} anexo(s)`}
                                >
                                  <Paperclip className="h-3 w-3 text-gray-400" />
                                  <span>{anexosCount}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Estado vazio discreto */}
                    {cards.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-6 text-center my-auto flex flex-col items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
                          {isAFazer ? (
                            <FileText className="h-4 w-4" />
                          ) : isEmAndamento ? (
                            <Play className="h-4 w-4" />
                          ) : isBloqueado ? (
                            <Lock className="h-4 w-4" />
                          ) : isConcluido ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Inbox className="h-4 w-4" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-gray-600">Nenhuma tarefa aqui</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Mova cartões da triagem</p>
                      </div>
                    )}
                  </div>

                  {/* Linha "+ Adicionar tarefa" ao final de cada coluna */}
                  <button
                    type="button"
                    onClick={() => abrirNova(col.key)}
                    className={cn(
                      'w-full py-2 px-3 rounded-xl border border-dashed text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-2',
                      isTriagem
                        ? 'border-amber-300 text-amber-800 hover:bg-amber-100/50 hover:border-amber-400'
                        : 'border-gray-200 text-gray-500 hover:bg-white hover:text-gray-900 hover:border-gray-300',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar tarefa</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Calendário: Reestruturado com visão padrão Semanal (7 colunas), cartões compactos, atrasadas destacadas, navegador com extenso e painel lateral com totais da semana e carga por pessoa */}
      {vista === 'calendario' && (
        <TarefasCalendarioView
          itens={itensLista}
          hoje={hoje}
          onAbrirDetalhe={abrirDetalhe}
          onAbrirNova={abrirNova}
          mesRef={mesRef}
          setMesRef={setMesRef}
          diasMes={diasMes}
        />
      )}

      {/* Diálogo unificado Nova/Editar Tarefa — Modelo "IA primeiro" fiel ao mockup visual */}
      <TarefaFormDialog
        open={dialog}
        onOpenChange={(aberto) => {
          if (!aberto && ouvindo) {
            pararOuvir()
          }
          setDialog(aberto)
        }}
        editando={editando}
        form={form}
        setForm={setForm}
        empresas={empresas}
        parceiros={parceiros}
        obterIconeEmpresa={obterIconeEmpresa}
        onAbrirNovoParceiro={() => setNovoParceiroModalAberto(true)}
        arquivosNovos={arquivosNovos}
        setArquivosNovos={setArquivosNovos}
        anexosExistentes={anexosExistentes}
        setAnexosExistentes={setAnexosExistentes}
        dialogErro={dialogErro}
        setDialogErro={setDialogErro}
        salvando={salvando}
        onSalvar={salvar}
      />

      {/* Detalhe da tarefa — Versão A: Layout 3 Zonas fiel ao mockup */}
      <TarefaDetalheModal
        detalhe={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={(t) => abrirEditar(t)}
        onCompartilhar={(t) => abrirCompartilhar(t)}
        onExcluir={(t) => setExcluindoTarefa(t)}
        onMover={async (t, novo) => {
          await mover(t, novo)
          // Atualiza o estado em memória do detalhe
          setDetalhe((prev: any) =>
            prev && prev.id === t.id
              ? {
                  ...prev,
                  status_kanban: novo,
                  status:
                    novo === 'concluido'
                      ? 'concluida'
                      : novo === 'em_andamento'
                        ? 'em_andamento'
                        : 'pendente',
                }
              : prev,
          )
        }}
        onSubtarefasAtualizadas={(upd) => {
          setDetalhe(upd)
          carregar()
        }}
        chatMsgs={chatMsgs}
        novoChat={novoChat}
        setNovoChat={setNovoChat}
        chatAnexo={chatAnexo}
        setChatAnexo={setChatAnexo}
        enviarChat={enviarChat}
        chatErro={chatErro}
      />

      {/* Confirmação de exclusão da tarefa */}
      <Dialog open={!!excluindoTarefa} onOpenChange={(o) => !o && setExcluindoTarefa(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" /> Excluir Tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-[13px] text-gray-700 leading-relaxed">
            Tem certeza que deseja excluir a tarefa{' '}
            <strong className="text-gray-900 font-semibold">"{excluindoTarefa?.titulo}"</strong>?
            Esta ação é irreversível e removerá todos os dados do kanban e histórico de chat.
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setExcluindoTarefa(null)}
              className="h-9"
              disabled={excluindoEmAndamento}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarExclusao}
              disabled={excluindoEmAndamento}
              className="h-9 bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {excluindoEmAndamento ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo unificado de Cadastro de Novo Parceiro (mesmo de Parceiros & Contatos) */}
      <ParceiroCadastroDialog
        open={novoParceiroModalAberto}
        onOpenChange={setNovoParceiroModalAberto}
        empresaPadrao={form.empresa || empresaFiltroAtiva}
        onSalvo={async (novoParceiro) => {
          // Atualiza lista de parceiros em memória
          await carregarParceiros()
          if (novoParceiro && novoParceiro.id) {
            // Seleciona automaticamente o novo parceiro criado
            setForm((f: any) => {
              const curIds = f.parceiro_ids || []
              const novosIds = curIds.includes(novoParceiro.id)
                ? curIds
                : [...curIds, novoParceiro.id]
              return {
                ...f,
                parceiro_ids: novosIds,
                responsavel: f.responsavel ? f.responsavel : novoParceiro.nome,
              }
            })
            toast({
              title: 'Parceiro cadastrado e selecionado',
              description: `"${novoParceiro.nome}" foi vinculado automaticamente à tarefa.`,
            })
          }
        }}
      />

      {/* T2c: Compartilhar tarefa com parceiro (WhatsApp / e-mail) */}
      <Dialog open={!!compartilhar} onOpenChange={(o) => !o && setCompartilhar(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[#1B5E20]" /> Compartilhar tarefa
              </span>
              <button
                onClick={() => setCompartilhar(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {compartilhar && (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Parceiro/contato vinculado
                </Label>
                <Select
                  value={compartilhar.parceiroId}
                  onValueChange={(v) => setCompartilhar({ ...compartilhar, parceiroId: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {compartilhar.parceiros.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} {p.whatsapp ? '(WA)' : ''} {p.email ? '(e-mail)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => compartilharTarefa(compartilhar.tarefa, 'whatsapp')}
                  disabled={!compartilhar.parceiroId}
                >
                  <MessageSquare className="h-4 w-4 mr-1.5" /> WhatsApp
                </Button>
                <Button
                  className="h-11 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  onClick={() => compartilharTarefa(compartilhar.tarefa, 'email')}
                  disabled={!compartilhar.parceiroId}
                >
                  <Mail className="h-4 w-4 mr-1.5" /> E-mail
                </Button>
              </div>
              <p className="text-[11px] text-gray-400">
                WhatsApp abre o app com a tarefa preenchida; e-mail envia direto pelo relay do
                portal.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
