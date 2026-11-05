import { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
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
  tipo?: string // Judicial, Administrativo
  natureza?: string // Trabalhista, Cível etc. (somente a categoria)
  polo?: string // ex: Polo passivo, Polo ativo
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

export interface JuridicosImportModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onImportadoSucesso?: () => void
}

const EMPRESAS_DISPONIVEIS = ['Extrafruti', 'Laticínio Boa Nata', 'Transportadora', 'Holding']

// Converte valores monetários em formato PT-BR ou numérico para float seguro
export function normalizarNumeroRobusto(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '-' || str === '—') return 0
  const limpo = str.replace(/[R$\s]/g, '')
  // Caso brasileiro: 1.234,56
  if (limpo.includes(',') && limpo.includes('.')) {
    return parseFloat(limpo.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (limpo.includes(',')) {
    return parseFloat(limpo.replace(',', '.')) || 0
  }
  return parseFloat(limpo) || 0
}

// Trunca texto com segurança para respeitar o limite máximo do banco (ex: acao max 150)
export function truncarTexto(val: any, maxChars: number): string {
  if (!val) return ''
  const str = String(val).trim()
  if (str.length <= maxChars) return str
  return str.slice(0, maxChars).trim()
}

// Sanitiza e canoniza probabilidade para caber no campo text(max 100) do banco
// Mantém o texto legível (ex: "Perda Possível") e garante que nunca ultrapasse 100 caracteres
export function sanitizarProbabilidade(val: any): string {
  if (!val) return 'Perda Possível'
  const str = String(val).trim()
  if (!str) return 'Perda Possível'

  // Se já for uma string normal curta, trunca em 100
  if (str.length <= 100) return str

  // Se for muito longa (ex: texto corrido extraído por engano), canoniza pelas palavras-chave
  const lower = str.toLowerCase()
  if (lower.includes('provável') || lower.includes('provavel')) {
    return lower.includes('êxito') || lower.includes('exito') ? 'Êxito Provável' : 'Perda Provável'
  }
  if (lower.includes('possível') || lower.includes('possivel')) {
    return lower.includes('êxito') || lower.includes('exito') ? 'Êxito Possível' : 'Perda Possível'
  }
  if (lower.includes('remoto') || lower.includes('remota')) {
    return 'Perda Remota'
  }

  return str.slice(0, 100).trim()
}

// Canoniza e limpa a categoria de natureza para que nunca grave o cliente concatenado
// Exemplo: "Trabalhista Cliente principal: Extrafruti" -> "Trabalhista"
// "Cível - Extrafruti" -> "Cível"
export function canonizarNatureza(val: any): string {
  if (!val) return 'Trabalhista'
  let str = String(val).trim()
  if (!str) return 'Trabalhista'

  // Remove rótulos adicionais que possam ter vindo concatenados do PDF
  str = str
    .split(
      /\s*(?:Cliente\s+Principal|Polo|Contr[aá]rio\s+Principal|Respons[aá]vel\s+Principal)\s*[:-]/i,
    )[0]
    .trim()
  str = str.split(/\s+[-—]\s+/)[0].trim()

  const lower = str.toLowerCase()
  if (lower.includes('trabalh')) return 'Trabalhista'
  if (lower.includes('cív') || lower.includes('civ')) return 'Cível'
  if (lower.includes('admin')) return 'Administrativa'
  if (lower.includes('trib') || lower.includes('fisc')) return 'Tributária'
  if (lower.includes('crim') || lower.includes('penal')) return 'Criminal'
  if (lower.includes('ambien')) return 'Ambiental'
  if (lower.includes('societ')) return 'Societária'
  if (lower.includes('comerc')) return 'Comercial'

  return truncarTexto(str, 80) || 'Trabalhista'
}

// Extrai e limpa o cliente principal e o polo se presente
export function extrairClienteEPolo(val: any): { cliente: string; polo?: string } {
  if (!val) return { cliente: '' }
  const str = String(val).trim()
  if (!str) return { cliente: '' }

  // Extrai polo se estiver em parênteses ou após hífen: "(Polo passivo)", "(Polo ativo)"
  let polo: string | undefined = undefined
  const poloMatch =
    str.match(/\((Polo\s+(?:passivo|ativo|neutro))\)/i) ||
    str.match(/\b(Polo\s+(?:passivo|ativo))\b/i)
  if (poloMatch) {
    polo = poloMatch[1].trim()
  }

  // Limpa ruídos de campos concatenados posteriores ("Contrário principal: ...", etc.)
  let clienteLimpo = str
    .split(/\s*(?:Contr[aá]rio\s+Principal|Respons[aá]vel\s+Principal)\s*[:-]/i)[0]
    .replace(/\(Polo\s+(?:passivo|ativo|neutro)\)/gi, '')
    .trim()

  return {
    cliente: truncarTexto(clienteLimpo, 190),
    polo: polo ? truncarTexto(polo, 50) : undefined,
  }
}

import { removerRodapesDePagina } from './juridicos-texto-utils'

/**
 * Extrai o bloco completo de Observações e Andamento Processual preservando toda a cronologia.
 * Também cobre os casos em que o PDF traz o texto datado logo após "Órgão:" SEM o rótulo
 * "Observações:" — nesse caso usamos a primeira linha datada legítima como início do bloco,
 * para que nenhuma entrada da cronologia se perca (ex.: processo JOÃO PAULO).
 */
export function extrairBlocoObservacoes(bloco: string): string {
  if (!bloco) return ''

  // Rodapés de página ("R$ 0,0001/11/2026 00:44Pagina 50 de 71") são removidos
  // ANTES da extração para não gerar entradas datadas espúrias nem truncar o bloco.
  const blocoLimpo = removerRodapesDePagina(bloco)

  // 1. Tenta encontrar a seção iniciada por "Observações e Andamento Processual", "Observações", etc.
  // Aceita variações de acento, pontuação e espaços
  const regexSecao =
    /(?:Observa[cç][oõ]es(?:\s+e\s+Andamento(?:\s+Processual)?)?|Andamento\s+Processual|Andamento(?:\s+Geral)?|Hist[oó]rico\s+Processual|Andamentos)\s*[:-]?\s*([\s\S]*)/i
  const matchSecao = blocoLimpo.match(regexSecao)

  let textoCandidato = matchSecao ? matchSecao[1] : ''

  // 1b. Sem rótulo "Observações:": cronologia datada após a linha "Órgão:" (ex.: JOÃO PAULO).
  // Em vários processos o texto datado ("dd/mm/aaaa (SIGLA): ...") vem logo após a linha
  // do Órgão (ou linhas seguintes) sem rótulo de bloco conhecido entre eles.
  // Deve capturar TODAS as linhas datadas contíguas até o próximo processo ou bloco estruturado.
  if (!textoCandidato) {
    const matchOrgao = blocoLimpo.match(/(?:^|\n)\s*Órg[aã]o\s*[:-]/i)
    if (matchOrgao && matchOrgao.index !== undefined) {
      // Pula a linha do Órgão (pois o valor do órgão pode estar na mesma linha)
      const indiceFimLinhaOrgao = blocoLimpo.indexOf('\n', matchOrgao.index + matchOrgao[0].length)
      const inicioAposOrgao =
        indiceFimLinhaOrgao !== -1
          ? indiceFimLinhaOrgao + 1
          : matchOrgao.index + matchOrgao[0].length

      const trechoAposOrgao = blocoLimpo.slice(inicioAposOrgao)

      // Procura a primeira linha datada ("dd/mm/aaaa", "d/m/aaaa") após o Órgão
      const matchPrimeiraData = trechoAposOrgao.match(
        /(?:^|\n)\s*(\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}(?:\s*[([]?[A-Za-z0-9_\- ]+[)\]]?)?\s*[:-]?)/,
      )

      if (matchPrimeiraData && matchPrimeiraData.index !== undefined) {
        // Verifica se antes dessa data surgiu algum rótulo conhecido de fechamento
        const textoIntermediario = trechoAposOrgao.slice(0, matchPrimeiraData.index)
        const temOutroBlocoAntes =
          /(?:^|\n)\s*(?:Valores|Valor\s+Base|Garantias|Provid[eê]ncias|Processo|Proc\.?|N[uú]mero\s+do\s+Processo)\s*[:]/i.test(
            textoIntermediario,
          )

        if (!temOutroBlocoAntes) {
          // A cronologia começa na primeira data identificada após a linha do Órgão
          textoCandidato = trechoAposOrgao.slice(matchPrimeiraData.index).trim()
        }
      }
    }
  }

  // 2. Ainda sem seção: procura a primeira ocorrência de data dd/mm/aaaa ou d/m/aaaa no bloco
  if (!textoCandidato) {
    const matchData = blocoLimpo.match(
      /(?:^|\n|\b)(\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b(?:\s*[([]?[A-Za-z0-9_\- ]+[)\]]?)?\s*[:-]?)/,
    )
    if (matchData && matchData.index !== undefined) {
      textoCandidato = blocoLimpo.slice(matchData.index).trim()
    }
  }

  if (!textoCandidato) return ''

  // 2. Delimitadores de fim EXAUSTIVOS com cabeçalhos reais dos relatórios de processos jurídicos
  // (Valores, Garantias, Providências, etc.)
  // CUIDADO ABSOLUTO: NUNCA parar em palavras soltas no meio do texto da nota.
  // Exigimos início de linha / quebra de linha + cabeçalho estruturado com dois pontos ou traço
  const delimitadoresProximoBloco = [
    // Início de outro processo no mesmo lote/relatório
    /(?:^|\n)\s*(?:Processo|Proc\.?|N[uú]mero\s+do\s+Processo|CNJ)\s*[:]\s*[0-9A-Za-z.\-/]+/i,
    // Cabeçalhos estruturados de valores e dados financeiros
    /(?:^|\n)\s*(?:Valores|Dados\s+Financeiros|Hist[oó]rico\s+Financeiro|Resumo\s+Financeiro|Planilha\s+de\s+C[aá]lculos?)\s*[:]/i,
    /(?:^|\n)\s*(?:Valor\s+Base|Valor\s+da\s+Causa|Valor\s+Causa|Valor\s+Inicial|Valor\s+Corrigido|Valor\s+Atualizado(?:\s+Indexado)?|Valor\s+Envolvido|Risco\s+Total)\s*[:]\s*(?:R\$\s*)?[0-9]/i,
    // Garantias, depósitos, penhoras e cauções
    /(?:^|\n)\s*(?:Garantias(?:\s+e\s+Dep[oó]sitos)?|Dep[oó]sitos(?:\s+Recursais)?|Penhoras?|Bens\s+Penhorados|Bloqueios?\s+Judiciais?)\s*[:]/i,
    // Providências, tarefas, prazos e pendências
    /(?:^|\n)\s*(?:Provid[eê]ncias|Pr[oó]ximas?\s+Provid[eê]ncias?|Pend[eê]ncias|Prazos?\s+Processuais?|Prazos?)\s*[:]/i,
    // Separador visual explícito entre processos
    /(?:^|\n)\s*(?:===+|---+|\*\*\*+)\s*(?:\n|$)/,
  ]

  let fimIndex = textoCandidato.length
  for (const delim of delimitadoresProximoBloco) {
    const m = textoCandidato.match(delim)
    if (m && m.index !== undefined && m.index < fimIndex) {
      fimIndex = m.index
    }
  }

  // Se for o último bloco do processo, captura até o fim sem truncar
  const blocoExtraido = textoCandidato.slice(0, fimIndex).trim()

  return blocoExtraido
}

