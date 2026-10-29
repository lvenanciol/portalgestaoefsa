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
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { TarefasListaView } from '@/components/operacional/TarefasListaView'
import { ParceiroCadastroDialog } from '@/components/operacional/ParceiroCadastroDialog'
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
  { key: 'a_fazer', label: 'A Fazer', cor: 'bg-gray-100 text-gray-700' },
  { key: 'em_andamento', label: 'Em Andamento', cor: 'bg-amber-50 text-amber-700' },
  { key: 'bloqueado', label: 'Bloqueado', cor: 'bg-red-50 text-red-700' },
  { key: 'concluido', label: 'Concluído', cor: 'bg-emerald-50 text-emerald-700' },
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
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [excluindoTarefa, setExcluindoTarefa] = useState<any | null>(null)
  const [excluindoEmAndamento, setExcluindoEmAndamento] = useState(false)
  const [form, setForm] = useState<any>({})
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([])
  const [anexosExistentes, setAnexosExistentes] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

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
  const [logos, setLogos] = useState<any[]>([])

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
    }
  }

  const abrirNova = () => {
    setForm({
      titulo: '',
      responsavel: '',
      prazo: '',
      prioridade_p: 'P2',
      status_kanban: 'a_fazer',
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
      prioridade_p:
        t.prioridade_p || (t.prioridade === 'alta' ? 'P1' : t.prioridade === 'baixa' ? 'P3' : 'P2'),
      status_kanban:
        t.status_kanban ||
        (t.status === 'concluida'
          ? 'concluido'
          : t.status === 'em_andamento'
            ? 'em_andamento'
            : 'a_fazer'),
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

  const carregarLogos = async () => {
    try {
      const r = await pb.collection('logomarcas').getFullList()
      setLogos(r as any[])
    } catch (_) {
      setLogos([])
    }
  }

  useEffect(() => {
    carregarParceiros()
    carregarLogos()
  }, [])

  const obterIconeEmpresa = (nomeEmpresa: string) => {
    if (!nomeEmpresa) return null
    const norm = (s: any) =>
      String(s || '')
        .trim()
        .toLowerCase()
    const logoRec = logos.find((l) => norm(l.empresa) === norm(nomeEmpresa))
    const empRec = empresas.find((e) => norm(e.nome) === norm(nomeEmpresa))
    const cor = logoRec?.cor || empRec?.cor || '#1B5E20'
    const sigla =
      logoRec?.sigla ||
      (empRec ? empRec.nome.slice(0, 2).toUpperCase() : nomeEmpresa.slice(0, 2).toUpperCase())

    const urlImagem = (rec: any, campo: string) => {
      if (!rec || !rec[campo]) return ''
      return pb.files.getURL(rec, rec[campo])
    }
    const urlEmb = urlImagem(logoRec, 'emblema')
    const urlLogo = urlImagem(logoRec, 'logo')

    if (urlEmb) {
      return <img src={urlEmb} alt={nomeEmpresa} className="h-4 w-4 object-contain rounded-xs" />
    }
    if (urlLogo) {
      return <img src={urlLogo} alt={nomeEmpresa} className="h-4 w-4 object-contain rounded-xs" />
    }
    return (
      <span
        className="h-4 w-4 rounded-xs text-[8px] font-bold text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: cor }}
      >
        {sigla}
      </span>
    )
  }

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

  const salvar = async () => {
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

    // Se ainda assim não houver parceiro selecionado:
    if (idsParceiros.length === 0) {
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
      fd.append('prioridade_p', form.prioridade_p || 'P2')
      fd.append('status_kanban', form.status_kanban || 'a_fazer')
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

      if (editando) {
        await pb.collection('tarefas').update(editando.id, fd)
        toast({
          title: 'Tarefa atualizada',
          description: `A tarefa "${form.titulo.trim()}" foi salva com sucesso.`,
        })
      } else {
        fd.append('criado_por', user?.email || '')
        await pb.collection('tarefas').create(fd)
        toast({
          title: 'Tarefa criada com sucesso',
          description: `A tarefa "${form.titulo.trim()}" foi adicionada com sucesso.`,
        })
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
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Kanban className="h-6 w-6 text-[#1B5E20]" /> Tarefas & Agenda
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Kanban do time com prioridades, subtarefas e calendário
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggles de visualização: Lista (à esquerda do Kanban), Kanban e Calendário */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                vista === 'lista'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setVista('kanban')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                vista === 'kanban'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setVista('calendario')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                vista === 'calendario'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendário
            </button>
          </div>

          {/* Filtro 1: Período da Agenda por clique e arrasto (range picker popup) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-9 text-xs font-medium bg-white border-gray-200 shadow-xs flex items-center gap-1.5',
                  (filtroPeriodo?.from || filtroPeriodo?.to) &&
                    'border-[#1B5E20] text-[#1B5E20] bg-emerald-50/50 font-semibold',
                )}
                title="Filtrar tarefas pelo prazo da agenda"
              >
                <Calendar className="h-3.5 w-3.5 text-[#1B5E20]" />
                {filtroPeriodo?.from ? (
                  filtroPeriodo.to ? (
                    <span>
                      {filtroPeriodo.from.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      —{' '}
                      {filtroPeriodo.to.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  ) : (
                    <span>
                      A partir de{' '}
                      {filtroPeriodo.from.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  )
                ) : (
                  <span>Período da agenda</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white" align="start">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900">Período da Agenda</div>
                  <div className="text-[11px] text-gray-500">
                    Clique e arraste ou selecione início e fim
                  </div>
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

          {/* Filtro 2: Dropdown multisseleção "Parceiros & Contatos" */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-9 text-xs font-medium bg-white border-gray-200 shadow-xs flex items-center gap-1.5',
                  filtroParceiros.length > 0 &&
                    'border-[#1B5E20] text-[#1B5E20] bg-emerald-50/50 font-semibold',
                )}
              >
                <UsersIcon className="h-3.5 w-3.5 text-[#1B5E20]" />
                <span>
                  {filtroParceiros.length === 0
                    ? 'Parceiros & Contatos'
                    : `${filtroParceiros.length} parceiro(s)`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 bg-white" align="start">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 px-1">
                <span className="text-xs font-bold text-gray-800">Parceiros & Contatos</span>
                {filtroParceiros.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroParceiros([])}
                    className="text-[11px] text-red-600 hover:underline font-medium"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1 py-1.5">
                {parceiros.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-2">
                    Nenhum parceiro cadastrado.
                  </p>
                ) : (
                  parceiros.map((p) => {
                    const sel = filtroParceiros.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setFiltroParceiros((prev) =>
                            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                          )
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                          sel
                            ? 'bg-emerald-50 text-[#1B5E20] font-semibold'
                            : 'hover:bg-gray-100 text-gray-700',
                        )}
                      >
                        <span className="truncate mr-2">{p.nome}</span>
                        {sel ? <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" /> : null}
                      </button>
                    )
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Dropdown "empresa" posicionado à direita dos filtros */}
          <Select value={empresaFiltroAtiva} onValueChange={(v) => setFiltroEmpresa(v)}>
            <SelectTrigger
              className="h-9 w-[190px] bg-white border-gray-200 text-xs font-medium text-gray-700 shadow-xs focus:ring-[#1B5E20]"
              aria-label="Filtrar por empresa"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-gray-400 font-normal">Empresa:</span>
                <span className="truncate font-semibold text-gray-800">
                  {empresaFiltroAtiva === 'todas' ? 'Todas as empresas' : empresaFiltroAtiva}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent align="end" className="w-[210px]">
              <SelectItem value="todas">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <span>Todas as empresas</span>
                </div>
              </SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.nome}>
                  <div className="flex items-center gap-2">
                    {obterIconeEmpresa(e.nome)}
                    <span>{e.nome}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Botão para limpar filtros ativos se algum estiver ativo */}
          {(filtroPeriodo?.from ||
            filtroPeriodo?.to ||
            filtroParceiros.length > 0 ||
            empresaFiltroAtiva !== 'todas') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiltroPeriodo(undefined)
                setFiltroParceiros([])
                setFiltroEmpresa('todas')
              }}
              className="h-9 px-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 gap-1"
              title="Limpar todos os filtros ativos"
            >
              <FilterX className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          )}

          <Button
            onClick={abrirNova}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs"
          >
            <Plus className="h-4 w-4 mr-1" /> Nova tarefa
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* Widgets: compromissos de hoje + atrasos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Compromissos de hoje
          </div>
          {deHoje.length === 0 ? (
            <p className="text-[12px] text-gray-400">Nenhum compromisso para hoje.</p>
          ) : (
            <div className="space-y-1.5">
              {deHoje.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => abrirDetalhe(t)}
                  className="block w-full text-left text-[13px] font-medium text-gray-800 hover:text-[#1B5E20] truncate"
                >
                  · {t.titulo} <span className="text-gray-400">({t.responsavel})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            'bg-white rounded-xl border p-4 shadow-xs',
            atrasadas.length ? 'border-red-200' : 'border-[#E5E7EB]',
          )}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle
              className={cn('h-3.5 w-3.5', atrasadas.length ? 'text-red-500' : 'text-gray-300')}
            />
            Atrasadas ({atrasadas.length})
          </div>
          {atrasadas.length === 0 ? (
            <p className="text-[12px] text-gray-400">Nada atrasado. 👍</p>
          ) : (
            <div className="space-y-1.5">
              {atrasadas.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => abrirDetalhe(t)}
                  className="block w-full text-left text-[13px] font-medium text-red-700 hover:underline truncate"
                >
                  · {t.titulo} <span className="text-red-400">{fmtData(t.prazo)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vista: Lista (Tabela com colunas ordenáveis ao clique, reorganizáveis e redimensionáveis por arrasto) */}
      {vista === 'lista' && (
        <TarefasListaView
          itens={itensFiltrados}
          onAbrirDetalhe={abrirDetalhe}
          onAbrirEditar={abrirEditar}
          onExcluir={(t) => setExcluindoTarefa(t)}
          obterIconeEmpresa={obterIconeEmpresa}
        />
      )}

      {/* Vista: Kanban */}
      {vista === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUNAS.map((col) => {
            const cards = itensFiltrados.filter((t) => (t.status_kanban || 'a_fazer') === col.key)
            return (
              <div
                key={col.key}
                className="bg-gray-50/60 rounded-xl border border-gray-100 p-3 min-h-[300px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', col.cor)}>
                    {col.label}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((t) => {
                    const anexosCount = Array.isArray(t.anexos) ? t.anexos.length : t.anexos ? 1 : 0

                    return (
                      <div
                        key={t.id}
                        className="bg-white rounded-lg border border-gray-100 p-3 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => abrirDetalhe(t)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded',
                              PRIO_COR[t.prioridade_p || 'P3'],
                            )}
                          >
                            {t.prioridade_p || 'P3'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {t.prazo &&
                              String(t.prazo).slice(0, 10) < hoje &&
                              t.status_kanban !== 'concluido' && (
                                <span className="text-[9px] font-bold text-red-600">ATRASADA</span>
                              )}
                            <button
                              type="button"
                              title="Editar tarefa"
                              onClick={(e) => {
                                e.stopPropagation()
                                abrirEditar(t)
                              }}
                              className="p-1 rounded-md text-gray-400 hover:text-[#1B5E20] hover:bg-emerald-50 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Excluir tarefa"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExcluindoTarefa(t)
                              }}
                              className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[13px] font-semibold text-gray-900 leading-snug">
                          {t.titulo}
                        </div>
                        {t.vinculo_tipo && (
                          <span className="inline-flex mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {t.vinculo_tipo === 'ata'
                              ? 'de Ata'
                              : t.vinculo_tipo === 'projeto'
                                ? 'de Projeto'
                                : t.vinculo_tipo}
                          </span>
                        )}
                        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                          <span>{t.responsavel || '—'}</span>
                          <span className="tabular-nums">{fmtData(t.prazo)}</span>
                        </div>
                        {/* Chips de subtarefas, comentários e anexos */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {(() => {
                            const subs = Array.isArray(t.subtarefas)
                              ? t.subtarefas
                              : (() => {
                                  try {
                                    return JSON.parse(t.subtarefas || '[]')
                                  } catch (_) {
                                    return []
                                  }
                                })()
                            return subs.length ? (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <ListChecks className="h-3 w-3" />
                                {subs.filter((s: any) => s.ok).length}/{subs.length}
                              </div>
                            ) : null
                          })()}
                          {(() => {
                            const coms = Array.isArray(t.comentarios)
                              ? t.comentarios
                              : (() => {
                                  try {
                                    return JSON.parse(t.comentarios || '[]')
                                  } catch (_) {
                                    return []
                                  }
                                })()
                            return coms.length ? (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <MessageSquare className="h-3 w-3" /> {coms.length}
                              </div>
                            ) : null
                          })()}
                          {anexosCount > 0 && (
                            <div
                              className="flex items-center gap-1 text-[10px] text-[#1B5E20] font-medium bg-emerald-50 px-1 py-0.2 rounded"
                              title={`${anexosCount} arquivo(s) anexado(s)`}
                            >
                              <Paperclip className="h-3 w-3" /> {anexosCount}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <p className="text-[11px] text-gray-400 text-center py-4">Vazio</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Calendário */}
      {vista === 'calendario' && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1B5E20]" />
              <span className="text-sm font-bold text-gray-900">{mesRef}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  const [y, m] = mesRef.split('-').map(Number)
                  const d = new Date(y, m - 2, 1)
                  setMesRef(d.toISOString().slice(0, 7))
                }}
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  const [y, m] = mesRef.split('-').map(Number)
                  const d = new Date(y, m, 1)
                  setMesRef(d.toISOString().slice(0, 7))
                }}
              >
                →
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center py-1"
              >
                {d}
              </div>
            ))}
            {diasMes.map((dia, i) => (
              <div
                key={i}
                className={cn(
                  'min-h-[72px] rounded-lg border p-1.5',
                  dia ? 'border-gray-100 bg-white' : 'border-transparent bg-transparent',
                )}
              >
                {dia && (
                  <>
                    <div
                      className={cn(
                        'text-[10px] font-bold tabular-nums mb-1',
                        dia === hoje ? 'text-[#1B5E20]' : 'text-gray-400',
                      )}
                    >
                      {parseInt(dia.slice(8), 10)}
                    </div>
                    <div className="space-y-1">
                      {tarefasPorDia(dia)
                        .slice(0, 2)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => abrirDetalhe(t)}
                            className={cn(
                              'block w-full text-left text-[9px] font-semibold px-1 py-0.5 rounded truncate',
                              t.status_kanban === 'concluido'
                                ? 'bg-gray-100 text-gray-500'
                                : String(t.prazo).slice(0, 10) < hoje
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-emerald-50 text-emerald-700',
                            )}
                          >
                            {t.titulo}
                          </button>
                        ))}
                      {tarefasPorDia(dia).length > 2 && (
                        <div className="text-[9px] text-gray-400">
                          +{tarefasPorDia(dia).length - 2} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog nova/editar tarefa — ampliado para max-w-4xl (95vw) para usabilidade em telas grandes */}
      <Dialog
        open={dialog}
        onOpenChange={(aberto) => {
          if (!aberto && ouvindo) {
            pararOuvir()
          }
          setDialog(aberto)
        }}
      >
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">
              {editando ? 'Editar' : 'Nova'} tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* T2a: abertura por áudio */}
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" /> Abrir por áudio
                  {ouvindo && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded animate-pulse">
                      ● Gravando...
                    </span>
                  )}
                  {processandoAudio && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo...
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleOuvir}
                    disabled={processandoAudio}
                    className={cn(
                      'h-8 font-medium transition-colors',
                      ouvindo &&
                        'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 ring-2 ring-red-200',
                    )}
                  >
                    {ouvindo ? (
                      <X className="h-3.5 w-3.5 mr-1 text-red-600" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 mr-1 text-[#1B5E20]" />
                    )}
                    {ouvindo ? 'Parar gravação' : 'Ouvir'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={estruturarVoz}
                    disabled={estruturando || processandoAudio || !transcricao.trim()}
                    className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    {estruturando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                    Preencher com IA
                  </Button>
                </div>
              </div>
              {(transcricao || ouvindo || processandoAudio) && (
                <div className="text-[11px] text-gray-700 bg-white/70 rounded p-2 border border-emerald-100">
                  {ouvindo && (
                    <p className="text-red-600 font-semibold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-600 animate-ping inline-block" />
                      Captando áudio em tempo real... Fale os detalhes da tarefa e clique em "Parar
                      gravação".
                    </p>
                  )}
                  {processandoAudio && (
                    <p className="text-amber-700 italic">
                      Transcrevendo áudio via IA... Aguarde alguns instantes.
                    </p>
                  )}
                  {transcricao && (
                    <div className="mt-1">
                      <span className="font-semibold text-emerald-900 mr-1">Transcrição:</span>
                      <span className="text-gray-800 italic">"{transcricao}"</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Campo Título */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Título *
              </Label>
              <Input
                value={form.titulo || ''}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Alinhar faturamento mensal..."
                className="h-10 bg-gray-50"
              />
            </div>

            {/* Linha 1 após Título: EMPRESA e RESPONSÁVEL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 1. EMPRESA */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Select
                  value={form.empresa || ' '}
                  onValueChange={(v) => setForm({ ...form, empresa: v === ' ' ? '' : v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Selecione a empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Todas / Grupo Consolidado</SelectItem>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.nome}>
                        <div className="flex items-center gap-2">
                          {obterIconeEmpresa(e.nome)}
                          <span>{e.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {/* Item exclusivo no dropdown Empresa do diálogo de nova/editar tarefa */}
                    <SelectItem value="CPF">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>CPF</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. RESPONSÁVEL */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Responsável
                </Label>
                <Select
                  value={form.responsavel || ' '}
                  onValueChange={(v) => {
                    if (v === '__cadastrar_novo__') {
                      setNovoParceiroModalAberto(true)
                      return
                    }
                    const novoNome = v === ' ' ? '' : v
                    setForm((f: any) => {
                      const pMatch = parceiros.find((p) => p.nome === novoNome)
                      const curParceiros = f.parceiro_ids || []
                      const novosParceiros =
                        pMatch && !curParceiros.includes(pMatch.id)
                          ? [...curParceiros, pMatch.id]
                          : curParceiros
                      return { ...f, responsavel: novoNome, parceiro_ids: novosParceiros }
                    })
                  }}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Selecione o parceiro responsável..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem
                      value="__cadastrar_novo__"
                      className="font-semibold text-[#1B5E20] bg-emerald-50/70 border-b border-emerald-100 focus:bg-emerald-100 focus:text-[#0F3D13] cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-[#1B5E20]">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Cadastrar novo</span>
                      </div>
                    </SelectItem>
                    <SelectItem value=" ">Não definido</SelectItem>
                    {parceiros.map((p) => {
                      const empRotulo =
                        p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(', ') : p.tipo)
                      return (
                        <SelectItem key={p.id} value={p.nome}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{p.nome}</span>
                            {empRotulo ? (
                              <span className="text-[10px] text-gray-400">({empRotulo})</span>
                            ) : null}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha de metadados: VÍNCULO (ORIGEM), PRAZO, PRIORIDADE e STATUS proporcionais ao conteúdo preenchendo 100% da linha */}
            <div className="flex flex-wrap items-end gap-3.5 w-full">
              {/* 3. VÍNCULO (ORIGEM) - conteúdo mais extenso (tipo + ID opcional): peso flex 3.2 */}
              <div className="grid gap-1.5 w-full sm:w-auto sm:flex-[3.2] min-w-[170px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vínculo (origem)
                </Label>
                <div className="flex items-center gap-2 w-full">
                  <Select
                    value={form.vinculo_tipo || ''}
                    onValueChange={(v) =>
                      setForm({ ...form, vinculo_tipo: v, vinculo_id: v ? form.vinculo_id : '' })
                    }
                  >
                    <SelectTrigger className="h-10 bg-gray-50 w-full flex-1">
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">Nenhum</SelectItem>
                      <SelectItem value="ata">Ata</SelectItem>
                      <SelectItem value="projeto">Projeto</SelectItem>
                      <SelectItem value="contrato">Contrato</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.vinculo_tipo && form.vinculo_tipo !== ' ' && (
                    <Input
                      value={form.vinculo_id || ''}
                      onChange={(e) => setForm({ ...form, vinculo_id: e.target.value })}
                      placeholder="ID (opcional)"
                      className="h-10 bg-gray-50 w-24 shrink-0 text-xs"
                    />
                  )}
                </div>
              </div>

              {/* 4. PRAZO - data formatada dd/mm/aaaa: peso flex 2.2 */}
              <div className="grid gap-1.5 w-full sm:w-auto sm:flex-[2.2] min-w-[130px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prazo
                </Label>
                <Input
                  type="date"
                  value={form.prazo || ''}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  className="h-10 bg-gray-50 w-full"
                />
              </div>

              {/* 5. PRIORIDADE - rótulos médios (P1/P2/P3): peso flex 2.2 */}
              <div className="grid gap-1.5 w-full sm:w-auto sm:flex-[2.2] min-w-[130px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prioridade
                </Label>
                <Select
                  value={form.prioridade_p || 'P2'}
                  onValueChange={(v) => setForm({ ...form, prioridade_p: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 — Crítica</SelectItem>
                    <SelectItem value="P2">P2 — Normal</SelectItem>
                    <SelectItem value="P3">P3 — Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 6. STATUS - rótulos mais longos (Em Andamento, Concluído, etc.): peso flex 2.6 */}
              <div className="grid gap-1.5 w-full sm:w-auto sm:flex-[2.6] min-w-[145px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </Label>
                <Select
                  value={form.status_kanban || 'a_fazer'}
                  onValueChange={(v) => setForm({ ...form, status_kanban: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUNAS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descrição */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Descrição
              </Label>
              <Textarea
                value={form.descricao || ''}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={2}
                placeholder="Detalhes ou orientações sobre a tarefa..."
              />
            </div>

            {/* e4: Dropdown para vincular parceiros com tags/badges visíveis */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Parceiros/contatos responsáveis * (obrigatório)
                </Label>
                <span
                  className={cn(
                    'text-[11px] font-semibold',
                    (form.parceiro_ids || []).length > 0 ? 'text-[#1B5E20]' : 'text-amber-600',
                  )}
                >
                  {(form.parceiro_ids || []).length} selecionado(s)
                </span>
              </div>
              <Select
                value="placeholder"
                onValueChange={(val) => {
                  if (val === 'placeholder') return
                  if (val === '__cadastrar_novo__') {
                    setNovoParceiroModalAberto(true)
                    return
                  }
                  setForm((f: any) => {
                    const cur = f.parceiro_ids || []
                    const exists = cur.includes(val)
                    const novoIds = exists ? cur.filter((x: string) => x !== val) : [...cur, val]
                    const pObj = parceiros.find((p) => p.id === val)
                    return {
                      ...f,
                      parceiro_ids: novoIds,
                      responsavel: !f.responsavel && pObj ? pObj.nome : f.responsavel,
                    }
                  })
                }}
              >
                <SelectTrigger className="h-10 bg-gray-50 text-xs">
                  <SelectValue placeholder="Selecione um parceiro cadastrado para alternar seleção..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {/* Primeiro item de seleção: Cadastrar novo */}
                  <SelectItem
                    value="__cadastrar_novo__"
                    className="font-semibold text-[#1B5E20] bg-emerald-50/70 border-b border-emerald-100 focus:bg-emerald-100 focus:text-[#0F3D13] cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-[#1B5E20]">
                      <Plus className="h-3.5 w-3.5" />
                      <span>Cadastrar novo</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="placeholder" disabled>
                    Selecione um parceiro cadastrado para alternar seleção
                  </SelectItem>
                  {parceiros.map((p) => {
                    const sel = (form.parceiro_ids || []).includes(p.id)
                    const empRotulo =
                      p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(', ') : '')
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span
                            className={cn(
                              'text-xs',
                              sel ? 'font-bold text-[#1B5E20]' : 'text-gray-700',
                            )}
                          >
                            {p.nome}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {sel ? '✓ Selecionado' : empRotulo ? `(${empRotulo})` : `(${p.tipo})`}
                          </span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {/* Badges dos parceiros selecionados com remoção direta */}
              {(form.parceiro_ids || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(form.parceiro_ids || []).map((pid: string) => {
                    const pObj = parceiros.find((p) => p.id === pid)
                    return (
                      <span
                        key={pid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                      >
                        {pObj?.nome || pid}
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f: any) => ({
                              ...f,
                              parceiro_ids: (f.parceiro_ids || []).filter((x: string) => x !== pid),
                            }))
                          }}
                          className="hover:text-emerald-950 p-0.5 rounded-full"
                          title="Remover"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Campo ANEXAR ARQUIVOS E MÍDIAS */}
            <div className="grid gap-2 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-[#1B5E20]" />
                  Anexar Arquivos e Mídias
                </Label>
                <span className="text-[11px] text-gray-400">
                  {anexosExistentes.length + arquivosNovos.length} anexo(s)
                </span>
              </div>

              {/* Botão de seleção de arquivos */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-[#1B5E20] hover:bg-emerald-50/20 rounded-lg p-3 cursor-pointer transition-colors text-center">
                <UploadCloud className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-xs font-semibold text-gray-700">
                  Clique para selecionar fotos, vídeos, PDFs ou documentos
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  Imagens, PDFs, planilhas, mídias e documentos em geral (até 50MB cada)
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fl = Array.from(e.target.files || [])
                    if (fl.length > 0) {
                      setArquivosNovos((prev) => [...prev, ...fl])
                    }
                    e.target.value = ''
                  }}
                />
              </label>

              {/* Chips/Cards de anexos (existentes no PocketBase e novos selecionados) com botões de ação para Visualizar e Baixar */}
              {(anexosExistentes.length > 0 || arquivosNovos.length > 0) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Anexos já salvos no PocketBase (com botão de ação para abrir/visualizar e baixar) */}
                  {anexosExistentes.map((nome, idx) => {
                    const urlArquivo = editando ? pb.files.getURL(editando, nome) : ''
                    return (
                      <div
                        key={`existente-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                        <span className="max-w-[160px] truncate font-medium" title={nome}>
                          {nome}
                        </span>

                        {/* Botão de ação: Visualizar / Abrir */}
                        {urlArquivo && (
                          <a
                            href={urlArquivo}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded text-[#1B5E20] hover:bg-emerald-100 transition-colors inline-flex items-center"
                            title="Visualizar anexo em nova aba"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        )}

                        {/* Botão de ação: Download */}
                        {urlArquivo && (
                          <a
                            href={urlArquivo}
                            download={nome}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded text-[#1B5E20] hover:bg-emerald-100 transition-colors inline-flex items-center"
                            title="Baixar anexo"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}

                        {/* Botão de remoção do anexo */}
                        <button
                          type="button"
                          onClick={() =>
                            setAnexosExistentes((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-emerald-700 hover:text-red-600 p-0.5 rounded-full ml-0.5"
                          title="Remover anexo antes de salvar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}

                  {/* Anexos novos a salvar (com botão de ação para visualizar e baixar via Object URL) */}
                  {arquivosNovos.map((arq, idx) => {
                    const abrirPreviewNovo = () => {
                      try {
                        const objUrl = URL.createObjectURL(arq)
                        window.open(objUrl, '_blank')
                      } catch (err) {
                        console.error('Falha ao abrir preview do arquivo novo:', err)
                      }
                    }

                    const baixarArquivoNovo = () => {
                      try {
                        const objUrl = URL.createObjectURL(arq)
                        const a = document.createElement('a')
                        a.href = objUrl
                        a.download = arq.name
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
                      } catch (err) {
                        console.error('Falha ao baixar arquivo novo:', err)
                      }
                    }

                    return (
                      <div
                        key={`novo-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs"
                      >
                        <UploadCloud className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="max-w-[150px] truncate font-medium" title={arq.name}>
                          {arq.name}
                        </span>
                        <span className="text-[10px] text-amber-700">
                          ({(arq.size / 1024).toFixed(0)} KB)
                        </span>

                        {/* Botão de ação: Visualizar (prévia do arquivo selecionado) */}
                        <button
                          type="button"
                          onClick={abrirPreviewNovo}
                          className="p-1 rounded text-amber-800 hover:bg-amber-100 transition-colors inline-flex items-center"
                          title="Visualizar anexo antes de salvar"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        {/* Botão de ação: Baixar */}
                        <button
                          type="button"
                          onClick={baixarArquivoNovo}
                          className="p-1 rounded text-amber-800 hover:bg-amber-100 transition-colors inline-flex items-center"
                          title="Baixar arquivo selecionado"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>

                        {/* Botão de remoção */}
                        <button
                          type="button"
                          onClick={() =>
                            setArquivosNovos((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-amber-700 hover:text-red-600 p-0.5 rounded-full ml-0.5"
                          title="Remover anexo antes de salvar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Alerta de erro de validação dentro do diálogo */}
            {dialogErro && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                <span>{dialogErro}</span>
              </div>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (ouvindo) pararOuvir()
                setDialog(false)
                setDialogErro('')
              }}
              className="h-9"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe da tarefa — ampliado para max-w-2xl para visualização confortável de histórico e subtarefas */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detalhe?.titulo}</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirEditar(detalhe)}
                  className="h-8"
                  title="Editar tarefa"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirCompartilhar(detalhe)}
                  className="h-8"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Compartilhar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExcluindoTarefa(detalhe)}
                  className="h-8 text-red-600 hover:bg-red-50 hover:border-red-200"
                  title="Excluir tarefa"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                </Button>
                <button
                  onClick={() => setDetalhe(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            <span
              className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded',
                PRIO_COR[detalhe?.prioridade_p || 'P3'],
              )}
            >
              {detalhe?.prioridade_p}
            </span>
            <span>{detalhe?.responsavel || '—'}</span>
            <span>· prazo {fmtData(detalhe?.prazo)}</span>
          </div>
          {detalhe?.descricao && <p className="text-[13px] text-gray-700">{detalhe.descricao}</p>}

          {/* Anexos persistidos da tarefa (clique para abrir/visualizar) */}
          {(() => {
            const anexosLista: string[] = Array.isArray(detalhe?.anexos)
              ? detalhe.anexos
              : detalhe?.anexos
                ? [detalhe.anexos]
                : []

            if (anexosLista.length === 0) return null

            return (
              <div className="grid gap-1.5 p-3 rounded-lg border border-gray-200 bg-gray-50/70">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-[#1B5E20]" />
                  Anexos da Tarefa ({anexosLista.length})
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {anexosLista.map((nome, i) => {
                    const url = pb.files.getURL(detalhe, nome)
                    const ext = nome.split('.').pop()?.toLowerCase() || ''
                    const ehImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)

                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-200 hover:border-[#1B5E20] hover:shadow-xs transition-all group"
                        title="Clique para abrir e visualizar anexo"
                      >
                        {ehImg ? (
                          <img
                            src={url}
                            alt={nome}
                            className="h-8 w-8 rounded object-cover shrink-0 border border-gray-100"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-emerald-50 text-[#1B5E20] flex items-center justify-center shrink-0 font-bold text-[10px]">
                            {ext.slice(0, 4).toUpperCase() || 'FILE'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-gray-800 group-hover:text-[#1B5E20] truncate">
                            {nome}
                          </div>
                          <div className="text-[10px] text-gray-400">Clique para abrir ↗</div>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* mover coluna */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Mover para
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COLUNAS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => mover(detalhe, c.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold border',
                    (detalhe?.status_kanban || 'a_fazer') === c.key
                      ? 'bg-[#1B5E20] text-white border-[#1B5E20]'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* subtarefas */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Subtarefas
            </Label>
            {(() => {
              const subs = detalhe
                ? Array.isArray(detalhe.subtarefas)
                  ? detalhe.subtarefas
                  : JSON.parse(detalhe.subtarefas || '[]')
                : []
              return (
                <div className="space-y-1">
                  {subs.map((s: any, i: number) => (
                    <label
                      key={i}
                      className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!!s.ok}
                        onChange={() => toggleSub(i)}
                        className="h-3.5 w-3.5 accent-[#1B5E20]"
                      />
                      <span className={s.ok ? 'line-through text-gray-400' : ''}>{s.t}</span>
                    </label>
                  ))}
                  {subs.length === 0 && <p className="text-[12px] text-gray-400">Nenhuma.</p>}
                </div>
              )
            })()}
            <div className="flex gap-2">
              <Input
                value={novaSub}
                onChange={(e) => setNovaSub(e.target.value)}
                placeholder="Nova subtarefa..."
                className="h-9 text-xs bg-gray-50"
              />
              <Button variant="outline" size="sm" onClick={addSub} className="h-9">
                +
              </Button>
            </div>
          </div>

          {/* T2: histórico em formato de chat com anexos */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Histórico da tarefa (chat)
            </Label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {chatMsgs.map((c: any) => {
                const meu = c.autor === (user?.email || '')
                return (
                  <div key={c.id} className={cn('flex', meu ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-xl px-3 py-2',
                        meu ? 'bg-[#1B5E20] text-white' : 'bg-gray-100 text-gray-800',
                      )}
                    >
                      {!meu && (
                        <div className="text-[10px] font-bold opacity-70 mb-0.5">
                          {c.autor}
                          {c.autor_tipo === 'parceiro' ? ' · parceiro' : ''}
                        </div>
                      )}
                      {c.texto && <div className="text-[12px] whitespace-pre-wrap">{c.texto}</div>}
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
                          <Paperclip className="h-3 w-3" /> {String(c.anexo).slice(0, 30)}
                        </a>
                      )}
                      <div className="text-[9px] opacity-60 mt-0.5">
                        {String(c.created).slice(11, 16)}
                      </div>
                    </div>
                  </div>
                )
              })}
              {chatMsgs.length === 0 && (
                <p className="text-[12px] text-gray-400 text-center py-3">
                  Sem mensagens — comece o histórico abaixo.
                </p>
              )}
            </div>
            {chatErro && <p className="text-[11px] text-red-600">{chatErro}</p>}
            <div className="flex items-center gap-2">
              <Input
                value={novoChat}
                onChange={(e) => setNovoChat(e.target.value)}
                placeholder="Mensagem ou atualização..."
                className="h-9 text-xs bg-gray-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') enviarChat()
                }}
              />
              <label className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer text-gray-500">
                <Paperclip className="h-3.5 w-3.5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.docx,.xlsx,.txt,.csv,audio/*,video/*"
                  onChange={(e) => setChatAnexo(e.target.files?.[0] || null)}
                />
              </label>
              <Button variant="outline" size="sm" onClick={enviarChat} className="h-9">
                Enviar
              </Button>
            </div>
            {chatAnexo && (
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> {chatAnexo.name} (envia junto da mensagem)
                <button
                  type="button"
                  onClick={() => setChatAnexo(null)}
                  className="text-gray-400 hover:text-gray-600 ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
