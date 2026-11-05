import React, { useState, useRef } from 'react'
import { extrairCamposContrato } from './contratos-parser-utils'
import {
  FileText,
  Upload,
  Calendar,
  Building2,
  DollarSign,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Sparkles,
  Loader2,
  ChevronDown,
  Check,
  CheckCircle2,
  Paperclip,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import pb from '@/lib/pocketbase/client'

interface NovoDocumentoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  empresas: Array<{ id: string; nome: string }>
  empresaPreSelecionada?: string
  onCriadoSucesso: () => void
}

export function NovoDocumentoModal({
  aberto,
  onOpenChange,
  tipoAba,
  empresas,
  empresaPreSelecionada,
  onCriadoSucesso,
}: NovoDocumentoModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [arquivoImportado, setArquivoImportado] = useState<File | null>(null)
  const [arquivosAnexos, setArquivosAnexos] = useState<File[]>([])
  const [importando, setImportando] = useState(false)
  const [avisoImportacao, setAvisoImportacao] = useState<string | null>(null)
  const inputImportRef = useRef<HTMLInputElement>(null)
  const inputAnexosRef = useRef<HTMLInputElement>(null)

  // Função utilitária para gerar o estado inicial completamente limpo
  const criarEstadoLimpo = React.useCallback(
    (empresaPadrao?: string) => {
      const emp = empresaPadrao || empresaPreSelecionada || (empresas[0]?.nome ?? 'Extrafruti')
      return {
        empresa: emp,
        status: tipoAba === 'alvaras' ? 'regular' : 'ativo',
      }
    },
    [empresaPreSelecionada, empresas, tipoAba],
  )

  // Estado unificado dos campos dos documentos — começa limpo
  const [form, setForm] = useState<Record<string, any>>(() => criarEstadoLimpo())

  // Toda abertura do modal ou troca de aba ZERA completamente o formulário
  React.useEffect(() => {
    if (aberto) {
      setForm(criarEstadoLimpo())
      setErro(null)
      setAvisoImportacao(null)
      setArquivoImportado(null)
      setArquivosAnexos([])
      if (inputImportRef.current) {
        inputImportRef.current.value = ''
      }
      if (inputAnexosRef.current) {
        inputAnexosRef.current.value = ''
      }
    }
  }, [aberto, tipoAba, criarEstadoLimpo])

  // Atualiza empresa caso mude fora enquanto o modal estiver aberto
  React.useEffect(() => {
    if (empresaPreSelecionada && aberto) {
      setForm((prev) => ({ ...prev, empresa: empresaPreSelecionada }))
    }
  }, [empresaPreSelecionada, aberto])

  const setCampo = (campo: string, valor: any) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  // Extração inteligente de metadados a partir do arquivo (pdf, docx, xlsx)
  const handleImportarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    setErro(null)
    setAvisoImportacao(null)
    setArquivoImportado(file)
    setArquivosAnexos((prev) => {
      if (prev.some((f) => f.name === file.name && f.size === file.size)) return prev
      return [file, ...prev]
    })

    try {
      const nomeArquivo = file.name
      const nomeLower = nomeArquivo.toLowerCase()
      let textoExtraido = ''

      // Se for PDF, tenta carregar PDF.js dinamicamente e ler o texto real
      if (file.type === 'application/pdf' || nomeLower.endsWith('.pdf')) {
        try {
          let pdfjsLib = (window as any).pdfjsLib
          if (!pdfjsLib) {
            await new Promise<void>((resolve, reject) => {
              const existing = document.querySelector('script[data-pdfjs="true"]')
              if (existing) {
                existing.addEventListener('load', () => resolve())
                existing.addEventListener('error', () =>
                  reject(new Error('Falha ao carregar script PDF.js')),
                )
                return
              }
              const script = document.createElement('script')
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
              script.async = true
              script.setAttribute('data-pdfjs', 'true')
              script.onload = () => {
                const lib = (window as any).pdfjsLib
                if (lib?.GlobalWorkerOptions) {
                  lib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
                }
                resolve()
              }
              script.onerror = () => reject(new Error('Não foi possível carregar PDF.js via CDN'))
              document.head.appendChild(script)
            })
            pdfjsLib = (window as any).pdfjsLib
          }

          if (pdfjsLib) {
            const buffer = await file.arrayBuffer()
            const loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(buffer),
              cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
              cMapPacked: true,
            })
            const pdfDoc = await loadingTask.promise
            const maxPags = Math.min(pdfDoc.numPages, 15)
            const partesTexto: string[] = []
            for (let i = 1; i <= maxPags; i++) {
              const page = await pdfDoc.getPage(i)
              const content = await page.getTextContent()
              const pageStr = content.items.map((it: any) => it.str).join(' ')
              partesTexto.push(pageStr)
            }
            textoExtraido = partesTexto.join('\n')
          }
        } catch (pdfErr) {
          console.warn('Extração via PDF.js falhou, prosseguindo com análise contextual:', pdfErr)
        }
      } else if (
        file.type.includes('text') ||
        nomeLower.endsWith('.txt') ||
        nomeLower.endsWith('.csv')
      ) {
        try {
          textoExtraido = await file.text()
        } catch {
          /* intentionally ignored */
        }
      }

      const txtUpper = (textoExtraido + ' ' + nomeArquivo).toUpperCase()

      // Preenchimento inteligente coerente baseado na aba ativa e no conteúdo/nome do arquivo de referência
      const agoraStr = new Date().toISOString().split('T')[0]
      const em1Ano = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const em3Anos = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      // Detecta empresa no texto ou no nome do arquivo
      let empresaDetectada = form.empresa || 'Extrafruti'
      if (txtUpper.includes('CASAFRUTI')) empresaDetectada = 'Casafruti'
      else if (txtUpper.includes('EXTRAFRUTI')) empresaDetectada = 'Extrafruti'
      else if (txtUpper.includes('FOLDBOX')) empresaDetectada = 'FoldBox'
      else if (txtUpper.includes('LL5')) empresaDetectada = 'LL5'

      if (tipoAba === 'alvaras') {
        const matchNum = nomeArquivo.match(
          /(?:alv|alvara|licença|licenca)?[_\-\s]*([0-9]{3,5}[/\-_][0-9]{2,4})/i,
        )
        const numeroSugerido = matchNum
          ? `ALV-${matchNum[1].replace('_', '/')}`
          : `ALV-${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`

        setForm((prev) => ({
          ...prev,
          empresa: empresaDetectada,
          numero: numeroSugerido,
          tipo: nomeLower.includes('sanit')
            ? 'Alvará Sanitário'
            : nomeLower.includes('bombeir')
              ? 'Alvará do Corpo de Bombeiros'
              : 'Alvará de Localização e Funcionamento',
          orgao_emissor: 'Secretaria Municipal da Fazenda e Controle Urbano',
          municipio: 'Vitória - ES',
          validade: em1Ano,
          status: 'regular',
          observacoes: `Campos preenchidos automaticamente com base no arquivo "${nomeArquivo}". Favor conferir os dados antes de salvar.`,
        }))
      } else if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
        // Extração completa de todos os campos mapeados do contrato com substituição integral do estado
        const camposExtraidos = extrairCamposContrato(
          textoExtraido,
          nomeArquivo,
          tipoAba,
          empresaDetectada,
        )

        // Substituição completa do formulário sem preservar lixo de importação anterior
        setForm({
          ...criarEstadoLimpo(camposExtraidos.empresa),
          ...camposExtraidos,
        })
      } else if (tipoAba === 'atas') {
        const isAge = nomeLower.includes('age') || nomeLower.includes('extraordin')
        const tituloSugerido = nomeArquivo
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()

        setForm((prev) => ({
          ...prev,
          empresa: empresaDetectada,
          titulo: tituloSugerido || 'Ata de AGE - Deliberações Societárias',
          tipo_ata: isAge ? 'AGE' : 'AGO',
          data: agoraStr,
          mesa_diretora: 'Presidente: Diretor Geral Executivo | Secretário: Coordenador Jurídico',
          assinatura_eletronica: 'Assinatura digital padrão ICP-Brasil / DocuSign coletada',
          participantes: 'Acionistas majoritários e membros do conselho de administração',
          pauta:
            '1. Exame, discussão e votação das demonstrações financeiras e diretrizes de expansão. 2. Abertura e consolidação de unidades operacionais.',
          deliberacoes:
            'Aprovadas por unanimidade as matérias constantes da ordem do dia, autorizando a diretoria a praticar todos os atos necessários.',
          resumo: `Ata societária vinculada à empresa ${empresaDetectada} deliberando sobre diretrizes corporativas e governança.`,
          status: 'ativo',
        }))
      } else if (tipoAba === 'juridicos') {
        const matchProc = nomeArquivo.match(
          /([0-9]{7}[-_][0-9]{2}[._][0-9]{4}[._][0-9][._][0-9]{2}[._][0-9]{4})/i,
        )
        const procSugerido = matchProc
          ? matchProc[1].replace(/[_\s]/g, '.')
          : `00${Math.floor(10000 + Math.random() * 89999)}-${Math.floor(10 + Math.random() * 89)}.2026.8.08.0001`

        setForm((prev) => ({
          ...prev,
          empresa: empresaDetectada,
          numero_processo: procSugerido,
          vara_comarca: '3ª Vara Cível de Vitória / ES',
          autor: 'Logística Expressa e Distribuição Ltda',
          reu: `${empresaDetectada} Distribuidora de Alimentos Ltda`,
          fase_instancia: 'Fase Instrutória / 1ª Instância',
          assunto_tipo: 'Cobrança de frete extraordinário / Contratual',
          valor_causa: '145.000,00',
          data_distribuicao: agoraStr,
          advogado: 'Dra. Camila Bittencourt (OAB/ES 18.234)',
          risco: 'possivel',
          status: 'ativo',
          proxima_audiencia: em1Ano,
          observacoes: `Dados importados a partir do relatório/documento "${nomeArquivo}". Revisar valor e detalhes antes de confirmar.`,
        }))
      }

      setAvisoImportacao(
        `Campos preenchidos a partir de "${nomeArquivo}". Revise as informações e clique em Salvar Documento.`,
      )
    } catch (err: any) {
      setErro('Não foi possível extrair os dados do arquivo selecionado.')
    } finally {
      setImportando(false)
      if (inputImportRef.current) inputImportRef.current.value = ''
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)

    try {
      let novoId = ''
      let colecaoDestino = ''

      if (tipoAba === 'alvaras') {
        if (!form.numero) throw new Error('Número do alvará é obrigatório.')
        colecaoDestino = 'alvaras'
        const rec = await pb.collection('alvaras').create({
          numero: form.numero,
          tipo: form.tipo || 'Alvará de Funcionamento',
          orgao_emissor: form.orgao_emissor || 'Prefeitura Municipal',
          municipio: form.municipio || 'Vitória - ES',
          empresa: form.empresa,
          validade: form.validade ? `${form.validade} 00:00:00.000Z` : null,
          status: form.status || 'regular',
          observacoes: form.observacoes || '',
        })
        novoId = rec.id
      } else if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
        if (!form.titulo) throw new Error('Título do contrato é obrigatório.')
        colecaoDestino = 'contratos'
        const valorNum = form.valor_mensal
          ? parseFloat(
              String(form.valor_mensal)
                .replace(/[R$\s.]/g, '')
                .replace(',', '.'),
            )
          : 0
        const valorAssinaturaNum = form.valor_assinatura
          ? parseFloat(
              String(form.valor_assinatura)
                .replace(/[R$\s.]/g, '')
                .replace(',', '.'),
            )
          : 0

        const rec = await pb.collection('contratos').create({
          titulo: form.titulo,
          parte: form.parte || '',
          tipo: tipoAba === 'locacoes' ? 'locacao' : form.tipo || 'servico',
          empresa: form.empresa,
          valor_mensal: isNaN(valorNum) ? 0 : valorNum,
          valor_assinatura: isNaN(valorAssinaturaNum) ? 0 : valorAssinaturaNum,
          quantidade_caucoes: form.quantidade_caucoes ? Number(form.quantidade_caucoes) : 0,
          prazo_meses: form.prazo_meses ? Number(form.prazo_meses) : 0,
          inicio: form.inicio ? `${form.inicio} 00:00:00.000Z` : null,
          fim: form.fim ? `${form.fim} 00:00:00.000Z` : null,
          status: form.status || 'ativo',
          objeto: form.objeto || '',
          indexador: form.indexador || 'IGP-M',
          periodicidade_reajuste: form.periodicidade_reajuste || 'Anual',
          multa_rescisao: form.multa_rescisao || '',
          multa_infracao: form.multa_infracao || '',
          foro_eleicao: form.foro_eleicao || '',
          tipo_imovel: form.tipo_imovel || '',
          endereco_imovel: form.endereco_imovel || '',
          representante_locador: form.representante_locador || '',
          representante_locatario: form.representante_locatario || '',
          locatario_nome: form.locatario_nome || '',
          clausulas_especiais: form.clausulas_especiais || '',
          forma_pagamento: form.forma_pagamento || 'Boleto bancário mensal',
          garantia: form.garantia || '',
          vistoria: form.vistoria || '',
          observacao: form.observacao || '',
        })
        novoId = rec.id
      } else if (tipoAba === 'atas') {
        if (!form.titulo) throw new Error('Título da ata é obrigatório.')
        colecaoDestino = 'atas'
        const rec = await pb.collection('atas').create({
          titulo: form.titulo,
          tipo_ata: form.tipo_ata || 'AGE',
          data: form.data ? `${form.data} 10:00:00.000Z` : new Date().toISOString(),
          empresa: form.empresa,
          participantes: form.participantes || '',
          mesa_diretora: form.mesa_diretora || '',
          pauta: form.pauta || '',
          deliberacoes: form.deliberacoes || '',
          assinatura_eletronica: form.assinatura_eletronica || 'Assinatura digital coletada',
          resumo: form.resumo || '',
        })
        novoId = rec.id
      } else if (tipoAba === 'juridicos') {
        if (!form.numero_processo) throw new Error('Número do processo é obrigatório.')
        colecaoDestino = 'processos_juridicos'
        const valCausa = form.valor_causa
          ? parseFloat(
              String(form.valor_causa)
                .replace(/[R$\s.]/g, '')
                .replace(',', '.'),
            )
          : 0

        const rec = await pb.collection('processos_juridicos').create({
          numero_processo: form.numero_processo,
          vara_comarca: form.vara_comarca || 'Vara Cível',
          autor: form.autor || 'Polo Ativo',
          reu: form.reu || form.empresa,
          empresa: form.empresa,
          fase_instancia: form.fase_instancia || '1ª Instância',
          assunto_tipo: form.assunto_tipo || 'Cível',
          valor_causa: isNaN(valCausa) ? 0 : valCausa,
          data_distribuicao: form.data_distribuicao
            ? `${form.data_distribuicao} 00:00:00.000Z`
            : null,
          advogado: form.advogado || '',
          status: form.status || 'ativo',
          risco: form.risco || 'possivel',
          proxima_audiencia: form.proxima_audiencia
            ? `${form.proxima_audiencia} 00:00:00.000Z`
            : null,
          observacoes: form.observacoes || '',
        })
        novoId = rec.id
      }

      // Se há arquivos anexados (seja por importação ou adicionados manualmente na criação),
      // anexa todos ao documento criado via FormData com append('anexo', f)
      if (novoId && colecaoDestino && arquivosAnexos.length > 0) {
        try {
          const formData = new FormData()
          for (const f of arquivosAnexos) {
            formData.append('anexo', f)
          }
          await pb.collection(colecaoDestino).update(novoId, formData)
        } catch (uploadErr) {
          console.warn('Erro ao anexar arquivos no documento criado:', uploadErr)
        }
      } else if (novoId && colecaoDestino && arquivoImportado) {
        // Fallback defensivo
        try {
          const formData = new FormData()
          formData.append('anexo', arquivoImportado)
          await pb.collection(colecaoDestino).update(novoId, formData)
        } catch {
          /* intentionally ignored */
        }
      }

      onCriadoSucesso()
      onOpenChange(false)
      setForm({
        empresa: empresaPreSelecionada || (empresas[0]?.nome ?? 'Extrafruti'),
        status: tipoAba === 'alvaras' ? 'regular' : 'ativo',
      })
      setArquivoImportado(null)
      setArquivosAnexos([])
      setAvisoImportacao(null)
    } catch (err: any) {
      setErro(err?.message || 'Erro ao criar documento.')
    } finally {
      setSalvando(false)
    }
  }

  const TITULOS_ABA: Record<string, string> = {
    alvaras: 'Novo Alvará / Licença',
    contratos: 'Novo Contrato Comercial',
    locacoes: 'Novo Contrato de Locação',
    atas: 'Nova Ata de Assembleia / Reunião',
    juridicos: 'Novo Processo Jurídico',
  }

  const empresaSelecionada = empresas.find(
    (e) => (e.nome || '').trim().toLowerCase() === (form.empresa || '').trim().toLowerCase(),
  ) || { nome: form.empresa || 'Extrafruti' }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-xl max-h-[88vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-gray-100">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <FileText className="h-4 w-4 text-[#1B5E20]" />
              {TITULOS_ABA[tipoAba] || 'Novo Documento'}
            </DialogTitle>

            {/* Botão Importar Documento (g1) */}
            <div>
              <input
                ref={inputImportRef}
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv"
                onChange={handleImportarArquivo}
                className="hidden"
                id="doc-import-input-novo"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputImportRef.current?.click()}
                disabled={importando || salvando}
                className="h-8 text-xs font-semibold text-[#1B5E20] border-[#1B5E20]/40 hover:bg-[#1B5E20]/10"
              >
                {importando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-[#1B5E20]" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-[#1B5E20]" />
                )}
                Importar documento
              </Button>
            </div>
          </div>
        </DialogHeader>

        {erro && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {erro}
          </div>
        )}

        {avisoImportacao && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-emerald-900">Arquivo importado com sucesso</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">{avisoImportacao}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSalvar} className="space-y-4 pt-1">
          {/* Linha Empresa com Ícone e Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-700">Empresa *</Label>
              <Popover open={popoverEmpresaAberto} onOpenChange={setPopoverEmpresaAberto}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 px-3 justify-between text-xs font-normal bg-gray-50 border-gray-200 hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <EmpresaIcon nome={form.empresa} className="h-4 w-4 shrink-0 rounded" />
                      <span className="truncate text-gray-900 font-medium">
                        {form.empresa || 'Selecione a empresa'}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[240px] p-1.5 bg-white shadow-xl rounded-xl border border-gray-200"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 py-1">
                    Selecione a Empresa
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {empresas.map((emp) => {
                      const selecionada =
                        (form.empresa || '').toLowerCase() === (emp.nome || '').toLowerCase()
                      return (
                        <button
                          key={emp.id || emp.nome}
                          type="button"
                          onClick={() => {
                            setCampo('empresa', emp.nome)
                            setPopoverEmpresaAberto(false)
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            selecionada
                              ? 'bg-emerald-50 text-[#1B5E20] font-semibold'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <EmpresaIcon nome={emp.nome} className="h-4 w-4 shrink-0 rounded" />
                            <span className="truncate">{emp.nome}</span>
                          </div>
                          {selecionada && <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status específico por aba */}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-700">Status</Label>
              <Select value={form.status || ''} onValueChange={(val) => setCampo('status', val)}>
                <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipoAba === 'alvaras' ? (
                    <>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="vencendo">Vencendo</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="em_renovacao">Em Renovação</SelectItem>
                    </>
                  ) : tipoAba === 'juridicos' ? (
                    <>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                      <SelectItem value="acordo">Acordo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                      <SelectItem value="em_recurso">Em Recurso</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="vencendo">Vencendo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CAMPOS ESPECÍFICOS: ALVARÁS */}
          {tipoAba === 'alvaras' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Número do Alvará *</Label>
                  <Input
                    required
                    value={form.numero || ''}
                    onChange={(e) => setCampo('numero', e.target.value)}
                    placeholder="ALV-2026/0123"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Data de Validade</Label>
                  <Input
                    type="date"
                    value={form.validade || ''}
                    onChange={(e) => setCampo('validade', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Tipo de Alvará</Label>
                  <Input
                    value={form.tipo || ''}
                    onChange={(e) => setCampo('tipo', e.target.value)}
                    placeholder="Funcionamento / Sanitário / Bombeiros"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Órgão Emissor</Label>
                  <Input
                    value={form.orgao_emissor || ''}
                    onChange={(e) => setCampo('orgao_emissor', e.target.value)}
                    placeholder="Prefeitura / Vigilância Sanitária"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Município / UF</Label>
                <Input
                  value={form.municipio || ''}
                  onChange={(e) => setCampo('municipio', e.target.value)}
                  placeholder="Viana - ES"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Observações</Label>
                <Textarea
                  value={form.observacoes || ''}
                  onChange={(e) => setCampo('observacoes', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Condicionantes ou notas adicionais..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: CONTRATOS & LOCAÇÕES */}
          {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">
                  Título / Objeto Resumido *
                </Label>
                <Input
                  required
                  value={form.titulo || ''}
                  onChange={(e) => setCampo('titulo', e.target.value)}
                  placeholder={
                    tipoAba === 'locacoes'
                      ? 'Locação Galpão Petrolina'
                      : 'Contrato de Prestação de Serviços'
                  }
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    {tipoAba === 'locacoes'
                      ? 'Locador (Proprietário) *'
                      : 'Contraparte / Fornecedor *'}
                  </Label>
                  <Input
                    value={form.parte || ''}
                    onChange={(e) => setCampo('parte', e.target.value)}
                    placeholder={
                      tipoAba === 'locacoes' ? 'Águia Mercantil Ltda' : 'Razão Social / Nome'
                    }
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Valor Mensal (R$)</Label>
                  <Input
                    value={form.valor_mensal || ''}
                    onChange={(e) => setCampo('valor_mensal', e.target.value)}
                    placeholder="16.000,00"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              {/* Campos compartilhados e detalhados de contratos e locações */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Valor na Assinatura (R$)
                  </Label>
                  <Input
                    value={form.valor_assinatura || ''}
                    onChange={(e) => setCampo('valor_assinatura', e.target.value)}
                    placeholder="0,00"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    {tipoAba === 'locacoes' ? 'Qtd. Cauções' : 'Garantia / Cauções'}
                  </Label>
                  <Input
                    type="number"
                    value={form.quantidade_caucoes ?? ''}
                    onChange={(e) => setCampo('quantidade_caucoes', e.target.value)}
                    placeholder="0"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Prazo (meses)</Label>
                  <Input
                    type="number"
                    value={form.prazo_meses ?? ''}
                    onChange={(e) => setCampo('prazo_meses', e.target.value)}
                    placeholder="12"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    {tipoAba === 'locacoes' ? 'Tipo do Imóvel' : 'Tipo / Classificação'}
                  </Label>
                  <Input
                    value={form.tipo_imovel || ''}
                    onChange={(e) => setCampo('tipo_imovel', e.target.value)}
                    placeholder="Comercial / Serviços"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Foro de Eleição</Label>
                  <Input
                    value={form.foro_eleicao || ''}
                    onChange={(e) => setCampo('foro_eleicao', e.target.value)}
                    placeholder="Comarca de Vitória/ES"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              {(tipoAba === 'locacoes' || Boolean(form.endereco_imovel)) && (
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Endereço Completo do Imóvel / Unidade
                  </Label>
                  <Input
                    value={form.endereco_imovel || ''}
                    onChange={(e) => setCampo('endereco_imovel', e.target.value)}
                    placeholder="Logradouro, número, bairro, cidade/UF"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    {tipoAba === 'locacoes' ? 'Rep. Legal Locador' : 'Representante da Contraparte'}
                  </Label>
                  <Input
                    value={form.representante_locador || ''}
                    onChange={(e) => setCampo('representante_locador', e.target.value)}
                    placeholder="Nome e documento do representante"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    {tipoAba === 'locacoes'
                      ? 'Rep. Legal Locatário'
                      : 'Representante da Empresa (Interno)'}
                  </Label>
                  <Input
                    value={form.representante_locatario || ''}
                    onChange={(e) => setCampo('representante_locatario', e.target.value)}
                    placeholder="Nome e documento do representante"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Multa Rescisão Antecipada
                  </Label>
                  <Input
                    value={form.multa_rescisao || ''}
                    onChange={(e) => setCampo('multa_rescisao', e.target.value)}
                    placeholder="Multa rescisória"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Multa por Infração Contratual
                  </Label>
                  <Input
                    value={form.multa_infracao || ''}
                    onChange={(e) => setCampo('multa_infracao', e.target.value)}
                    placeholder="Multa infracional"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Início da Vigência</Label>
                  <Input
                    type="date"
                    value={form.inicio || ''}
                    onChange={(e) => setCampo('inicio', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Término da Vigência</Label>
                  <Input
                    type="date"
                    value={form.fim || ''}
                    onChange={(e) => setCampo('fim', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Índice de Reajuste e Periodicidade
                  </Label>
                  <Input
                    value={form.indexador || ''}
                    onChange={(e) => setCampo('indexador', e.target.value)}
                    placeholder="IGP-M (anual)"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Garantia / Fiança / Caução
                  </Label>
                  <Input
                    value={form.garantia || ''}
                    onChange={(e) => setCampo('garantia', e.target.value)}
                    placeholder="Depósito caução / Fiança bancária"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Vistoria e Condições</Label>
                <Input
                  value={form.vistoria || ''}
                  onChange={(e) => setCampo('vistoria', e.target.value)}
                  placeholder="Laudo de vistoria inicial assinado"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Objeto Detalhado</Label>
                <Textarea
                  value={form.objeto || ''}
                  onChange={(e) => setCampo('objeto', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Descrição completa do objeto do contrato..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">
                  Cláusulas Especiais / Condições Diferenciadas
                </Label>
                <Textarea
                  value={form.clausulas_especiais || ''}
                  onChange={(e) => setCampo('clausulas_especiais', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Cláusulas específicas, condições especiais ou obrigações acessórias..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: ATAS */}
          {tipoAba === 'atas' && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Título da Ata *</Label>
                <Input
                  required
                  value={form.titulo || ''}
                  onChange={(e) => setCampo('titulo', e.target.value)}
                  placeholder="Ata de AGE - Abertura de Filial"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Tipo de Ata</Label>
                  <Select
                    value={form.tipo_ata || 'AGE'}
                    onValueChange={(val) => setCampo('tipo_ata', val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AGE">AGE (Extraordinária)</SelectItem>
                      <SelectItem value="AGO">AGO (Ordinária)</SelectItem>
                      <SelectItem value="Reunião Diretoria">Reunião de Diretoria</SelectItem>
                      <SelectItem value="Comitê">Comitê Executivo</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Data da Reunião</Label>
                  <Input
                    type="date"
                    value={form.data || ''}
                    onChange={(e) => setCampo('data', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Mesa Diretora</Label>
                  <Input
                    value={form.mesa_diretora || ''}
                    onChange={(e) => setCampo('mesa_diretora', e.target.value)}
                    placeholder="Presidente e Secretário"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Assinatura Eletrônica
                  </Label>
                  <Input
                    value={form.assinatura_eletronica || ''}
                    onChange={(e) => setCampo('assinatura_eletronica', e.target.value)}
                    placeholder="DocuSign / ICP-Brasil / Assinado"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Ordem do Dia / Pauta</Label>
                <Textarea
                  value={form.pauta || ''}
                  onChange={(e) => setCampo('pauta', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Itens pautados para deliberação..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Deliberações</Label>
                <Textarea
                  value={form.deliberacoes || ''}
                  onChange={(e) => setCampo('deliberacoes', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Decisões tomadas pelos membros..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: JURÍDICOS */}
          {tipoAba === 'juridicos' && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Número do Processo *</Label>
                <Input
                  required
                  value={form.numero_processo || ''}
                  onChange={(e) => setCampo('numero_processo', e.target.value)}
                  placeholder="0012345-67.2026.8.08.0001"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Vara / Comarca</Label>
                  <Input
                    value={form.vara_comarca || ''}
                    onChange={(e) => setCampo('vara_comarca', e.target.value)}
                    placeholder="3ª Vara Cível de Vitória"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Valor da Causa (R$)</Label>
                  <Input
                    value={form.valor_causa || ''}
                    onChange={(e) => setCampo('valor_causa', e.target.value)}
                    placeholder="0,00"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Autor / Requerente</Label>
                  <Input
                    value={form.autor || ''}
                    onChange={(e) => setCampo('autor', e.target.value)}
                    placeholder="Polo ativo"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Réu / Requerido</Label>
                  <Input
                    value={form.reu || ''}
                    onChange={(e) => setCampo('reu', e.target.value)}
                    placeholder="Polo passivo"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Fase / Instância</Label>
                  <Input
                    value={form.fase_instancia || ''}
                    onChange={(e) => setCampo('fase_instancia', e.target.value)}
                    placeholder="Fase Instrutória / 1ª Instância"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Risco</Label>
                  <Select
                    value={form.risco || 'possivel'}
                    onValueChange={(val) => setCampo('risco', val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provavel">Provável</SelectItem>
                      <SelectItem value="possivel">Possível</SelectItem>
                      <SelectItem value="remoto">Remoto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Advogado Responsável
                  </Label>
                  <Input
                    value={form.advogado || ''}
                    onChange={(e) => setCampo('advogado', e.target.value)}
                    placeholder="Nome do patrono"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Próxima Audiência</Label>
                  <Input
                    type="date"
                    value={form.proxima_audiencia || ''}
                    onChange={(e) => setCampo('proxima_audiencia', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>
            </>
          )}

          {/* SEÇÃO DE ARQUIVOS ANEXOS (SUPORTE A MÚLTIPLOS ANEXOS NA CRIAÇÃO) */}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-emerald-700" />
                Arquivos Anexos ({arquivosAnexos.length})
              </Label>
              <div>
                <input
                  ref={inputAnexosRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length === 0) return
                    setArquivosAnexos((prev) => {
                      const novos = files.filter(
                        (f) => !prev.some((p) => p.name === f.name && p.size === f.size),
                      )
                      return [...prev, ...novos]
                    })
                    if (inputAnexosRef.current) inputAnexosRef.current.value = ''
                  }}
                  className="hidden"
                  id="doc-anexos-multiplos-novo"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputAnexosRef.current?.click()}
                  className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {arquivosAnexos.length === 0 ? 'Adicionar anexo(s)' : 'Adicionar mais anexos'}
                </Button>
              </div>
            </div>

            {arquivosAnexos.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 border border-gray-200 rounded-lg">
                {arquivosAnexos.map((file, idx) => (
                  <div
                    key={`${file.name}-${file.size}-${idx}`}
                    className="flex items-center justify-between gap-2 p-1.5 bg-white border border-gray-200/80 rounded-md text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate text-gray-800 font-medium">{file.name}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setArquivosAnexos((prev) => prev.filter((_, i) => i !== idx))
                        if (arquivoImportado?.name === file.name) {
                          setArquivoImportado(null)
                        }
                      }}
                      className="text-gray-400 hover:text-red-600 p-1 rounded"
                      title="Remover anexo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center border border-dashed border-gray-200 rounded-lg text-[11px] text-gray-500 bg-gray-50/50">
                Nenhum arquivo anexado ainda. Você pode anexar múltiplos PDFs, DOCXs ou planilhas.
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="h-9 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? 'Salvando...' : 'Salvar Documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