// Canoniza o status para o enum do banco: ativo | suspenso | acordo | encerrado | em_recurso
export function canonizarStatus(val: any): string {
  const str = String(val || '')
    .toLowerCase()
    .trim()
  if (!str) return 'ativo'
  if (str.includes('encerr') || str.includes('arquiv') || str.includes('baixad')) return 'encerrado'
  if (str.includes('suspens') || str.includes('sobrest')) return 'suspenso'
  if (str.includes('acord')) return 'acordo'
  if (str.includes('recurs')) return 'em_recurso'
  return 'ativo'
}

// Canoniza risco para o select do banco: provavel | possivel | remoto
export function canonizarRisco(probabilidadeTexto: string): 'provavel' | 'possivel' | 'remoto' {
  const p = (probabilidadeTexto || '').toLowerCase()
  if (p.includes('prov')) return 'provavel'
  if (p.includes('remot')) return 'remoto'
  return 'possivel'
}

// Extrai processos estruturados a partir do texto do relatório em PDF
export function extrairProcessosDeTextoRelatorio(
  texto: string,
  empresaPadrao: string,
): ProcessoExtraido[] {
  const processos: ProcessoExtraido[] = []

  // Normaliza quebras e múltiplos espaços
  const textoLimpo = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // O relatório do sistema jurídico geralmente separa os processos por linhas como:
  // "Processo: 1.0010944" ou "Processo : 0000365-46.2023.5.17.0003"
  const regexMarcador = /(?:^|\n)\s*(?:Processo|Proc\.)\s*[:]\s*([0-9A-Za-z.\-/]+)/gi

  const indices: { codigoOuNumero: string; index: number }[] = []
  let match: RegExpExecArray | null

  while ((match = regexMarcador.exec(textoLimpo)) !== null) {
    indices.push({
      codigoOuNumero: match[1].trim(),
      index: match.index,
    })
  }

  // Se não encontrou pelo marcador "Processo:", tenta segmentar por padrão de CNJ clássico
  if (indices.length === 0) {
    const regexCnj = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/g
    while ((match = regexCnj.exec(textoLimpo)) !== null) {
      indices.push({
        codigoOuNumero: match[1].trim(),
        index: match.index,
      })
    }
  }

  if (indices.length === 0) {
    return processos
  }

  for (let i = 0; i < indices.length; i++) {
    const inicio = indices[i].index
    const fim = i + 1 < indices.length ? indices[i + 1].index : textoLimpo.length
    const bloco = textoLimpo.slice(inicio, fim)
    const proc = extrairDadosDeBlocoProcesso(bloco, indices[i].codigoOuNumero, empresaPadrao)
    if (proc && (proc.numero_cnj || proc.processo_codigo || proc.numero_processo)) {
      processos.push(proc)
    }
  }

  return processos
}

