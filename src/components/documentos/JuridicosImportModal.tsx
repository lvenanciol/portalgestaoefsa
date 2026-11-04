import { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Database,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'

// Helper para carregar o worker/lib do PDF.js sob demanda caso o usuário importe PDF
declare global {
  interface Window {
    pdfjsLib?: any
  }
}

async function carregarPdfJs(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Window indisponível')
  }
  if (window.pdfjsLib) return window.pdfjsLib

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      try {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          resolve(window.pdfjsLib)
        } else {
          reject(new Error('pdfjsLib não encontrado'))
        }
      } catch (err) {
        reject(err)
      }
    }
    script.onerror = () => reject(new Error('Falha ao carregar PDF.js'))
    document.head.appendChild(script)
  })
}

// Extrai texto completo de todas as páginas de um arquivo PDF
async function extrairTextoDePdf(file: File): Promise<string> {
  const pdfjs = await carregarPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
  })
  const pdfDoc = await loadingTask.promise
  let textoCompleto = ''

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(' ')
    textoCompleto += `\n--- PAGINA_${pageNum} ---\n` + pageText
  }

  return textoCompleto
}

export interface ProcessoExtraido {
  processo_codigo?: string // ex: 1.0010944
  numero_processo: string // ex: CNJ ou código
  numero_cnj?: string
  numeros_alternativos?: string // Número antigo / MTE
  titulo?: string
  orgao?: string
  acao?: string
  status?: string // Ativo, Arquivado, Encerrado etc.
  tipo?: string // Judicial, Administrativo
  natureza?: string // Trabalhista, Cível etc.
  cliente_principal?: string
  contrario_principal?: string
  responsavel_principal?: string
  probabilidade?: string // ex: Perda Possível, Êxito Provável
  observacoes?: string
  valor_base?: number
  valor_corrigido?: number
  juros?: number
  multa?: number
  valor_atualizado?: number
  valor_atualizado_indexado?: number
  valor_envolvido?: number
  empresa?: string
}

