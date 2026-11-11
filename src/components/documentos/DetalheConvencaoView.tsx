/**
 * DetalheConvencaoView — tela de detalhe dedicada da aba Convenções (/documentos).
 * Mesmo padrão das demais views dedicadas (DetalheAtaView etc.):
 * - Hero com KPIs (vigência, data-base, reajuste)
 * - Caixa de anexos com visualização inline + download (AnexoVisualizadorInline)
 * - Edição inline por campo (CampoEditorInline)
 * - Responsáveis editáveis (ResponsaveisEditorDialog)
 * - Parecer IA contextual para convenções coletivas
 * - Barra inferior fixa sem conflito com a sidebar
 */

import React, { useState, useMemo } from 'react'
import { ArrowLeft, Paperclip, Pencil, Users, CalendarDays, Percent, Handshake } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { contarAnexos } from './documentos-anexos-utils'
import { AnexoVisualizadorInline } from './AnexoVisualizadorInline'
import { DocumentoDetalheAnexos } from './DocumentoDetalheAnexos'
import { CampoEditorInline, DefinicaoCampo } from './CampoEditorInline'
import { ResponsaveisEditorDialog } from './ResponsaveisEditorDialog'
import { DocumentoParecerButton } from './DocumentoParecerButton'
import { calcularPrazoValidade, obterStatusInfo } from './documentos-design-tokens'

export interface DetalheConvencaoProps {
  documentoId: string
  registroInicial?: Record<string, any>
  onVoltar?: () => void
  onSalvo?: () => void
  onAbrirAnexoModal?: (doc: any) => void
}

const PROMPT_PADRAO_CONVENCAO = `Você é um assessor jurídico-trabalhista do Portal de Gestão Executivo.
Analise esta CONVENÇÃO COLETIVA DE TRABALHO e emita um parecer objetivo em PT-BR, no formato JSON com as chaves resumo, riscos, oportunidades, ameacas e sugestoes.
Considere: vigência e data-base, percentual de reajuste salarial, cláusulas econômicas (benefícios, adicionais), cláusulas obrigacionais que gerem custo à empresa, multas e obrigações de fazer, e prazos de cumprimento.`

