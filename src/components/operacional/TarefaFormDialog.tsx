import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles,
  Mic,
  Paperclip,
  Loader2,
  X,
  Plus,
  Calendar as CalendarIcon,
  Repeat,
  AlertTriangle,
  AlertCircle,
  UploadCloud,
  Eye,
  Download,
  ChevronDown,
  Search,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { limparTextoResponsavel } from '@/lib/responsavel-utils'

export interface TarefaFormData {
  titulo: string
  responsavel: string
  prazo: string
  recorrencia: string
  prioridade_p: 'P1' | 'P2' | 'P3'
  status_kanban: string
  descricao: string
  vinculo_tipo: string
  vinculo_id: string
  projeto_id?: string
  marco_id?: string
  empresa: string
  parceiro_ids: string[]
}

export interface TarefaFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editando?: any | null
  form: TarefaFormData
  setForm: React.Dispatch<React.SetStateAction<TarefaFormData>>
  empresas: any[]
  parceiros: any[]
  obterIconeEmpresa: (nomeEmpresa: string) => React.ReactNode
  onAbrirNovoParceiro: () => void
  arquivosNovos: File[]
  setArquivosNovos: React.Dispatch<React.SetStateAction<File[]>>
  anexosExistentes: string[]
  setAnexosExistentes: React.Dispatch<React.SetStateAction<string[]>>
  dialogErro: string
  setDialogErro: (msg: string) => void
  salvando: boolean
  onSalvar: (isRascunho?: boolean, fraseCapturaIa?: string) => Promise<void>
  // Contexto B (detalhe do projeto):
  contextoProjeto?: {
    id: string
    nome: string
  }
}

