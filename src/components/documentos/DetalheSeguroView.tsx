/**
 * DetalheSeguroView — tela de detalhe dedicada da aba Seguros (/documentos).
 * Mesmo padrão das demais views dedicadas (DetalheConvencaoView / DetalheContratoView):
 * - Hero com KPIs (vigência, importância segurada, prêmio)
 * - Caixa de anexos com upload/visualização/remoção (DocumentoDetalheAnexos)
 * - Edição inline por campo (CampoEditorInline)
 * - Parecer IA contextual para apólices
 * - Barra inferior fixa sem conflito com a sidebar
 */

import React, { useState, useMemo } from 'react'
import {
  ArrowLeft,
  Paperclip,
  Pencil,
  Users,
  CalendarDays,
  ShieldCheck,
  BadgeDollarSign,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { contarAnexos } from './documentos-anexos-utils'
import { AnexoVisualizadorInline } from './AnexoVisualizadorInline'
import { CampoEditorInline, DefinicaoCampo } from './CampoEditorInline'
import { ResponsaveisEditorDialog } from './ResponsaveisEditorDialog'
import { DocumentoParecerButton } from './DocumentoParecerButton'
import { DocumentoDetalheAnexos } from './DocumentoDetalheAnexos'
import { calcularPrazoValidade, obterStatusInfo } from './documentos-design-tokens'

export interface DetalheSeguroProps {
  documentoId: string
  registroInicial?: Record<string, any>
  onVoltar?: () => void
  onSalvo?: () => void
  onAbrirAnexoModal?: (doc: any) => void
}

const PROMPT_PADRAO_SEGURO = `Você é um assessor de riscos e seguros do Portal de Gestão Executivo.
Analise esta APÓLICE DE SEGURO e emita um parecer objetivo em PT-BR, no formato JSON com as chaves resumo, riscos, oportunidades, ameacas e sugestoes.
Considere: vigência e renovação, coberturas contratadas versus riscos do negócio, exclusões relevantes, limites de indenização e importância segurada, franquias, prêmio e sinistralidade, e obrigações do segurado.`

const fmtDataBR = (iso?: string | null) => {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

const fmtMoeda = (v: any) => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function DetalheSeguroView({
  documentoId,
  registroInicial,
  onVoltar,
  onSalvo,
}: DetalheSeguroProps) {
  const { toast } = useToast()
  const [doc, setDoc] = useState<Record<string, any>>(registroInicial || {})
  const [carregando, setCarregando] = useState(!registroInicial)
  const [salvando, setSalvando] = useState(false)
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)
  const [editorAberto, setEditorAberto] = useState(false)
  const [camposEmEdicao, setCamposEmEdicao] = useState<DefinicaoCampo[]>([])
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  React.useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await pb.collection('seguros').getOne(documentoId)
        if (vivo) setDoc(r)
      } catch (e: any) {
        console.warn('Erro ao carregar seguro:', e)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [documentoId])

  // contarAnexos devolve OBJETO { total, pdfs, imagens } — usar .total no JSX
  const anexosResumo = useMemo(() => contarAnexos(doc.anexo), [doc.anexo])
  const qtdAnexos = anexosResumo.total

  const statusInfo = useMemo(
    () => obterStatusInfo(String(doc.status || ''), 'seguros'),
    [doc.status],
  )

  const abrirEditor = (campos: DefinicaoCampo[]) => {
    setCamposEmEdicao(campos)
    setEditorAberto(true)
  }

  const salvarDireto = async (payload: Record<string, any>) => {
    if (!documentoId) return
    setSalvando(true)
    try {
      const atualizado = await pb.collection('seguros').update(documentoId, payload)
      setDoc(atualizado)
      toast({ title: 'Seguro atualizado', description: 'Alteração salva com sucesso.' })
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar',
        description: e?.message || 'Não foi possível salvar a alteração.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const prazoVigencia = doc.vigencia_fim ? calcularPrazoValidade(String(doc.vigencia_fim)) : null

  if (carregando && !doc?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-slate-500">Carregando seguro…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* HEADER */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onVoltar}
                className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Voltar
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                  <h1 className="text-base font-bold text-slate-900 truncate max-w-[520px]">
                    {doc.titulo || 'Apólice de seguro'}
                  </h1>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold border ${statusInfo?.corClasses || 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    {statusInfo?.rotulo || doc.status || 'Status não informado'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {doc.seguradora ? `${doc.seguradora} · ` : ''}
                  {doc.empresa || 'Empresa não informada'}
                </p>
              </div>
            </div>

            <DocumentoParecerButton
              documento={doc}
              tipoAba="seguros"
              promptPadrao={PROMPT_PADRAO_SEGURO}
            />
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 max-w-5xl mx-auto">
          {/* KPIs hero */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() =>
                abrirEditor([
                  { campo: 'vigencia_inicio', rotulo: 'Início da vigência', tipo: 'data' },
                  {
                    campo: 'vigencia_fim',
                    rotulo: 'Fim da vigência',
                    tipo: 'data',
                    obrigatorio: true,
                  },
                ])
              }
              className="text-left rounded-[16px] bg-white border border-slate-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:ring-2 hover:ring-emerald-700/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-700" />
                Vigência
              </div>
              <div className="mt-2 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {fmtDataBR(doc.vigencia_inicio) || '—'} → {fmtDataBR(doc.vigencia_fim) || '—'}
              </div>
              <div
                className={`text-[10.5px] font-medium mt-1 ${prazoVigencia?.corTexto || 'text-slate-500'}`}
              >
                {prazoVigencia?.textoAmigavel || 'Informe a vigência'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                abrirEditor([
                  {
                    campo: 'importancia_segurada',
                    rotulo: 'Importância segurada (R$)',
                    tipo: 'moeda',
                  },
                ])
              }
              className="text-left rounded-[16px] bg-white border border-slate-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:ring-2 hover:ring-emerald-700/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                Importância segurada
              </div>
              <div className="mt-2 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {fmtMoeda(doc.importancia_segurada) || 'Não informada'}
              </div>
              <div className="text-[10.5px] font-medium text-slate-500 mt-1">
                {doc.importancia_segurada != null
                  ? 'Limite máximo de indenização'
                  : 'Clique para informar'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                abrirEditor([{ campo: 'premio_total', rotulo: 'Prêmio total (R$)', tipo: 'moeda' }])
              }
              className="text-left rounded-[16px] bg-white border border-slate-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:ring-2 hover:ring-emerald-700/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <BadgeDollarSign className="h-3.5 w-3.5 text-emerald-700" />
                Prêmio
              </div>
              <div className="mt-2 font-mono text-sm font-semibold text-emerald-800 tabular-nums">
                {fmtMoeda(doc.premio_total) || 'Não informado'}
              </div>
              <div className="text-[10.5px] font-medium text-slate-500 mt-1">
                {doc.premio_total != null ? 'Valor pago pelo seguro' : 'Clique para informar'}
              </div>
            </button>
          </div>

          {/* Dados do seguro */}
          <div className="rounded-[16px] bg-white border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Dados do seguro</h2>
              <span className="text-[11px] text-slate-400">Clique em um campo para editar</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {[
                { campo: 'titulo', rotulo: 'Título', tipo: 'texto' as const, obrigatorio: true },
                { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' as const },
                { campo: 'seguradora', rotulo: 'Seguradora', tipo: 'texto' as const },
                { campo: 'corretora', rotulo: 'Corretora', tipo: 'texto' as const },
                { campo: 'numero_apolice', rotulo: 'Nº da apólice', tipo: 'texto' as const },
                { campo: 'ramo', rotulo: 'Ramo', tipo: 'texto' as const },
                { campo: 'franquia', rotulo: 'Franquia (R$)', tipo: 'moeda' as const },
                { campo: 'status', rotulo: 'Status', tipo: 'texto' as const },
                { campo: 'cobertura', rotulo: 'Coberturas', tipo: 'textarea' as const },
                { campo: 'objeto', rotulo: 'Objeto / bens segurados', tipo: 'textarea' as const },
                { campo: 'observacoes', rotulo: 'Observações', tipo: 'textarea' as const },
              ].map((c) => (
                <div
                  key={c.campo}
                  role="button"
                  tabIndex={0}
                  onClick={() => abrirEditor([c])}
                  onKeyDown={(e) => e.key === 'Enter' && abrirEditor([c])}
                  className="group cursor-pointer rounded-lg border border-transparent hover:border-emerald-200 hover:bg-emerald-50/40 px-2 py-1.5 -mx-2 transition"
                >
                  <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    {c.rotulo}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
                  </div>
                  <div className="text-xs text-slate-900 mt-0.5 whitespace-pre-wrap break-words">
                    {(() => {
                      const bruto = doc[c.campo]
                      if (bruto === null || bruto === undefined || bruto === '') {
                        return <span className="text-slate-400">Não informado</span>
                      }
                      if (c.tipo === 'moeda') return fmtMoeda(bruto)
                      return String(bruto)
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Anexos */}
          <div className="rounded-[16px] bg-white border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-emerald-700" />
                Anexos ({qtdAnexos})
              </h2>
            </div>
            <DocumentoDetalheAnexos
              colecaoNome="seguros"
              recordId={documentoId}
              anexos={doc.anexo}
              onVisualizarArquivo={(nome) => setAnexoVisualizando(nome)}
              onAnexosAlterados={() => {
                pb.collection('seguros')
                  .getOne(documentoId)
                  .then((r) => {
                    setDoc(r)
                    onSalvo?.()
                  })
                  .catch(() => {})
              }}
            />
          </div>

          {/* Responsáveis */}
          <div className="rounded-[16px] bg-white border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-700" />
                Responsáveis
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResponsaveisAberto(true)}
                className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar responsáveis
              </Button>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
              <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">
                Responsáveis
              </div>
              <div className="text-xs font-medium text-slate-900 mt-0.5 whitespace-pre-wrap break-words">
                {doc.responsaveis || <span className="text-slate-400">Não informado</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA INFERIOR FIXA */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3 flex items-center justify-between gap-3 z-20">
        <div className="text-xs text-slate-500 truncate">
          {doc.titulo || 'Apólice de seguro'} · {doc.empresa || '—'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onVoltar}
            className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={salvando}
            onClick={() => setResponsaveisAberto(true)}
            className="rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Responsáveis
          </Button>
        </div>
      </div>

      <CampoEditorInline
        aberto={editorAberto}
        onOpenChange={setEditorAberto}
        colecao="seguros"
        documento={doc}
        campos={camposEmEdicao}
        onSalvo={(r) => {
          setDoc(r)
          onSalvo?.()
        }}
      />

      <ResponsaveisEditorDialog
        aberto={responsaveisAberto}
        onOpenChange={setResponsaveisAberto}
        colecao="seguros"
        documento={doc}
        contexto="do seguro"
        onSalvo={(r) => {
          setDoc(r)
          onSalvo?.()
        }}
      />

      {anexoVisualizando && (
        <AnexoVisualizadorInline
          aberto={!!anexoVisualizando}
          onOpenChange={(v) => !v && setAnexoVisualizando(null)}
          colecao="seguros"
          registroId={documentoId}
          nomeArquivo={anexoVisualizando}
        />
      )}
    </div>
  )
}