function parsearNumeroBr(val: any): number {
  if (!val) return 0
  const str = String(val)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

// Parser inteligente de texto do Relatório de Processos (PDF)
export function parsearRelatorioProcessosPdf(
  texto: string,
  empresaPadrao = 'Extrafruti',
): ProcessoExtraido[] {
  // Segmenta o texto por ocorrências de "Processo:\s*([0-9]+\.[0-9]+|[0-9]+)"
  const regexProcesso = /Processo:\s*([0-9]+(?:\.[0-9]+)?)/gi
  const indices: { codigo: string; index: number }[] = []
  let match: RegExpExecArray | null

  while ((match = regexProcesso.exec(texto)) !== null) {
    indices.push({
      codigo: match[1].trim(),
      index: match.index,
    })
  }

  if (indices.length === 0) return []

  const processos: ProcessoExtraido[] = []

  for (let i = 0; i < indices.length; i++) {
    const inicio = indices[i].index
    const fim = i < indices.length - 1 ? indices[i + 1].index : texto.length
    const bloco = texto.substring(inicio, fim)
    const procCod = indices[i].codigo

    // Extração de campos via regex do bloco estruturado
    // Números (CNJ / antigo / MTE)
    let cnj = ''
    const matchCnj = /Número CNJ:\s*([0-9.\-/]+)/i.exec(bloco)
    if (matchCnj) cnj = matchCnj[1].trim()

    let numerosAlt = ''
    const matchAntigo = /Número antigo:\s*([0-9.\-/]+)/i.exec(bloco)
    if (matchAntigo) numerosAlt += `Antigo: ${matchAntigo[1].trim()} `
    const matchMte = /MTE:\s*([0-9.\-/]+)/i.exec(bloco)
    if (matchMte) numerosAlt += `MTE: ${matchMte[1].trim()}`

    // Título
    let titulo = ''
    const matchTitulo = /Título:\s*([^]+?)(?=Órgão:|Ação:|Status:|Tipo:|Natureza:|$)/i.exec(bloco)
    if (matchTitulo) {
      titulo = matchTitulo[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Órgão
    let orgao = ''
    const matchOrgao =
      /Órgão:\s*([^]+?)(?=Ação:|Status:|Tipo:|Natureza:|Cliente principal:|$)/i.exec(bloco)
    if (matchOrgao) {
      orgao = matchOrgao[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Ação
    let acao = ''
    const matchAcao =
      /Ação:\s*([^]+?)(?=Status:|Tipo:|Natureza:|Cliente principal:|Contrário principal:|$)/i.exec(
        bloco,
      )
    if (matchAcao) {
      acao = matchAcao[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Status
    let status = 'Ativo'
    const matchStatus =
      /Status:\s*([^]+?)(?=Tipo:|Natureza:|Cliente principal:|Contrário principal:|$)/i.exec(bloco)
    if (matchStatus) {
      status = matchStatus[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Tipo
    let tipo = 'Judicial'
    const matchTipo =
      /Tipo:\s*([^]+?)(?=Natureza:|Cliente principal:|Contrário principal:|$)/i.exec(bloco)
    if (matchTipo) {
      tipo = matchTipo[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Natureza
    let natureza = 'Trabalhista'
    const matchNatureza =
      /Natureza:\s*([^]+?)(?=Cliente principal:|Contrário principal:|Responsável principal:|$)/i.exec(
        bloco,
      )
    if (matchNatureza) {
      natureza = matchNatureza[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Cliente principal
    let clientePrincipal = empresaPadrao
    const matchCliente =
      /Cliente principal:\s*([^]+?)(?=Contrário principal:|Responsável principal:|Probabilidade:|$)/i.exec(
        bloco,
      )
    if (matchCliente) {
      clientePrincipal = matchCliente[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Contrário principal
    let contrarioPrincipal = ''
    const matchContrario =
      /Contrário principal:\s*([^]+?)(?=Responsável principal:|Probabilidade:|Observações:|Valores|$)/i.exec(
        bloco,
      )
    if (matchContrario) {
      contrarioPrincipal = matchContrario[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Responsável principal
    let responsavelPrincipal = ''
    const matchResp =
      /Responsável principal:\s*([^]+?)(?=Probabilidade:|Observações:|Valores|$)/i.exec(bloco)
    if (matchResp) {
      responsavelPrincipal = matchResp[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Probabilidade
    let probabilidade = 'Perda Possível'
    const matchProb = /Probabilidade:\s*([^]+?)(?=Observações:|Valores|$)/i.exec(bloco)
    if (matchProb) {
      probabilidade = matchProb[1].replace(/[\r\n]+/g, ' ').trim()
    }

    // Observações
    let observacoes = ''
    const matchObs = /Observações:\s*([^]+?)(?=Valores|$)/i.exec(bloco)
    if (matchObs) {
      observacoes = matchObs[1].replace(/[\r\n]+/g, ' ').trim()
      if (observacoes.length > 2500) {
        observacoes = observacoes.substring(0, 2500) + '...'
      }
    }

    // Bloco de Valores:
    // "Valor da causa: R$ 73.585,59 (Determinada) R$ 83.600,96 R$ 28.229,26 R$ 0,00 R$ 111.830,22 R$ 0,00"
    // Valores típicos: Base, Corrigido, Juros, Multa, Atualizado, Atualizado indexado
    let valorBase = 0
    let valorCorrigido = 0
    let juros = 0
    let multa = 0
    let valorAtualizado = 0
    let valorAtualizadoIndexado = 0
    let valorEnvolvido = 0

    const matchValoresBloco =
      /Valores[\s\S]*?(?:Valor da causa:?|Valor envolvido:?)([\s\S]*?)(?=01\/11|Página|\n--- PAGINA|$)/i.exec(
        bloco,
      )
    if (matchValoresBloco) {
      const trechoValores = matchValoresBloco[0]

      // Linha do Valor da causa
      const matchLinhaCausa =
        /Valor da causa:\s*R\$\s*([0-9.,]+)[^R$]*?R\$\s*([0-9.,]+)\s*R\$\s*([0-9.,]+)\s*R\$\s*([0-9.,]+)\s*R\$\s*([0-9.,]+)(?:\s*R\$\s*([0-9.,]+))?/i.exec(
          trechoValores,
        )
      if (matchLinhaCausa) {
        valorBase = parsearNumeroBr(matchLinhaCausa[1])
        valorCorrigido = parsearNumeroBr(matchLinhaCausa[2])
        juros = parsearNumeroBr(matchLinhaCausa[3])
        multa = parsearNumeroBr(matchLinhaCausa[4])
        valorAtualizado = parsearNumeroBr(matchLinhaCausa[5])
        if (matchLinhaCausa[6]) valorAtualizadoIndexado = parsearNumeroBr(matchLinhaCausa[6])
      } else {
        // Fallback: pega ocorrências individuais de R$
        const todasOcorrenciasRs = [
          ...trechoValores.matchAll(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g),
        ]
        if (todasOcorrenciasRs.length >= 1) valorBase = parsearNumeroBr(todasOcorrenciasRs[0][1])
        if (todasOcorrenciasRs.length >= 2)
          valorCorrigido = parsearNumeroBr(todasOcorrenciasRs[1][1])
        if (todasOcorrenciasRs.length >= 3) juros = parsearNumeroBr(todasOcorrenciasRs[2][1])
        if (todasOcorrenciasRs.length >= 4) multa = parsearNumeroBr(todasOcorrenciasRs[3][1])
        if (todasOcorrenciasRs.length >= 5)
          valorAtualizado = parsearNumeroBr(todasOcorrenciasRs[4][1])
        if (todasOcorrenciasRs.length >= 6)
          valorAtualizadoIndexado = parsearNumeroBr(todasOcorrenciasRs[5][1])
      }

      // Linha do Valor envolvido se houver
      const matchLinhaEnv = /Valor envolvido:\s*R\$\s*([0-9.,]+)/i.exec(trechoValores)
      if (matchLinhaEnv) {
        valorEnvolvido = parsearNumeroBr(matchLinhaEnv[1])
      }
    }

    const numPrincipal = cnj || procCod

    processos.push({
      processo_codigo: procCod,
      numero_processo: numPrincipal,
      numero_cnj: cnj || procCod,
      numeros_alternativos: numerosAlt.trim(),
      titulo: titulo || `Processo ${procCod}`,
      orgao: orgao || 'Tribunal do Trabalho',
      acao: acao || 'Ação Trabalhista',
      status: status || 'Ativo',
      tipo: tipo || 'Judicial',
      natureza: natureza || 'Trabalhista',
      cliente_principal: clientePrincipal,
      contrario_principal: contrarioPrincipal || 'Parte Contrária',
      responsavel_principal: responsavelPrincipal,
      probabilidade: probabilidade || 'Perda Possível',
      observacoes,
      valor_base: valorBase,
      valor_corrigido: valorCorrigido,
      juros,
      multa,
      valor_atualizado: valorAtualizado || valorCorrigido || valorBase,
      valor_atualizado_indexado: valorAtualizadoIndexado,
      valor_envolvido: valorEnvolvido || valorAtualizado,
      empresa: clientePrincipal.toLowerCase().includes('casafruti')
        ? 'Casafruti'
        : clientePrincipal.toLowerCase().includes('agrofruti')
          ? 'Agrofruti'
          : 'Extrafruti',
    })
  }

  return processos
}

interface JuridicosImportModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onImportadoSucesso: () => void
}

export function JuridicosImportModal({
  aberto,
  onOpenChange,
  onImportadoSucesso,
}: JuridicosImportModalProps) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [tipoArquivo, setTipoArquivo] = useState<'pdf' | 'xlsx' | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [processosExtraidos, setProcessosExtraidos] = useState<ProcessoExtraido[]>([])

  // Caso seja XLSX com mapeamento de colunas
  const [colunasPlanilha, setColunasPlanilha] = useState<string[]>([])
  const [linhasBrutasXlsx, setLinhasBrutasXlsx] = useState<any[][]>()
  const [mapeamentoXlsx, setMapeamentoXlsx] = useState<Record<string, number>>({})

  const [salvando, setSalvando] = useState(false)
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    total: number
    novos: number
    atualizadosComHistorico: number
    falhas?: { processo: string; motivo: string }[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reiniciar = () => {
    setPasso(1)
    setTipoArquivo(null)
    setArquivo(null)
    setProcessosExtraidos([])
    setColunasPlanilha([])
    setLinhasBrutasXlsx(undefined)
    setMapeamentoXlsx({})
    setSalvando(false)
    setProcessandoArquivo(false)
    setErro(null)
    setResultado(null)
  }

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErro(null)
    setArquivo(file)
    setProcessandoArquivo(true)

    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    const isXlsx =
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.name.toLowerCase().endsWith('.xls') ||
      file.name.toLowerCase().endsWith('.csv')

    try {
      if (isPdf) {
        setTipoArquivo('pdf')
        const texto = await extrairTextoDePdf(file)
        const lista = parsearRelatorioProcessosPdf(texto)
        if (lista.length === 0) {
          throw new Error(
            'Não foi possível identificar blocos de "Processo: NNNNNN" no PDF selecionado. Verifique se o relatório contém o formato padrão.',
          )
        }
        setProcessosExtraidos(lista)
        setPasso(2)
      } else if (isXlsx) {
        setTipoArquivo('xlsx')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const wsName = wb.SheetNames[0]
        const ws = wb.Sheets[wsName]
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false })

        if (!rawRows || rawRows.length === 0) {
          throw new Error('A planilha selecionada está vazia.')
        }

        // Localizar linha de cabeçalho
        let headerRowIndex = 0
        for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
          const rowStr = (rawRows[r] || []).map((c) => String(c || '').toLowerCase()).join(' ')
          if (
            rowStr.includes('processo') ||
            rowStr.includes('número') ||
            rowStr.includes('numero') ||
            rowStr.includes('contrário') ||
            rowStr.includes('contrario') ||
            rowStr.includes('fase')
          ) {
            headerRowIndex = r
            break
          }
        }

        const headers = (rawRows[headerRowIndex] || []).map((h, i) =>
          String(h || `Coluna ${i + 1}`).trim(),
        )
        setColunasPlanilha(headers)

        const dadosFiltrados = rawRows.slice(headerRowIndex + 1).filter((r) => {
          if (!r || r.length === 0) return false
          return r.some((c: any) => String(c || '').trim() !== '')
        })

        setLinhasBrutasXlsx(dadosFiltrados)

        // Converter linhas XLSX para ProcessoExtraido
        const autoMap: Record<string, number> = {}
        const mapaCampos: Record<string, string[]> = {
          numero_processo: ['número principal', 'numero principal', 'processo', 'numero', 'nº'],
          contrario_principal: [
            'contrário principal',
            'contrario principal',
            'contrario',
            'parte contraria',
            'reu',
          ],
          titulo: ['título', 'titulo', 'assunto', 'ação', 'acao'],
          orgao: ['órgão', 'orgao', 'tribunal', 'vara', 'comarca'],
          fase_instancia: ['fase', 'instancia'],
          valor_base: ['valor da causa', 'valor bruto', 'pedido', 'valor base'],
          valor_atualizado: ['valor atualizado', 'atualizado', 'valor envolvido'],
          probabilidade: ['probabilidade', 'risco'],
          empresa: ['empresa', 'cliente', 'cliente principal'],
          advogado: ['advogado', 'responsável', 'responsavel'],
        }

        Object.entries(mapaCampos).forEach(([chave, padroes]) => {
          const idx = headers.findIndex((h) => {
            const limpo = h.toLowerCase()
            return padroes.some((p) => limpo.includes(p))
          })
          if (idx !== -1) autoMap[chave] = idx
        })

        setMapeamentoXlsx(autoMap)

        // Mapeia prévia
        const listaXlsx: ProcessoExtraido[] = dadosFiltrados.map((linha, idx) => {
          const getVal = (k: string) => {
            const col = autoMap[k]
            return col !== undefined && col >= 0 ? String(linha[col] ?? '').trim() : ''
          }
          const num = getVal('numero_processo') || `Proc-${idx + 1}`
          const vBase = parsearNumeroBr(getVal('valor_base'))
          const vAtu = parsearNumeroBr(getVal('valor_atualizado'))
          return {
            numero_processo: num,
            numero_cnj: num,
            processo_codigo: num,
            titulo: getVal('titulo') || `Processo ${num}`,
            orgao: getVal('orgao') || 'Tribunal de Justiça',
            status: 'Ativo',
            tipo: 'Judicial',
            natureza: 'Cível',
            cliente_principal: getVal('empresa') || 'Extrafruti',
            contrario_principal: getVal('contrario_principal') || 'Parte Contrária',
            responsavel_principal: getVal('advogado'),
            probabilidade: getVal('probabilidade') || 'Perda Possível',
            valor_base: vBase,
            valor_corrigido: vBase,
            juros: 0,
            multa: 0,
            valor_atualizado: vAtu || vBase,
            empresa: getVal('empresa') || 'Extrafruti',
          }
        })

        setProcessosExtraidos(listaXlsx)
        setPasso(2)
      } else {
        throw new Error(
          'Formato não suportado. Por favor, envie um arquivo PDF ou Excel (.xlsx / .xls).',
        )
      }
    } catch (err: any) {
      setErro(err?.message || 'Falha ao processar o arquivo.')
    } finally {
      setProcessandoArquivo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Grava processos identificados com versionamento e histórico de forma defensiva
  const handleConfirmarImportacao = async () => {
    setSalvando(true)
    setErro(null)

    let novos = 0
    let atualizadosComHistorico = 0
    const falhas: { processo: string; motivo: string }[] = []

    const normalizarNumero = (val: any, padrao = 0): number => {
      if (val === undefined || val === null || val === '') return padrao
      const n = typeof val === 'number' ? val : Number(val)
      return Number.isFinite(n) ? n : padrao
    }

    const normalizarStatus = (st?: string): string => {
      const s = String(st || '').toLowerCase()
      if (s.includes('arquiv') || s.includes('encerrad')) return 'encerrado'
      if (s.includes('suspens')) return 'suspenso'
      if (s.includes('acord')) return 'acordo'
      if (s.includes('recurs')) return 'em_recurso'
      return 'ativo'
    }

    const normalizarRisco = (prob?: string): string => {
      const p = String(prob || '').toLowerCase()
      if (p.includes('prov')) return 'provavel'
      if (p.includes('remot')) return 'remoto'
      return 'possivel'
    }

    try {
      const dataHoje = new Date().toISOString()
      const usuarioLogado = pb.authStore.model?.email || pb.authStore.model?.name || 'Sistema'

      for (const item of processosExtraidos) {
        if (!item.numero_processo || String(item.numero_processo).trim().length < 2) continue

        const numProcLimpo = String(item.numero_processo).trim()
        const cnjLimpo = item.numero_cnj ? String(item.numero_cnj).trim() : numProcLimpo
        const codLimpo = item.processo_codigo ? String(item.processo_codigo).trim() : ''

        try {
          // Verifica se processo já existe no banco (pelo número_processo, numero_cnj ou processo_codigo)
          let existente: any = null
          try {
            existente = await pb
              .collection('processos_juridicos')
              .getFirstListItem(
                `numero_processo = "${numProcLimpo}" || (numero_cnj != "" && numero_cnj = "${cnjLimpo}")`,
              )
          } catch (_) {
            existente = null
          }

          if (!existente && codLimpo) {
            try {
              existente = await pb
                .collection('processos_juridicos')
                .getFirstListItem(`processo_codigo = "${codLimpo}"`)
            } catch (_) {
              existente = null
            }
          }

          if (existente) {
            // PROCESSO JÁ EXISTE: Salvar versão anterior em juridicos_historico e atualizar com nova versão
            const versaoAntiga = normalizarNumero(existente.versao_atual, 1)
            const novaVersao = versaoAntiga + 1

            // Snapshot dos valores anteriores
            const valoresAnteriores = {
              titulo: existente.titulo || '',
              orgao: existente.orgao || existente.orgao_tribunal || existente.vara_comarca || '',
              status: existente.status || 'ativo',
              natureza: existente.natureza || '',
              fase_instancia: existente.fase_instancia || '',
              contrario: existente.contrario_principal || existente.reu || existente.autor || '',
              responsavel: existente.responsavel_principal || existente.advogado || '',
              probabilidade: existente.probabilidade || existente.risco || '',
              valor_base: normalizarNumero(existente.valor_base ?? existente.valor_causa, 0),
              valor_corrigido: normalizarNumero(existente.valor_corrigido, 0),
              juros: normalizarNumero(existente.juros, 0),
              multa: normalizarNumero(existente.multa, 0),
              valor_atualizado: normalizarNumero(existente.valor_atualizado, 0),
              observacoes: existente.observacoes || '',
            }

            // Diferenças / alterações
            const alteracoes: Record<string, { anterior: any; novo: any }> = {}
            if (valoresAnteriores.valor_atualizado !== item.valor_atualizado) {
              alteracoes['valor_atualizado'] = {
                anterior: valoresAnteriores.valor_atualizado,
                novo: item.valor_atualizado,
              }
            }
            if (valoresAnteriores.probabilidade !== item.probabilidade) {
              alteracoes['probabilidade'] = {
                anterior: valoresAnteriores.probabilidade,
                novo: item.probabilidade,
              }
            }
            if (valoresAnteriores.status !== item.status) {
              alteracoes['status'] = {
                anterior: valoresAnteriores.status,
                novo: item.status,
              }
            }

            // Grava histórico de versão de forma segura
            try {
              await pb.collection('juridicos_historico').create({
                processo_id: existente.id,
                numero_processo: numProcLimpo,
                versao: versaoAntiga,
                data_importacao: dataHoje,
                valores_anteriores: valoresAnteriores,
                alteracoes: alteracoes,
                importado_por: usuarioLogado,
              })
            } catch (histErr) {
              console.warn('Aviso ao registrar histórico do processo:', histErr)
            }

            // Payload defensivo para atualização com tipos compatíveis
            const payloadUpdate: Record<string, any> = {
              processo_codigo: codLimpo || existente.processo_codigo || '',
              numeros_alternativos:
                item.numeros_alternativos || existente.numeros_alternativos || '',
              numero_cnj: cnjLimpo || existente.numero_cnj || numProcLimpo,
              titulo: item.titulo || existente.titulo || `Processo ${numProcLimpo}`,
              orgao: item.orgao || existente.orgao || 'Tribunal de Justiça',
              orgao_tribunal: item.orgao || existente.orgao_tribunal || 'Tribunal de Justiça',
              vara_comarca: item.orgao || existente.vara_comarca || 'Tribunal de Justiça',
              acao: item.acao || existente.acao || 'Ação Judicial',
              status: normalizarStatus(item.status || existente.status),
              tipo: item.tipo || existente.tipo || 'Judicial',
              natureza: item.natureza || existente.natureza || 'Trabalhista',
              cliente_principal:
                item.cliente_principal || existente.cliente_principal || 'Extrafruti',
              contrario_principal:
                item.contrario_principal || existente.contrario_principal || 'Parte Contrária',
              responsavel_principal:
                item.responsavel_principal || existente.responsavel_principal || '',
              advogado: item.responsavel_principal || existente.advogado || '',
              probabilidade: item.probabilidade || existente.probabilidade || 'Perda Possível',
              risco: normalizarRisco(
                item.probabilidade || existente.probabilidade || existente.risco,
              ),
              valor_base: normalizarNumero(
                item.valor_base ?? existente.valor_base ?? existente.valor_causa,
                0,
              ),
              valor_corrigido: normalizarNumero(
                item.valor_corrigido ?? existente.valor_corrigido,
                0,
              ),
              juros: normalizarNumero(item.juros ?? existente.juros, 0),
              multa: normalizarNumero(item.multa ?? existente.multa, 0),
              valor_causa: normalizarNumero(
                item.valor_base ?? existente.valor_causa ?? existente.valor_base,
                0,
              ),
              valor_atualizado: normalizarNumero(
                item.valor_atualizado ?? existente.valor_atualizado,
                0,
              ),
              valor_atualizado_indexado: normalizarNumero(
                item.valor_atualizado_indexado ?? existente.valor_atualizado_indexado,
                0,
              ),
              valor_envolvido: normalizarNumero(
                item.valor_envolvido ?? existente.valor_envolvido,
                0,
              ),
              observacoes: item.observacoes || existente.observacoes || '',
              versao_atual: novaVersao,
            }

            await pb.collection('processos_juridicos').update(existente.id, payloadUpdate)
            atualizadosComHistorico++
          } else {
            // NOVO PROCESSO
            const payloadNovo: Record<string, any> = {
              numero_processo: numProcLimpo,
              processo_codigo: codLimpo,
              numeros_alternativos: item.numeros_alternativos || '',
              numero_cnj: cnjLimpo,
              titulo: item.titulo || `Processo ${numProcLimpo}`,
              orgao: item.orgao || 'Tribunal de Justiça',
              orgao_tribunal: item.orgao || 'Tribunal de Justiça',
              vara_comarca: item.orgao || 'Tribunal de Justiça',
              acao: item.acao || 'Ação Judicial',
              status: normalizarStatus(item.status),
              tipo: item.tipo || 'Judicial',
              natureza: item.natureza || 'Trabalhista',
              cliente_principal: item.cliente_principal || 'Extrafruti',
              empresa: item.empresa || 'Extrafruti',
              contrario_principal: item.contrario_principal || 'Parte Contrária',
              responsavel_principal: item.responsavel_principal || '',
              advogado: item.responsavel_principal || '',
              autor: item.contrario_principal || 'Parte Contrária',
              reu: item.empresa || 'Extrafruti',
              polo: 'Polo passivo',
              fase_instancia: 'Em Andamento',
              assunto_tipo: item.natureza || 'Trabalhista',
              probabilidade: item.probabilidade || 'Perda Possível',
              risco: normalizarRisco(item.probabilidade),
              valor_base: normalizarNumero(item.valor_base, 0),
              valor_corrigido: normalizarNumero(item.valor_corrigido, 0),
              juros: normalizarNumero(item.juros, 0),
              multa: normalizarNumero(item.multa, 0),
              valor_causa: normalizarNumero(item.valor_base, 0),
              valor_atualizado: normalizarNumero(item.valor_atualizado ?? item.valor_base, 0),
              valor_atualizado_indexado: normalizarNumero(item.valor_atualizado_indexado, 0),
              valor_envolvido: normalizarNumero(item.valor_envolvido ?? item.valor_atualizado, 0),
              observacoes: item.observacoes || '',
              versao_atual: 1,
            }

            await pb.collection('processos_juridicos').create(payloadNovo)
            novos++
          }
        } catch (itemErr: any) {
          console.warn(`Erro ao processar item ${numProcLimpo}:`, itemErr)
          falhas.push({
            processo: numProcLimpo,
            motivo: itemErr?.message || 'Falha ao salvar registro no banco de dados',
          })
        }
      }

      setResultado({
        total: processosExtraidos.length,
        novos,
        atualizadosComHistorico,
        falhas,
      })
      setPasso(3)
      onImportadoSucesso()
    } catch (err: any) {
      console.error('Erro geral na importação jurídica:', err)
      setErro(err?.message || 'Falha ao processar os registros de processos jurídicos.')
    } finally {
      setSalvando(false)
    }
  }

  const formatarMoeda = (val?: number) => {
    if (!val && val !== 0) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) reiniciar()
        onOpenChange(o)
      }}
    >
      <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            <FileText className="h-5 w-5 text-[#1B5E20]" />
            Importar Processos Jurídicos (PDF / XLSX)
          </DialogTitle>
        </DialogHeader>

        {erro && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {erro}
          </div>
        )}

        {/* Passo 1: Selecionar Arquivo (PDF ou Excel) */}
        {passo === 1 && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              Faça upload do relatório de processos em <strong>PDF</strong> (ex: Relatório
              trabalhista / demais áreas) ou <strong>Excel</strong>. O sistema extrai
              automaticamente código, números CNJ, órgão, partes, responsável, probabilidade e os
              blocos de valores (base, corrigido, juros, multa e atualizado).
            </p>

            <div
              onClick={() => !processandoArquivo && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all space-y-3 ${
                processandoArquivo
                  ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  : 'border-gray-300 hover:border-emerald-600 bg-gray-50/50 hover:bg-emerald-50/20'
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto">
                {processandoArquivo ? (
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-800" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  {processandoArquivo
                    ? 'Processando relatório...'
                    : 'Clique para selecionar o relatório (.pdf, .xlsx, .xls)'}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Suporta relatórios PDF com blocos "Processo: NNNNNN" e planilhas eletrônicas
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={handleArquivoSelecionado}
              className="hidden"
            />
          </div>
        )}

        {/* Passo 2: Prévia dos Processos Identificados e Mapeamento */}
        {passo === 2 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/80 p-3 rounded-xl border border-emerald-200 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-white text-emerald-900 border-emerald-300 font-mono"
                >
                  {tipoArquivo?.toUpperCase()}
                </Badge>
                <span className="font-semibold text-emerald-950 truncate max-w-sm">
                  {arquivo?.name}
                </span>
              </div>
              <div className="text-emerald-900 font-bold bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                {processosExtraidos.length} processos identificados
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Info className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span>
                Processos existentes serão atualizados criando uma{' '}
                <strong>nova versão com histórico</strong> das alterações. Novos processos serão
                incluídos como versão 1.
              </span>
            </div>

            {/* Lista com Amostra dos Processos Extraídos */}
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 text-[11px] font-bold text-gray-700 flex justify-between items-center">
                <span>
                  Pré-visualização dos Processos (primeiros 5 de {processosExtraidos.length})
                </span>
                <span className="text-gray-400 font-normal">Valores e campos segmentados</span>
              </div>

              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {processosExtraidos.slice(0, 5).map((proc, idx) => (
                  <div
                    key={idx}
                    className="p-3 text-xs space-y-1.5 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                          <span className="font-mono text-emerald-800">
                            {proc.processo_codigo ? `[${proc.processo_codigo}]` : ''}
                          </span>
                          <span>{proc.numero_processo}</span>
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5 line-clamp-1">
                          {proc.titulo}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 shrink-0"
                      >
                        {proc.natureza || 'Trabalhista'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-600 bg-gray-50 p-2 rounded-lg">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Contrário:</span>
                        <span className="font-medium text-gray-800 truncate block">
                          {proc.contrario_principal || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Órgão:</span>
                        <span className="truncate block" title={proc.orgao}>
                          {proc.orgao || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Probabilidade:</span>
                        <span className="font-medium text-amber-700 truncate block">
                          {proc.probabilidade || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Valor Atualizado:</span>
                        <span className="font-bold text-emerald-800 truncate block">
                          {formatarMoeda(proc.valor_atualizado)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPasso(1)}
                className="h-8 text-xs"
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarImportacao}
                disabled={salvando}
                className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                {salvando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                )}
                Confirmar e Gravar {processosExtraidos.length} processos no Banco
              </Button>
            </div>
          </div>
        )}

        {/* Passo 3: Sucesso / Conclusão */}
        {passo === 3 && resultado && (
          <div className="py-6 text-center space-y-4">
            <div
              className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto ${
                resultado.falhas && resultado.falhas.length > 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-[#1B5E20]'
              }`}
            >
              {resultado.falhas && resultado.falhas.length > 0 ? (
                <AlertCircle className="h-8 w-8" />
              ) : (
                <CheckCircle2 className="h-8 w-8" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {resultado.falhas && resultado.falhas.length > 0
                  ? 'Importação finalizada com avisos'
                  : 'Importação concluída com sucesso!'}
              </h3>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Total de <strong>{resultado.total}</strong> processos processados:{' '}
                <strong className="text-emerald-700">{resultado.novos} novos</strong> inseridos e{' '}
                <strong className="text-blue-700">
                  {resultado.atualizadosComHistorico} atualizados com histórico
                </strong>{' '}
                de versão preservado.
              </p>
            </div>

            {resultado.falhas && resultado.falhas.length > 0 && (
              <div className="text-left bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs max-h-40 overflow-y-auto space-y-1.5">
                <div className="font-semibold text-amber-900">
                  {resultado.falhas.length} processo(s) com falha ao gravar:
                </div>
                {resultado.falhas.map((f, i) => (
                  <div key={i} className="text-amber-800 text-[11px]">
                    • <strong>{f.processo}:</strong> {f.motivo}
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              onClick={() => {
                reiniciar()
                onOpenChange(false)
              }}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs h-9 px-6"
            >
              Concluir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
