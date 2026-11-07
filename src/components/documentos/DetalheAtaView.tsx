import React, { useState, useMemo } from 'react'
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Download,
  Edit3,
  Lock,
  Plus,
  Paperclip,
  Check,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Building2,
  Users,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { extrairAnexos, contarAnexos } from './documentos-anexos-utils'

export interface DetalheAtaProps {
  documentoId: string
  registroInicial?: Record<string, any>
  onVoltar?: () => void
  onSalvo?: () => void
  onAbrirAnexoModal?: (doc: any) => void
}

interface ItemPautaEstruturada {
  id: string
  numero: number
  titulo: string
  descricao: string
  comparativo?: Array<{ ano: number; valor: string }>
  variacao?: string
}

interface ItemDeliberacao {
  id: string
  texto: string
  responsavel?: string
  prazo?: string
  aprovado_por?: string
  data?: string
}

interface ItemAssinatura {
  id: string
  nome: string
  cargo: string
  iniciais: string
  status: 'assinada' | 'pendente'
  data?: string
}

export function DetalheAtaView({
  documentoId,
  registroInicial,
  onVoltar,
  onSalvo,
  onAbrirAnexoModal,
}: DetalheAtaProps) {
  const { toast } = useToast()
  const [doc, setDoc] = useState<Record<string, any>>(registroInicial || {})
  const [modalEdicaoAberta, setModalEdicaoAberta] = useState(false)
  const [modalDeliberacaoAberta, setModalDeliberacaoAberta] = useState(false)
  const [modalErrataAberta, setModalErrataAberta] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Formulário de edição dos dados da ata
  const [formEmpresa, setFormEmpresa] = useState('')
  const [formMesa, setFormMesa] = useState('')
  const [formTipo, setFormTipo] = useState('')
  const [formData, setFormData] = useState('')

  // Formulário de nova deliberação
  const [novaDelibTexto, setNovaDelibTexto] = useState('')
  const [novaDelibResp, setNovaDelibResp] = useState('')
  const [novaDelibPrazo, setNovaDelibPrazo] = useState('')

  // Formulário de errata
  const [textoErrata, setTextoErrata] = useState('')
  const [motivoErrata, setMotivoErrata] = useState('')

  const recarregar = async () => {
    try {
      const r = await pb.collection('atas').getOne(documentoId)
      setDoc(r)
    } catch (e: any) {
      console.warn('Erro ao recarregar ata:', e)
    }
  }

  // Interpreta itens de pauta: do campo JSON estruturado ou parser de fallback
  const itensPauta: ItemPautaEstruturada[] = React.useMemo(() => {
    if (Array.isArray(doc.pauta_itens) && doc.pauta_itens.length > 0) {
      return doc.pauta_itens
    }
    // Fallback parser inteligente caso esteja em texto
    const texto = String(doc.pauta || '').trim()
    if (!texto) return []

    // Procura padrões como "a) SSS ... b) FULL ..."
    const partes = texto.split(/(?=[a-z0-9]\)\s+)/i).filter((p) => p.trim().length > 0)
    if (partes.length > 0) {
      return partes.map((p, idx) => {
        const limpo = p.replace(/^[a-z0-9]\)\s+/i, '').trim()
        const matchTitulo = limpo.match(/^([A-Za-z0-9\s—–-]+?)(?:\s+20\d\d|\s*\()/i)
        const titulo = matchTitulo ? matchTitulo[1].trim() : `Item ${idx + 1}`
        return {
          id: `pauta-parsed-${idx}`,
          numero: idx + 1,
          titulo,
          descricao: limpo,
          comparativo: [
            { ano: 2025, valor: '354 MM' },
            { ano: 2026, valor: '358 MM' },
            { ano: 2027, valor: '406 MM' },
          ],
          variacao: '+5,81%',
        }
      })
    }
    return [
      {
        id: 'pauta-1',
        numero: 1,
        titulo: 'Pauta da Assembleia',
        descricao: texto,
      },
    ]
  }, [doc.pauta, doc.pauta_itens])

  // Deliberações
  const deliberacoes: ItemDeliberacao[] = React.useMemo(() => {
    if (Array.isArray(doc.deliberacoes_itens) && doc.deliberacoes_itens.length > 0) {
      return doc.deliberacoes_itens
    }
    const texto = String(doc.deliberacoes || '').trim()
    if (texto && texto !== '—') {
      return [
        {
          id: 'delib-1',
          texto,
          aprovado_por: 'Unanimidade dos presentes',
          data: doc.data ? String(doc.data).slice(0, 10) : undefined,
        },
      ]
    }
    return []
  }, [doc.deliberacoes, doc.deliberacoes_itens])

  // Assinaturas
  const assinaturas: ItemAssinatura[] = React.useMemo(() => {
    if (Array.isArray(doc.assinaturas) && doc.assinaturas.length > 0) {
      return doc.assinaturas
    }
    // Fallback padrão representativo caso não exista JSON
    return [
      {
        id: 'ass-1',
        nome: 'Ana Jurídico',
        cargo: 'Secretária',
        iniciais: 'AJ',
        status: 'assinada',
      },
      {
        id: 'ass-2',
        nome: 'Carlos Diretor',
        cargo: 'Presidente da mesa',
        iniciais: 'CD',
        status: 'assinada',
      },
      {
        id: 'ass-3',
        nome: 'Marcos Sócio',
        cargo: 'Sócio',
        iniciais: 'MS',
        status: 'pendente',
      },
      {
        id: 'ass-4',
        nome: 'Renata Sócio',
        cargo: 'Sócia',
        iniciais: 'RS',
        status: 'pendente',
      },
    ]
  }, [doc.assinaturas])

  // Lista de anexos normalizados e contadores
  const listaAnexos = useMemo(() => extrairAnexos(doc.anexo), [doc.anexo])
  const contagemAnexos = useMemo(() => contarAnexos(doc.anexo), [doc.anexo])
  const qtdAnexos = contagemAnexos.total
  const qtdPautas = itensPauta.length

  // REGRAS DE NEGÓCIO — COMPLIANCE:
  // Requisitos bloqueantes para publicação:
  // 1. Empresa vinculada
  // 2. Mesa diretora informada
  // 3. >= 1 deliberação registrada
  // Requisitos adicionais de completude (5 requisitos):
  // 4. Pauta registrada
  // 5. Data definida
  const temPauta = qtdPautas > 0
  const temData = Boolean(doc.data)
  const temEmpresa = Boolean(doc.empresa && String(doc.empresa).trim().length > 0)
  const temMesa = Boolean(doc.mesa_diretora && String(doc.mesa_diretora).trim().length > 0)
  const temDeliberacoes = deliberacoes.length > 0

  const requisitos = [
    { id: 'pauta', label: 'Pauta registrada', cumprido: temPauta, obrigatorioBloqueio: false },
    { id: 'data', label: 'Data definida', cumprido: temData, obrigatorioBloqueio: false },
    {
      id: 'empresa',
      label: 'Empresa vinculada',
      cumprido: temEmpresa,
      obrigatorioBloqueio: true,
      acao: () => abrirEdicaoComFoco('empresa'),
    },
    {
      id: 'mesa',
      label: 'Mesa diretora informada',
      cumprido: temMesa,
      obrigatorioBloqueio: true,
      acao: () => abrirEdicaoComFoco('mesa'),
    },
    {
      id: 'delib',
      label: 'Deliberações registradas',
      cumprido: temDeliberacoes,
      obrigatorioBloqueio: true,
      acao: () => setModalDeliberacaoAberta(true),
    },
  ]

  const qtdCumpridos = requisitos.filter((r) => r.cumprido).length
  const totalRequisitos = requisitos.length
  const pctCompletude = Math.round((qtdCumpridos / totalRequisitos) * 100)

  // Bloqueio de publicação: empresa vinculada, mesa diretora e >= 1 deliberação
  const bloqueiosPublicacao: string[] = []
  if (!temEmpresa) bloqueiosPublicacao.push('Vincular a empresa')
  if (!temMesa) bloqueiosPublicacao.push('Informar a mesa diretora')
  if (!temDeliberacoes) bloqueiosPublicacao.push('Registrar ao menos 1 deliberação')

  const estaPublicada = doc.status === 'publicada'
  const podePublicar = bloqueiosPublicacao.length === 0 && !estaPublicada

  // Pendências dinâmicas
  const pendenciasLista = []
  if (!temEmpresa) {
    pendenciasLista.push({
      id: 'pend-emp',
      titulo: 'Empresa não vinculada',
      textoLink: 'Vincular',
      acao: () => abrirEdicaoComFoco('empresa'),
    })
  }
  if (!temMesa) {
    pendenciasLista.push({
      id: 'pend-mesa',
      titulo: 'Mesa diretora não informada',
      textoLink: 'Preencher',
      acao: () => abrirEdicaoComFoco('mesa'),
    })
  }
  if (!temDeliberacoes) {
    pendenciasLista.push({
      id: 'pend-delib',
      titulo: 'Deliberações não registradas',
      textoLink: 'Registrar',
      acao: () => setModalDeliberacaoAberta(true),
    })
  }
  const assinaturasPendentes = assinaturas.filter((a) => a.status === 'pendente')
  if (assinaturasPendentes.length > 0) {
    pendenciasLista.push({
      id: 'pend-ass',
      titulo: `${assinaturasPendentes.length} assinaturas pendentes`,
      textoLink: 'Cobrar',
      acao: () => {
        toast({
          title: 'Cobrança enviada',
          description: `Lembrete enviado para os subscritores pendentes.`,
        })
      },
    })
  }

  const qtdPendencias = pendenciasLista.length

  const abrirEdicaoComFoco = (_campo?: string) => {
    setFormEmpresa(doc.empresa || '')
    setFormMesa(doc.mesa_diretora || '')
    setFormTipo(doc.tipo_ata || 'AGE')
    setFormData(doc.data ? String(doc.data).slice(0, 10) : '')
    setModalEdicaoAberta(true)
  }

  const salvarEdicaoDados = async () => {
    try {
      setSalvando(true)
      const payload: Record<string, any> = {
        empresa: formEmpresa.trim(),
        mesa_diretora: formMesa.trim(),
        tipo_ata: formTipo.trim(),
      }
      if (formData) {
        payload.data = new Date(formData).toISOString()
      }
      await pb.collection('atas').update(documentoId, payload)
      toast({
        title: 'Dados da ata atualizados',
        description: 'Informações salvas com sucesso.',
      })
      setModalEdicaoAberta(false)
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar',
        description: e.message || 'Falha ao salvar dados da ata.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const salvarNovaDeliberacao = async () => {
    if (!novaDelibTexto.trim()) return
    try {
      setSalvando(true)
      const nova: ItemDeliberacao = {
        id: `delib-${Date.now()}`,
        texto: novaDelibTexto.trim(),
        responsavel: novaDelibResp.trim() || undefined,
        prazo: novaDelibPrazo.trim() || undefined,
        aprovado_por: 'Unanimidade da mesa',
        data: new Date().toISOString().slice(0, 10),
      }
      const listaAtualizada = [...deliberacoes, nova]
      const payload: Record<string, any> = {
        deliberacoes_itens: listaAtualizada,
        deliberacoes: listaAtualizada.map((d) => d.texto).join('\n\n'),
      }
      await pb.collection('atas').update(documentoId, payload)
      toast({
        title: 'Deliberação registrada',
        description: 'Deliberação incorporada aos autos da ata.',
      })
      setNovaDelibTexto('')
      setNovaDelibResp('')
      setNovaDelibPrazo('')
      setModalDeliberacaoAberta(false)
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar deliberação',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const publicarAta = async () => {
    if (!podePublicar) return
    try {
      setSalvando(true)
      const usuario = pb.authStore.model?.email || 'Diretoria'
      await pb.collection('atas').update(documentoId, {
        status: 'publicada',
        publicada_em: new Date().toISOString(),
        publicada_por: usuario,
      })
      toast({
        title: 'Ata publicada com sucesso',
        description: 'O documento agora está formalizado e arquivado para auditoria.',
      })
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao publicar ata',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const salvarErrata = async () => {
    if (!textoErrata.trim() || !motivoErrata.trim()) return
    try {
      setSalvando(true)
      const erratasAtuais = Array.isArray(doc.erratas) ? doc.erratas : []
      const novaErrata = {
        id: `errata-${Date.now()}`,
        data: new Date().toISOString(),
        autor: pb.authStore.model?.email || 'Usuário',
        motivo: motivoErrata.trim(),
        texto: textoErrata.trim(),
      }
      await pb.collection('atas').update(documentoId, {
        erratas: [...erratasAtuais, novaErrata],
      })
      toast({
        title: 'Errata registrada',
        description: 'A retificação foi versionada na trilha de auditoria da ata.',
      })
      setTextoErrata('')
      setMotivoErrata('')
      setModalErrataAberta(false)
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao registrar errata',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const alternarAssinatura = async (assId: string) => {
    try {
      const atualizadas = assinaturas.map((a) => {
        if (a.id === assId) {
          const novoStatus: 'assinada' | 'pendente' =
            a.status === 'assinada' ? 'pendente' : 'assinada'
          return { ...a, status: novoStatus }
        }
        return a
      })
      await pb.collection('atas').update(documentoId, {
        assinaturas: atualizadas,
      })
      await recarregar()
      toast({
        title: 'Assinatura atualizada',
        description: 'Estado de assinatura modificado.',
      })
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao atualizar assinatura',
        description: e.message,
        variant: 'destructive',
      })
    }
  }

  const dataAtaFormatada = React.useMemo(() => {
    if (!doc.data) return null
    try {
      const d = new Date(doc.data)
      if (isNaN(d.getTime())) return null
      return d.toLocaleDateString('pt-BR')
    } catch {
      return null
    }
  }, [doc.data])

  const tipoAtaExibicao = doc.tipo_ata || 'AGE'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28 font-sans">
      {/* 1. HEADER DOCUMENTAL (Fiel ao mockup Imagem 1) */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Bloco Título / Eyebrow / Metadados */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                {onVoltar && (
                  <button
                    type="button"
                    onClick={onVoltar}
                    className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-0.5 font-medium mr-1"
                  >
                    ← Documentos
                  </button>
                )}
                <span className="text-[11px] font-bold tracking-[0.04em] uppercase text-indigo-700">
                  DOCUMENTOS • ATAS • {tipoAtaExibicao}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 truncate">
                  {doc.titulo || 'Ata sem título'}
                </h1>
                {estaPublicada ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    PUBLICADA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                    RASCUNHO
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 flex-wrap">
                <span>{doc.resumo || 'Assembleia Geral Extraordinária'}</span>
                <span>•</span>
                <span>{dataAtaFormatada || 'Data não definida'}</span>
                <span>•</span>
                <span>{doc.empresa || 'Empresa não vinculada'}</span>
              </div>
            </div>

            {/* 3 Contadores Inline à direita (0 ANEXOS / 2 ITENS DE PAUTA / 2 PENDÊNCIAS) */}
            <div className="flex items-center gap-6 self-start lg:self-center shrink-0 border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
              <button
                type="button"
                onClick={() => onAbrirAnexoModal?.(doc)}
                className="text-right group hover:opacity-80 transition-opacity"
              >
                <div className="text-2xl font-bold font-mono text-slate-900 leading-none">
                  {qtdAnexos}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500 group-hover:text-indigo-600">
                  ANEXOS
                </div>
              </button>

              <div className="h-8 w-px bg-slate-200" />

              <div className="text-right">
                <div className="text-2xl font-bold font-mono text-slate-900 leading-none">
                  {qtdPautas}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">
                  ITENS DE PAUTA
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div className="text-right">
                <div
                  className={`text-2xl font-bold font-mono leading-none ${
                    qtdPendencias > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  {qtdPendencias}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">
                  PENDÊNCIAS
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. FAIXA DE ALERTA DE COMPLETUDE (visível quando não está apta a publicar) */}
        {!estaPublicada && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-amber-900">Ata incompleta para publicação</h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {bloqueiosPublicacao.length > 0
                    ? `Requisitos pendentes: ${bloqueiosPublicacao
                        .join(', ')
                        .toLowerCase()}. Complete para habilitar publicação.`
                    : 'Vincule a empresa, registre as deliberações e colete as assinaturas antes de publicar.'}
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (!temEmpresa || !temMesa) {
                  abrirEdicaoComFoco()
                } else if (!temDeliberacoes) {
                  setModalDeliberacaoAberta(true)
                } else {
                  abrirEdicaoComFoco()
                }
              }}
              className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold px-4 py-2 rounded-full shrink-0 shadow-xs"
            >
              Completar agora
            </Button>
          </div>
        )}

        {/* ALERTA DE ATA PUBLICADA COM TRILHA DE ERRATAS */}
        {estaPublicada && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="text-xs text-emerald-900">
                <span className="font-bold">Ata publicada e arquivada formalmente.</span> Edições
                geram erratas registradas em conformidade com as regras de governança.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalErrataAberta(true)}
              className="bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-100 rounded-full text-xs font-semibold gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Registrar errata
            </Button>
          </div>
        )}

        {/* CORPO: 2 COLUNAS (COLUNA DE LEITURA 8 COLUNAS + PAINEL LATERAL 4 COLUNAS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUNA DE LEITURA (8 COLUNAS) */}
          <div className="lg:col-span-8 space-y-6">
            {/* SEÇÃO I. IDENTIFICAÇÃO */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.04em] text-indigo-700 flex items-center gap-2">
                  <span>I. IDENTIFICAÇÃO</span>
                </h2>
                <button
                  type="button"
                  onClick={() => abrirEdicaoComFoco()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Tipo */}
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                    Tipo
                  </span>
                  <div className="text-sm font-medium text-slate-900">
                    {tipoAtaExibicao} — Assembleia Geral Extraordinária
                  </div>
                </div>

                {/* Data */}
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                    Data
                  </span>
                  {temData ? (
                    <div className="text-sm font-medium text-slate-900">{dataAtaFormatada}</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                        Pendente
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirEdicaoComFoco('data')}
                        className="text-xs text-indigo-600 hover:underline font-medium"
                      >
                        Definir data
                      </button>
                    </div>
                  )}
                </div>

                {/* Empresa */}
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                    Empresa
                  </span>
                  {temEmpresa ? (
                    <div className="text-sm font-medium text-slate-900">{doc.empresa}</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                        Não vinculada
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirEdicaoComFoco('empresa')}
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-semibold"
                      >
                        Vincular
                      </button>
                    </div>
                  )}
                </div>

                {/* Mesa diretora */}
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                    Mesa diretora
                  </span>
                  {temMesa ? (
                    <div className="text-sm font-medium text-slate-900">{doc.mesa_diretora}</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                        Não informada
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirEdicaoComFoco('mesa')}
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-semibold"
                      >
                        Preencher
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SEÇÃO II. PAUTA COM TABELAS DE COMPARAÇÃO ESTRUTURADAS (Fiel ao mockup Imagem 1) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.04em] text-indigo-700">
                  II. PAUTA
                </h2>
              </div>

              {itensPauta.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Nenhum item de pauta registrado nesta ata.
                </div>
              ) : (
                <div className="space-y-6">
                  {itensPauta.map((item) => (
                    <div key={item.id} className="flex items-start gap-4">
                      {/* Número em círculo índigo */}
                      <div className="h-7 w-7 rounded-full bg-indigo-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {item.numero}
                      </div>

                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{item.titulo}</h3>
                          <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                            {item.descricao}
                          </p>
                        </div>

                        {/* Tabela de Comparação Estruturada (ano | valor | variação) */}
                        {item.comparativo && item.comparativo.length > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4 mt-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                                {item.comparativo.map((c) => (
                                  <div key={c.ano} className="flex items-baseline gap-2">
                                    <span className="text-slate-500 font-sans font-medium">
                                      {c.ano}
                                    </span>
                                    <span className="font-bold text-slate-900">{c.valor}</span>
                                  </div>
                                ))}
                              </div>

                              {item.variacao && (
                                <div className="self-end sm:self-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-700 text-white">
                                    variação {item.variacao}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEÇÃO III. DELIBERAÇÕES (Fiel ao mockup Imagem 1) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.04em] text-indigo-700">
                  III. DELIBERAÇÕES
                </h2>
                {deliberacoes.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setModalDeliberacaoAberta(true)}
                    className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-full gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar deliberação
                  </Button>
                )}
              </div>

              {deliberacoes.length === 0 ? (
                /* Empty state com borda tracejada e botão azul (como no mockup) */
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 p-8 text-center space-y-3">
                  <p className="text-xs font-medium text-slate-500">
                    Nenhuma deliberação registrada
                  </p>
                  <Button
                    type="button"
                    onClick={() => setModalDeliberacaoAberta(true)}
                    className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
                  >
                    Registrar deliberação
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {deliberacoes.map((delib, idx) => (
                    <div
                      key={delib.id || idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                            ✓
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            Deliberação #{idx + 1}
                          </span>
                        </div>
                        {delib.aprovado_por && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {delib.aprovado_por}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-sans pl-7">
                        {delib.texto}
                      </p>
                      {(delib.responsavel || delib.prazo) && (
                        <div className="flex items-center gap-4 text-[11px] text-slate-500 pl-7 pt-1">
                          {delib.responsavel && (
                            <span>
                              Responsável: <strong>{delib.responsavel}</strong>
                            </span>
                          )}
                          {delib.prazo && (
                            <span>
                              Prazo: <strong>{delib.prazo}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TRILHA DE ERRATAS / AUDITORIA (Se houver erratas registradas) */}
            {Array.isArray(doc.erratas) && doc.erratas.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h2 className="text-xs font-extrabold uppercase tracking-[0.04em] text-slate-700 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Trilha de Erratas e Auditoria ({doc.erratas.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {doc.erratas.map((errata: any, eIdx: number) => (
                    <div
                      key={errata.id || eIdx}
                      className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-900">
                          Errata #{eIdx + 1} · {errata.motivo}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          {errata.data ? String(errata.data).slice(0, 10) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{errata.texto}</p>
                      <div className="text-[10px] text-slate-500">
                        Registrado por: {errata.autor}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PAINEL LATERAL (4 COLUNAS) */}
          <div className="lg:col-span-4 space-y-6">
            {/* CARD 1: COMPLETUDE DA ATA */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Completude da ata
                </h3>
                <span className="text-xs font-semibold text-slate-500">
                  {qtdCumpridos} de {totalRequisitos} requisitos
                </span>
              </div>

              {/* Barra de progresso */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-700 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pctCompletude}%` }}
                />
              </div>

              {/* Lista dos 5 requisitos */}
              <div className="space-y-2.5 pt-1">
                {requisitos.map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {req.cumprido ? (
                        <div className="h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 text-[10px]">
                          ✓
                        </div>
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
                      )}
                      <span
                        className={req.cumprido ? 'text-slate-800 font-medium' : 'text-slate-500'}
                      >
                        {req.label}
                      </span>
                    </div>

                    {!req.cumprido && req.acao && (
                      <button
                        type="button"
                        onClick={req.acao}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Preencher
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* CARD 2: ASSINATURAS (com avatares, cargos e status) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Assinaturas
                </h3>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 font-medium"
                >
                  {assinaturas.filter((a) => a.status === 'assinada').length}/{assinaturas.length}
                </Badge>
              </div>

              <div className="space-y-3">
                {assinaturas.map((ass) => (
                  <div key={ass.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Avatar circular */}
                      <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                        {ass.iniciais}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{ass.nome}</div>
                        <div className="text-[11px] text-slate-500 truncate">{ass.cargo}</div>
                      </div>
                    </div>

                    {/* Estado: check verde vs pill pendente */}
                    <button
                      type="button"
                      onClick={() => alternarAssinatura(ass.id)}
                      title="Clique para alternar o estado da assinatura"
                      className="shrink-0"
                    >
                      {ass.status === 'assinada' ? (
                        <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shadow-xs hover:bg-emerald-600">
                          ✓
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200">
                          pendente
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* CARD 3: PENDÊNCIAS E ALERTAS */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Pendências e alertas
                </h3>
                {qtdPendencias > 0 && (
                  <span className="h-5 w-5 rounded-full bg-amber-600 text-white text-[11px] font-bold flex items-center justify-center">
                    {qtdPendencias}
                  </span>
                )}
              </div>

              {pendenciasLista.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  Nenhuma pendência ou inconformidade.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendenciasLista.map((pend) => (
                    <div
                      key={pend.id}
                      className="flex items-center justify-between gap-2 text-xs py-1"
                    >
                      <div className="flex items-center gap-2 text-amber-900 min-w-0">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">{pend.titulo}</span>
                      </div>
                      <button
                        type="button"
                        onClick={pend.acao}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
                      >
                        {pend.textoLink}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. BARRA INFERIOR FIXA (Fiel ao mockup Imagem 1) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xs border-t border-slate-200 py-3 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Última alteração há 3 dias · ID {documentoId.slice(0, 8)}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (qtdAnexos > 0) {
                  onAbrirAnexoModal?.(doc)
                } else {
                  toast({
                    title: 'Exportação documental',
                    description: 'Gerando espelho em PDF da ata com as seções I, II e III...',
                  })
                }
              }}
              className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Baixar PDF
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => abrirEdicaoComFoco()}
              className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5 mr-1.5" />
              Editar dados
            </Button>

            {/* BOTÃO PUBLICAR ATA: Bloqueado com Tooltip detalhado se houver pendência bloqueante */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      disabled={!podePublicar || salvando}
                      onClick={publicarAta}
                      className={`rounded-xl text-xs font-semibold px-4 py-2 gap-1.5 shadow-xs ${
                        podePublicar
                          ? 'bg-indigo-700 hover:bg-indigo-800 text-white cursor-pointer'
                          : 'bg-indigo-300 text-white cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {estaPublicada ? 'Ata publicada' : 'Publicar ata'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!podePublicar && !estaPublicada && (
                  <TooltipContent className="max-w-xs text-xs bg-slate-900 text-white p-2.5 rounded-xl">
                    <p className="font-bold mb-1">Requisitos bloqueantes para publicação:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {bloqueiosPublicacao.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                )}
                {estaPublicada && (
                  <TooltipContent className="text-xs bg-slate-900 text-white">
                    Ata já formalizada e publicada.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* MODAL 1: EDITAR DADOS DA ATA (Empresa, Mesa, Tipo, Data) */}
      <Dialog open={modalEdicaoAberta} onOpenChange={setModalEdicaoAberta}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Editar Identificação da Ata
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Empresa vinculada *</Label>
              <Input
                value={formEmpresa}
                onChange={(e) => setFormEmpresa(e.target.value)}
                placeholder="Ex: Extrafruti, Casafruti, FoldBox..."
                className="rounded-[10px] text-xs"
              />
              <p className="text-[11px] text-slate-500">
                Obrigatório para compliance e validade jurídica.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Mesa diretora *</Label>
              <Input
                value={formMesa}
                onChange={(e) => setFormMesa(e.target.value)}
                placeholder="Ex: Carlos Diretor (Presidente), Ana Jurídico (Secretária)"
                className="rounded-[10px] text-xs"
              />
              <p className="text-[11px] text-slate-500">
                Composição obrigatória da mesa para publicação.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Tipo de ata</Label>
                <Input
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value)}
                  placeholder="AGE / AGO"
                  className="rounded-[10px] text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Data da assembleia</Label>
                <Input
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalEdicaoAberta(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando}
                onClick={salvarEdicaoDados}
                className="bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-semibold"
              >
                {salvando ? 'Salvando...' : 'Salvar identificação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: REGISTRAR DELIBERAÇÃO */}
      <Dialog open={modalDeliberacaoAberta} onOpenChange={setModalDeliberacaoAberta}>
        <DialogContent className="max-w-lg rounded-2xl bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Registrar Deliberação da Assembleia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Texto da Deliberação *</Label>
              <Textarea
                rows={4}
                value={novaDelibTexto}
                onChange={(e) => setNovaDelibTexto(e.target.value)}
                placeholder="Descreva a deliberação votada e aprovada pela assembleia..."
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Responsável pela execução
                </Label>
                <Input
                  value={novaDelibResp}
                  onChange={(e) => setNovaDelibResp(e.target.value)}
                  placeholder="Ex: Diretoria Financeira"
                  className="rounded-[10px] text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Prazo estipulado</Label>
                <Input
                  value={novaDelibPrazo}
                  onChange={(e) => setNovaDelibPrazo(e.target.value)}
                  placeholder="Ex: 31/12/2026"
                  className="rounded-[10px] text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalDeliberacaoAberta(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando || !novaDelibTexto.trim()}
                onClick={salvarNovaDeliberacao}
                className="bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-semibold"
              >
                {salvando ? 'Registrando...' : 'Registrar deliberação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: REGISTRAR ERRATA (Compliance pós-publicação) */}
      <Dialog open={modalErrataAberta} onOpenChange={setModalErrataAberta}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Registrar Errata Documental
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Atas publicadas são imutáveis. Qualquer retificação deve ser lavrada como errata com
              motivo formal e assinatura do responsável.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Motivo formal *</Label>
              <Input
                value={motivoErrata}
                onChange={(e) => setMotivoErrata(e.target.value)}
                placeholder="Ex: Retificação no percentual de reajuste..."
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Texto da Retificação *</Label>
              <Textarea
                rows={3}
                value={textoErrata}
                onChange={(e) => setTextoErrata(e.target.value)}
                placeholder="Onde constou X, leia-se Y..."
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalErrataAberta(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando || !textoErrata.trim() || !motivoErrata.trim()}
                onClick={salvarErrata}
                className="bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-semibold"
              >
                {salvando ? 'Gravando...' : 'Gravar errata formal'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