function extrairCampoPorRotulos(bloco: string, rotulos: string[]): string {
  for (const rotulo of rotulos) {
    // Regex buscando "Rótulo: valor" até o próximo rótulo comum ou fim de linha
    const escaped = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `${escaped}\\s*[:\\-]?\\s*([^\\n\\r]{1,300}?)(?=(?:\\s{2,}[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+[:\\-])|\\n|$)`,
      'i',
    )
    const m = bloco.match(regex)
    if (m && m[1] && m[1].trim()) {
      return m[1].trim()
    }
  }
  return ''
}

function extrairValorMonetarioPorRotulos(bloco: string, rotulos: string[]): number {
  for (const rotulo of rotulos) {
    const escaped = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `${escaped}\\s*[:\\-]?\\s*(?:R\\$\\s*)?([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+(?:,[0-9]{2})?)`,
      'i',
    )
    const m = bloco.match(regex)
    if (m && m[1]) {
      return normalizarNumeroRobusto(m[1])
    }
  }
  return 0
}

function extrairDadosDeBlocoProcesso(
  bloco: string,
  identificadorInicial: string,
  empresaPadrao: string,
): ProcessoExtraido {
  // Procura CNJ no bloco: NNNNNNN-NN.NNNN.N.NN.NNNN
  const cnjMatch = bloco.match(/\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/)
  const numeroCnj = cnjMatch ? cnjMatch[1] : undefined

  // Processo código interno: ex 1.0010944
  let processoCodigo: string | undefined = undefined
  if (identificadorInicial && /^\d+\.\d+$/.test(identificadorInicial)) {
    processoCodigo = identificadorInicial
  } else {
    const codMatch = bloco.match(/\b(\d+\.\d{6,8})\b/)
    if (codMatch) processoCodigo = codMatch[1]
  }

  const numeroProcesso = numeroCnj || processoCodigo || identificadorInicial

  const titulo =
    extrairCampoPorRotulos(bloco, ['Título', 'Titulo', 'Assunto', 'Objeto']) ||
    bloco.match(/(?:Ação|Acao|Assunto)\s*[:]\s*([^\n]+)/i)?.[1]?.trim()

  const orgao = extrairCampoPorRotulos(bloco, [
    'Órgão',
    'Orgao',
    'Vara / Comarca',
    'Vara',
    'Tribunal',
    'Juízo',
    'Juizo',
  ])

  // Blindagem de acao: campo com max 150 no banco de dados
  const acaoCrua =
    extrairCampoPorRotulos(bloco, ['Ação', 'Acao', 'Tipo de Ação', 'Tipo Ação']) ||
    bloco.match(/Ação\s*[:-]\s*([^\n\r]+)/i)?.[1]?.trim() ||
    ''
  const acao = truncarTexto(acaoCrua, 150)

  const tipo =
    extrairCampoPorRotulos(bloco, ['Tipo']) ||
    (bloco.includes('Administrativo') ? 'Administrativo' : 'Judicial')
  const naturezaCrua = extrairCampoPorRotulos(bloco, ['Natureza']) || 'Trabalhista'
  const natureza = canonizarNatureza(naturezaCrua)

  const clienteCru = extrairCampoPorRotulos(bloco, [
    'Cliente Principal',
    'Cliente',
    'Autor',
    'Requerente',
  ])
  const { cliente, polo: poloExtraido } = extrairClienteEPolo(clienteCru)

  const contrarioCru = extrairCampoPorRotulos(bloco, [
    'Contrário Principal',
    'Contrario Principal',
    'Contrário',
    'Contrario',
    'Réu',
    'Reu',
    'Reclamante',
    'Reclamado',
  ])
  const contrario = extrairClienteEPolo(contrarioCru).cliente

  const responsavelCru = extrairCampoPorRotulos(bloco, [
    'Responsável Principal',
    'Responsavel Principal',
    'Responsável',
    'Advogado',
  ])
  const responsavel = responsavelCru
    .split(/\s*(?:Contr[aá]rio\s+Principal|Cliente\s+Principal)\s*[:-]/i)[0]
    .trim()

  // Probabilidade com sanitização defensiva <= 100 caracteres
  const probCrua = extrairCampoPorRotulos(bloco, [
    'Probabilidade',
    'Prognóstico',
    'Prognostico',
    'Risco',
  ])
  const probabilidade = sanitizarProbabilidade(probCrua)

  // Extração dos valores monetários
  const valorBase = extrairValorMonetarioPorRotulos(bloco, [
    'Valor Base',
    'Valor Causa',
    'Valor da Causa',
    'Valor Inicial',
  ])
  const valorCorrigido = extrairValorMonetarioPorRotulos(bloco, [
    'Valor Corrigido',
    'Valor Atualizado',
  ])
  const juros = extrairValorMonetarioPorRotulos(bloco, ['Juros', 'Valor Juros'])
  const multa = extrairValorMonetarioPorRotulos(bloco, ['Multa', 'Valor Multa'])
  const valorAtualizado =
    extrairValorMonetarioPorRotulos(bloco, [
      'Valor Atualizado',
      'Valor Total',
      'Valor Atualizado Indexado',
    ]) || (valorCorrigido ? valorCorrigido + juros + multa : valorBase)
  const valorAtualizadoIndexado = extrairValorMonetarioPorRotulos(bloco, [
    'Valor Atualizado Indexado',
    'Valor Indexado',
  ])
  const valorEnvolvido = extrairValorMonetarioPorRotulos(bloco, ['Valor Envolvido', 'Risco Total'])

  // Números alternativos (ex: Antigo, MTE, NDFCL)
  const altMatch = bloco.match(/(?:Antigo|MTE|NDFCL|Notificação|Documento Fiscal)[^\n\r]+/i)
  const numerosAlternativos = altMatch ? truncarTexto(altMatch[0], 280) : undefined

  // Andamento / Observações completas preservando cronologia inteira do bloco sem truncamento
  const observacoesCruas = extrairBlocoObservacoes(bloco)
  const observacoes = observacoesCruas ? observacoesCruas.trim() : undefined

  // Empresa: se identificada no bloco ou usa a padrão
  let empresa = empresaPadrao
  for (const emp of EMPRESAS_DISPONIVEIS) {
    if (bloco.toLowerCase().includes(emp.toLowerCase())) {
      empresa = emp
      break
    }
  }

  return {
    processo_codigo: processoCodigo,
    numero_processo: numeroProcesso,
    numero_cnj: numeroCnj,
    numeros_alternativos: numerosAlternativos,
    titulo: truncarTexto(
      titulo || (acao ? `${acao} - ${numeroProcesso}` : `Processo ${numeroProcesso}`),
      280,
    ),
    orgao: truncarTexto(orgao, 240),
    acao,
    tipo: truncarTexto(tipo, 80),
    natureza: truncarTexto(natureza, 100),
    polo: poloExtraido,
    cliente_principal: truncarTexto(cliente, 190),
    contrario_principal: truncarTexto(contrario, 190),
    responsavel_principal: truncarTexto(responsavel, 190),
    probabilidade,
    observacoes,
    valor_base: valorBase,
    valor_corrigido: valorCorrigido,
    juros,
    multa,
    valor_atualizado: valorAtualizado,
    valor_atualizado_indexado: valorAtualizadoIndexado,
    valor_envolvido: valorEnvolvido,
    empresa,
  }
}

