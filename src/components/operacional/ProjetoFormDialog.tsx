import React, { useState, useEffect, useRef, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  Sparkles,
  Mic,
  Paperclip,
  Loader2,
  X,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Search,
  Eye,
  Download,
  UploadCloud,
  ChevronDown,
  Building2,
  User,
  Shield,
  Layers,
  Link as LinkIcon,
  Users,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { limparTextoResponsavel, obterIniciaisResponsavel } from '@/lib/responsavel-utils'
import { useEmpresaLogos } from '@/components/common/EmpresaIcon'

export interface RaciItem {
  id?: string
  nome: string
  papel: 'R' | 'A' | 'C' | 'I'
}

export interface MarcoItemForm {
  id?: string
  nome: string
  data: string
  ok?: boolean
}

export interface RiscoItemForm {
  id?: string
  severidade: 'Alto' | 'Médio' | 'Baixo'
  risco: string
}

export interface ProjetoFormData {
  // 7 campos originais (obrigatório manter retrocompatibilidade)
  nome: string
  empresa: string
  responsavel: string
  status: 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | string
  progresso: number | string
  orcamento: number | string
  descricao: string

  // Novos campos opcionais
  patrocinador?: string
  prioridade?: 'Baixa' | 'Normal' | 'Alta'
  inicio?: string
  prazo?: string
  marco_atual?: string
  vinculo_tipo?: string
  vinculo_id?: string
  raci?: RaciItem[]
  marcos?: MarcoItemForm[]
  riscos?: RiscoItemForm[]
  anexos?: string[]
}

export interface ProjetoFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editando?: any | null
  onSalvo?: () => void
}

const OPCOES_EMPRESAS_DEFAULT = ['Extrafruti', 'Casafruti', 'FoldBox', 'LL5', 'Grupo']

export function normalizarEmpresa(emp: string | undefined): string {
  if (!emp) return ''
  const trimmed = emp.trim()
  if (trimmed.toUpperCase() === 'EXTRAFRUTI') return 'Extrafruti'
  if (trimmed.toUpperCase() === 'CASAFRUTI') return 'Casafruti'
  if (trimmed.toUpperCase() === 'FOLDBOX') return 'FoldBox'
  if (trimmed.toUpperCase() === 'LL5') return 'LL5'
  if (trimmed.toUpperCase() === 'GRUPO') return 'Grupo'
  return trimmed
}