const fmtDataBR = (iso?: string | null) => {
  if (!iso) return ''
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

export function DetalheConvencaoView({
  documentoId,
  registroInicial,
  onVoltar,
  onSalvo,
}: DetalheConvencaoProps) {
  const { toast } = useToast()
  const [doc, setDoc] = useState<Record<string, any>>(registroInicial || {})
  const [carregando, setCarregando] = useState(!registroInicial)
  const [salvando, setSalvando] = useState(false)
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)

  // Editor inline
  const [editorAberto, setEditorAberto] = useState(false)
  const [camposEmEdicao, setCamposEmEdicao] = useState<DefinicaoCampo[]>([])

  // Responsáveis
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  React.useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await pb.collection('convencoes').getOne(documentoId)
        if (vivo) setDoc(r)
      } catch (e: any) {
        console.warn('Erro ao carregar convenção:', e)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [documentoId])

  // contarAnexos devolve OBJETO { total, pdfs, imagens } — renderizar o objeto
  // direto no JSX imprimia "[object Object]" no título da caixa de anexos.
  const anexosResumo = useMemo(() => contarAnexos(doc.anexo), [doc.anexo])
  const qtdAnexos = anexosResumo.total

  const statusInfo = useMemo(
    () => obterStatusInfo(String(doc.status || ''), 'convencoes'),
    [doc.status],
  )

  // ===== ALINHAMENTO DE CAMPOS (11/11/2026) =====
  // A view lia nomes que NÃO existem na coleção `convencoes` (migração 0060):
  //   lido aqui       -> campo real no PocketBase
  //   sindicato       -> entidade_sindical
  //   percentual_reajuste -> reajuste_percentual
  //   responsavel_interno/externo -> responsaveis (campo único)
  // Resultado: a tela mostrava "Não informado" mesmo com o dado gravado, e as
  // edições inline salvavam em campos inexistentes (erro 400 do PocketBase).
  const sindicato = doc.entidade_sindical || doc.sindicato || ''
  const partePatronal = doc.parte_patronal || ''
  const percentualReajuste = doc.reajuste_percentual ?? doc.percentual_reajuste ?? null
  const responsaveisTexto =
    doc.responsaveis || doc.responsavel_interno || doc.responsavel_externo || ''

  // Data-base é texto livre na coleção ('Outubro'), mas o editor de data exige
  // ISO. Converte só quando o conteúdo for uma data real; senão o campo abre vazio
  // e o usuário perde o que estava gravado.
  const dataBaseIso = (() => {
    const bruto = String(doc.data_base || '').trim()
    if (!bruto) return ''
    if (/^\d{4}-\d{2}-\d{2}/.test(bruto)) return bruto.slice(0, 10)
    const meses: Record<string, string> = {
      janeiro: '01',
      fevereiro: '02',
      marco: '03',
      abril: '04',
      maio: '05',
      junho: '06',
      julho: '07',
      agosto: '08',
      setembro: '09',
      outubro: '10',
      novembro: '11',
      dezembro: '12',
    }
    const norm = bruto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const mes = Object.keys(meses).find((m) => norm.startsWith(m))
    if (mes) {
      const ano = (norm.match(/(\d{4})/) || [])[1] || String(new Date().getFullYear())
      return `${ano}-${meses[mes]}-01`
    }
    return ''
  })()

  const abrirEditor = (campos: DefinicaoCampo[]) => {
    setCamposEmEdicao(campos)
    setEditorAberto(true)
  }

  const salvarDireto = async (payload: Record<string, any>) => {
    if (!documentoId) return
    setSalvando(true)
    try {
      const atualizado = await pb.collection('convencoes').update(documentoId, payload)
      setDoc(atualizado)
      toast({
        title: 'Convenção atualizada',
        description: 'Alteração salva com sucesso.',
      })
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

  // O download/visualização/remoção de anexos agora é responsabilidade do
  // DocumentoDetalheAnexos (mesmo componente das outras abas). A função local
  // baixarAnexo ficou sem uso e foi removida — import/função órfã quebra o typecheck.

  const prazoVigencia = doc.vigencia_fim ? calcularPrazoValidade(String(doc.vigencia_fim)) : null

  if (carregando && !doc?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-slate-500">Carregando convenção…</div>
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
                  <Handshake className="h-4 w-4 text-emerald-700 shrink-0" />
                  <h1 className="text-base font-bold text-slate-900 truncate max-w-[520px]">
                    {doc.titulo || 'Convenção coletiva'}
                  </h1>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold border ${statusInfo?.corClasses || 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    {statusInfo?.rotulo || doc.status || 'Status não informado'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {sindicato ? `${sindicato} · ` : ''}
                  {doc.empresa || 'Empresa não informada'}
                </p>
              </div>
            </div>

            <DocumentoParecerButton
              documento={doc}
              tipoAba="convencoes"
              promptPadrao={PROMPT_PADRAO_CONVENCAO}
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
                abrirEditor([{ campo: 'data_base', rotulo: 'Data-base', tipo: 'texto' }])
              }
              className="text-left rounded-[16px] bg-white border border-slate-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:ring-2 hover:ring-emerald-700/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-700" />
                Data-base
              </div>
              <div className="mt-2 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {String(doc.data_base || '') || 'Não informada'}
              </div>
              <div className="text-[10.5px] font-medium text-slate-500 mt-1">
                {doc.data_base ? 'Mês-base da categoria' : 'Clique para informar'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                abrirEditor([
                  {
                    campo: 'reajuste_percentual',
                    rotulo: 'Percentual de reajuste (%)',
                    tipo: 'numero',
                  },
                ])
              }
              className="text-left rounded-[16px] bg-white border border-slate-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:ring-2 hover:ring-emerald-700/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <Percent className="h-3.5 w-3.5 text-emerald-700" />
                Reajuste salarial
              </div>
              <div className="mt-2 font-mono text-sm font-semibold text-emerald-800 tabular-nums">
                {percentualReajuste !== null && percentualReajuste !== undefined
                  ? `${String(percentualReajuste).replace('.', ',')}%`
                  : 'Não informado'}
              </div>
              <div className="text-[10.5px] font-medium text-slate-500 mt-1">
                {percentualReajuste != null ? 'Percentual aplicado' : 'Clique para informar'}
              </div>
            </button>
          </div>

          {/* Dados da convenção (edição inline campo a campo) */}
          <div className="rounded-[16px] bg-white border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Dados da convenção</h2>
              <span className="text-[11px] text-slate-400">Clique em um campo para editar</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {[
                { campo: 'titulo', rotulo: 'Título', tipo: 'texto' as const, obrigatorio: true },
                { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' as const },
                {
                  campo: 'entidade_sindical',
                  rotulo: 'Entidade sindical',
                  tipo: 'texto' as const,
                },
                { campo: 'parte_patronal', rotulo: 'Parte patronal', tipo: 'texto' as const },
                { campo: 'piso_salarial', rotulo: 'Piso salarial (R$)', tipo: 'moeda' as const },
                { campo: 'status', rotulo: 'Status', tipo: 'texto' as const },
                {
                  campo: 'observacoes',
                  rotulo: 'Observações',
                  tipo: 'textarea' as const,
                },
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
                      if (c.tipo === 'moeda') {
                        const n = Number(bruto)
                        return Number.isFinite(n)
                          ? n.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })
                          : String(bruto)
                      }
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
            {/* ANEXOS — mesmo componente das outras abas: permite Anexar (upload
                múltiplo via campo 'anexo+'), visualizar inline, baixar e remover.
                Antes a tela só listava e mandava usar o menu "…" da listagem, o que
                não permitia anexar a convenção coletiva (PDF) pela própria tela. */}
            <DocumentoDetalheAnexos
              colecaoNome="convencoes"
              recordId={documentoId}
              anexos={doc.anexo}
              onVisualizarArquivo={(nome) => setAnexoVisualizando(nome)}
              onAnexosAlterados={() => {
                // Recarrega o registro para refletir a lista real gravada no servidor
                pb.collection('convencoes')
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
            {/* A coleção tem UM campo `responsaveis` (texto). Antes a tela procurava
                responsavel_interno/responsavel_externo, que não existem no schema —
                exibia "Não informado" mesmo com o dado gravado. */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
              <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">
                Responsáveis
              </div>
              <div className="text-xs font-medium text-slate-900 mt-0.5 whitespace-pre-wrap break-words">
                {responsaveisTexto || <span className="text-slate-400">Não informado</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA INFERIOR FIXA (sem conflito com a sidebar) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3 flex items-center justify-between gap-3 z-20">
        <div className="text-xs text-slate-500 truncate">
          {doc.titulo || 'Convenção coletiva'} · {doc.empresa || '—'}
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

      {/* Editor inline de campos */}
      <CampoEditorInline
        aberto={editorAberto}
        onOpenChange={setEditorAberto}
        colecao="convencoes"
        documento={doc}
        campos={camposEmEdicao}
        onSalvo={(r) => {
          setDoc(r)
          onSalvo?.()
        }}
      />

      {/* Responsáveis */}
      <ResponsaveisEditorDialog
        aberto={responsaveisAberto}
        onOpenChange={setResponsaveisAberto}
        colecao="convencoes"
        documento={doc}
        contexto="da convenção"
        onSalvo={(r) => {
          setDoc(r)
          onSalvo?.()
        }}
      />

      {/* Visualizador inline de anexos */}
      {anexoVisualizando && (
        <AnexoVisualizadorInline
          aberto
          onOpenChange={(v) => !v && setAnexoVisualizando(null)}
          nomeArquivo={anexoVisualizando}
          colecao="convencoes"
          registroId={documentoId}
          tituloDoc={doc.titulo || 'Convenção coletiva'}
        />
      )}
    </div>
  )
}
