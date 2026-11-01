import React, { useState, useRef, useEffect } from 'react'
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
  UploadCloud,
  Eye,
  Download,
  ChevronDown,
  Search,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  onSalvar: (isRascunho?: boolean) => Promise<void>
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
}: TarefaFormDialogProps) {
  // Bloco de Captura IA
  const [iaPrompt, setIaPrompt] = useState('')
  const [gerandoIa, setGerandoIa] = useState(false)
  const [iaAnexandoArquivo, setIaAnexandoArquivo] = useState(false)

  // Áudio
  const [ouvindo, setOuvindo] = useState(false)
  const [processandoAudio, setProcessandoAudio] = useState(false)
  const recRef = useRef<any>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])

  // Busca e dropdown de Parceiros
  const [buscaParceiro, setBuscaParceiro] = useState('')
  const [popoverParceiroAberto, setPopoverParceiroAberto] = useState(false)

  // Expandir lista de anexos
  const [expandirAnexos, setExpandirAnexos] = useState(false)

  // Sinalização de campos obrigatórios não preenchidos pela IA ou pelo usuário
  const [camposSinalizados, setCamposSinalizados] = useState<{
    titulo?: boolean
    parceiros?: boolean
  }>({})

  // Limpa estados ao fechar ou reabrir
  useEffect(() => {
    if (!open) {
      pararOuvir()
      setIaPrompt('')
      setCamposSinalizados({})
      setExpandirAnexos(false)
    }
  }, [open])

  // Parar áudio
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

  // Transcrever áudio via backend
  const transcreverAudioBlob = async (blob: Blob) => {
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
          : 'Não foi possível transcrever o áudio gravado.',
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
        description: 'Fale sua tarefa. Ao terminar, clique em "Parar gravação".',
      })
    } catch (err: any) {
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        toast({
          title: 'Permissão de microfone negada',
          description:
            'Permita o acesso ao microfone nas permissões do navegador (ícone de cadeado).',
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

  // Alternar gravação por voz
  const toggleOuvir = async () => {
    if (ouvindo) {
      pararOuvir()
      return
    }

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
            toast({
              title: 'Permissão de microfone negada',
              description:
                'Permita o acesso ao microfone nas configurações do navegador (ícone de cadeado).',
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
            description: 'Fale sua tarefa. O texto será reconhecido automaticamente no campo.',
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
            setIaPrompt(total)
          }
        }

        rec.onerror = (ev: any) => {
          const errCode = ev.error || ''
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            toast({
              title: 'Permissão de microfone negada',
              description: 'O acesso ao microfone foi negado nas configurações.',
              variant: 'destructive',
            })
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
        console.warn('SpeechRecognition falhou ao iniciar, usando fallback MediaRecorder:', err)
      }
    }

    if (typeof MediaRecorder !== 'undefined') {
      await iniciarGravacaoMediaRecorder()
      return
    }

    toast({
      title: 'Navegador incompatível',
      description: 'Seu navegador não suporta Web Speech API nem gravação de mídia.',
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

  // Ação principal de IA: "Gerar tarefa"
  const gerarTarefaComIa = async () => {
    if (!iaPrompt.trim()) {
      toast({
        title: 'Descreva a tarefa',
        description: 'Digite uma frase ou dite por áudio antes de clicar em Gerar tarefa.',
        variant: 'destructive',
      })
      return
    }

    setGerandoIa(true)
    setDialogErro('')
    try {
      const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
        method: 'POST',
        body: JSON.stringify({ alvo: 'tarefa', texto: iaPrompt }),
      })) as any

      const e = r.estrutura || {}

      // Mapeamento de empresa sugerida
      let empresaFinal = form.empresa
      if (e.empresa) {
        const empNome = String(e.empresa).trim().toLowerCase()
        const matchEmp = empresas.find(
          (emp) => emp.nome.toLowerCase() === empNome || emp.nome.toLowerCase().includes(empNome),
        )
        if (matchEmp) {
          empresaFinal = matchEmp.nome
        } else if (empNome === 'cpf') {
          empresaFinal = 'CPF'
        } else if (e.empresa) {
          empresaFinal = e.empresa
        }
      }

      // Mapeamento de responsável e parceiros sugeridos
      let respFinal = e.responsavel || form.responsavel || ''
      const novosParceiroIds: string[] = [...(form.parceiro_ids || [])]

      const nomesSugeridos: string[] = [
        ...(Array.isArray(e.parceiros_sugeridos) ? e.parceiros_sugeridos : []),
        ...(e.responsavel ? [e.responsavel] : []),
      ]

      for (const nomeSug of nomesSugeridos) {
        const nNorm = String(nomeSug || '')
          .trim()
          .toLowerCase()
        if (!nNorm) continue
        const matchParceiro = parceiros.find((p) => {
          const pNorm = String(p.nome || '')
            .trim()
            .toLowerCase()
          return pNorm === nNorm || pNorm.includes(nNorm) || nNorm.includes(pNorm)
        })
        if (matchParceiro) {
          if (!novosParceiroIds.includes(matchParceiro.id)) {
            novosParceiroIds.push(matchParceiro.id)
          }
          if (!respFinal) {
            respFinal = matchParceiro.nome
          }
        }
      }

      // Prioridade mapeada (P1, P2, P3)
      let prioridadeFinal: 'P1' | 'P2' | 'P3' = 'P2'
      if (e.prioridade_p === 'P1' || e.prioridade_p === 'P3' || e.prioridade_p === 'P2') {
        prioridadeFinal = e.prioridade_p
      }

      // Status kanban
      let statusFinal = form.status_kanban || 'a_fazer'
      if (e.status_kanban) {
        statusFinal = e.status_kanban
      }

      // Recorrência
      let recorrenciaFinal = form.recorrencia || 'Nenhuma'
      if (e.recorrencia) {
        recorrenciaFinal = e.recorrencia
      }

      const novoForm: TarefaFormData = {
        ...form,
        titulo: e.titulo ? String(e.titulo).trim() : form.titulo,
        descricao: e.descricao ? String(e.descricao).trim() : form.descricao,
        responsavel: respFinal,
        prazo: e.prazo ? String(e.prazo).slice(0, 10) : form.prazo,
        recorrencia: recorrenciaFinal,
        prioridade_p: prioridadeFinal,
        status_kanban: statusFinal,
        empresa: empresaFinal,
        vinculo_tipo: e.vinculo_tipo !== undefined ? e.vinculo_tipo : form.vinculo_tipo,
        vinculo_id: e.vinculo_id !== undefined ? e.vinculo_id : form.vinculo_id,
        parceiro_ids: novosParceiroIds,
      }

      setForm(novoForm)

      // Checa campos obrigatórios: Título e Parceiros
      const faltamObrigatorios: { titulo?: boolean; parceiros?: boolean } = {}
      if (!novoForm.titulo || !novoForm.titulo.trim()) {
        faltamObrigatorios.titulo = true
      }
      if (!novoForm.parceiro_ids || novoForm.parceiro_ids.length === 0) {
        faltamObrigatorios.parceiros = true
      }
      setCamposSinalizados(faltamObrigatorios)

      if (faltamObrigatorios.titulo || faltamObrigatorios.parceiros) {
        toast({
          title: 'Tarefa gerada com campos pendentes',
          description:
            'A IA preencheu os dados disponíveis. Complete os campos obrigatórios destacados antes de salvar.',
        })
      } else {
        toast({
          title: 'Tarefa gerada com sucesso!',
          description: 'Os campos foram preenchidos pela IA e estão prontos para conferência.',
        })
      }
    } catch (e: any) {
      console.error('Erro ao gerar tarefa com IA:', e)
      toast({
        title: 'Não foi possível estruturar via IA',
        description: 'Você pode preencher o formulário manualmente abaixo sem bloqueio.',
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
            {/* Rótulo com ícone */}
            <div className="flex items-center gap-1.5 text-[#1B5E20] font-bold text-[13px]">
              <Sparkles className="h-4 w-4 text-[#1B5E20]" />
              <span>Criar com IA</span>
              {ouvindo && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-100/90 px-2 py-0.5 rounded-full animate-pulse">
                  ● Gravando áudio...
                </span>
              )}
              {processandoAudio && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo...
                </span>
              )}
              {iaAnexandoArquivo && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lendo arquivo...
                </span>
              )}
            </div>

            {/* Campo de texto amplo com instrução exata */}
            <Textarea
              value={iaPrompt}
              onChange={(e) => setIaPrompt(e.target.value)}
              placeholder="Descreva a tarefa em uma frase. Ex.: Emitir os recibos de locação da Foldbox todo dia 1º, responsável Leonardo."
              rows={3}
              className="w-full bg-white border border-emerald-200/80 focus-visible:ring-[#1B5E20] focus-visible:border-[#1B5E20] rounded-lg text-sm text-gray-800 placeholder:text-gray-400 resize-none shadow-2xs"
            />

            {/* Rodapé do bloco: 3 botões alinhados (Ditar por áudio, Anexar arquivo e Gerar tarefa) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Botão: Ditar por áudio */}
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
                  <Mic className={cn('h-3.5 w-3.5', ouvindo ? 'text-red-600' : 'text-[#1B5E20]')} />
                  <span>{ouvindo ? 'Parar gravação' : 'Ditar por áudio'}</span>
                </Button>

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

              {/* Botão principal verde: Gerar tarefa */}
              <Button
                type="button"
                onClick={gerarTarefaComIa}
                disabled={gerandoIa || processandoAudio}
                className="h-9 px-4 text-xs font-bold rounded-full bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center justify-center gap-1.5 shrink-0"
              >
                {gerandoIa ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{gerandoIa ? 'Gerando tarefa...' : 'Gerar tarefa'}</span>
              </Button>
            </div>
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
                  'text-xs font-bold uppercase tracking-wider',
                  camposSinalizados.titulo ? 'text-red-600' : 'text-gray-500',
                )}
              >
                Título *
              </Label>
              <Input
                value={form.titulo || ''}
                onChange={(e) => {
                  setForm({ ...form, titulo: e.target.value })
                  if (camposSinalizados.titulo && e.target.value.trim()) {
                    setCamposSinalizados((prev) => ({ ...prev, titulo: false }))
                  }
                }}
                placeholder="Ex.: Emitir recibos de locação"
                className={cn(
                  'h-11 text-base font-semibold text-gray-900 bg-gray-50/70 border-gray-200 focus-visible:ring-[#1B5E20] focus-visible:border-[#1B5E20]',
                  camposSinalizados.titulo && 'border-red-400 bg-red-50/40 ring-1 ring-red-300',
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
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Select
                  value={form.empresa || ' '}
                  onValueChange={(v) => setForm({ ...form, empresa: v === ' ' ? '' : v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200">
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
                    {/* Opção "CPF" exclusiva do dropdown Empresa deste diálogo */}
                    <SelectItem value="CPF">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>CPF</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RESPONSÁVEL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Responsável
                </Label>
                <Select
                  value={form.responsavel || ' '}
                  onValueChange={(v) => {
                    if (v === '__cadastrar_novo__') {
                      onAbrirNovoParceiro()
                      return
                    }
                    const novoNome = v === ' ' ? '' : v
                    setForm((f) => {
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
                  <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200">
                    <SelectValue placeholder="Não definido" />
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

            {/* Linha 2: PRAZO e RECORRÊNCIA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* PRAZO */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                  Prazo
                </Label>
                <Input
                  type="date"
                  value={form.prazo || ''}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  className="h-10 bg-gray-50/80 border-gray-200"
                />
              </div>

              {/* RECORRÊNCIA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5 text-[#1B5E20]" />
                  Recorrência
                </Label>
                <Select
                  value={form.recorrencia || 'Nenhuma'}
                  onValueChange={(v) => setForm({ ...form, recorrencia: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200">
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

            {/* Linha 3: PRIORIDADE (3 opções lado a lado com Normal pré-selecionada) e STATUS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* PRIORIDADE */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prioridade
                </Label>
                <div className="grid grid-cols-3 gap-1 bg-gray-100/90 p-1 rounded-lg border border-gray-200/80">
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

              {/* STATUS */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </Label>
                <Select
                  value={form.status_kanban || 'a_fazer'}
                  onValueChange={(v) => setForm({ ...form, status_kanban: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_fazer">A Fazer</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha complementar: VÍNCULO (ORIGEM) mantido com proporcionalidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vínculo (Origem)
                </Label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <Select
                    value={form.vinculo_tipo || ' '}
                    onValueChange={(v) => {
                      const vt = v === ' ' ? '' : v
                      setForm({ ...form, vinculo_tipo: vt, vinculo_id: vt ? form.vinculo_id : '' })
                    }}
                  >
                    <SelectTrigger className="h-10 bg-gray-50/80 border-gray-200 w-full sm:w-1/2">
                      <SelectValue placeholder="Nenhum vínculo" />
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
                      placeholder="Identificador ou Código (opcional)"
                      className="h-10 bg-gray-50/80 border-gray-200 w-full sm:w-1/2 text-xs"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* PARCEIROS/CONTATOS RESPONSÁVEIS (obrigatório) em largura total */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    camposSinalizados.parceiros ? 'text-red-600' : 'text-gray-500',
                  )}
                >
                  Parceiros/Contatos Responsáveis *
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
              <Popover open={popoverParceiroAberto} onOpenChange={setPopoverParceiroAberto}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between h-10 bg-gray-50/80 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60',
                      camposSinalizados.parceiros &&
                        'border-red-400 bg-red-50/40 ring-1 ring-red-300',
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
                    <div className="max-h-56 overflow-y-auto space-y-1">
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
                                  return {
                                    ...f,
                                    parceiro_ids: novoIds,
                                    responsavel: !f.responsavel ? p.nome : f.responsavel,
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
                                <span className="truncate">{p.nome}</span>
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
                        {pObj?.nome || pid}
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
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Descrição
              </Label>
              <Textarea
                value={form.descricao || ''}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="Detalhes ou orientações sobre a tarefa..."
                className="bg-gray-50/80 border-gray-200 text-xs sm:text-sm resize-none"
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
                    return (
                      <div
                        key={`existente-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
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
                        <UploadCloud className="h-3.5 w-3.5 text-amber-600 shrink-0" />
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
          {/* Lado esquerdo: Salvar rascunho */}
          <button
            type="button"
            onClick={() => onSalvar(true)}
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
              }}
              disabled={salvando}
              className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-200 hover:bg-gray-50"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={() => onSalvar(false)}
              disabled={salvando}
              className="h-9 px-5 text-xs font-bold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center gap-1.5"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>{editando ? 'Salvar alterações' : 'Criar tarefa'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