// Extrai processos estruturados de uma planilha XLSX
export function extrairProcessosDePlanilha(rows: any[], empresaPadrao: string): ProcessoExtraido[] {
  const processos: ProcessoExtraido[] = []

  const buscarColuna = (row: any, termos: string[]): any => {
    const chaves = Object.keys(row)
    for (const termo of termos) {
      const achada = chaves.find((k) => k.toLowerCase().trim().includes(termo.toLowerCase()))
      if (
        achada &&
        row[achada] !== undefined &&
        row[achada] !== null &&
        String(row[achada]).trim() !== ''
      ) {
        return row[achada]
      }
    }
    return undefined
  }

  for (const row of rows) {
    const num = buscarColuna(row, [
      'cnj',
      'numero_cnj',
      'número cnj',
      'processo',
      'numero_processo',
      'número processo',
      'código',
      'codigo',
    ])
    if (!num) continue

    const numeroStr = String(num).trim()
    const cnjMatch = numeroStr.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)
    const numeroCnj = cnjMatch
      ? cnjMatch[0]
      : buscarColuna(row, ['cnj'])
        ? String(buscarColuna(row, ['cnj'])).trim()
        : undefined
    const processoCodigo = buscarColuna(row, [
      'código',
      'codigo',
      'pasta',
      'pasta_cliente',
      'proc_cod',
    ])
      ? String(buscarColuna(row, ['código', 'codigo', 'pasta', 'pasta_cliente', 'proc_cod'])).trim()
      : undefined

    const acaoCrua = buscarColuna(row, ['ação', 'acao', 'tipo de ação', 'tipo acao']) || ''
    const acao = truncarTexto(acaoCrua, 150)

    const probCrua = buscarColuna(row, ['probabilidade', 'risco', 'prognóstico', 'prognostico'])
    const probabilidade = sanitizarProbabilidade(probCrua)

    const empPlanilha = buscarColuna(row, ['empresa', 'cliente', 'unidade'])
    let empFinal = empresaPadrao
    if (empPlanilha) {
      const empEncontrada = EMPRESAS_DISPONIVEIS.find((e) =>
        String(empPlanilha).toLowerCase().includes(e.toLowerCase()),
      )
      if (empEncontrada) empFinal = empEncontrada
    }

    const valorBase = normalizarNumeroRobusto(
      buscarColuna(row, [
        'valor base',
        'valor_base',
        'valor causa',
        'valor_causa',
        'valor inicial',
      ]),
    )
    const valorCorrigido = normalizarNumeroRobusto(
      buscarColuna(row, ['valor corrigido', 'valor_corrigido']),
    )
    const juros = normalizarNumeroRobusto(buscarColuna(row, ['juros', 'valor juros']))
    const multa = normalizarNumeroRobusto(buscarColuna(row, ['multa', 'valor multa']))
    const valorAtualizado =
      normalizarNumeroRobusto(
        buscarColuna(row, [
          'valor atualizado',
          'valor_atualizado',
          'valor total',
          'saldo atualizado',
        ]),
      ) || (valorCorrigido ? valorCorrigido + juros + multa : valorBase)

    processos.push({
      processo_codigo: processoCodigo,
      numero_processo: numeroCnj || processoCodigo || numeroStr,
      numero_cnj: numeroCnj,
      numeros_alternativos: truncarTexto(buscarColuna(row, ['alternativo', 'antigo', 'mte']), 280),
      titulo: truncarTexto(
        buscarColuna(row, ['título', 'titulo', 'assunto', 'objeto']) ||
          (acao ? `${acao} - ${numeroStr}` : `Processo ${numeroStr}`),
        280,
      ),
      orgao: truncarTexto(
        buscarColuna(row, ['órgão', 'orgao', 'vara', 'comarca', 'tribunal']),
        240,
      ),
      acao,
      tipo: truncarTexto(buscarColuna(row, ['tipo']) || 'Judicial', 80),
      natureza: truncarTexto(buscarColuna(row, ['natureza']) || 'Trabalhista', 100),
      cliente_principal: truncarTexto(
        buscarColuna(row, ['cliente principal', 'cliente', 'autor']),
        190,
      ),
      contrario_principal: truncarTexto(
        buscarColuna(row, [
          'contrário principal',
          'contrario principal',
          'contrário',
          'réu',
          'reclamante',
        ]),
        190,
      ),
      responsavel_principal: truncarTexto(
        buscarColuna(row, ['responsável principal', 'responsavel', 'advogado']),
        190,
      ),
      probabilidade,
      observacoes: buscarColuna(row, ['observações', 'observacoes', 'andamento', 'resumo'])
        ? String(buscarColuna(row, ['observações', 'observacoes', 'andamento', 'resumo'])).trim()
        : undefined,
      valor_base: valorBase,
      valor_corrigido: valorCorrigido,
      juros,
      multa,
      valor_atualizado: valorAtualizado,
      valor_atualizado_indexado: normalizarNumeroRobusto(
        buscarColuna(row, ['valor atualizado indexado', 'indexado']),
      ),
      valor_envolvido: normalizarNumeroRobusto(buscarColuna(row, ['valor envolvido', 'envolvido'])),
      empresa: empFinal,
    })
  }

  return processos
}