export function TarefaFormDialog({
  open,
  onOpenChange,
  editando,
  form,
  setForm,
  empresas,
  parceiros,
  obterIconeEmpresa,
  onAbrirNovoParceiro,
  arquivosNovos,
  setArquivosNovos,
  anexosExistentes,
  setAnexosExistentes,
  dialogErro,
  setDialogErro,
  salvando,
  onSalvar,
  contextoProjeto,
}: TarefaFormDialogProps) {
  // Estado de projetos e marcos para encadeamento
  const [listaProjetos, setListaProjetos] = useState<Array<{ id: string; nome: string }>>([])
  const [marcosDisponiveis, setMarcosDisponiveis] = useState<
    Array<{ id: string; nome: string; concluido?: boolean }>
  >([])
  const [carregandoMarcos, setCarregandoMarcos] = useState(false)
  const [erroMarco, setErroMarco] = useState('')
  const [novoMarcoModalAberto, setNovoMarcoModalAberto] = useState(false)
  const [novoMarcoNome, setNovoMarcoNome] = useState('')
  const [novoMarcoData, setNovoMarcoData] = useState('')
  const [salvandoNovoMarco, setSalvandoNovoMarco] = useState(false)
  const [erroNovoMarco, setErroNovoMarco] = useState('')
  const selectMarcoTriggerRef = useRef<HTMLButtonElement | null>(null)

  // Carrega lista de projetos quando necessário
  useEffect(() => {
    let ativo = true
    const carregarProjetos = async () => {
      try {
        const res = await pb.collection('projetos').getFullList<{ id: string; nome: string }>({
          sort: 'nome',
          fields: 'id,nome',
        })
        if (ativo) setListaProjetos(res)
      } catch (err) {
        console.warn('Erro ao carregar projetos:', err)
      }
    }
    if (open) {
      carregarProjetos()
    }
    return () => {
      ativo = false
    }
  }, [open])

  // Se estiver em contextoProjeto, força vinculo_tipo="projeto" e projeto_id=contextoProjeto.id
  useEffect(() => {
    if (open && contextoProjeto?.id) {
      setForm((f) => ({
        ...f,
        vinculo_tipo: 'projeto',
        vinculo_id: contextoProjeto.id,
        projeto_id: contextoProjeto.id,
      }))
    }
  }, [open, contextoProjeto?.id, setForm])

  // ID do projeto atualmente selecionado (ou do contexto de projeto)
  const idProjetoAtivo =
    contextoProjeto?.id ||
    form.projeto_id ||
    (form.vinculo_tipo === 'projeto' ? form.vinculo_id : '')

  // Carrega os marcos do projeto ativo
  const carregarMarcosDoProjeto = useCallback(
    async (projId: string, selecionarMarcoId?: string) => {
      if (!projId) {
        setMarcosDisponiveis([])
        return
      }
      setCarregandoMarcos(true)
      try {
        const res = await pb
          .collection('marcos')
          .getFullList<{ id: string; nome: string; concluido?: boolean }>({
            filter: `projeto_id = "${projId}"`,
            sort: 'ordem',
          })
        setMarcosDisponiveis(res)
        if (selecionarMarcoId) {
          setForm((f) => ({ ...f, marco_id: selecionarMarcoId }))
        }
      } catch (err) {
        console.warn('Erro ao carregar marcos do projeto:', err)
        setMarcosDisponiveis([])
      } finally {
        setCarregandoMarcos(false)
      }
    },
    [setForm],
  )

  useEffect(() => {
    if (open && idProjetoAtivo) {
      carregarMarcosDoProjeto(idProjetoAtivo)
    } else if (!idProjetoAtivo) {
      setMarcosDisponiveis([])
    }
  }, [open, idProjetoAtivo, carregarMarcosDoProjeto])

  // Limpa erro de marco ao selecionar
  useEffect(() => {
    if (form.marco_id) {
      setErroMarco('')
    }
  }, [form.marco_id])

  // Salvar novo marco enxuto inline
  const salvarNovoMarcoInline = async () => {
    if (!novoMarcoNome.trim()) {
      setErroNovoMarco('Informe o nome do marco.')
      return
    }
    const pid = idProjetoAtivo
    if (!pid) {
      setErroNovoMarco('Nenhum projeto selecionado.')
      return
    }
    setSalvandoNovoMarco(true)
    setErroNovoMarco('')
    try {
      const proximaOrdem = (marcosDisponiveis.length || 0) + 1
      const rec = await pb.collection('marcos').create({
        nome: novoMarcoNome.trim(),
        projeto_id: pid,
        data: novoMarcoData ? novoMarcoData + ' 00:00:00.000Z' : undefined,
        ordem: proximaOrdem,
        concluido: false,
      })
      await carregarMarcosDoProjeto(pid, rec.id)
      setNovoMarcoModalAberto(false)
      setNovoMarcoNome('')
      setNovoMarcoData('')
      setErroMarco('')
      toast({
        title: 'Marco criado',
        description: `O marco "${rec.nome}" foi criado e selecionado.`,
      })
    } catch (err: any) {
      setErroNovoMarco(err?.message || 'Erro ao cadastrar marco.')
    } finally {
      setSalvandoNovoMarco(false)
    }
  }

  // Intercepta onSalvar para validar marco obrigatório quando Vínculo = Projeto
  const handleSalvarComValidacao = async (isRascunho = false, frase?: string) => {
    setDialogErro('')
    setErroMarco('')

    const ehContextoProjeto = !!contextoProjeto?.id
    const ehVinculoProjeto = ehContextoProjeto || form.vinculo_tipo === 'projeto'

    // Regra: "Salvar rascunho" continua funcionando SEM marco em ambos os contextos
    if (!isRascunho && ehVinculoProjeto) {
      if (!form.marco_id || !form.marco_id.trim()) {
        const msgAviso =
          'Selecione um marco para esta tarefa. O progresso do projeto é calculado a partir das tarefas concluídas em cada marco.'
        setErroMarco(msgAviso)
        setDialogErro(msgAviso)
        if (selectMarcoTriggerRef.current) {
          selectMarcoTriggerRef.current.focus()
        }
        return
      }
    }

    try {
      await onSalvar(isRascunho, frase)
    } catch (err: any) {
      const msg = String(err?.message || err || '')
      // Mapeamento amigável de erros do backend
      if (
        msg.includes('chk_tarefa_marco_obrigatorio') ||
        msg.includes('origem') ||
        msg.includes('marcoId é obrigatório') ||
        msg.includes('marco')
      ) {
        setErroMarco('Selecione um marco para esta tarefa.')
        setDialogErro('Selecione um marco para esta tarefa.')
      } else if (msg.includes('não pertence') || msg.includes('MISMATCH')) {
        setErroMarco('O marco escolhido não pertence a este projeto. Escolha outro marco.')
        setDialogErro('O marco escolhido não pertence a este projeto. Escolha outro marco.')
      } else if (msg.includes('cancelado')) {
        setErroMarco('Este marco foi cancelado. Escolha um marco ativo.')
        setDialogErro('Este marco foi cancelado. Escolha um marco ativo.')
      } else {
        setDialogErro(msg)
      }
    }
  }

  // Bloco de Captura IA
  const [iaPrompt, setIaPrompt] = useState('')
  const [gerandoIa, setGerandoIa] = useState(false)
  const [iaAnexandoArquivo, setIaAnexandoArquivo] = useState(false)
  const [fraseIaAplicada, setFraseIaAplicada] = useState('')

  // Estado de feedback / desfazer pós-captura
  const [estadoCaptura, setEstadoCaptura] = useState<{
    status: 'ocioso' | 'sucesso' | 'falha' | 'parcial'
    mensagem: string
    camposPreenchidosQtd: number
    pendencias: string[]
    naoEncontrados: string[]
  }>({
    status: 'ocioso',
    mensagem: '',
    camposPreenchidosQtd: 0,
    pendencias: [],
    naoEncontrados: [],
  })

  // Snapshot do formulário anterior para permitir DESFAZER
  const formSnapshotAnteriorRef = useRef<TarefaFormData | null>(null)

  // Destaque visual temporário nos campos preenchidos pela IA
  const [camposDestacados, setCamposDestacados] = useState<{
    [campo: string]: boolean
  }>({})
  const timerDestaqueRef = useRef<any>(null)

  // Refs para dar foco ao primeiro campo obrigatório pendente
  const inputTituloRef = useRef<HTMLInputElement | null>(null)
  const triggerParceiroRef = useRef<HTMLButtonElement | null>(null)

  // Áudio: constantes de duração (60s limite com aviso aos 50s / 10s restantes)
  const DURACAO_MAX_AUDIO_S = 60
  const AVISO_PREVIO_AUDIO_S = 50

  const [ouvindo, setOuvindo] = useState(false)
  const [tempoGravacaoS, setTempoGravacaoS] = useState(0)
  const [processandoAudio, setProcessandoAudio] = useState(false)
  const [erroPermissaoMic, setErroPermissaoMic] = useState(false)

  const recRef = useRef<any>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const cancelandoAudioRef = useRef<boolean>(false)
  const cronometroIntervalRef = useRef<any>(null)
  const autoEncerramentoDisparadoRef = useRef<boolean>(false)

  // Busca e dropdown de Parceiros e Responsável
  const [buscaParceiro, setBuscaParceiro] = useState('')
  const [popoverParceiroAberto, setPopoverParceiroAberto] = useState(false)
  const [buscaResponsavel, setBuscaResponsavel] = useState('')
  const [popoverResponsavelAberto, setPopoverResponsavelAberto] = useState(false)

  // Expandir lista de anexos
  const [expandirAnexos, setExpandirAnexos] = useState(false)

  // Sinalização de campos obrigatórios não preenchidos pela IA ou pelo usuário
  const [camposSinalizados, setCamposSinalizados] = useState<{
    titulo?: boolean
    parceiros?: boolean
    empresaNaoReconhecida?: string
    responsavelNaoReconhecido?: string
  }>({})

  // Limpa timer do cronômetro
  const limparCronometro = () => {
    if (cronometroIntervalRef.current) {
      clearInterval(cronometroIntervalRef.current)
      cronometroIntervalRef.current = null
    }
  }

  // Parar áudio e liberar microfone com segurança
  const pararOuvir = () => {
    limparCronometro()
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
    setTempoGravacaoS(0)
  }

  // Cancelar gravação explicitamente sem enviar nada
  const cancelarGravacaoAudio = () => {
    cancelandoAudioRef.current = true
    mediaChunksRef.current = []
    pararOuvir()
    setTimeout(() => {
      cancelandoAudioRef.current = false
    }, 100)
    toast({
      title: 'Gravação cancelada',
      description: 'O áudio foi descartado sem enviar para transcrição.',
    })
  }

  // Tratamento dedicado para permissão de microfone negada
  const tratarPermissaoMicNegada = () => {
    setErroPermissaoMic(true)
    setOuvindo(false)
    limparCronometro()
    toast({
      title: 'Permissão de microfone negada',
      description:
        'Acesso ao microfone bloqueado no navegador. Libere no ícone de cadeado ou digite diretamente no campo.',
      variant: 'destructive',
    })
  }

  // Limpa estados ao fechar ou reabrir
  useEffect(() => {
    if (!open) {
      // Ao fechar o modal durante a gravação, descarta com segurança e libera hardware
      cancelandoAudioRef.current = true
      mediaChunksRef.current = []
      pararOuvir()
      cancelandoAudioRef.current = false
      setErroPermissaoMic(false)
      setIaPrompt('')
      setFraseIaAplicada('')
      setEstadoCaptura({
        status: 'ocioso',
        mensagem: '',
        camposPreenchidosQtd: 0,
        pendencias: [],
        naoEncontrados: [],
      })
      formSnapshotAnteriorRef.current = null
      setCamposDestacados({})
      if (timerDestaqueRef.current) clearTimeout(timerDestaqueRef.current)
      setCamposSinalizados({})
      setExpandirAnexos(false)
      setBuscaParceiro('')
      setBuscaResponsavel('')
      setPopoverParceiroAberto(false)
      setPopoverResponsavelAberto(false)
    }
  }, [open])

  // Cleanup adicional caso o componente seja desmontado (ex: navegação de rota)
  useEffect(() => {
    return () => {
      cancelandoAudioRef.current = true
      mediaChunksRef.current = []
      pararOuvir()
    }
  }, [])

  // Inicia cronômetro com monitoramento de tempo decorrido, aviso aos 50s e auto-encerramento aos 60s
  const iniciarCronometro = () => {
    limparCronometro()
    setTempoGravacaoS(0)
    autoEncerramentoDisparadoRef.current = false
    const inicio = Date.now()

    cronometroIntervalRef.current = setInterval(() => {
      const decorrido = Math.floor((Date.now() - inicio) / 1000)
      setTempoGravacaoS(decorrido)

      // Auto-encerramento ao atingir o limite de 60s
      if (decorrido >= DURACAO_MAX_AUDIO_S && !autoEncerramentoDisparadoRef.current) {
        autoEncerramentoDisparadoRef.current = true
        limparCronometro()
        toast({
          title: 'Limite de áudio atingido (60s)',
          description: 'A gravação foi encerrada e está sendo processada para transcrição.',
        })
        pararOuvir()
      }
    }, 1000)
  }

  // Transcrever áudio via backend
  const transcreverAudioBlob = async (blob: Blob) => {
    // Se a gravação foi cancelada pelo usuário ou descarte de fechamento, não envia
    if (cancelandoAudioRef.current) {
      return
    }

    setProcessandoAudio(true)
    try {
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
        setIaPrompt((prev) => (prev ? prev + ' ' + texto : texto).trim())
        toast({
          title: 'Áudio transcrito com sucesso',
          description: 'Clique em "Gerar tarefa" para estruturar os campos.',
        })
      } else {
        toast({
          title: 'Transcrição vazia',
          description: 'A IA não identificou fala clara no áudio. Digite ou tente novamente.',
          variant: 'destructive',
        })
      }
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao transcrever')
      toast({
        title: 'Falha na transcrição do áudio',
        description: msg.includes('GEMINI_API_KEY')
          ? 'Chave GEMINI_API_KEY não configurada. Use o reconhecimento nativo do navegador ou digite a tarefa.'
          : 'Não foi possível transcrever o áudio gravado. Você pode digitar diretamente no campo.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAudio(false)
    }
  }

  // Gravação via MediaRecorder
  const iniciarGravacaoMediaRecorder = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast({
        title: 'Microfone indisponível',
        description:
          'Seu navegador não possui suporte a captura de áudio ou a página não está em HTTPS.',
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
        if (ev.data && ev.data.size > 0 && !cancelandoAudioRef.current) {
          mediaChunksRef.current.push(ev.data)
        }
      }

      mr.onstop = async () => {
        limparCronometro()
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop())
          mediaStreamRef.current = null
        }
        if (cancelandoAudioRef.current) {
          mediaChunksRef.current = []
          return
        }
        const mime = mr.mimeType || 'audio/webm'
        const audioBlob = new Blob(mediaChunksRef.current, { type: mime })
        if (audioBlob.size > 0) {
          await transcreverAudioBlob(audioBlob)
        }
      }

      mr.onerror = (ev: any) => {
        limparCronometro()
        setOuvindo(false)
        setTempoGravacaoS(0)
        toast({
          title: 'Erro na gravação',
          description: String(ev?.error || 'Falha no gravador de áudio.'),
          variant: 'destructive',
        })
      }

      cancelandoAudioRef.current = false
      mr.start()
      mediaRecRef.current = mr
      setOuvindo(true)
      setErroPermissaoMic(false)
      iniciarCronometro()
      toast({
        title: 'Gravando áudio...',
        description:
          'Fale sua tarefa. Toque no microfone para parar e transcrever ou em Cancelar para descartar.',
      })
    } catch (err: any) {
      limparCronometro()
      setTempoGravacaoS(0)
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        tratarPermissaoMicNegada()
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toast({
          title: 'Nenhum microfone encontrado',
          description:
            'Conecte um microfone ao dispositivo para gravar ou digite diretamente a tarefa.',
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

  // Alternar gravação por voz
  const toggleOuvir = async () => {
    // Regra: tocar no microfone durante uma gravação encerra e envia
    if (ouvindo) {
      pararOuvir()
      return
    }

    setErroPermissaoMic(false)

    const SR =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null

    if (SR) {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          probeStream.getTracks().forEach((t) => t.stop())
        } catch (err: any) {
          const name = err?.name || ''
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            tratarPermissaoMicNegada()
            return
          }
          if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            toast({
              title: 'Nenhum microfone encontrado',
              description: 'Conecte um microfone para gravar ou digite a tarefa manualmente.',
              variant: 'destructive',
            })
            return
          }
        }
      }

      try {
        const rec = new SR()
        rec.lang = 'pt-BR'
        rec.continuous = true
        rec.interimResults = true

        rec.onstart = () => {
          setOuvindo(true)
          setErroPermissaoMic(false)
          cancelandoAudioRef.current = false
          iniciarCronometro()
          toast({
            title: 'Gravando voz...',
            description:
              'Fale sua tarefa. O texto será reconhecido em tempo real no campo de texto.',
          })
        }

        rec.onresult = (ev: any) => {
          if (cancelandoAudioRef.current) return
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
            setIaPrompt(total)
          }
        }

        rec.onerror = (ev: any) => {
          limparCronometro()
          const errCode = ev.error || ''
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            tratarPermissaoMicNegada()
          } else if (errCode === 'network') {
            toast({
              title: 'Erro de conexão no reconhecimento de voz',
              description: 'Tentando gravador de áudio do sistema...',
              variant: 'destructive',
            })
            pararOuvir()
            iniciarGravacaoMediaRecorder()
            return
          } else if (errCode !== 'no-speech') {
            toast({
              title: 'Erro no reconhecimento de voz',
              description: `Código: ${errCode || 'desconhecido'}. Você pode digitar a tarefa manualmente.`,
              variant: 'destructive',
            })
          }
          setOuvindo(false)
          setTempoGravacaoS(0)
        }

        rec.onend = () => {
          limparCronometro()
          setOuvindo(false)
          setTempoGravacaoS(0)
        }

        recRef.current = rec
        rec.start()
        return
      } catch (err: any) {
        console.warn('SpeechRecognition falhou ao iniciar, usando fallback MediaRecorder:', err)
      }
    }

    if (typeof MediaRecorder !== 'undefined') {
      await iniciarGravacaoMediaRecorder()
      return
    }

    toast({
      title: 'Navegador incompatível',
      description:
        'Seu navegador não suporta captura de áudio. Por favor, digite a tarefa no campo.',
      variant: 'destructive',
    })
  }

  // Anexar arquivo no bloco de IA para extrair contexto
  const handleIaAnexarArquivo = async (file: File) => {
    setIaAnexandoArquivo(true)
    try {
      // Adiciona também aos arquivos da tarefa para ficar anexado
      setArquivosNovos((prev) => [...prev, file])

      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append(
        'prompt',
        'Extraia uma frase resumida descrevendo a tarefa ou ação principal contida neste documento.',
      )
      fd.append('modulo', 'tarefas')

      const r = (await pb.send('/backend/v1/ia/analisar-arquivo', {
        method: 'POST',
        body: fd,
      })) as any

      const resumo =
        r?.estrutura?.sumario_executivo ||
        (Array.isArray(r?.estrutura?.principais_achados)
          ? r.estrutura.principais_achados.join(' ')
          : '') ||
        file.name

      setIaPrompt((prev) => (prev ? prev + ' ' + resumo : resumo).trim())
      toast({
        title: 'Arquivo analisado pela IA',
        description: `Informações do arquivo "${file.name}" adicionadas à descrição da IA.`,
      })
    } catch (e: any) {
      // Se der erro na análise, apenas anexa o arquivo normalmente
      setIaPrompt((prev) => (prev ? prev + ' Anexo: ' + file.name : `Analisar ${file.name}`).trim())
      toast({
        title: 'Arquivo anexado',
        description: `O arquivo "${file.name}" foi anexado à tarefa.`,
      })
    } finally {
      setIaAnexandoArquivo(false)
    }
  }

  // Função para DESFAZER o preenchimento da IA e restaurar o estado anterior
  const desfazerCapturaIa = () => {
    if (formSnapshotAnteriorRef.current) {
      setForm(formSnapshotAnteriorRef.current)
      formSnapshotAnteriorRef.current = null
    }
    setCamposDestacados({})
    if (timerDestaqueRef.current) clearTimeout(timerDestaqueRef.current)
    setEstadoCaptura({
      status: 'ocioso',
      mensagem: '',
      camposPreenchidosQtd: 0,
      pendencias: [],
      naoEncontrados: [],
    })
    setCamposSinalizados({})
    setFraseIaAplicada('')
    toast({
      title: 'Captura por IA desfeita',
      description: 'O formulário foi restaurado ao estado anterior à captura.',
    })
  }

  // Ação principal de IA: "Gerar tarefa"
  const gerarTarefaComIa = async () => {
    const fraseCaptura = iaPrompt.trim()
    if (!fraseCaptura) {
      toast({
        title: 'Descreva a tarefa',
        description: 'Digite uma frase ou dite por áudio antes de clicar em Gerar tarefa.',
        variant: 'destructive',
      })
      return
    }

    setGerandoIa(true)
    setDialogErro('')

    // Salva snapshot do formulário antes da captura para permitir DESFAZER
    formSnapshotAnteriorRef.current = {
      ...form,
      parceiro_ids: [...(form.parceiro_ids || [])],
    }

    try {
      const hojeISO = new Date().toISOString().slice(0, 10)
      const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
        method: 'POST',
        body: JSON.stringify({
          alvo: 'tarefa',
          texto: fraseCaptura,
          data_referencia: hojeISO,
        }),
      })) as any

      const e = r.estrutura || {}

      // Mapeamento com correspondência confiável de Empresa
      let empresaFinal = form.empresa
      let empresaMudou = false
      let empresaNaoReconhecida = ''
      if (e.empresa) {
        const empNome = String(e.empresa).trim().toLowerCase()
        const matchEmp = empresas.find((emp) => {
          const nomeE = emp.nome.toLowerCase()
          return nomeE === empNome || nomeE.replace(/\s+/g, '') === empNome.replace(/\s+/g, '')
        })
        if (matchEmp) {
          empresaFinal = matchEmp.nome
          empresaMudou = true
        } else if (empNome === 'cpf' || empNome === 'll5') {
          empresaFinal = 'LL5'
          empresaMudou = true
        } else {
          // Empresa citada mas não tem correspondência confiável nos cadastros
          empresaNaoReconhecida = String(e.empresa)
        }
      } else if (e.empresa_nao_encontrada) {
        empresaNaoReconhecida = String(e.empresa_nao_encontrada)
      }

      // Mapeamento com correspondência confiável de Parceiro/Responsável
      // Preencher APENAS com correspondência confiável nos cadastros existentes.
      let respFinal = form.responsavel || ''
      let respMudou = false
      let novosParceiroIds: string[] = [...(form.parceiro_ids || [])]
      let parceiroMudou = false
      let responsavelNaoReconhecido = ''

      const nomesParaBuscar: string[] = [
        ...(e.responsavel ? [String(e.responsavel).trim()] : []),
        ...(Array.isArray(e.parceiros_sugeridos)
          ? e.parceiros_sugeridos.map((x: any) => String(x).trim())
          : []),
      ].filter(Boolean)

      for (const nomeBruto of nomesParaBuscar) {
        const nNorm = nomeBruto
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        const match = parceiros.find((p) => {
          const pNorm = String(p.nome || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
          // Match exato ou partes de nome relevantes
          if (pNorm === nNorm) return true
          const tokensN = nNorm.split(/\s+/).filter((t: string) => t.length > 2)
          const tokensP = pNorm.split(/\s+/).filter((t: string) => t.length > 2)
          // Se pelo menos um token exclusivo de nome coincide (ex.: "Leonardo" com "LEONARDO VENANCIO LOURENCO")
          const intersecao = tokensN.filter((t: string) => tokensP.includes(t))
          return intersecao.length > 0
        })

        if (match) {
          if (!respFinal || !respMudou) {
            respFinal = match.nome
            respMudou = true
          }
          if (!novosParceiroIds.includes(match.id)) {
            novosParceiroIds.push(match.id)
            parceiroMudou = true
          }
        } else {
          responsavelNaoReconhecido = nomeBruto
        }
      }

      // Se a IA reportou pessoas não encontradas
      if (Array.isArray(e.pessoas_nao_encontradas) && e.pessoas_nao_encontradas.length > 0) {
        responsavelNaoReconhecido = e.pessoas_nao_encontradas.join(', ')
      }

      // Prioridade
      let prioridadeFinal = form.prioridade_p || 'P2'
      let prioridadeMudou = false
      if (e.prioridade_p === 'P1' || e.prioridade_p === 'P3' || e.prioridade_p === 'P2') {
        prioridadeFinal = e.prioridade_p
        prioridadeMudou = true
      }

      // Status
      let statusFinal = form.status_kanban || 'triagem'
      let statusMudou = false
      if (e.status_kanban) {
        statusFinal = e.status_kanban
        statusMudou = true
      }

      // Recorrência
      let recorrenciaFinal = form.recorrencia || 'Nenhuma'
      let recorrenciaMudou = false
      if (e.recorrencia) {
        const recFormat = String(e.recorrencia).trim()
        const opcoesRec = ['Nenhuma', 'Diária', 'Semanal', 'Mensal', 'Bimestral', 'A definir']
        const recMatch = opcoesRec.find((op) => op.toLowerCase() === recFormat.toLowerCase())
        if (recMatch) {
          recorrenciaFinal = recMatch
          recorrenciaMudou = true
        }
      }

      // Prazo
      let prazoFinal = form.prazo || ''
      let prazoMudou = false
      if (e.prazo && /^\d{4}-\d{2}-\d{2}$/.test(String(e.prazo).slice(0, 10))) {
        prazoFinal = String(e.prazo).slice(0, 10)
        prazoMudou = true
      }

      // Título
      let tituloFinal = form.titulo
      let tituloMudou = false
      if (e.titulo && String(e.titulo).trim()) {
        tituloFinal = String(e.titulo).trim()
        tituloMudou = true
      }

      // Descrição
      let descFinal = form.descricao
      let descMudou = false
      if (e.descricao && String(e.descricao).trim()) {
        descFinal = String(e.descricao).trim()
        descMudou = true
      }

      const novoForm: TarefaFormData = {
        ...form,
        titulo: tituloFinal,
        descricao: descFinal,
        responsavel: respFinal,
        prazo: prazoFinal,
        recorrencia: recorrenciaFinal,
        prioridade_p: prioridadeFinal,
        status_kanban: statusFinal,
        empresa: empresaFinal,
        vinculo_tipo:
          e.vinculo_tipo !== undefined && e.vinculo_tipo !== ''
            ? e.vinculo_tipo
            : form.vinculo_tipo,
        vinculo_id:
          e.vinculo_id !== undefined && e.vinculo_id !== '' ? e.vinculo_id : form.vinculo_id,
        parceiro_ids: novosParceiroIds,
      }

      setForm(novoForm)
      setFraseIaAplicada(fraseCaptura)

      // Contagem e identificação de campos preenchidos pela IA nesta rodada
      const camposPreenchidosMap: { [campo: string]: boolean } = {}
      let qtdPreenchidos = 0

      if (tituloMudou) {
        camposPreenchidosMap.titulo = true
        qtdPreenchidos++
      }
      if (empresaMudou) {
        camposPreenchidosMap.empresa = true
        qtdPreenchidos++
      }
      if (respMudou) {
        camposPreenchidosMap.responsavel = true
        qtdPreenchidos++
      }
      if (parceiroMudou) {
        camposPreenchidosMap.parceiros = true
        qtdPreenchidos++
      }
      if (prazoMudou) {
        camposPreenchidosMap.prazo = true
        qtdPreenchidos++
      }
      if (recorrenciaMudou) {
        camposPreenchidosMap.recorrencia = true
        qtdPreenchidos++
      }
      if (prioridadeMudou) {
        camposPreenchidosMap.prioridade = true
        qtdPreenchidos++
      }
      if (statusMudou) {
        camposPreenchidosMap.status = true
        qtdPreenchidos++
      }
      if (descMudou) {
        camposPreenchidosMap.descricao = true
        qtdPreenchidos++
      }

      // Destaque visual temporário nos campos preenchidos
      setCamposDestacados(camposPreenchidosMap)
      if (timerDestaqueRef.current) clearTimeout(timerDestaqueRef.current)
      timerDestaqueRef.current = setTimeout(() => {
        setCamposDestacados({})
      }, 5000)

      // Verificação de campos obrigatórios: Título e Parceiros/Contatos Responsáveis
      const pendenciasObrigatorias: string[] = []
      const faltamObrigatorios: {
        titulo?: boolean
        parceiros?: boolean
        empresaNaoReconhecida?: string
        responsavelNaoReconhecido?: string
      } = {}

      if (!novoForm.titulo || !novoForm.titulo.trim()) {
        faltamObrigatorios.titulo = true
        pendenciasObrigatorias.push('Título')
      }
      if (!novoForm.parceiro_ids || novoForm.parceiro_ids.length === 0) {
        faltamObrigatorios.parceiros = true
        pendenciasObrigatorias.push('Parceiro/Contato Responsável')
      }

      const naoEncontradosLista: string[] = []
      if (empresaNaoReconhecida) {
        faltamObrigatorios.empresaNaoReconhecida = empresaNaoReconhecida
        naoEncontradosLista.push(`Empresa "${empresaNaoReconhecida}" não cadastrada`)
      }
      if (
        responsavelNaoReconhecido &&
        (!novoForm.parceiro_ids || novoForm.parceiro_ids.length === 0)
      ) {
        faltamObrigatorios.responsavelNaoReconhecido = responsavelNaoReconhecido
        naoEncontradosLista.push(`Pessoa "${responsavelNaoReconhecido}" não cadastrada`)
      }

      setCamposSinalizados(faltamObrigatorios)

      // Foco automático no primeiro campo obrigatório pendente
      setTimeout(() => {
        if (faltamObrigatorios.titulo && inputTituloRef.current) {
          inputTituloRef.current.focus()
          inputTituloRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else if (faltamObrigatorios.parceiros && triggerParceiroRef.current) {
          triggerParceiroRef.current.focus()
          triggerParceiroRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)

      const ehParcial = pendenciasObrigatorias.length > 0 || naoEncontradosLista.length > 0

      setEstadoCaptura({
        status: ehParcial ? 'parcial' : 'sucesso',
        mensagem: ehParcial
          ? `${qtdPreenchidos} campo(s) preenchido(s). Pendências: ${[...pendenciasObrigatorias, ...naoEncontradosLista].join(', ')}.`
          : `${qtdPreenchidos} campo(s) preenchido(s) com sucesso a partir da frase.`,
        camposPreenchidosQtd: qtdPreenchidos,
        pendencias: pendenciasObrigatorias,
        naoEncontrados: naoEncontradosLista,
      })

      if (ehParcial) {
        toast({
          title: 'IA: Captura parcial',
          description: `${qtdPreenchidos} campo(s) preenchido(s). Conclua os campos obrigatórios destacados.`,
        })
      } else {
        toast({
          title: 'IA: Tarefa estruturada com sucesso',
          description: `${qtdPreenchidos} campos preenchidos. Revise e clique em Criar tarefa quando pronto.`,
        })
      }
    } catch (e: any) {
      console.error('Erro ao gerar tarefa com IA:', e)
      setEstadoCaptura({
        status: 'falha',
        mensagem:
          'Não foi possível interpretar a frase pela IA. Sua descrição foi mantida no campo e você pode preencher o formulário manualmente.',
        camposPreenchidosQtd: 0,
        pendencias: [],
        naoEncontrados: [],
      })
      toast({
        title: 'Não foi possível estruturar via IA',
        description:
          'Sua frase foi preservada no campo. O formulário manual segue funcionando normalmente.',
        variant: 'destructive',
      })
    } finally {
      setGerandoIa(false)
    }
  }

  // Filtragem de parceiros no dropdown
  const parceirosFiltrados = parceiros.filter((p) => {
    if (!buscaParceiro.trim()) return true
    const b = buscaParceiro.toLowerCase()
    const nome = String(p.nome || '').toLowerCase()
    const emp = String(p.empresa || '').toLowerCase()
    const tipo = String(p.tipo || '').toLowerCase()
    return nome.includes(b) || emp.includes(b) || tipo.includes(b)
  })

  // Filtragem de responsáveis no dropdown (mesma lógica)
  const responsaveisFiltrados = parceiros.filter((p) => {
    if (!buscaResponsavel.trim()) return true
    const b = buscaResponsavel.toLowerCase()
    const nome = String(p.nome || '').toLowerCase()
    const emp = String(p.empresa || '').toLowerCase()
    const tipo = String(p.tipo || '').toLowerCase()
    return nome.includes(b) || emp.includes(b) || tipo.includes(b)
  })

  // Prioridades mapeadas para o seletor de 3 opções lado a lado (Baixa / Normal / Alta)
  const prioridadeSelecionada = form.prioridade_p || 'P2'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl border border-gray-200 shadow-2xl">
        {/* Cabeçalho do modal */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100 flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight">
              {editando ? 'Editar tarefa' : 'Nova tarefa'}
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-0.5">Descreva, dite ou preencha manualmente</p>
          </div>
        </DialogHeader>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ============================================================== */}
          {/* 1) BLOCO DE CAPTURA IA NO TOPO (Elemento principal da tela) */}
          {/* ============================================================== */}
          <div className="rounded-xl border border-emerald-200/90 bg-[#F1F8F4] p-4.5 sm:p-5 shadow-2xs space-y-3">
            {/* Rótulo com ícone e status de áudio com cronômetro em segundos */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[#1B5E20] font-bold text-[13px] flex-wrap">
                <Sparkles className="h-4 w-4 text-[#1B5E20]" />
                <span>Criar com IA</span>
                {ouvindo && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full transition-colors',
                      tempoGravacaoS >= AVISO_PREVIO_AUDIO_S
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                        : 'bg-red-100/90 text-red-700 border border-red-200',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                    <span>
                      Gravando: {tempoGravacaoS}s / {DURACAO_MAX_AUDIO_S}s
                    </span>
                  </span>
                )}
                {processandoAudio && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo...
                  </span>
                )}
                {iaAnexandoArquivo && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <Loader2 className="h-3 w-3 animate-spin" /> Lendo arquivo...
                  </span>
                )}
              </div>

              {/* Botão Cancelar visível no topo durante gravação */}
              {ouvindo && (
                <button
                  type="button"
                  onClick={cancelarGravacaoAudio}
                  className="text-[11px] font-medium text-gray-500 hover:text-red-700 underline underline-offset-2 flex items-center gap-1 transition-colors"
                >
                  <X className="h-3 w-3" /> Descartar áudio
                </button>
              )}
            </div>

            {/* Aviso prévio pouco antes do limite de duração (50s a 60s) */}
            {ouvindo && tempoGravacaoS >= AVISO_PREVIO_AUDIO_S && (
              <div className="rounded-md bg-amber-50 border border-amber-300/80 px-3 py-1.5 text-xs text-amber-900 flex items-center justify-between gap-2 animate-fadeIn">
                <span className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  Atenção: limite de áudio próximo ({DURACAO_MAX_AUDIO_S - tempoGravacaoS}s
                  restantes). Ao atingir 60s, o áudio será enviado automaticamente.
                </span>
                <button
                  type="button"
                  onClick={toggleOuvir}
                  className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950 shrink-0"
                >
                  Concluir agora
                </button>
              </div>
            )}

            {/* Mensagem amigável dedicada para permissão de microfone negada */}
            {erroPermissaoMic && !ouvindo && (
              <div className="rounded-lg bg-amber-50/90 border border-amber-300 p-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-gray-900">
                      Permissão do microfone bloqueada no navegador
                    </p>
                    <p className="text-[11px] text-gray-700 leading-relaxed">
                      Para ditar por voz, clique no{' '}
                      <strong>ícone de cadeado / configurações de site</strong> ao lado da barra de
                      endereço do navegador, altere <em>Microfone</em> para{' '}
                      <strong>Permitir</strong> e recarregue a página.
                    </p>
                    <p className="text-[11px] font-medium text-emerald-900">
                      💡 Você pode continuar criando tarefas normalmente digitando a descrição no
                      campo abaixo e clicando em <strong>Gerar tarefa</strong>.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setErroPermissaoMic(false)}
                  className="h-7 text-xs text-gray-500 hover:text-gray-800 self-end sm:self-start shrink-0"
                >
                  Entendi
                </Button>
              </div>
            )}

            {/* Campo de texto amplo com instrução exata */}
            <Textarea
              value={iaPrompt}
              onChange={(e) => setIaPrompt(e.target.value)}
              placeholder="Descreva a tarefa em uma frase. Ex.: Emitir os recibos de locação da Foldbox todo dia 1º, responsável Leonardo."
              rows={3}
              className="w-full bg-white border border-emerald-200/80 focus-visible:ring-[#1B5E20] focus-visible:border-[#1B5E20] rounded-lg text-sm text-gray-800 placeholder:text-gray-400 resize-none shadow-2xs"
            />

            {/* Rodapé do bloco: botões alinhados com suporte a cancelar durante gravação */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Botão: Ditar por áudio (ou Parar e transcrever quando gravando) */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleOuvir}
                  disabled={processandoAudio || gerandoIa}
                  className={cn(
                    'h-9 px-3.5 text-xs font-semibold rounded-full border border-emerald-300 bg-white text-[#1B5E20] hover:bg-emerald-50 hover:text-[#0F3D13] transition-colors flex items-center gap-1.5 shadow-2xs',
                    ouvindo &&
                      'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 ring-2 ring-red-200',
                  )}
                >
                  <Mic
                    className={cn(
                      'h-3.5 w-3.5',
                      ouvindo ? 'text-red-600 animate-pulse' : 'text-[#1B5E20]',
                    )}
                  />
                  <span>
                    {ouvindo ? `Parar e transcrever (${tempoGravacaoS}s)` : 'Ditar por áudio'}
                  </span>
                </Button>

                {/* Botão de Cancelar durante a gravação (descarta áudio sem enviar nada) */}
                {ouvindo && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelarGravacaoAudio}
                    className="h-9 px-3 text-xs font-medium rounded-full text-red-700 hover:bg-red-100/80 hover:text-red-800 transition-colors flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancelar</span>
                  </Button>
                )}

                {/* Botão: Anexar arquivo (alimenta prompt IA e adiciona aos anexos) */}
                <label className="h-9 px-3.5 text-xs font-semibold rounded-full border border-emerald-300 bg-white text-[#1B5E20] hover:bg-emerald-50 hover:text-[#0F3D13] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <Paperclip className="h-3.5 w-3.5 text-[#1B5E20]" />
                  <span>Anexar arquivo</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleIaAnexarArquivo(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              {/* Botão principal verde: Gerar tarefa (desabilitado com campo vazio ou processando) */}
              <Button
                type="button"
                onClick={gerarTarefaComIa}
                disabled={!iaPrompt.trim() || gerandoIa || processandoAudio || ouvindo}
                className="h-9 px-4 text-xs font-bold rounded-full bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gerandoIa ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{gerandoIa ? 'Gerando tarefa...' : 'Gerar tarefa'}</span>
              </Button>
            </div>

            {/* Banner de Feedback da Captura com contagem de campos, pendências e opção de DESFAZER */}
            {estadoCaptura.status !== 'ocioso' && (
              <div
                className={cn(
                  'rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all border',
                  estadoCaptura.status === 'sucesso' &&
                    'bg-emerald-50/90 text-emerald-900 border-emerald-300',
                  estadoCaptura.status === 'parcial' &&
                    'bg-amber-50/90 text-amber-900 border-amber-300',
                  estadoCaptura.status === 'falha' && 'bg-red-50/90 text-red-900 border-red-300',
                )}
              >
                <div className="flex items-start gap-2">
                  {estadoCaptura.status === 'sucesso' && (
                    <Sparkles className="h-4 w-4 text-[#1B5E20] shrink-0 mt-0.5" />
                  )}
                  {estadoCaptura.status === 'parcial' && (
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  {estadoCaptura.status === 'falha' && (
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{estadoCaptura.mensagem}</p>
                    {estadoCaptura.pendencias.length > 0 && (
                      <p className="text-[11px] opacity-90 mt-0.5">
                        Campos pendentes de conferência/preenchimento:{' '}
                        <strong>{estadoCaptura.pendencias.join(', ')}</strong>
                      </p>
                    )}
                    {estadoCaptura.naoEncontrados.length > 0 && (
                      <p className="text-[11px] opacity-90 mt-0.5">
                        Não reconhecidos no cadastro:{' '}
                        <em>{estadoCaptura.naoEncontrados.join(', ')}</em> (o sistema não cria
                        registros automaticamente).
                      </p>
                    )}
                  </div>
                </div>

                {/* Opção de DESFAZER que restaura o formulário ao estado anterior à captura */}
                {formSnapshotAnteriorRef.current && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={desfazerCapturaIa}
                    className="h-7 text-xs font-semibold shrink-0 bg-white hover:bg-gray-100 border-gray-300 shadow-2xs"
                  >
                    Desfazer captura
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 2) SEPARADOR DISCRETO */}
          {/* ============================================================== */}
          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-white px-3 text-[11px] font-medium text-gray-400">
              ou preencha manualmente
            </span>
          </div>

          {/* ============================================================== */}
          {/* 3) FORMULÁRIO MANUAL EM DUAS COLUNAS COMPACTAS */}
          {/* ============================================================== */}
          <div className="space-y-4">
            {/* TÍTULO em largura inteira com destaque tipográfico maior */}
            <div className="space-y-1.5">
              <Label
                className={cn(
                  'text-xs font-bold uppercase tracking-wider flex items-center justify-between',
                  camposSinalizados.titulo ? 'text-red-600' : 'text-gray-500',
                )}
              >
                <span>Título *</span>
                {camposDestacados.titulo && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                    Preenchido por IA
                  </span>
                )}
              </Label>
              <Input
                ref={inputTituloRef}
                value={form.titulo || ''}
                onChange={(e) => {
                  setForm({ ...form, titulo: e.target.value })
                  if (camposSinalizados.titulo && e.target.value.trim()) {
                    setCamposSinalizados((prev) => ({ ...prev, titulo: false }))
                  }
                }}
                placeholder="Ex.: Emitir recibos de locação"
                className={cn(
                  'h-11 text-base font-semibold text-gray-900 bg-gray-50/70 border-gray-200 focus-visible:ring-[#1B5E20] focus-visible:border-[#1B5E20] transition-all',
                  camposSinalizados.titulo && 'border-red-400 bg-red-50/40 ring-2 ring-red-300',
                  camposDestacados.titulo &&
                    'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                )}
              />
              {camposSinalizados.titulo && (
                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Campo obrigatório — a IA não identificou um título ou você ainda não preencheu.
                </p>
              )}
            </div>

            {/* Linha 1: EMPRESA e RESPONSÁVEL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* EMPRESA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Empresa</span>
                  {camposDestacados.empresa && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <Select
                  value={form.empresa || ' '}
                  onValueChange={(v) => {
                    setForm({ ...form, empresa: v === ' ' ? '' : v })
                    if (camposSinalizados.empresaNaoReconhecida) {
                      setCamposSinalizados((prev) => ({
                        ...prev,
                        empresaNaoReconhecida: undefined,
                      }))
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      'h-10 bg-gray-50/80 border-gray-200 transition-all',
                      camposDestacados.empresa &&
                        'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                      camposSinalizados.empresaNaoReconhecida &&
                        'border-amber-400 bg-amber-50/50 ring-1 ring-amber-300',
                    )}
                  >
                    {/* O SelectValue já renderiza o conteúdo do item selecionado (ícone + nome);
                        renderizar o ícone aqui de novo duplicava o ícone no campo. */}
                    <div className="flex items-center gap-2 truncate">
                      <SelectValue placeholder="Selecione a empresa..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">
                      <div className="flex items-center gap-2">
                        {obterIconeEmpresa('')}
                        <span>Todas / Grupo Consolidado</span>
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
                {camposSinalizados.empresaNaoReconhecida && (
                  <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Empresa "{camposSinalizados.empresaNaoReconhecida}" não encontrada no cadastro.
                  </p>
                )}
              </div>

              {/* RESPONSÁVEL (Seleção ÚNICA com busca e lista estilo Parceiros/Contatos) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Responsável</span>
                  {camposDestacados.responsavel && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <Popover
                  modal
                  open={popoverResponsavelAberto}
                  onOpenChange={setPopoverResponsavelAberto}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'w-full justify-between h-10 bg-gray-50/80 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60 transition-all',
                        camposDestacados.responsavel &&
                          'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                        camposSinalizados.responsavelNaoReconhecido &&
                          'border-amber-400 bg-amber-50/50 ring-1 ring-amber-300',
                      )}
                    >
                      <span className="truncate">
                        {(() => {
                          if (!form.responsavel) return 'Não definido'
                          const pMatch = parceiros.find((p) => p.nome === form.responsavel)
                          const nomeLimpo =
                            limparTextoResponsavel(form.responsavel) || form.responsavel
                          const emp =
                            pMatch?.empresa ||
                            (Array.isArray(pMatch?.empresas) ? pMatch.empresas[0] : '')
                          return emp ? `${nomeLimpo} (${emp})` : nomeLimpo
                        })()}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[calc(100vw-3rem)] sm:w-[420px] p-2 bg-white"
                    align="start"
                  >
                    <div className="space-y-2">
                      {/* Campo de busca interno */}
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3" />
                        <Input
                          value={buscaResponsavel}
                          onChange={(e) => setBuscaResponsavel(e.target.value)}
                          placeholder="Buscar parceiro por nome ou empresa..."
                          className="h-9 pl-8 text-xs bg-gray-50"
                        />
                      </div>

                      {/* Cadastrar novo como primeiro item */}
                      <button
                        type="button"
                        onClick={() => {
                          setPopoverResponsavelAberto(false)
                          onAbrirNovoParceiro()
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-md text-xs font-semibold text-[#1B5E20] bg-emerald-50/80 hover:bg-emerald-100 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Cadastrar novo</span>
                      </button>

                      {/* Lista rolável de responsáveis (seleção única). O stopPropagation no wheel
                          impede o bloqueio de rolagem do Dialog (react-remove-scroll) e o modal
                          do Popover registra o popover na própria camada de scroll. */}
                      <div
                        className="max-h-72 overflow-y-auto overscroll-contain space-y-1"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {/* Opção para limpar / Não definido */}
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, responsavel: '' }))
                            setPopoverResponsavelAberto(false)
                            if (camposSinalizados.responsavelNaoReconhecido) {
                              setCamposSinalizados((prev) => ({
                                ...prev,
                                responsavelNaoReconhecido: undefined,
                              }))
                            }
                          }}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                            !form.responsavel
                              ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                              : 'hover:bg-gray-50 text-gray-500 italic',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-4 w-4 rounded-xs border flex items-center justify-center text-[10px]',
                                !form.responsavel
                                  ? 'bg-[#1B5E20] border-[#1B5E20] text-white'
                                  : 'border-gray-300',
                              )}
                            >
                              {!form.responsavel ? '✓' : ''}
                            </span>
                            <span>Não definido</span>
                          </div>
                        </button>

                        {responsaveisFiltrados.length === 0 ? (
                          <p className="text-[11px] text-gray-400 text-center py-3">
                            Nenhum parceiro encontrado com esse nome.
                          </p>
                        ) : (
                          responsaveisFiltrados.map((p) => {
                            const sel = form.responsavel === p.nome
                            const empRotulo =
                              p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(', ') : '')
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  const novoNome = p.nome
                                  setForm((f) => {
                                    const curParceiros = f.parceiro_ids || []
                                    const novosParceiros = !curParceiros.includes(p.id)
                                      ? [...curParceiros, p.id]
                                      : curParceiros
                                    return {
                                      ...f,
                                      responsavel: novoNome,
                                      parceiro_ids: novosParceiros,
                                    }
                                  })
                                  setPopoverResponsavelAberto(false)
                                  if (camposSinalizados.responsavelNaoReconhecido) {
                                    setCamposSinalizados((prev) => ({
                                      ...prev,
                                      responsavelNaoReconhecido: undefined,
                                    }))
                                  }
                                }}
                                className={cn(
                                  'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                                  sel
                                    ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                    : 'hover:bg-gray-50 text-gray-800',
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span
                                    className={cn(
                                      'h-4 w-4 rounded-xs border flex items-center justify-center text-[10px]',
                                      sel
                                        ? 'bg-[#1B5E20] border-[#1B5E20] text-white'
                                        : 'border-gray-300',
                                    )}
                                  >
                                    {sel ? '✓' : ''}
                                  </span>
                                  <span className="truncate">
                                    {limparTextoResponsavel(p.nome) || p.nome}
                                  </span>
                                </div>
                                <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                                  {empRotulo ? `(${empRotulo})` : `(${p.tipo})`}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {camposSinalizados.responsavelNaoReconhecido && (
                  <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />"
                    {camposSinalizados.responsavelNaoReconhecido}" não encontrado no cadastro de
                    parceiros.
                  </p>
                )}
              </div>
            </div>

            {/* Linha 2: PRAZO e RECORRÊNCIA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* PRAZO */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                    Prazo
                  </span>
                  {camposDestacados.prazo && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <Input
                  type="date"
                  value={form.prazo || ''}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  className={cn(
                    'h-10 bg-gray-50/80 border-gray-200 transition-all',
                    camposDestacados.prazo &&
                      'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                  )}
                />
              </div>

              {/* RECORRÊNCIA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-[#1B5E20]" />
                    Recorrência
                  </span>
                  {camposDestacados.recorrencia && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <Select
                  value={form.recorrencia || 'Nenhuma'}
                  onValueChange={(v) => setForm({ ...form, recorrencia: v })}
                >
                  <SelectTrigger
                    className={cn(
                      'h-10 bg-gray-50/80 border-gray-200 transition-all',
                      camposDestacados.recorrencia &&
                        'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nenhuma">Nenhuma</SelectItem>
                    <SelectItem value="Diária">Diária</SelectItem>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                    <SelectItem value="Bimestral">Bimestral</SelectItem>
                    <SelectItem value="A definir">A definir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 3: PRIORIDADE · STATUS (compacto pelo conteúdo) · VÍNCULO (compacto, à direita do status) */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3.5">
              {/* PRIORIDADE (à esquerda, largura proporcional como antes) */}
              <div className="space-y-1.5 w-full sm:w-1/2 sm:shrink-0">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Prioridade</span>
                  {camposDestacados.prioridade && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <div
                  className={cn(
                    'grid grid-cols-3 gap-1 bg-gray-100/90 p-1 rounded-lg border border-gray-200/80 transition-all',
                    camposDestacados.prioridade &&
                      'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, prioridade_p: 'P3' })}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-md transition-all text-center',
                      prioridadeSelecionada === 'P3'
                        ? 'bg-white text-gray-800 shadow-xs border border-gray-200/60'
                        : 'text-gray-500 hover:text-gray-800',
                    )}
                  >
                    Baixa
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, prioridade_p: 'P2' })}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-md transition-all text-center',
                      prioridadeSelecionada === 'P2'
                        ? 'bg-[#1B5E20] text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800',
                    )}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, prioridade_p: 'P1' })}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-md transition-all text-center',
                      prioridadeSelecionada === 'P1'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800',
                    )}
                  >
                    Alta
                  </button>
                </div>
              </div>

              {/* Bloco compacto à direita: STATUS e VÍNCULO (ORIGEM) lado a lado na mesma linha */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 w-full sm:flex-1">
                {/* STATUS compacto (largura dimensionada pelo conteúdo) */}
                <div className="space-y-1.5 w-full sm:w-auto shrink-0">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between gap-1">
                    <span>Status</span>
                    {camposDestacados.status && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                        IA
                      </span>
                    )}
                  </Label>
                  <Select
                    value={form.status_kanban || 'triagem'}
                    onValueChange={(v) => setForm({ ...form, status_kanban: v })}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-10 bg-gray-50/80 border-gray-200 transition-all w-full sm:w-[150px]',
                        camposDestacados.status &&
                          'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="triagem">Triagem</SelectItem>
                      <SelectItem value="a_fazer">A Fazer</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* VÍNCULO (ORIGEM) compacto à direita do Status na mesma linha */}
                <div className="space-y-1.5 w-full sm:flex-1 sm:min-w-0">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block truncate">
                    Vínculo (Origem)
                  </Label>
                  <div className="flex items-center gap-1.5 w-full">
                    {contextoProjeto?.id ? (
                      /* Contexto B: projeto pré-selecionado e travado como texto */
                      <div className="h-10 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-md text-xs font-semibold text-gray-800 w-full truncate">
                        Projeto: {contextoProjeto.nome}
                      </div>
                    ) : (
                      /* Contexto A: opções Nenhum | Tarefa | Contrato | Ata | Projeto */
                      <Select
                        value={form.vinculo_tipo || ' '}
                        onValueChange={(v) => {
                          const vt = v === ' ' ? '' : v
                          setForm({
                            ...form,
                            vinculo_tipo: vt,
                            vinculo_id: vt === 'projeto' ? form.vinculo_id : '',
                            projeto_id: vt === 'projeto' ? form.projeto_id : '',
                            marco_id: vt === 'projeto' ? form.marco_id : '',
                          })
                        }}
                      >
                        <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200 transition-all w-full">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value=" ">Nenhum</SelectItem>
                          <SelectItem value="tarefa">Tarefa</SelectItem>
                          <SelectItem value="contrato">Contrato</SelectItem>
                          <SelectItem value="ata">Ata</SelectItem>
                          <SelectItem value="projeto">Projeto</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>

              {/* Texto de apoio discreto (11px cinza) quando Vínculo = Projeto em Contexto A */}
              {!contextoProjeto?.id && form.vinculo_tipo === 'projeto' && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Ao vincular a um projeto, a tarefa passa a contar no progresso e precisa estar em
                  um marco.
                </p>
              )}

              {/* Seleção de Projeto e Marco se Vínculo = Projeto (Contexto A ou Contexto B) */}
              {(form.vinculo_tipo === 'projeto' || !!contextoProjeto?.id) && (
                <div className="p-3 bg-emerald-50/40 rounded-lg border border-emerald-100 space-y-3 mt-2">
                  {/* Select de Projeto (só editável em Contexto A) */}
                  {!contextoProjeto?.id && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-700">
                        Projeto <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={form.projeto_id || form.vinculo_id || ''}
                        onValueChange={(projId) => {
                          setForm({
                            ...form,
                            vinculo_tipo: 'projeto',
                            vinculo_id: projId,
                            projeto_id: projId,
                            marco_id: '',
                          })
                          setErroMarco('')
                        }}
                      >
                        <SelectTrigger className="h-10 bg-white border-gray-200 text-xs">
                          <SelectValue placeholder="Selecione o projeto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {listaProjetos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Select de Marco (obrigatório com asterisco vermelho) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="select-marco-tarefa"
                        className={cn(
                          'text-xs font-bold flex items-center gap-1',
                          erroMarco ? 'text-red-600' : 'text-gray-700',
                        )}
                      >
                        <span>Marco</span>
                        <span className="text-red-500">*</span>
                      </Label>
                      {idProjetoAtivo && (
                        <button
                          type="button"
                          onClick={() => {
                            setErroNovoMarco('')
                            setNovoMarcoNome('')
                            setNovoMarcoData('')
                            setNovoMarcoModalAberto(true)
                          }}
                          className="text-[11px] font-semibold text-[#1B5E20] hover:underline"
                        >
                          + Novo marco
                        </button>
                      )}
                    </div>

                    {!idProjetoAtivo ? (
                      <p className="text-xs text-gray-500 italic">
                        Selecione primeiro um projeto para visualizar os marcos.
                      </p>
                    ) : carregandoMarcos ? (
                      <p className="text-xs text-gray-500">Carregando marcos do projeto...</p>
                    ) : marcosDisponiveis.length === 0 ? (
                      /* Bloco âmbar inline no lugar do select se o projeto não tiver marcos */
                      <div
                        role="alert"
                        className="p-3 rounded-lg border border-amber-300 bg-amber-50/90 text-amber-900 space-y-2"
                      >
                        <p className="text-xs font-medium">
                          Este projeto ainda não possui marcos. Cadastre um marco para poder
                          vincular tarefas.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setErroNovoMarco('')
                            setNovoMarcoNome('')
                            setNovoMarcoData('')
                            setNovoMarcoModalAberto(true)
                          }}
                          className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs font-semibold"
                        >
                          Criar marco agora
                        </Button>
                      </div>
                    ) : (
                      /* Select de Marco */
                      <>
                        <Select
                          value={form.marco_id || ''}
                          onValueChange={(mId) => {
                            setForm({ ...form, marco_id: mId })
                            setErroMarco('')
                          }}
                        >
                          <SelectTrigger
                            ref={selectMarcoTriggerRef}
                            id="select-marco-tarefa"
                            aria-invalid={!!erroMarco}
                            aria-describedby={erroMarco ? 'erro-marco-desc' : undefined}
                            className={cn(
                              'h-10 bg-white border-gray-200 text-xs',
                              erroMarco && 'border-red-500 ring-2 ring-red-200',
                            )}
                          >
                            <SelectValue placeholder="Selecione o marco..." />
                          </SelectTrigger>
                          <SelectContent>
                            {marcosDisponiveis.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Mensagem amigável de erro acessível */}
                        {erroMarco && (
                          <p
                            id="erro-marco-desc"
                            role="alert"
                            className="text-xs font-medium text-red-600 flex items-center gap-1.5 mt-1"
                          >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>{erroMarco}</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PARCEIROS/CONTATOS RESPONSÁVEIS (obrigatório) em largura total */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider flex items-center gap-2',
                    camposSinalizados.parceiros ? 'text-red-600' : 'text-gray-500',
                  )}
                >
                  <span>Parceiros/Contatos Responsáveis *</span>
                  {camposDestacados.parceiros && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                      Preenchido por IA
                    </span>
                  )}
                </Label>
                <span
                  className={cn(
                    'text-[11px] font-bold',
                    (form.parceiro_ids || []).length > 0 ? 'text-[#1B5E20]' : 'text-amber-600',
                  )}
                >
                  {(form.parceiro_ids || []).length} selecionado(s)
                </span>
              </div>

              {/* Popover com busca e seleção de parceiros */}
              <Popover modal open={popoverParceiroAberto} onOpenChange={setPopoverParceiroAberto}>
                <PopoverTrigger asChild>
                  <Button
                    ref={triggerParceiroRef}
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between h-10 bg-gray-50/80 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60 transition-all',
                      camposSinalizados.parceiros &&
                        'border-red-400 bg-red-50/40 ring-2 ring-red-300',
                      camposDestacados.parceiros &&
                        'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                    )}
                  >
                    <span className="truncate">
                      {(form.parceiro_ids || []).length === 0
                        ? 'Buscar parceiro...'
                        : `${(form.parceiro_ids || []).length} parceiro(s) selecionado(s)`}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                      {(form.parceiro_ids || []).length} selecionado(s)
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-3rem)] sm:w-[480px] p-2 bg-white"
                  align="start"
                >
                  <div className="space-y-2">
                    {/* Campo de busca interno */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3" />
                      <Input
                        value={buscaParceiro}
                        onChange={(e) => setBuscaParceiro(e.target.value)}
                        placeholder="Buscar parceiro por nome ou empresa..."
                        className="h-9 pl-8 text-xs bg-gray-50"
                      />
                    </div>

                    {/* Cadastrar novo como primeiro item */}
                    <button
                      type="button"
                      onClick={() => {
                        setPopoverParceiroAberto(false)
                        onAbrirNovoParceiro()
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-xs font-semibold text-[#1B5E20] bg-emerald-50/80 hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Cadastrar novo</span>
                    </button>

                    {/* Lista rolável de parceiros */}
                    <div
                      className="max-h-56 overflow-y-auto overscroll-contain space-y-1"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {parceirosFiltrados.length === 0 ? (
                        <p className="text-[11px] text-gray-400 text-center py-3">
                          Nenhum parceiro encontrado com esse nome.
                        </p>
                      ) : (
                        parceirosFiltrados.map((p) => {
                          const sel = (form.parceiro_ids || []).includes(p.id)
                          const empRotulo =
                            p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(', ') : '')
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setForm((f) => {
                                  const cur = f.parceiro_ids || []
                                  const exists = cur.includes(p.id)
                                  const novoIds = exists
                                    ? cur.filter((x: string) => x !== p.id)
                                    : [...cur, p.id]
                                  const nomeLimpoParceiro = limparTextoResponsavel(p.nome)
                                  return {
                                    ...f,
                                    parceiro_ids: novoIds,
                                    responsavel: !f.responsavel ? nomeLimpoParceiro : f.responsavel,
                                  }
                                })
                                if (camposSinalizados.parceiros) {
                                  setCamposSinalizados((prev) => ({ ...prev, parceiros: false }))
                                }
                              }}
                              className={cn(
                                'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                                sel
                                  ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                  : 'hover:bg-gray-50 text-gray-800',
                              )}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span
                                  className={cn(
                                    'h-4 w-4 rounded-xs border flex items-center justify-center text-[10px]',
                                    sel
                                      ? 'bg-[#1B5E20] border-[#1B5E20] text-white'
                                      : 'border-gray-300',
                                  )}
                                >
                                  {sel ? '✓' : ''}
                                </span>
                                <span className="truncate">
                                  {limparTextoResponsavel(p.nome) || p.nome}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                                {empRotulo ? `(${empRotulo})` : `(${p.tipo})`}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Badges de parceiros selecionados */}
              {(form.parceiro_ids || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(form.parceiro_ids || []).map((pid: string) => {
                    const pObj = parceiros.find((p) => p.id === pid)
                    return (
                      <span
                        key={pid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                      >
                        {pObj?.nome ? limparTextoResponsavel(pObj.nome) : pid}
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({
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

              {camposSinalizados.parceiros && (
                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Campo obrigatório — vincule pelo menos um parceiro/contato responsável.
                </p>
              )}
            </div>

            {/* 4) DESCRIÇÃO com altura reduzida (~3 linhas) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                <span>Descrição</span>
                {camposDestacados.descricao && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs animate-pulse">
                    Preenchido por IA
                  </span>
                )}
              </Label>
              <Textarea
                value={form.descricao || ''}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="Detalhes ou orientações sobre a tarefa..."
                className={cn(
                  'bg-gray-50/80 border-gray-200 text-xs sm:text-sm resize-none transition-all',
                  camposDestacados.descricao &&
                    'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-300 shadow-xs',
                )}
              />
            </div>

            {/* 4) ANEXOS: linha compacta com ícone de clipe e contador dinâmico */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50/60 hover:bg-gray-100/50 transition-colors">
                <label className="flex items-center gap-2 cursor-pointer flex-1">
                  <Paperclip className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-600 font-medium">
                    {anexosExistentes.length + arquivosNovos.length} anexos —{' '}
                    <span className="text-[#1B5E20] font-semibold underline underline-offset-2">
                      clique para adicionar
                    </span>
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf,.docx,.xlsx,.txt,.csv,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const fl = Array.from(e.target.files || [])
                      const LIMITE_TAMANHO = 25 * 1024 * 1024 // 25MB
                      const validos: File[] = []
                      for (const f of fl) {
                        if (f.size > LIMITE_TAMANHO) {
                          setDialogErro(
                            `Arquivo "${f.name}" excede o limite máximo permitido de 25MB.`,
                          )
                        } else {
                          validos.push(f)
                        }
                      }
                      if (validos.length > 0) {
                        setArquivosNovos((prev) => [...prev, ...validos])
                      }
                      e.target.value = ''
                    }}
                  />
                </label>

                {/* Ação de alternar expansão para ver detalhes dos anexos */}
                {(anexosExistentes.length > 0 || arquivosNovos.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setExpandirAnexos(!expandirAnexos)}
                    className="text-xs text-[#1B5E20] font-semibold hover:underline px-2 py-1"
                  >
                    {expandirAnexos ? 'Ocultar anexos' : 'Ver anexos'}
                  </button>
                )}
              </div>

              {/* Lista compacta de anexos (expandida quando clicado ou quando houver novos) */}
              {(expandirAnexos || anexosExistentes.length > 0 || arquivosNovos.length > 0) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Anexos existentes no PocketBase */}
                  {anexosExistentes.map((nome, idx) => {
                    const urlArquivo = editando ? pb.files.getURL(editando, nome) : ''
                    const ext = nome.split('.').pop()?.toLowerCase() || ''
                    const ehFoto = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
                    const ehVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'avi', 'mkv'].includes(ext)

                    return (
                      <div
                        key={`existente-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs"
                      >
                        {ehFoto ? (
                          <span className="text-[10px] font-bold px-1 rounded bg-emerald-100 text-[#1B5E20]">
                            FOTO
                          </span>
                        ) : ehVideo ? (
                          <span className="text-[10px] font-bold px-1 rounded bg-purple-100 text-purple-800">
                            VÍDEO
                          </span>
                        ) : (
                          <Paperclip className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                        )}
                        <span className="max-w-[150px] truncate font-medium" title={nome}>
                          {nome}
                        </span>

                        {urlArquivo && (
                          <a
                            href={urlArquivo}
                            target="_blank"
                            rel="noreferrer"
                            className="p-0.5 rounded text-[#1B5E20] hover:bg-emerald-100"
                            title="Visualizar anexo"
                          >
                            <Eye className="h-3 w-3" />
                          </a>
                        )}

                        {urlArquivo && (
                          <a
                            href={urlArquivo}
                            download={nome}
                            target="_blank"
                            rel="noreferrer"
                            className="p-0.5 rounded text-[#1B5E20] hover:bg-emerald-100"
                            title="Baixar anexo"
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setAnexosExistentes((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-emerald-700 hover:text-red-600 p-0.5 rounded-full"
                          title="Remover anexo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}

                  {/* Anexos novos a salvar */}
                  {arquivosNovos.map((arq, idx) => {
                    const ext = arq.name.split('.').pop()?.toLowerCase() || ''
                    const ehFoto =
                      arq.type.startsWith('image/') ||
                      ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
                    const ehVideo =
                      arq.type.startsWith('video/') ||
                      ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'avi', 'mkv'].includes(ext)

                    const abrirPreviewNovo = () => {
                      try {
                        const objUrl = URL.createObjectURL(arq)
                        window.open(objUrl, '_blank')
                      } catch (err) {
                        console.error('Falha ao abrir preview:', err)
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
                        console.error('Falha ao baixar:', err)
                      }
                    }

                    return (
                      <div
                        key={`novo-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs"
                      >
                        {ehFoto ? (
                          <span className="text-[10px] font-bold px-1 rounded bg-amber-100 text-amber-800">
                            FOTO
                          </span>
                        ) : ehVideo ? (
                          <span className="text-[10px] font-bold px-1 rounded bg-purple-100 text-purple-800">
                            VÍDEO
                          </span>
                        ) : (
                          <UploadCloud className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span className="max-w-[140px] truncate font-medium" title={arq.name}>
                          {arq.name}
                        </span>

                        <button
                          type="button"
                          onClick={abrirPreviewNovo}
                          className="p-0.5 rounded text-amber-800 hover:bg-amber-100"
                          title="Visualizar anexo"
                        >
                          <Eye className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={baixarArquivoNovo}
                          className="p-0.5 rounded text-amber-800 hover:bg-amber-100"
                          title="Baixar anexo"
                        >
                          <Download className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setArquivosNovos((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-amber-700 hover:text-red-600 p-0.5 rounded-full"
                          title="Remover anexo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Alerta de erro do formulário */}
            {dialogErro && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                <span>{dialogErro}</span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* 5) RODAPÉ FIXO NA BASE DO MODAL */}
        {/* ============================================================== */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3 shrink-0">
          {/* Lado esquerdo: Salvar rascunho (continua funcionando SEM marco em ambos os contextos) */}
          <button
            type="button"
            onClick={() => handleSalvarComValidacao(true, fraseIaAplicada)}
            disabled={salvando}
            className="text-xs sm:text-[13px] font-medium text-gray-500 hover:text-gray-800 transition-colors underline-offset-2 hover:underline disabled:opacity-50"
          >
            Salvar rascunho
          </button>

          {/* Lado direito: Cancelar e botão principal verde "Criar tarefa" / "Salvar alterações" */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (ouvindo) pararOuvir()
                onOpenChange(false)
                setDialogErro('')
                setErroMarco('')
              }}
              disabled={salvando}
              className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-200 hover:bg-gray-50"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={() => handleSalvarComValidacao(false, fraseIaAplicada)}
              disabled={
                salvando ||
                // Botão "Criar tarefa" desabilitado (opacity .5) enquanto não houver marco selecionável em contexto de projeto
                (!!contextoProjeto?.id && marcosDisponiveis.length === 0)
              }
              className={cn(
                'h-9 px-5 text-xs font-bold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center gap-1.5',
                !!contextoProjeto?.id &&
                  marcosDisponiveis.length === 0 &&
                  'opacity-50 cursor-not-allowed',
              )}
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>{editando ? 'Salvar alterações' : 'Criar tarefa'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Modal enxuto para criar novo marco inline (nome e data prevista; ao salvar seleciona) */}
      <Dialog open={novoMarcoModalAberto} onOpenChange={setNovoMarcoModalAberto}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900">
              Novo Marco do Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">
                Nome do Marco <span className="text-red-500">*</span>
              </Label>
              <Input
                value={novoMarcoNome}
                onChange={(e) => setNovoMarcoNome(e.target.value)}
                placeholder="Ex.: Fase 1 - Planejamento"
                className="h-9 text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">Data Prevista</Label>
              <Input
                type="date"
                value={novoMarcoData}
                onChange={(e) => setNovoMarcoData(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            {erroNovoMarco && (
              <p role="alert" className="text-xs text-red-600 font-medium">
                {erroNovoMarco}
              </p>
            )}
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNovoMarcoModalAberto(false)}
              disabled={salvandoNovoMarco}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={salvarNovoMarcoInline}
              disabled={salvandoNovoMarco}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs font-semibold"
            >
              {salvandoNovoMarco ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Salvar marco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