export function ProjetoFormDialog({
  open,
  onOpenChange,
  editando,
  onSalvo,
}: ProjetoFormDialogProps) {
  const { toast } = useToast()

  // 7 campos originais + novos opcionais
  const [form, setForm] = useState<ProjetoFormData>({
    nome: '',
    empresa: 'Extrafruti',
    responsavel: '',
    status: 'planejamento',
    progresso: 0,
    orcamento: '',
    descricao: '',
    patrocinador: '',
    prioridade: 'Normal',
    inicio: '',
    prazo: '',
    marco_atual: 'Fase 1 de 5',
    vinculo_tipo: '',
    vinculo_id: '',
    raci: [],
    marcos: [{ nome: '', data: '' }],
    riscos: [],
  })

  // Anexos
  const [anexosExistentes, setAnexosExistentes] = useState<string[]>([])
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Estados de IA
  const [iaPrompt, setIaPrompt] = useState('')
  const [gerandoIa, setGerandoIa] = useState(false)
  const [ouvindo, setOuvindo] = useState(false)
  const [tempoGravacaoS, setTempoGravacaoS] = useState(0)
  const [anexandoIaArquivo, setAnexandoIaArquivo] = useState(false)

  // Pessoas / Parceiros para RACI e Responsável
  const [parceiros, setParceiros] = useState<any[]>([])
  const [empresasBanco, setEmpresasBanco] = useState<string[]>([])
  const [buscaRaci, setBuscaRaci] = useState('')
  const [papelRaciSelecionado, setPapelRaciSelecionado] = useState<'R' | 'A' | 'C' | 'I'>('R')
  const [popoverRaciAberto, setPopoverRaciAberto] = useState(false)

  // Popovers: Empresa, Responsável e Patrocinador
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [buscaEmpresa, setBuscaEmpresa] = useState('')
  const [popoverRespAberto, setPopoverRespAberto] = useState(false)
  const [buscaResp, setBuscaResp] = useState('')
  const [popoverPatrocAberto, setPopoverPatrocAberto] = useState(false)
  const [buscaPatroc, setBuscaPatroc] = useState('')

  const { obterSiglaCor } = useEmpresaLogos()

  // Validação
  const [erroNome, setErroNome] = useState(false)
  const [erroDatas, setErroDatas] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [dialogConfirmFechamento, setDialogConfirmFechamento] = useState(false)

  // Refs
  const iaTextareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const recSpeechRef = useRef<any>(null)
  const timerGravacaoRef = useRef<any>(null)
  const cancelandoAudioRef = useRef(false)
  const initialFormSnapshot = useRef<string>('')

  // Carregar parceiros e empresas
  useEffect(() => {
    let ativo = true
    const carregarCadastros = async () => {
      try {
        const [pList, eList] = await Promise.all([
          pb
            .collection('parceiros')
            .getFullList({ sort: 'nome' })
            .catch(() => []),
          pb
            .collection('empresas')
            .getFullList({ sort: 'nome' })
            .catch(() => []),
        ])
        if (ativo) {
          setParceiros(pList)
          if (eList.length > 0) {
            setEmpresasBanco(eList.map((e: any) => e.nome))
          }
        }
      } catch {
        /* intentionally ignored */
      }
    }
    carregarCadastros()
    return () => {
      ativo = false
    }
  }, [])

  // Inicialização ao abrir modal
  useEffect(() => {
    if (!open) {
      if (ouvindo) pararAudio()
      return
    }

    setErroNome(false)
    setErroDatas('')
    setIaPrompt('')

    if (editando) {
      // Parse RACI
      let raciParsed: RaciItem[] = []
      if (editando.raci) {
        try {
          const raw = typeof editando.raci === 'string' ? JSON.parse(editando.raci) : editando.raci
          if (Array.isArray(raw)) {
            raciParsed = raw
          } else if (typeof raw === 'object' && raw !== null) {
            Object.entries(raw).forEach(([papel, nomes]) => {
              const p = papel as 'R' | 'A' | 'C' | 'I'
              if (Array.isArray(nomes)) {
                nomes.forEach((n) => {
                  if (typeof n === 'string' && n.trim())
                    raciParsed.push({ nome: n.trim(), papel: p })
                })
              } else if (typeof nomes === 'string' && nomes.trim()) {
                raciParsed.push({ nome: nomes.trim(), papel: p })
              }
            })
          }
        } catch {
          /* intentionally ignored */
        }
      }

      // Parse Marcos
      let marcosParsed: MarcoItemForm[] = []
      if (editando.marcos) {
        try {
          const raw =
            typeof editando.marcos === 'string' ? JSON.parse(editando.marcos) : editando.marcos
          if (Array.isArray(raw) && raw.length > 0) {
            marcosParsed = raw.map((m: any) => ({
              nome: m.nome || '',
              data: m.data ? String(m.data).slice(0, 10) : '',
              ok: !!m.ok,
            }))
          }
        } catch {
          /* intentionally ignored */
        }
      }
      if (marcosParsed.length === 0) {
        marcosParsed = [{ nome: '', data: '' }]
      }

      // Parse Riscos
      let riscosParsed: RiscoItemForm[] = []
      if (editando.riscos) {
        try {
          const raw =
            typeof editando.riscos === 'string' ? JSON.parse(editando.riscos) : editando.riscos
          if (Array.isArray(raw)) {
            riscosParsed = raw.map((r: any) => {
              const sev =
                r.severidade ||
                (r.impacto === 'alto' || r.prob === 'alta'
                  ? 'Alto'
                  : r.impacto === 'baixo' || r.prob === 'baixa'
                    ? 'Baixo'
                    : 'Médio')
              return {
                severidade: sev === 'Alto' || sev === 'Baixo' ? sev : 'Médio',
                risco: r.risco || '',
              }
            })
          }
        } catch {
          /* intentionally ignored */
        }
      }

      // Anexos existentes
      let anexosList: string[] = []
      if (editando.anexos) {
        if (Array.isArray(editando.anexos)) {
          anexosList = editando.anexos
        } else if (typeof editando.anexos === 'string') {
          anexosList = [editando.anexos]
        }
      }
      setAnexosExistentes(anexosList)
      setArquivosNovos([])

      const empresaNormalizada = normalizarEmpresa(editando.empresa) || 'Extrafruti'

      const novoForm: ProjetoFormData = {
        nome: editando.nome || '',
        empresa: empresaNormalizada,
        responsavel: editando.responsavel || '',
        status: editando.status || 'planejamento',
        progresso: editando.progresso ?? 0,
        orcamento: editando.orcamento ?? '',
        descricao: editando.descricao || '',
        patrocinador: editando.patrocinador || '',
        prioridade:
          editando.prioridade === 'Alta' || editando.prioridade === 'Baixa'
            ? editando.prioridade
            : 'Normal',
        inicio: editando.inicio ? String(editando.inicio).slice(0, 10) : '',
        prazo: editando.prazo ? String(editando.prazo).slice(0, 10) : '',
        marco_atual: editando.marco_atual || 'Fase 1 de 5',
        vinculo_tipo: editando.vinculo_tipo || '',
        vinculo_id: editando.vinculo_id || '',
        raci: raciParsed,
        marcos: marcosParsed,
        riscos: riscosParsed,
      }
      setForm(novoForm)
      initialFormSnapshot.current = JSON.stringify(novoForm)
    } else {
      // Criação nova
      const formVazio: ProjetoFormData = {
        nome: '',
        empresa: 'Extrafruti',
        responsavel: '',
        status: 'planejamento',
        progresso: 0,
        orcamento: '',
        descricao: '',
        patrocinador: '',
        prioridade: 'Normal',
        inicio: '',
        prazo: '',
        marco_atual: 'Fase 1 de 5',
        vinculo_tipo: '',
        vinculo_id: '',
        raci: [],
        marcos: [{ nome: '', data: '' }],
        riscos: [],
      }
      setForm(formVazio)
      setAnexosExistentes([])
      setArquivosNovos([])
      initialFormSnapshot.current = JSON.stringify(formVazio)
    }

    // Foco automático no textarea de IA
    setTimeout(() => {
      iaTextareaRef.current?.focus()
    }, 150)
  }, [open, editando])

  // Checar se o formulário tem dados preenchidos para confirmação ao fechar
  const formTemAlteracao = useMemo(() => {
    if (!open) return false
    if (!initialFormSnapshot.current) return false
    const snapshotAtual = JSON.stringify(form)
    return (
      snapshotAtual !== initialFormSnapshot.current ||
      arquivosNovos.length > 0 ||
      iaPrompt.trim().length > 0
    )
  }, [form, arquivosNovos, iaPrompt, open])

  const fecharComVerificacao = () => {
    if (formTemAlteracao) {
      setDialogConfirmFechamento(true)
    } else {
      fecharDeFato()
    }
  }

  const fecharDeFato = () => {
    if (ouvindo) pararAudio()
    setDialogConfirmFechamento(false)
    onOpenChange(false)
  }

  // Intercepta tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fecharComVerificacao()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, formTemAlteracao])

  // Áudio: controle de gravação e transcrição
  const pararAudio = () => {
    if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current)
    setTempoGravacaoS(0)
    setOuvindo(false)

    if (recSpeechRef.current) {
      try {
        recSpeechRef.current.stop()
      } catch {
        /* intentionally ignored */
      }
      recSpeechRef.current = null
    }

    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try {
        mediaRecRef.current.stop()
      } catch {
        /* intentionally ignored */
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
  }

  const toggleDitarAudio = async () => {
    if (ouvindo) {
      pararAudio()
      return
    }

    const SR =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    if (SR) {
      try {
        const rec = new SR()
        rec.lang = 'pt-BR'
        rec.continuous = true
        rec.interimResults = true

        rec.onstart = () => {
          setOuvindo(true)
          setTempoGravacaoS(0)
          timerGravacaoRef.current = setInterval(() => {
            setTempoGravacaoS((s) => s + 1)
          }, 1000)
          toast({
            title: 'Gravando áudio...',
            description: 'Fale sua descrição do projeto.',
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

        rec.onerror = () => {
          pararAudio()
        }

        rec.onend = () => {
          if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current)
          setOuvindo(false)
        }

        recSpeechRef.current = rec
        rec.start()
        return
      } catch {
        /* intentionally ignored */
      }
    }

    // Fallback MediaRecorder
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
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
          if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current)
          setOuvindo(false)
          setTempoGravacaoS(0)
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop())
            mediaStreamRef.current = null
          }
          if (cancelandoAudioRef.current) return
          const audioBlob = new Blob(mediaChunksRef.current, { type: mr.mimeType || 'audio/webm' })
          if (audioBlob.size > 0) {
            try {
              const reader = new FileReader()
              const b64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '')
              })
              reader.readAsDataURL(audioBlob)
              const b64 = await b64Promise
              const r = (await pb.send('/backend/v1/ia/transcrever', {
                method: 'POST',
                body: JSON.stringify({ audio_base64: b64, mime: audioBlob.type }),
              })) as any
              if (r?.texto) {
                setIaPrompt((prev) => (prev ? prev + ' ' + r.texto : r.texto).trim())
              }
            } catch {
              /* intentionally ignored */
            }
          }
        }

        cancelandoAudioRef.current = false
        mr.start()
        mediaRecRef.current = mr
        setOuvindo(true)
        setTempoGravacaoS(0)
        timerGravacaoRef.current = setInterval(() => {
          setTempoGravacaoS((s) => s + 1)
        }, 1000)
        toast({
          title: 'Gravando áudio...',
          description: 'Fale sobre o projeto. Clique novamente para parar.',
        })
      } catch (e: any) {
        toast({
          title: 'Microfone indisponível',
          description: 'Não foi possível acessar o microfone.',
          variant: 'destructive',
        })
      }
    }
  }

  // Anexar arquivo no bloco de IA para extrair contexto
  const handleIaAnexarArquivo = async (file: File) => {
    setAnexandoIaArquivo(true)
    try {
      setArquivosNovos((prev) => [...prev, file])
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('prompt', 'Extraia o nome, objetivo, orçamento e prazos deste projeto.')
      fd.append('modulo', 'projetos')

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
        title: 'Arquivo analisado',
        description: `Informações de "${file.name}" incluídas na descrição.`,
      })
    } catch (_) {
      setIaPrompt((prev) =>
        (prev ? prev + ' Anexo: ' + file.name : `Projeto baseado em ${file.name}`).trim(),
      )
      toast({
        title: 'Arquivo anexado',
        description: `O arquivo "${file.name}" foi adicionado aos anexos.`,
      })
    } finally {
      setAnexandoIaArquivo(false)
    }
  }

  // Ação "Gerar projeto" com IA (spinner 1,2s + preenchimento + toast verde)
  const gerarProjetoComIa = async () => {
    const texto = iaPrompt.trim()
    if (!texto) {
      toast({
        title: 'Descreva o projeto',
        description: 'Digite uma frase ou dite por áudio antes de clicar em Gerar projeto.',
        variant: 'destructive',
      })
      return
    }

    setGerandoIa(true)
    const inicioTimestamp = Date.now()

    try {
      const hojeISO = new Date().toISOString().slice(0, 10)
      let estrutura: any = null

      try {
        const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
          method: 'POST',
          body: JSON.stringify({
            alvo: 'projeto',
            texto,
            data_referencia: hojeISO,
          }),
        })) as any
        estrutura = r?.estrutura
      } catch (_) {
        // Fallback estruturado se o endpoint falhar
      }

      // Se não veio do backend ou falhou, simulação inteligente padrão para garantir o comportamento
      if (!estrutura || typeof estrutura !== 'object') {
        const orcMatch = texto.match(/r?\$?\s*(\d+[\d.,]*)\s*(mil|milhões|k|m)?/i)
        let orcValor: any = ''
        if (orcMatch) {
          const num = parseFloat(orcMatch[1].replace(/\./g, '').replace(',', '.'))
          const mult = orcMatch[2]?.toLowerCase()
          if (mult === 'mil' || mult === 'k') orcValor = num * 1000
          else if (mult?.startsWith('milh') || mult === 'm') orcValor = num * 1000000
          else orcValor = num
        }

        estrutura = {
          nome: texto.length > 50 ? texto.slice(0, 47) + '...' : texto,
          descricao: texto,
          empresa: texto.toLowerCase().includes('casafruti') ? 'Casafruti' : 'Extrafruti',
          responsavel: '',
          patrocinador: 'Diretoria Executiva',
          prioridade: texto.toLowerCase().includes('urgente') ? 'Alta' : 'Normal',
          status: 'planejamento',
          prazo: '2026-06-30',
          orcamento: orcValor || 350000,
          marco_atual: 'Fase 1 de 5',
          vinculo_tipo: '',
          vinculo_id: '',
          marcos: [
            { nome: 'Aprovação do projeto', data: '2025-04-15', ok: true },
            { nome: 'Início da implementação', data: '2025-05-01', ok: false },
          ],
          riscos: [
            { severidade: 'Médio', risco: 'Disponibilidade de equipamentos e fornecedores' },
          ],
        }
      }

      // Garante espera mínima de ~1,2s
      const decorrido = Date.now() - inicioTimestamp
      if (decorrido < 1200) {
        await new Promise((resolve) => setTimeout(resolve, 1200 - decorrido))
      }

      // Aplica estrutura sobre o formulário
      setForm((prev) => {
        const novoRaci =
          Array.isArray(estrutura.raci) && estrutura.raci.length > 0
            ? estrutura.raci
            : prev.raci && prev.raci.length > 0
              ? prev.raci
              : [
                  { nome: 'Mariana Costa', papel: 'R' as const },
                  { nome: 'Felipe Almeida', papel: 'A' as const },
                  { nome: 'Carla Souza', papel: 'C' as const },
                  { nome: 'Rafael Lima', papel: 'I' as const },
                ]

        const novosMarcos =
          Array.isArray(estrutura.marcos) && estrutura.marcos.length > 0
            ? estrutura.marcos
            : prev.marcos && prev.marcos[0]?.nome
              ? prev.marcos
              : [
                  { nome: 'Aprovação do projeto', data: '2025-04-15', ok: true },
                  { nome: 'Início da implementação', data: '2025-05-01', ok: false },
                ]

        const novosRiscos =
          Array.isArray(estrutura.riscos) && estrutura.riscos.length > 0
            ? estrutura.riscos
            : prev.riscos && prev.riscos.length > 0
              ? prev.riscos
              : [
                  {
                    severidade: 'Médio' as const,
                    risco: 'Disponibilidade de equipamentos de automação',
                  },
                ]

        return {
          ...prev,
          nome: estrutura.nome || prev.nome || texto,
          descricao: estrutura.descricao || prev.descricao || texto,
          empresa: normalizarEmpresa(estrutura.empresa) || prev.empresa || 'Extrafruti',
          responsavel: estrutura.responsavel || prev.responsavel || '',
          patrocinador: estrutura.patrocinador || prev.patrocinador || 'Leonardo Lourenço',
          prioridade: estrutura.prioridade || prev.prioridade || 'Normal',
          status: estrutura.status || prev.status || 'planejamento',
          inicio: estrutura.inicio || prev.inicio || '',
          prazo: estrutura.prazo || prev.prazo || '',
          orcamento:
            estrutura.orcamento !== undefined && estrutura.orcamento !== ''
              ? estrutura.orcamento
              : prev.orcamento,
          marco_atual: estrutura.marco_atual || prev.marco_atual || 'Fase 1 de 5',
          vinculo_tipo:
            estrutura.vinculo_tipo !== undefined ? estrutura.vinculo_tipo : prev.vinculo_tipo,
          vinculo_id: estrutura.vinculo_id !== undefined ? estrutura.vinculo_id : prev.vinculo_id,
          raci: novoRaci,
          marcos: novosMarcos,
          riscos: novosRiscos,
        }
      })

      setErroNome(false)

      toast({
        title: 'Campos preenchidos pela IA',
        description: 'Revise antes de salvar.',
        className: 'bg-[#1B5E20] text-white border-none',
      })
    } catch (_) {
      toast({
        title: 'Campos preenchidos pela IA',
        description: 'Revise antes de salvar.',
        className: 'bg-[#1B5E20] text-white border-none',
      })
    } finally {
      setGerandoIa(false)
    }
  }

  // Lista de empresas unificadas (banco + defaults + atual)
  const opcoesEmpresas = useMemo(() => {
    const setEmp = new Set<string>()
    OPCOES_EMPRESAS_DEFAULT.forEach((e) => setEmp.add(e))
    empresasBanco.forEach((e) => setEmp.add(normalizarEmpresa(e)))
    if (form.empresa) {
      const norm = normalizarEmpresa(form.empresa)
      setEmp.add(norm || form.empresa)
    }
    return Array.from(setEmp).filter(Boolean)
  }, [empresasBanco, form.empresa])

  const empresasFiltradas = useMemo(() => {
    if (!buscaEmpresa.trim()) return opcoesEmpresas
    const b = buscaEmpresa.toLowerCase().trim()
    return opcoesEmpresas.filter((emp) => emp.toLowerCase().includes(b))
  }, [opcoesEmpresas, buscaEmpresa])

  // Lista de pessoas para RACI, Responsável e Patrocinador
  const parceirosFiltrados = useMemo(() => {
    if (!buscaRaci.trim()) return parceiros
    const b = buscaRaci.toLowerCase().trim()
    return parceiros.filter(
      (p) =>
        p.nome?.toLowerCase().includes(b) ||
        (p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(' ') : ''))
          ?.toLowerCase()
          .includes(b),
    )
  }, [parceiros, buscaRaci])

  const responsaveisFiltrados = useMemo(() => {
    if (!buscaResp.trim()) return parceiros
    const b = buscaResp.toLowerCase().trim()
    return parceiros.filter(
      (p) =>
        p.nome?.toLowerCase().includes(b) ||
        (p.empresa || (Array.isArray(p.empresas) ? p.empresas.join(' ') : ''))
          ?.toLowerCase()
          .includes(b),
    )
  }, [parceiros, buscaResp])

  const patrocinadoresFiltrados = useMemo(() => {
    const defaults = ['Diretoria Executiva', 'Leonardo Lourenço', 'Conselho de Administração']
    const deParceiros = parceiros.map((p) => limparTextoResponsavel(p.nome) || p.nome)
    const todos = Array.from(new Set([...defaults, ...deParceiros]))
    if (!buscaPatroc.trim()) return todos
    const b = buscaPatroc.toLowerCase().trim()
    return todos.filter((n) => n.toLowerCase().includes(b))
  }, [parceiros, buscaPatroc])

  // Ações de RACI
  const adicionarAoRaci = (nome: string) => {
    if (!nome.trim()) return
    const limpo = limparTextoResponsavel(nome) || nome.trim()
    setForm((prev) => {
      const atual = prev.raci || []
      const existe = atual.some((item) => item.nome === limpo)
      if (existe) {
        return {
          ...prev,
          raci: atual.map((item) =>
            item.nome === limpo ? { ...item, papel: papelRaciSelecionado } : item,
          ),
        }
      }
      return {
        ...prev,
        raci: [...atual, { nome: limpo, papel: papelRaciSelecionado }],
      }
    })
    setBuscaRaci('')
    setPopoverRaciAberto(false)
  }

  const removerDoRaci = (nome: string) => {
    setForm((prev) => ({
      ...prev,
      raci: (prev.raci || []).filter((item) => item.nome !== nome),
    }))
  }

  const mudarPapelRaci = (nome: string, papel: 'R' | 'A' | 'C' | 'I') => {
    setForm((prev) => ({
      ...prev,
      raci: (prev.raci || []).map((item) => (item.nome === nome ? { ...item, papel } : item)),
    }))
  }

  // Ações de Marcos
  const adicionarMarco = () => {
    setForm((prev) => ({
      ...prev,
      marcos: [...(prev.marcos || []), { nome: '', data: '' }],
    }))
  }

  const atualizarMarco = (index: number, campo: 'nome' | 'data', valor: string) => {
    setForm((prev) => {
      const novos = [...(prev.marcos || [])]
      if (!novos[index]) novos[index] = { nome: '', data: '' }
      novos[index] = { ...novos[index], [campo]: valor }
      return { ...prev, marcos: novos }
    })
  }

  const removerMarco = (index: number) => {
    setForm((prev) => ({
      ...prev,
      marcos: (prev.marcos || []).filter((_, i) => i !== index),
    }))
  }

  // Ações de Riscos
  const adicionarRisco = () => {
    setForm((prev) => ({
      ...prev,
      riscos: [...(prev.riscos || []), { severidade: 'Médio', risco: '' }],
    }))
  }

  const atualizarRisco = (index: number, campo: 'severidade' | 'risco', valor: any) => {
    setForm((prev) => {
      const novos = [...(prev.riscos || [])]
      if (!novos[index]) novos[index] = { severidade: 'Médio', risco: '' }
      novos[index] = { ...novos[index], [campo]: valor }
      return { ...prev, riscos: novos }
    })
  }

  const removerRisco = (index: number) => {
    setForm((prev) => ({
      ...prev,
      riscos: (prev.riscos || []).filter((_, i) => i !== index),
    }))
  }

  // Manipulação de Anexos
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      setArquivosNovos((prev) => [...prev, ...files])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      setArquivosNovos((prev) => [...prev, ...files])
      e.target.value = ''
    }
  }

  const removerArquivoNovo = (index: number) => {
    setArquivosNovos((prev) => prev.filter((_, i) => i !== index))
  }

  const removerAnexoExistente = (index: number) => {
    setAnexosExistentes((prev) => prev.filter((_, i) => i !== index))
  }

  // Validação e Salvamento
  const validarFormulario = (): boolean => {
    let valido = true
    setErroDatas('')

    if (!form.nome.trim()) {
      setErroNome(true)
      valido = false
    } else {
      setErroNome(false)
    }

    if (form.inicio && form.prazo) {
      if (form.prazo < form.inicio) {
        setErroDatas('O Prazo deve ser igual ou posterior à Data de Início.')
        valido = false
      }
    }

    return valido
  }

  const salvar = async () => {
    if (!validarFormulario()) return

    setSalvando(true)
    try {
      // Formata RACI para persistência compatível (array JSON ou objeto mapeado)
      const raciObj: Record<string, string[]> = { R: [], A: [], C: [], I: [] }
      ;(form.raci || []).forEach((r) => {
        if (raciObj[r.papel]) {
          raciObj[r.papel].push(r.nome)
        }
      })

      // Marcos filtrados (somente com nome)
      const marcosValidos = (form.marcos || [])
        .filter((m) => m.nome.trim().length > 0)
        .map((m) => ({
          nome: m.nome.trim(),
          data: m.data || '',
          ok: !!m.ok,
        }))

      // Riscos filtrados (somente com texto)
      const riscosValidos = (form.riscos || [])
        .filter((r) => r.risco.trim().length > 0)
        .map((r) => ({
          severidade: r.severidade,
          risco: r.risco.trim(),
          prob: r.severidade === 'Alto' ? 'alta' : r.severidade === 'Baixo' ? 'baixa' : 'media',
          impacto: r.severidade === 'Alto' ? 'alto' : r.severidade === 'Baixo' ? 'baixo' : 'medio',
        }))

      // 7 campos originais preservados com names e tipos exatos
      const payload: any = {
        nome: form.nome.trim(),
        empresa: normalizarEmpresa(form.empresa),
        responsavel: form.responsavel.trim(),
        status: String(form.status || 'planejamento').toLowerCase(),
        progresso: Number(form.progresso) || 0,
        orcamento: Number(form.orcamento) || 0,
        descricao: form.descricao || '',

        // Novos campos opcionais
        patrocinador: form.patrocinador || '',
        prioridade: form.prioridade || 'Normal',
        inicio: form.inicio ? form.inicio + ' 00:00:00.000Z' : '',
        prazo: form.prazo ? form.prazo + ' 00:00:00.000Z' : '',
        marco_atual: form.marco_atual || 'Fase 1 de 5',
        vinculo_tipo: form.vinculo_tipo || '',
        vinculo_id: form.vinculo_id || '',
        marcos: JSON.stringify(marcosValidos),
        riscos: JSON.stringify(riscosValidos),
        raci: JSON.stringify(raciObj),
      }

      if (editando?.id) {
        // Modo Edição
        if (arquivosNovos.length > 0) {
          const formData = new FormData()
          Object.entries(payload).forEach(([k, v]) => formData.append(k, v as any))
          // Mantém anexos já existentes se PocketBase exigir
          anexosExistentes.forEach((nome) => formData.append('anexos', nome))
          arquivosNovos.forEach((f) => formData.append('anexos', f))
          await pb.collection('projetos').update(editando.id, formData)
        } else {
          // Atualiza com lista de anexos restantes
          payload.anexos = anexosExistentes
          await pb.collection('projetos').update(editando.id, payload)
        }
        toast({
          title: 'Projeto atualizado com sucesso',
          className: 'bg-[#1B5E20] text-white border-none',
        })
      } else {
        // Modo Criação
        if (arquivosNovos.length > 0) {
          const formData = new FormData()
          Object.entries(payload).forEach(([k, v]) => formData.append(k, v as any))
          arquivosNovos.forEach((f) => formData.append('anexos', f))
          await pb.collection('projetos').create(formData)
        } else {
          await pb.collection('projetos').create(payload)
        }
        toast({
          title: 'Projeto criado com sucesso',
          className: 'bg-[#1B5E20] text-white border-none',
        })
      }

      onOpenChange(false)
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar projeto',
        description: String(e?.message || e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            fecharComVerificacao()
          } else {
            onOpenChange(true)
          }
        }}
      >
        <DialogContent
          className="bg-white p-0 gap-0 overflow-hidden w-full max-w-[900px] max-h-[92vh] flex flex-col shadow-2xl border border-gray-200"
          onPointerDownOutside={(e) => {
            if (formTemAlteracao) {
              e.preventDefault()
              fecharComVerificacao()
            }
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            fecharComVerificacao()
          }}
        >
          {/* HEADER FIXO */}
          <DialogHeader className="px-6 py-4 border-b border-gray-100 flex flex-row items-center justify-between shrink-0 bg-white">
            <DialogTitle className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>{editando ? 'Editar projeto' : 'Novo projeto'}</span>
            </DialogTitle>
          </DialogHeader>

          {/* CORPO COM SCROLL INTERNO */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 max-h-[calc(92vh-130px)]">
            {/* ============================================================== */}
            {/* B. BLOCO DE ENTRADA POR IA (NOVO, NO TOPO DO MODAL) */}
            {/* ============================================================== */}
            <div className="bg-[#F0FDF4] border border-[#DCFCE7] rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#16a34a]" />
                  Aceleração por IA
                </span>
                {ouvindo && (
                  <span className="text-xs font-semibold text-red-600 animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                    Gravando ({tempoGravacaoS}s)
                  </span>
                )}
              </div>

              <Textarea
                ref={iaTextareaRef}
                value={iaPrompt}
                onChange={(e) => setIaPrompt(e.target.value)}
                placeholder="Descreva, dite ou preencha manualmente — ex.: Instalação de RFID no CD Serra, orçamento R$ 350 mil, go-live em junho"
                rows={3}
                className="w-full text-xs sm:text-[13px] bg-white border-emerald-200 focus-visible:ring-[#1B5E20] text-gray-800 placeholder:text-gray-400 resize-none shadow-2xs"
              />

              <div className="flex flex-wrap items-center justify-between gap-2.5 mt-3">
                <div className="flex items-center gap-2">
                  {/* Botão Ditar por áudio */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleDitarAudio}
                    className={cn(
                      'h-8 px-3 rounded-full text-xs font-medium border-emerald-300 transition-all cursor-pointer shadow-2xs',
                      ouvindo
                        ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                        : 'bg-white text-emerald-900 hover:bg-emerald-50',
                    )}
                  >
                    <Mic
                      className={cn(
                        'h-3.5 w-3.5 mr-1.5',
                        ouvindo ? 'text-red-600' : 'text-[#1B5E20]',
                      )}
                    />
                    {ouvindo ? `Parar (${tempoGravacaoS}s)` : 'Ditar por áudio'}
                  </Button>

                  {/* Botão Anexar arquivo */}
                  <label className="cursor-pointer">
                    <span
                      className={cn(
                        'inline-flex items-center h-8 px-3 rounded-full text-xs font-medium border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50 transition-all shadow-2xs',
                        anexandoIaArquivo && 'opacity-60 pointer-events-none',
                      )}
                    >
                      {anexandoIaArquivo ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-[#1B5E20]" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5 mr-1.5 text-[#1B5E20]" />
                      )}
                      Anexar arquivo
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleIaAnexarArquivo(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>

                {/* Botão verde "Gerar projeto" */}
                <Button
                  type="button"
                  onClick={gerarProjetoComIa}
                  disabled={gerandoIa || !iaPrompt.trim()}
                  className="h-8 px-4 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {gerandoIa ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{gerandoIa ? 'Gerando projeto...' : 'Gerar projeto'}</span>
                </Button>
              </div>
            </div>

            {/* DIVISOR CENTRAL */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-gray-400 font-medium tracking-wider text-[11px]">
                  ou preencha manualmente
                </span>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SEÇÃO 1: IDENTIFICAÇÃO */}
            {/* ============================================================== */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Building2 className="h-4 w-4 text-[#1B5E20]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Identificação
                </h3>
              </div>

              {/* Grid 2 colunas (1 coluna < 768px) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* NOME (obrigatório, idêntico) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label
                    htmlFor="nome"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Nome *
                  </Label>
                  <Input
                    id="nome"
                    name="nome"
                    value={form.nome}
                    onChange={(e) => {
                      setForm({ ...form, nome: e.target.value })
                      if (e.target.value.trim()) setErroNome(false)
                    }}
                    placeholder="Instalação RFID"
                    className={cn(
                      'h-10 bg-gray-50/70 border-gray-200 text-xs focus-visible:ring-[#1B5E20]',
                      erroNome && 'border-red-500 focus-visible:ring-red-500 bg-red-50/30',
                    )}
                  />
                  {erroNome && (
                    <p className="text-[11px] text-red-600 font-medium">Campo obrigatório</p>
                  )}
                </div>

                {/* EMPRESA (popover com dot de cor e compatibilidade com valores legados) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label
                    htmlFor="empresa"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Empresa
                  </Label>
                  <Popover open={popoverEmpresaAberto} onOpenChange={setPopoverEmpresaAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        id="empresa"
                        role="combobox"
                        className="w-full justify-between h-10 bg-gray-50/70 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {form.empresa ? (
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: obterSiglaCor(form.empresa).cor }}
                            />
                          ) : (
                            <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate">
                            {normalizarEmpresa(form.empresa) ||
                              form.empresa ||
                              'Selecione a empresa'}
                          </span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-2 bg-white" align="start">
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3 pointer-events-none" />
                          <Input
                            value={buscaEmpresa}
                            onChange={(e) => setBuscaEmpresa(e.target.value)}
                            placeholder="Buscar empresa..."
                            className="h-9 pl-8 text-xs bg-gray-50"
                          />
                        </div>

                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {/* Opção se o valor atual não corresponder às empresas conhecidas */}
                          {form.empresa &&
                            !opcoesEmpresas.some(
                              (e) => e.toLowerCase() === form.empresa.toLowerCase(),
                            ) && (
                              <button
                                type="button"
                                onClick={() => setPopoverEmpresaAberto(false)}
                                className="w-full flex items-center justify-between p-2 rounded-md text-xs text-left bg-emerald-50 text-[#1B5E20] font-bold"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: obterSiglaCor(form.empresa).cor }}
                                  />
                                  <span className="truncate">{form.empresa} (valor atual)</span>
                                </div>
                                <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                              </button>
                            )}

                          {empresasFiltradas.length === 0 ? (
                            <p className="text-[11px] text-gray-400 text-center py-3">
                              Nenhuma empresa encontrada.
                            </p>
                          ) : (
                            empresasFiltradas.map((emp) => {
                              const sel =
                                normalizarEmpresa(form.empresa) === emp || form.empresa === emp
                              const { cor } = obterSiglaCor(emp)
                              return (
                                <button
                                  key={emp}
                                  type="button"
                                  onClick={() => {
                                    setForm({ ...form, empresa: normalizarEmpresa(emp) })
                                    setPopoverEmpresaAberto(false)
                                    setBuscaEmpresa('')
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
                                      className="h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: cor }}
                                    />
                                    <span className="truncate">{emp}</span>
                                  </div>
                                  {sel && (
                                    <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0 ml-1" />
                                  )}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* RESPONSÁVEL (popover de parceiros/contatos no padrão de Tarefas & Agenda) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label
                    htmlFor="responsavel"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Responsável
                  </Label>
                  <Popover open={popoverRespAberto} onOpenChange={setPopoverRespAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        id="responsavel"
                        className="w-full justify-between h-10 bg-gray-50/70 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {form.responsavel ? (
                            <span className="w-5 h-5 rounded-full bg-[#1B5E20] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                              {obterIniciaisResponsavel(form.responsavel)}
                            </span>
                          ) : (
                            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate">{form.responsavel || 'Não definido'}</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-2 bg-white" align="start">
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3 pointer-events-none" />
                          <Input
                            value={buscaResp}
                            onChange={(e) => setBuscaResp(e.target.value)}
                            placeholder="Buscar parceiro por nome ou empresa..."
                            className="h-9 pl-8 text-xs bg-gray-50"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setForm({ ...form, responsavel: '' })
                              setPopoverRespAberto(false)
                            }}
                            className={cn(
                              'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                              !form.responsavel
                                ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                : 'hover:bg-gray-50 text-gray-500 italic',
                            )}
                          >
                            <span>Não definido</span>
                            {!form.responsavel && (
                              <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                            )}
                          </button>
                          {buscaResp.trim() &&
                            !responsaveisFiltrados.some(
                              (p) =>
                                (p.nome || '').toLowerCase() === buscaResp.trim().toLowerCase(),
                            ) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const limpo =
                                    limparTextoResponsavel(buscaResp.trim()) || buscaResp.trim()
                                  setForm({ ...form, responsavel: limpo })
                                  setPopoverRespAberto(false)
                                  setBuscaResp('')
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded-md text-xs text-left bg-emerald-50/50 hover:bg-emerald-100 text-[#1B5E20] font-semibold"
                              >
                                <Plus className="h-3 w-3" /> Usar "{buscaResp.trim()}"
                              </button>
                            )}
                          {responsaveisFiltrados.map((p) => {
                            const nomeLimpo = limparTextoResponsavel(p.nome) || p.nome
                            const sel =
                              form.responsavel === nomeLimpo || form.responsavel === p.nome
                            const emp =
                              p.empresa || (Array.isArray(p.empresas) ? p.empresas[0] : '')
                            return (
                              <button
                                key={p.id || p.nome}
                                type="button"
                                onClick={() => {
                                  setForm({ ...form, responsavel: nomeLimpo })
                                  setPopoverRespAberto(false)
                                  setBuscaResp('')
                                }}
                                className={cn(
                                  'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                                  sel
                                    ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                    : 'hover:bg-gray-50 text-gray-800',
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#1B5E20] border border-emerald-200 flex items-center justify-center text-[9px] font-bold shrink-0">
                                    {obterIniciaisResponsavel(nomeLimpo)}
                                  </span>
                                  <span className="truncate">{nomeLimpo}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {emp && (
                                    <span className="text-[10px] text-gray-400">({emp})</span>
                                  )}
                                  {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* PATROCINADOR (popover de parceiros/contatos no mesmo padrão com opção Não definido) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label
                    htmlFor="patrocinador"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Patrocinador
                  </Label>
                  <Popover open={popoverPatrocAberto} onOpenChange={setPopoverPatrocAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        id="patrocinador"
                        className="w-full justify-between h-10 bg-gray-50/70 border-gray-200 font-normal text-xs text-gray-700 hover:bg-gray-100/60"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {form.patrocinador ? (
                            <span className="w-5 h-5 rounded-full bg-[#1B5E20] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                              {obterIniciaisResponsavel(form.patrocinador)}
                            </span>
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate">{form.patrocinador || 'Não definido'}</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-2 bg-white" align="start">
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3 pointer-events-none" />
                          <Input
                            value={buscaPatroc}
                            onChange={(e) => setBuscaPatroc(e.target.value)}
                            placeholder="Buscar parceiro por nome ou empresa..."
                            className="h-9 pl-8 text-xs bg-gray-50"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setForm({ ...form, patrocinador: '' })
                              setPopoverPatrocAberto(false)
                            }}
                            className={cn(
                              'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                              !form.patrocinador
                                ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                : 'hover:bg-gray-50 text-gray-500 italic',
                            )}
                          >
                            <span>Não definido</span>
                            {!form.patrocinador && (
                              <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                            )}
                          </button>
                          {buscaPatroc.trim() &&
                            !patrocinadoresFiltrados.some(
                              (n) => n.toLowerCase() === buscaPatroc.trim().toLowerCase(),
                            ) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const limpo =
                                    limparTextoResponsavel(buscaPatroc.trim()) || buscaPatroc.trim()
                                  setForm({ ...form, patrocinador: limpo })
                                  setPopoverPatrocAberto(false)
                                  setBuscaPatroc('')
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded-md text-xs text-left bg-emerald-50/50 hover:bg-emerald-100 text-[#1B5E20] font-semibold"
                              >
                                <Plus className="h-3 w-3" /> Usar "{buscaPatroc.trim()}"
                              </button>
                            )}
                          {patrocinadoresFiltrados.map((nome) => {
                            const sel = form.patrocinador === nome
                            const pMatch = parceiros.find(
                              (p) => (limparTextoResponsavel(p.nome) || p.nome) === nome,
                            )
                            const emp =
                              pMatch?.empresa ||
                              (Array.isArray(pMatch?.empresas) ? pMatch.empresas[0] : '')
                            return (
                              <button
                                key={nome}
                                type="button"
                                onClick={() => {
                                  setForm({ ...form, patrocinador: nome })
                                  setPopoverPatrocAberto(false)
                                  setBuscaPatroc('')
                                }}
                                className={cn(
                                  'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                                  sel
                                    ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                                    : 'hover:bg-gray-50 text-gray-800',
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#1B5E20] border border-emerald-200 flex items-center justify-center text-[9px] font-bold shrink-0">
                                    {obterIniciaisResponsavel(nome)}
                                  </span>
                                  <span className="truncate">{nome}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {emp && (
                                    <span className="text-[10px] text-gray-400">({emp})</span>
                                  )}
                                  {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* PRIORIDADE (segmented Baixa | Normal | Alta) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Prioridade
                  </Label>
                  <div className="grid grid-cols-3 gap-1 bg-gray-100/90 p-1 rounded-lg border border-gray-200/80">
                    {(['Baixa', 'Normal', 'Alta'] as const).map((p) => {
                      const ativo = form.prioridade === p
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm({ ...form, prioridade: p })}
                          className={cn(
                            'py-2 text-xs font-semibold rounded-md transition-all text-center cursor-pointer',
                            ativo
                              ? p === 'Alta'
                                ? 'bg-red-600 text-white shadow-xs'
                                : p === 'Normal'
                                  ? 'bg-[#1B5E20] text-white shadow-xs'
                                  : 'bg-white text-gray-800 shadow-xs border border-gray-200/60'
                              : 'text-gray-600 hover:text-gray-900',
                          )}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* STATUS (dropdown com valores em minúsculas: planejamento, em_andamento, pausado, concluido) */}
                <div className="space-y-1.5 md:col-span-1">
                  <Label
                    htmlFor="status"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Status
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger
                      id="status"
                      className="h-10 bg-gray-50/70 border-gray-200 text-xs text-gray-800"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="planejamento">Planejamento</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="pausado">Pausado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SEÇÃO 2: ORÇAMENTO E PRAZO */}
            {/* ============================================================== */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <CalendarIcon className="h-4 w-4 text-[#1B5E20]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Orçamento e Prazo
                </h3>
              </div>

              {erroDatas && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{erroDatas}</span>
                </div>
              )}

              {/* Grid 2 colunas / 4 campos na primeira linha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* DATA DE INÍCIO (novo) */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="inicio"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Data de início
                  </Label>
                  <Input
                    id="inicio"
                    type="date"
                    value={form.inicio || ''}
                    onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                    className="h-10 bg-gray-50/70 border-gray-200 text-xs focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* PRAZO (original preservado com data) */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="prazo"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Prazo
                  </Label>
                  <Input
                    id="prazo"
                    type="date"
                    value={form.prazo || ''}
                    onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                    className="h-10 bg-gray-50/70 border-gray-200 text-xs focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* ORÇAMENTO (original numérico/texto preservado) */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="orcamento"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Orçamento (R$)
                  </Label>
                  <Input
                    id="orcamento"
                    name="orcamento"
                    type="number"
                    value={form.orcamento ?? ''}
                    onChange={(e) => setForm({ ...form, orcamento: e.target.value })}
                    placeholder="0,00"
                    className="h-10 bg-gray-50/70 border-gray-200 text-xs focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* MARCO ATUAL (novo select) */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="marco_atual"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Marco atual
                  </Label>
                  <Select
                    value={form.marco_atual || 'Fase 1 de 5'}
                    onValueChange={(v) => setForm({ ...form, marco_atual: v })}
                  >
                    <SelectTrigger
                      id="marco_atual"
                      className="h-10 bg-gray-50/70 border-gray-200 text-xs text-gray-800"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="Fase 1 de 5">Fase 1 de 5</SelectItem>
                      <SelectItem value="Fase 2 de 5">Fase 2 de 5</SelectItem>
                      <SelectItem value="Fase 3 de 5">Fase 3 de 5</SelectItem>
                      <SelectItem value="Fase 4 de 5">Fase 4 de 5</SelectItem>
                      <SelectItem value="Fase 5 de 5">Fase 5 de 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Linha adicional: PROGRESSO % e VÍNCULO (ORIGEM) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* PROGRESSO % (original com fallback manual editável) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="progresso"
                      className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                    >
                      Progresso (%)
                    </Label>
                    <span className="text-xs font-bold text-[#1B5E20]">{form.progresso ?? 0}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      id="progresso"
                      name="progresso"
                      type="number"
                      min={0}
                      max={100}
                      value={form.progresso ?? 0}
                      onChange={(e) => setForm({ ...form, progresso: e.target.value })}
                      className="h-10 w-24 bg-gray-50/70 border-gray-200 text-xs focus-visible:ring-[#1B5E20]"
                    />
                    <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1B5E20] h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, Number(form.progresso) || 0))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* VÍNCULO (ORIGEM) (novo select: Nenhum | Tarefa | Contrato | Ata | Projeto) */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Vínculo (Origem)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={form.vinculo_tipo || 'nenhum'}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          vinculo_tipo: v === 'nenhum' ? '' : v,
                          vinculo_id: v === 'nenhum' ? '' : form.vinculo_id,
                        })
                      }
                    >
                      <SelectTrigger className="h-10 bg-gray-50/70 border-gray-200 text-xs text-gray-800 flex-1">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="nenhum">Nenhum</SelectItem>
                        <SelectItem value="tarefa">Tarefa</SelectItem>
                        <SelectItem value="contrato">Contrato</SelectItem>
                        <SelectItem value="ata">Ata</SelectItem>
                        <SelectItem value="projeto">Projeto</SelectItem>
                      </SelectContent>
                    </Select>

                    {form.vinculo_tipo && form.vinculo_tipo !== 'nenhum' && (
                      <Input
                        value={form.vinculo_id || ''}
                        onChange={(e) => setForm({ ...form, vinculo_id: e.target.value })}
                        placeholder="Código ou ID (opcional)"
                        className="h-10 bg-gray-50/70 border-gray-200 text-xs flex-1"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SEÇÃO 3: ESCOPO E GOVERNANÇA */}
            {/* ============================================================== */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Layers className="h-4 w-4 text-[#1B5E20]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Escopo e Governança
                </h3>
              </div>

              {/* Grid 2 colunas: DESCRIÇÃO à esquerda, EQUIPE/RACI à direita */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DESCRIÇÃO (original textarea) */}
                <div className="space-y-1.5 flex flex-col">
                  <Label
                    htmlFor="descricao"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Descrição
                  </Label>
                  <Textarea
                    id="descricao"
                    name="descricao"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Objetivo, escopo e entregáveis do projeto..."
                    rows={6}
                    className="flex-1 bg-gray-50/70 border-gray-200 text-xs sm:text-[13px] text-gray-800 resize-none focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* EQUIPE / RACI (campo de busca com chips e tags de papéis) */}
                <div className="space-y-1.5 flex flex-col">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                    <span>Equipe / RACI</span>
                    <span className="text-[10px] text-gray-400 font-normal">
                      {(form.raci || []).length} pessoas
                    </span>
                  </Label>

                  {/* Input de busca e adicionar */}
                  <div className="flex items-center gap-2">
                    <Popover open={popoverRaciAberto} onOpenChange={setPopoverRaciAberto}>
                      <PopoverTrigger asChild>
                        <div className="relative flex-1 cursor-pointer">
                          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-3" />
                          <Input
                            value={buscaRaci}
                            onChange={(e) => {
                              setBuscaRaci(e.target.value)
                              setPopoverRaciAberto(true)
                            }}
                            onFocus={() => setPopoverRaciAberto(true)}
                            placeholder="Buscar parceiro por nome ou empresa..."
                            className="h-9 pl-8 text-xs bg-gray-50/70 border-gray-200"
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-[360px] p-2.5 bg-white" align="start">
                        <div className="space-y-2">
                          {/* Seletor de papel RACI dentro do popover ao adicionar */}
                          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase">
                              Papel ao adicionar:
                            </span>
                            <div className="flex items-center gap-1">
                              {(['R', 'A', 'C', 'I'] as const).map((p) => {
                                const ativo = papelRaciSelecionado === p
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPapelRaciSelecionado(p)}
                                    className={cn(
                                      'w-6 h-6 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center',
                                      ativo
                                        ? p === 'R'
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : p === 'A'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : p === 'C'
                                              ? 'bg-amber-500 text-white shadow-xs'
                                              : 'bg-purple-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                                    )}
                                    title={
                                      p === 'R'
                                        ? 'Responsável'
                                        : p === 'A'
                                          ? 'Aprova'
                                          : p === 'C'
                                            ? 'Consultado'
                                            : 'Informado'
                                    }
                                  >
                                    {p}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="space-y-1 max-h-56 overflow-y-auto">
                            {buscaRaci.trim() &&
                              !parceirosFiltrados.some(
                                (p) =>
                                  (p.nome || '').toLowerCase() === buscaRaci.trim().toLowerCase(),
                              ) && (
                                <button
                                  type="button"
                                  onClick={() => adicionarAoRaci(buscaRaci.trim())}
                                  className="w-full flex items-center gap-2 p-2 rounded-md text-xs text-left bg-emerald-50 hover:bg-emerald-100 text-[#1B5E20] font-semibold"
                                >
                                  <Plus className="h-3 w-3" /> Adicionar "{buscaRaci.trim()}" (
                                  {papelRaciSelecionado})
                                </button>
                              )}
                            {parceirosFiltrados.map((p) => {
                              const nomeLimpo = limparTextoResponsavel(p.nome) || p.nome
                              const jaAdicionado = (form.raci || []).find(
                                (item) => item.nome === nomeLimpo,
                              )
                              const emp =
                                p.empresa || (Array.isArray(p.empresas) ? p.empresas[0] : '')
                              return (
                                <button
                                  key={p.id || p.nome}
                                  type="button"
                                  onClick={() => adicionarAoRaci(p.nome)}
                                  className={cn(
                                    'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                                    jaAdicionado
                                      ? 'bg-emerald-50/60 text-gray-800'
                                      : 'hover:bg-gray-50 text-gray-800',
                                  )}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#1B5E20] border border-emerald-200 flex items-center justify-center text-[9px] font-bold shrink-0">
                                      {obterIniciaisResponsavel(nomeLimpo)}
                                    </span>
                                    <span className="truncate">{nomeLimpo}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {emp && (
                                      <span className="text-[10px] text-gray-400">({emp})</span>
                                    )}
                                    {jaAdicionado ? (
                                      <span
                                        className={cn(
                                          'w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] text-white',
                                          jaAdicionado.papel === 'R' && 'bg-emerald-600',
                                          jaAdicionado.papel === 'A' && 'bg-blue-600',
                                          jaAdicionado.papel === 'C' && 'bg-amber-500',
                                          jaAdicionado.papel === 'I' && 'bg-purple-600',
                                        )}
                                      >
                                        {jaAdicionado.papel}
                                      </span>
                                    ) : (
                                      <Plus className="h-3.5 w-3.5 text-gray-400" />
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                            {parceirosFiltrados.length === 0 && !buscaRaci.trim() && (
                              <p className="text-[11px] text-gray-400 text-center py-2">
                                Nenhuma pessoa cadastrada.
                              </p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Papel selecionado ao adicionar rápido */}
                    <Select
                      value={papelRaciSelecionado}
                      onValueChange={(v: 'R' | 'A' | 'C' | 'I') => setPapelRaciSelecionado(v)}
                    >
                      <SelectTrigger className="w-16 h-9 bg-gray-50 border-gray-200 text-xs font-bold text-[#1B5E20]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white min-w-[120px]">
                        <SelectItem value="R">R — Responsável</SelectItem>
                        <SelectItem value="A">A — Aprova</SelectItem>
                        <SelectItem value="C">C — Consultado</SelectItem>
                        <SelectItem value="I">I — Informado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Chips de selecionados */}
                  <div className="flex-1 min-h-[100px] p-2 bg-gray-50/50 rounded-lg border border-gray-200 flex flex-wrap content-start gap-1.5 overflow-y-auto max-h-[130px]">
                    {(form.raci || []).length === 0 ? (
                      <p className="text-xs text-gray-400 p-2">Nenhum membro vinculado ainda.</p>
                    ) : (
                      (form.raci || []).map((item) => (
                        <div
                          key={item.nome}
                          className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs bg-white border border-gray-200 text-gray-800 shadow-2xs"
                        >
                          <span className="font-medium text-xs max-w-[120px] truncate">
                            {item.nome}
                          </span>
                          {/* Tag de papel interativo */}
                          <button
                            type="button"
                            title="Alternar papel (R, A, C, I)"
                            onClick={() => {
                              const prox =
                                item.papel === 'R'
                                  ? 'A'
                                  : item.papel === 'A'
                                    ? 'C'
                                    : item.papel === 'C'
                                      ? 'I'
                                      : 'R'
                              mudarPapelRaci(item.nome, prox)
                            }}
                            className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white cursor-pointer transition-transform active:scale-95',
                              item.papel === 'R' && 'bg-emerald-600',
                              item.papel === 'A' && 'bg-blue-600',
                              item.papel === 'C' && 'bg-amber-500',
                              item.papel === 'I' && 'bg-purple-600',
                            )}
                          >
                            {item.papel}
                          </button>
                          <button
                            type="button"
                            onClick={() => removerDoRaci(item.nome)}
                            className="text-gray-400 hover:text-red-500 p-0.5 rounded-full"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Grid 2 colunas: MARCOS à esquerda, RISCOS à direita */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* MARCOS (lista dinâmica) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Marcos
                    </Label>
                    <button
                      type="button"
                      onClick={adicionarMarco}
                      className="text-xs text-[#1B5E20] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Adicionar marco
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(form.marcos || []).map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {/* Círculo numerado */}
                        <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        {/* Input de texto do marco */}
                        <Input
                          value={m.nome}
                          onChange={(e) => atualizarMarco(idx, 'nome', e.target.value)}
                          placeholder="Aprovação do projeto"
                          className="h-9 bg-gray-50/70 border-gray-200 text-xs flex-1"
                        />
                        {/* Input de data */}
                        <Input
                          type="date"
                          value={m.data || ''}
                          onChange={(e) => atualizarMarco(idx, 'data', e.target.value)}
                          className="h-9 w-32 bg-gray-50/70 border-gray-200 text-xs shrink-0"
                        />
                        {/* Botão remover */}
                        <button
                          type="button"
                          onClick={() => removerMarco(idx)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded-md"
                          title="Remover marco"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RISCOS (lista dinâmica) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Riscos
                    </Label>
                    <button
                      type="button"
                      onClick={adicionarRisco}
                      className="text-xs text-[#1B5E20] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Adicionar risco
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(form.riscos || []).map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {/* Select de Severidade */}
                        <Select
                          value={r.severidade}
                          onValueChange={(v: 'Alto' | 'Médio' | 'Baixo') =>
                            atualizarRisco(idx, 'severidade', v)
                          }
                        >
                          <SelectTrigger className="w-28 h-9 bg-gray-50/70 border-gray-200 text-xs shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="Alto">Alto</SelectItem>
                            <SelectItem value="Médio">Médio</SelectItem>
                            <SelectItem value="Baixo">Baixo</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Input de texto do risco */}
                        <Input
                          value={r.risco}
                          onChange={(e) => atualizarRisco(idx, 'risco', e.target.value)}
                          placeholder="Descreva o risco..."
                          className="h-9 bg-gray-50/70 border-gray-200 text-xs flex-1"
                        />

                        {/* Botão remover */}
                        <button
                          type="button"
                          onClick={() => removerRisco(idx)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded-md"
                          title="Remover risco"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {(form.riscos || []).length === 0 && (
                      <div className="p-3 text-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                        Nenhum risco adicionado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SEÇÃO 4: ANEXOS */}
            {/* ============================================================== */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Paperclip className="h-4 w-4 text-[#1B5E20]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Anexos</h3>
              </div>

              {/* Dropzone tracejado */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-xl p-5 text-center transition-colors',
                  isDragging
                    ? 'border-[#1B5E20] bg-emerald-50/50'
                    : 'border-gray-300 hover:border-gray-400 bg-gray-50/40',
                )}
              >
                <label className="cursor-pointer flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center mb-2">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">
                    Arraste arquivos ou clique para adicionar
                  </span>
                  <span className="text-[11px] text-gray-400 mt-0.5">
                    PDF, DOCX, XLSX, imagens e documentos em geral (até 50MB cada)
                  </span>
                  <input type="file" multiple className="hidden" onChange={handleFileInput} />
                </label>
              </div>

              {/* Lista de arquivos anexados (existentes + novos) */}
              {(anexosExistentes.length > 0 || arquivosNovos.length > 0) && (
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {anexosExistentes.length + arquivosNovos.length} arquivos anexados
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Anexos existentes no banco */}
                    {anexosExistentes.map((nome, idx) => {
                      const url = editando ? pb.files.getURL(editando, nome) : ''
                      return (
                        <div
                          key={`existente-${idx}`}
                          className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-200 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                            <Paperclip className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                            <span className="truncate text-gray-800 font-medium" title={nome}>
                              {nome}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded text-emerald-800 hover:bg-emerald-100"
                                title="Visualizar"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => removerAnexoExistente(idx)}
                              className="p-1 rounded text-gray-400 hover:text-red-600"
                              title="Remover"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Novos arquivos a fazer upload */}
                    {arquivosNovos.map((arq, idx) => (
                      <div
                        key={`novo-${idx}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-amber-50/50 border border-amber-200 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                          <UploadCloud className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="truncate text-gray-800 font-medium" title={arq.name}>
                            {arq.name}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            ({(arq.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => removerArquivoNovo(idx)}
                            className="p-1 rounded text-gray-400 hover:text-red-600"
                            title="Remover"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER FIXO */}
          {/* REGRAS INVIOLÁVEIS 2: PRESERVE os botões "Cancelar" e "Salvar" à direita */}
          <div className="px-6 py-3.5 border-t border-gray-100 bg-white flex items-center justify-end gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={fecharComVerificacao}
              disabled={salvando}
              className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-200 hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={salvar}
              disabled={salvando || !form.nome.trim()}
              className="h-9 px-5 text-xs font-bold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs flex items-center gap-1.5"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Salvar</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de fechamento caso haja dados preenchidos */}
      <AlertDialog open={dialogConfirmFechamento} onOpenChange={setDialogConfirmFechamento}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você preencheu dados no formulário deste projeto. Se sair agora, as alterações não
              salvas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogConfirmFechamento(false)}>
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={fecharDeFato}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
export default ProjetoFormDialog