export function JuridicosImportModal({
  aberto,
  onOpenChange,
  onImportadoSucesso,
}: JuridicosImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('Extrafruti')
  const [arquivoNome, setArquivoNome] = useState<string>('')
  const [tipoArquivo, setTipoArquivo] = useState<'pdf' | 'xlsx' | null>(null)
  const [processosExtraidos, setProcessosExtraidos] = useState<ProcessoExtraido[]>([])
  const [processandoLeitura, setProcessandoLeitura] = useState<boolean>(false)
  const [gravandoLote, setGravandoLote] = useState<boolean>(false)
  const [progresso, setProgresso] = useState<{ atual: number; total: number }>({
    atual: 0,
    total: 0,
  })
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [resumoFinal, setResumoFinal] = useState<{
    criados: number
    atualizados: number
    erros: number
    detalhesErros: string[]
  } | null>(null)

  const resetarEstado = () => {
    setArquivoNome('')
    setTipoArquivo(null)
    setProcessosExtraidos([])
    setProcessandoLeitura(false)
    setGravandoLote(false)
    setProgresso({ atual: 0, total: 0 })
    setErroLeitura(null)
    setResumoFinal(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErroLeitura(null)
    setResumoFinal(null)
    setArquivoNome(file.name)
    setProcessandoLeitura(true)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') {
        setTipoArquivo('pdf')
        const texto = await extrairTextoDePdf(file)
        const lista = extrairProcessosDeTextoRelatorio(texto, empresaSelecionada)
        if (lista.length === 0) {
          setErroLeitura(
            'Não foi possível encontrar marcadores de processo ("Processo: ..." ou numeração CNJ) no PDF. Verifique se o arquivo contém texto pesquisável.',
          )
        } else {
          setProcessosExtraidos(lista)
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        setTipoArquivo('xlsx')
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const lista = extrairProcessosDePlanilha(rows, empresaSelecionada)
        if (lista.length === 0) {
          setErroLeitura(
            'Nenhum processo com coluna identificadora (Processo, CNJ, Código) foi encontrado na planilha.',
          )
        } else {
          setProcessosExtraidos(lista)
        }
      } else {
        setErroLeitura(
          'Formato inválido. Por favor, envie um relatório em PDF ou planilha XLSX/XLS.',
        )
      }
    } catch (err: any) {
      console.error('Erro na leitura do arquivo:', err)
      setErroLeitura(err?.message || 'Falha ao processar o arquivo selecionado.')
    } finally {
      setProcessandoLeitura(false)
    }
  }

  // Grava lote de processos com blindagem rigorosa de acao (<=150) e probabilidade (<=100)
  // e registra versões no histórico juridicos_historico
  const handleGravarLote = async () => {
    if (processosExtraidos.length === 0) return

    setGravandoLote(true)
    setProgresso({ atual: 0, total: processosExtraidos.length })

    let criados = 0
    let atualizados = 0
    let erros = 0
    const detalhesErros: string[] = []

    for (let i = 0; i < processosExtraidos.length; i++) {
      const p = processosExtraidos[i]
      setProgresso({ atual: i + 1, total: processosExtraidos.length })

      try {
        // Blindagens estritas garantidas em tempo de gravação
        const acaoSegura = truncarTexto(p.acao || '', 150)
        const probSegura = sanitizarProbabilidade(p.probabilidade)
        const riscoEnum = canonizarRisco(probSegura)
        const statusEnum = canonizarStatus(p.natureza) // padrão ativo

        const numIdentificador = p.numero_cnj || p.numero_processo || p.processo_codigo || ''
        if (!numIdentificador) {
          erros++
          detalhesErros.push(`Linha ${i + 1}: Sem número de processo ou CNJ identificável`)
          continue
        }

        // Tenta localizar registro existente por CNJ ou número de processo
        let existente: any = null
        try {
          const filtro = p.numero_cnj
            ? `numero_cnj = "${p.numero_cnj}" || numero_processo = "${p.numero_cnj}"`
            : `numero_processo = "${numIdentificador}" || processo_codigo = "${numIdentificador}"`

          const resBusca = await pb.collection('processos_juridicos').getList(1, 1, {
            filter: filtro,
          })
          if (resBusca.items.length > 0) {
            existente = resBusca.items[0]
          }
        } catch {
          // segue para criação se a busca falhar
        }

        if (existente) {
          // ATUALIZAÇÃO com blindagem em acao e probabilidade
          const versaoAnterior = existente.versao_atual || 1
          const novaVersao = versaoAnterior + 1

          const payloadUpdate: Record<string, any> = {
            titulo: truncarTexto(
              p.titulo || existente.titulo || `Processo ${numIdentificador}`,
              400,
            ),
            orgao: truncarTexto(p.orgao || existente.orgao || '', 400),
            orgao_tribunal: truncarTexto(p.orgao || existente.orgao_tribunal || '', 400),
            vara_comarca: truncarTexto(p.orgao || existente.vara_comarca || '', 400),
            acao: truncarTexto(acaoSegura || existente.acao || '', 150),
            tipo: truncarTexto(p.tipo || existente.tipo || 'Judicial', 100),
            natureza: canonizarNatureza(p.natureza || existente.natureza || 'Trabalhista'),
            status: statusEnum,
            cliente_principal: truncarTexto(
              p.cliente_principal || existente.cliente_principal || p.empresa || empresaSelecionada,
              400,
            ),
            contrario_principal: truncarTexto(
              p.contrario_principal || existente.contrario_principal || '',
              400,
            ),
            responsavel_principal: truncarTexto(
              p.responsavel_principal || existente.responsavel_principal || '',
              400,
            ),
            polo: truncarTexto(p.polo || existente.polo || 'Polo passivo', 100),
            autor: truncarTexto(
              p.cliente_principal || existente.autor || p.empresa || empresaSelecionada,
              400,
            ),
            reu: truncarTexto(p.contrario_principal || existente.reu || '', 400),
            probabilidade: probSegura,
            risco: riscoEnum,
            valor_base: p.valor_base ?? existente.valor_base ?? 0,
            valor_corrigido: p.valor_corrigido ?? existente.valor_corrigido ?? 0,
            juros: p.juros ?? existente.juros ?? 0,
            multa: p.multa ?? existente.multa ?? 0,
            valor_atualizado: p.valor_atualizado ?? existente.valor_atualizado ?? 0,
            valor_atualizado_indexado:
              p.valor_atualizado_indexado ?? existente.valor_atualizado_indexado ?? 0,
            valor_envolvido: p.valor_envolvido ?? existente.valor_envolvido ?? 0,
            empresa: p.empresa || existente.empresa || empresaSelecionada,
            versao_atual: novaVersao,
          }

          if (p.processo_codigo || existente.processo_codigo) {
            payloadUpdate.processo_codigo = truncarTexto(
              p.processo_codigo || existente.processo_codigo || '',
              100,
            )
          }
          if (p.numero_cnj || existente.numero_cnj) {
            payloadUpdate.numero_cnj = truncarTexto(p.numero_cnj || existente.numero_cnj || '', 100)
          }
          if (p.numeros_alternativos || existente.numeros_alternativos) {
            payloadUpdate.numeros_alternativos = truncarTexto(
              p.numeros_alternativos || existente.numeros_alternativos || '',
              300,
            )
          }
          if (p.observacoes) {
            payloadUpdate.observacoes = p.observacoes
          }

          // Atualização individual isolada
          let registroAtualizado: any = null
          try {
            registroAtualizado = await pb
              .collection('processos_juridicos')
              .update(existente.id, payloadUpdate)
          } catch (errUpdate: any) {
            // Tratamento detalhado de erro em PT-BR
            let msg =
              errUpdate?.data?.message || errUpdate?.message || 'Falha ao atualizar processo'
            const fieldData = errUpdate?.response?.data || errUpdate?.data?.data
            if (fieldData && typeof fieldData === 'object') {
              const errosCampos = Object.entries(fieldData)
                .map(([campo, detalhe]: [string, any]) => {
                  const detalheMsg =
                    typeof detalhe === 'object' && detalhe?.message
                      ? detalhe.message
                      : String(detalhe)
                  return `${campo}: ${detalheMsg}`
                })
                .join(', ')
              if (errosCampos) msg = `${msg} (${errosCampos})`
            }
            erros++
            detalhesErros.push(`Processo ${numIdentificador}: Atualização falhou - ${msg}`)
            continue
          }

          // Salva histórico da alteração com isolamento estrito
          try {
            await pb.collection('juridicos_historico').create({
              processo_id: registroAtualizado.id,
              numero_processo: numIdentificador,
              versao: novaVersao,
              data_importacao: new Date().toISOString(),
              valores_anteriores: {
                valor_base: existente.valor_base,
                valor_corrigido: existente.valor_corrigido,
                juros: existente.juros,
                multa: existente.multa,
                valor_atualizado: existente.valor_atualizado,
                probabilidade: existente.probabilidade,
                acao: existente.acao,
                observacoes: existente.observacoes,
              },
              alteracoes: {
                valor_atualizado: payloadUpdate.valor_atualizado,
                probabilidade: probSegura,
                acao: acaoSegura,
                observacoes: payloadUpdate.observacoes,
              },
              importado_por: pb.authStore.model?.email || 'sistema',
            })
          } catch (errHist: any) {
            console.warn(
              `Aviso: Histórico v${novaVersao} do processo ${numIdentificador} não pôde ser gravado:`,
              errHist,
            )
            // Histórico não aborta o lote nem invalida o processo atualizado
          }

          atualizados++
        } else {
          // CRIAÇÃO com blindagem em acao e probabilidade
          const payloadCreate: Record<string, any> = {
            numero_processo: numIdentificador,
            numero_cnj: p.numero_cnj || (numIdentificador.includes('-') ? numIdentificador : ''),
            processo_codigo: p.processo_codigo || '',
            numeros_alternativos: p.numeros_alternativos || '',
            titulo: p.titulo || `Processo ${numIdentificador}`,
            orgao: p.orgao || '',
            orgao_tribunal: p.orgao || '',
            vara_comarca: p.orgao || '',
            acao: acaoSegura,
            tipo: p.tipo || 'Judicial',
            natureza: canonizarNatureza(p.natureza || 'Trabalhista'),
            cliente_principal: p.cliente_principal || p.empresa || empresaSelecionada,
            contrario_principal: p.contrario_principal || '',
            responsavel_principal: p.responsavel_principal || '',
            polo: p.polo || 'Polo passivo',
            autor: p.cliente_principal || p.empresa || empresaSelecionada,
            reu: p.contrario_principal || '',
            empresa: p.empresa || empresaSelecionada,
            status: statusEnum,
            probabilidade: probSegura,
            risco: riscoEnum,
            valor_base: p.valor_base ?? 0,
            valor_causa: p.valor_base ?? 0,
            valor_corrigido: p.valor_corrigido ?? 0,
            juros: p.juros ?? 0,
            multa: p.multa ?? 0,
            valor_atualizado: p.valor_atualizado ?? 0,
            valor_atualizado_indexado: p.valor_atualizado_indexado ?? 0,
            valor_envolvido: p.valor_envolvido ?? 0,
            observacoes: p.observacoes || '',
            versao_atual: 1,
          }

          let novoRegistro: any = null
          try {
            novoRegistro = await pb.collection('processos_juridicos').create(payloadCreate)
          } catch (errCreate: any) {
            let msg =
              errCreate?.data?.message || errCreate?.message || 'Falha ao cadastrar processo'
            const fieldData = errCreate?.response?.data || errCreate?.data?.data
            if (fieldData && typeof fieldData === 'object') {
              const errosCampos = Object.entries(fieldData)
                .map(([campo, detalhe]: [string, any]) => {
                  const detalheMsg =
                    typeof detalhe === 'object' && detalhe?.message
                      ? detalhe.message
                      : String(detalhe)
                  return `${campo}: ${detalheMsg}`
                })
                .join(', ')
              if (errosCampos) msg = `${msg} (${errosCampos})`
            }
            erros++
            detalhesErros.push(`Processo ${numIdentificador}: Cadastro falhou - ${msg}`)
            continue
          }

          // Cria histórico inicial v1 isolado
          try {
            await pb.collection('juridicos_historico').create({
              processo_id: novoRegistro.id,
              numero_processo: numIdentificador,
              versao: 1,
              data_importacao: new Date().toISOString(),
              valores_anteriores: {},
              alteracoes: {
                tipo: 'criacao_inicial',
                valor_atualizado: payloadCreate.valor_atualizado,
                probabilidade: probSegura,
                acao: acaoSegura,
              },
              importado_por: pb.authStore.model?.email || 'sistema',
            })
          } catch (errHist: any) {
            console.warn(
              `Aviso: Histórico v1 do processo ${numIdentificador} não pôde ser gravado:`,
              errHist,
            )
          }

          criados++
        }
      } catch (err: any) {
        erros++
        let msg = err?.data?.message || err?.message || 'Erro inesperado no registro'
        const fieldData = err?.response?.data || err?.data?.data
        if (fieldData && typeof fieldData === 'object') {
          const errosCampos = Object.entries(fieldData)
            .map(([campo, detalhe]: [string, any]) => {
              const detalheMsg =
                typeof detalhe === 'object' && detalhe?.message ? detalhe.message : String(detalhe)
              return `${campo}: ${detalheMsg}`
            })
            .join(', ')
          if (errosCampos) {
            msg = `${msg} (${errosCampos})`
          }
        }
        detalhesErros.push(`Processo ${processosExtraidos[i].numero_processo || i + 1}: ${msg}`)
      }
    }

    setResumoFinal({
      criados,
      atualizados,
      erros,
      detalhesErros: detalhesErros.slice(0, 5),
    })

    setGravandoLote(false)

    if (criados > 0 || atualizados > 0) {
      if (onImportadoSucesso) {
        onImportadoSucesso()
      }
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!gravandoLote) {
          if (!v) resetarEstado()
          onOpenChange(v)
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Upload className="w-5 h-5 text-blue-600" />
            Importação de Processos Jurídicos (PDF / XLSX)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Seletor de Empresa Padrão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <Label className="text-xs font-semibold text-gray-700">
                Empresa atribuída por padrão
              </Label>
              <Select
                value={empresaSelecionada}
                onValueChange={setEmpresaSelecionada}
                disabled={gravandoLote || processandoLeitura}
              >
                <SelectTrigger className="mt-1 bg-white h-9 text-xs">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {EMPRESAS_DISPONIVEIS.map((emp) => (
                    <SelectItem key={emp} value={emp} className="text-xs">
                      {emp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-[11px] text-gray-500 flex flex-col justify-center">
              <span className="font-medium text-gray-700">Formatos aceitos:</span>
              <span>• Relatório do jurídico em PDF (extração de blocos por processo)</span>
              <span>• Planilha eletrônica XLSX / XLS com colunas estruturadas</span>
            </div>
          </div>

          {/* Área de Seleção de Arquivo */}
          {!resumoFinal && (
            <div
              onClick={() => {
                if (!gravandoLote && !processandoLeitura) {
                  fileInputRef.current?.click()
                }
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                processandoLeitura
                  ? 'border-blue-300 bg-blue-50/50'
                  : 'border-gray-300 hover:border-blue-400 bg-white hover:bg-gray-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                onChange={handleArquivoSelecionado}
                disabled={gravandoLote || processandoLeitura}
              />

              {processandoLeitura ? (
                <div className="flex flex-col items-center justify-center gap-2 py-2">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs font-medium text-gray-700">
                    Lendo e interpretando dados de {arquivoNome}...
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Isso pode levar alguns segundos dependendo do tamanho do PDF.
                  </span>
                </div>
              ) : arquivoNome ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                  {tipoArquivo === 'pdf' ? (
                    <FileText className="w-8 h-8 text-rose-600" />
                  ) : (
                    <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                  )}
                  <span className="text-xs font-semibold text-gray-800">{arquivoNome}</span>
                  <span className="text-[11px] text-blue-600 hover:underline">
                    Clique para escolher outro arquivo
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <FileText className="w-7 h-7 text-rose-500" />
                    <FileSpreadsheet className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-blue-600">Clique para enviar</span>
                    <span className="text-xs text-gray-600"> ou arraste o relatório aqui</span>
                  </div>
                  <span className="text-[11px] text-gray-400">Arquivos PDF ou XLSX até 25MB</span>
                </div>
              )}
            </div>
          )}

          {/* Erro de Leitura */}
          {erroLeitura && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Erro ao analisar arquivo</span>
                <p className="text-[11px] text-rose-700">{erroLeitura}</p>
              </div>
            </div>
          )}

          {/* Pré-visualização dos Processos Extraídos */}
          {processosExtraidos.length > 0 && !resumoFinal && (
            <div className="space-y-3 p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {processosExtraidos.length} processos identificados
                  </Badge>
                  <span className="text-[11px] text-gray-500">
                    {tipoArquivo === 'pdf' ? 'Segmentados por marcador' : 'Mapeados por colunas'}
                  </span>
                </div>
              </div>

              {/* Tabela Resumo com os Primeiros 5 Registros */}
              <div className="border border-gray-100 rounded-md overflow-hidden max-h-48 overflow-y-auto text-[11px]">
                <table className="w-full text-left divide-y divide-gray-100">
                  <thead className="bg-gray-50 text-gray-600 text-[10px] font-semibold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2">Nº Processo / CNJ</th>
                      <th className="py-1.5 px-2">Título / Ação</th>
                      <th className="py-1.5 px-2">Probabilidade</th>
                      <th className="py-1.5 px-2 text-right">Valor Atualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {processosExtraidos.slice(0, 10).map((p, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-1.5 px-2 font-mono text-gray-800">
                          {p.numero_cnj || p.numero_processo || p.processo_codigo}
                        </td>
                        <td
                          className="py-1.5 px-2 text-gray-700 max-w-[200px] truncate"
                          title={p.titulo || p.acao}
                        >
                          {p.titulo || p.acao || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-gray-600">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100">
                            {p.probabilidade || 'Perda Possível'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium text-emerald-700">
                          {(p.valor_atualizado || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {processosExtraidos.length > 10 && (
                <div className="text-[10px] text-gray-400 text-center">
                  Exibindo 10 de {processosExtraidos.length} processos extraídos.
                </div>
              )}

              {/* Barra de Progresso durante gravação */}
              {gravandoLote && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      Gravando e versionando lote...
                    </span>
                    <span>
                      {progresso.atual} de {progresso.total} (
                      {Math.round((progresso.atual / progresso.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-150"
                      style={{
                        width: `${Math.round((progresso.atual / progresso.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded text-[11px] text-blue-800 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  O sistema atualiza automaticamente processos existentes com novo histórico de
                  versão (v2, v3...), e cria novos registros preservando valores base, corrigidos,
                  juros e multas com blindagem em todos os campos.
                </span>
              </div>
            </div>
          )}

          {/* Resumo Final Pós-Gravação */}
          {resumoFinal && (
            <div className="space-y-3 p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Lote Processado com Sucesso!
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 bg-white rounded border border-emerald-100">
                  <span className="text-xs text-gray-500 block">Novos Criados</span>
                  <span className="text-base font-bold text-emerald-700">
                    {resumoFinal.criados}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-emerald-100">
                  <span className="text-xs text-gray-500 block">Atualizados (Nova Versão)</span>
                  <span className="text-base font-bold text-blue-700">
                    {resumoFinal.atualizados}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-emerald-100">
                  <span className="text-xs text-gray-500 block">Falhas</span>
                  <span
                    className={`text-base font-bold ${resumoFinal.erros > 0 ? 'text-rose-600' : 'text-gray-400'}`}
                  >
                    {resumoFinal.erros}
                  </span>
                </div>
              </div>

              {resumoFinal.detalhesErros.length > 0 && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 space-y-1">
                  <span className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Erros reportados no lote:
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-rose-700">
                    {resumoFinal.detalhesErros.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            {resumoFinal ? (
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-4"
                onClick={() => {
                  resetarEstado()
                  onOpenChange(false)
                }}
              >
                Concluir e Fechar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs h-9"
                  onClick={() => {
                    resetarEstado()
                    onOpenChange(false)
                  }}
                  disabled={gravandoLote}
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-4 flex items-center gap-1.5"
                  onClick={handleGravarLote}
                  disabled={processosExtraidos.length === 0 || gravandoLote || processandoLeitura}
                >
                  {gravandoLote ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gravando Lote...
                    </>
                  ) : (
                    <>
                      Gravar{' '}
                      {processosExtraidos.length > 0
                        ? `${processosExtraidos.length} Processos`
                        : 'Lote'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default JuridicosImportModal
