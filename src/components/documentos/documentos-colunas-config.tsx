/**
 * Configuração de colunas dinâmicas por tipo de documento.
 *
 * REGRA ESTRUTURAL MANDATÓRIA (Bloco 2 da Especificação):
 * - 5 colunas FIXAS em todas as abas:
 *     1) documento (checkbox/ícone/título)
 *     2) empresa (com ícone da empresa)
 *     3) status (com semáforo, ícone e texto unificado)
 *     4) anexos (ícone + contagem; se 0 e obrigatório -> ponto âmbar com tooltip)
 *     5) acoes (botão primário 'Abrir' + menu '…')
 *
 * - As colunas ESPECÍFICAS entram exatamente ENTRE 'documento' e 'empresa' (ou logo adjacente conforme layout da tabela):
 *     - Alvarás: Nº Alvará, Tipo, Órgão Emissor, Município, Validade
 *     - Contratos: Contraparte, Valor Mensal, Vigência, Índice de Reajuste
 *     - Locações: Imóvel, Aluguel, Caução, Fim da Vigência
 *     - Atas: Tipo (AGE/AGO), Data, Deliberações, Assinaturas
 *     - Jurídicos: Processo (CNJ), Vara/Comarca, Próximo Prazo / Audiência, Risco
 *     - Convenções: Sindicato, Vigência (fim), Data-base, Reajuste
 *
 * - Proibido "—" na renderização: campos vazios utilizam o estado "Não aplicável" ou "Pendente".
 */

import React from 'react'
import {
  Paperclip,
  AlertCircle,
  FileText,
  Calendar,
  Building2,
  MapPin,
  Scale,
  ShieldAlert,
} from 'lucide-react'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { calcularPrazoValidade, obterStatusInfo, CampoFormatado } from './documentos-design-tokens'
import { extrairAnexos } from '@/components/documentos/documentos-anexos-utils'
import { formatarBRL, parseNumeroBR } from './documentos-moeda-utils'

export interface ColunaTipoConfig<T = any> {
  id: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  sortValue?: (item: T) => any
  className?: string
  render: (item: T) => React.ReactNode
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  isFixed?: boolean
}

// Formatador de moeda BRL (util central com parse tolerante — string numérica do PocketBase ok)
const fmtMoeda = (val: any): string => formatarBRL(val)

// Formatador de data PT-BR
const fmtData = (val: any): string => {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

/**
 * 1) COLUNA FIXA: Documento (Título + Ícone)
 */
export const criarColunaDocumento = <T extends Record<string, any>>(): ColunaTipoConfig<T> => ({
  id: 'documento',
  label: 'TÍTULO DO DOCUMENTO',
  width: '260px',
  sortable: true,
  isFixed: true,
  sortValue: (item) => item.titulo || item.tipo || item.numero || item.numero_processo || '',
  render: (item) => {
    const titulo =
      item.titulo ||
      (item.tipo && item.empresa ? `${item.tipo} — ${item.empresa}` : null) ||
      item.tipo ||
      item.numero ||
      item.numero_processo ||
      'Documento sem título'

    return (
      <div className="flex items-center gap-2 min-w-0 py-0.5">
        <div className="h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
          <FileText className="h-3.5 w-3.5" />
        </div>
        <span className="font-semibold text-gray-900 text-xs truncate max-w-[240px]" title={titulo}>
          {titulo}
        </span>
      </div>
    )
  },
})

/**
 * 2) COLUNA FIXA: Empresa
 */
export const criarColunaEmpresa = <T extends Record<string, any>>(): ColunaTipoConfig<T> => ({
  id: 'empresa',
  label: 'EMPRESA',
  width: '140px',
  sortable: true,
  isFixed: true,
  sortValue: (item) => item.empresa || item.cliente_principal || '',
  render: (item) => {
    const nome = item.empresa || item.cliente_principal
    if (!nome) {
      return <CampoFormatado estado="pendente" textoAcao="Definir" />
    }
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <EmpresaIcon
          nome={nome}
          mostrarNome
          className="h-4 w-4 shrink-0 rounded-xs"
          nomeClassName="text-xs font-medium text-gray-800 truncate"
        />
      </div>
    )
  },
})

/**
 * 3) COLUNA FIXA: Status (com taxonomia unificada)
 */
export const criarColunaStatus = <T extends Record<string, any>>(
  tipoAba: string,
): ColunaTipoConfig<T> => ({
  id: 'status',
  label: 'STATUS',
  width: '120px',
  align: 'center',
  sortable: true,
  isFixed: true,
  sortValue: (item) => item.status || '',
  render: (item) => {
    // Para alvarás, se tiver data de validade, o semáforo pode guiar ou unificar com item.status
    let statusTexto = item.status
    if (tipoAba === 'alvaras' && item.validade) {
      const calculo = calcularPrazoValidade(item.validade)
      if (calculo.categoria === 'vencido') statusTexto = 'vencido'
      else if (calculo.categoria === 'vencendo' || calculo.categoria === 'urgente')
        statusTexto = 'vencendo'
      else statusTexto = 'regular'
    }

    const info = obterStatusInfo(statusTexto, tipoAba)
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border tracking-wide uppercase ${info.badgeClass}`}
      >
        {info.icone}
        <span>{info.label}</span>
      </span>
    )
  },
})

/**
 * 4) COLUNA FIXA: Anexos (ícone + contagem, tooltip se obrigatório)
 */
export const criarColunaAnexos = <T extends Record<string, any>>(): ColunaTipoConfig<T> => ({
  id: 'anexos',
  label: 'ANEXOS',
  width: '90px',
  align: 'center',
  sortable: true,
  isFixed: true,
  sortValue: (item) => {
    const lista = extrairAnexos(item.anexo)
    return lista.length
  },
  render: (item) => {
    const lista = extrairAnexos(item.anexo)
    const count = lista.length

    if (count === 0) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="font-mono">0</span>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs bg-gray-900 text-white font-medium">
              Anexo obrigatório pendente
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <div className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
        <Paperclip className="h-3.5 w-3.5 text-gray-500" />
        <span className="font-mono">{count}</span>
      </div>
    )
  },
})

/**
 * CONFIGURAÇÃO ESPECÍFICA: ALVARÁS
 * Colunas específicas: Nº Alvará, Tipo, Órgão Emissor, Município, Validade
 */
export const COLUNAS_ALVARAS: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Nº Alvará
  {
    id: 'numero',
    label: 'Nº ALVARÁ',
    width: '130px',
    sortable: true,
    sortValue: (item) => item.numero || '',
    render: (item) => (
      <span className="font-mono font-semibold text-xs text-gray-900">
        {item.numero || <CampoFormatado estado="pendente" />}
      </span>
    ),
  },
  // Específica: Tipo
  {
    id: 'tipo',
    label: 'TIPO',
    width: '180px',
    sortable: true,
    sortValue: (item) => item.tipo || '',
    render: (item) => (
      <span className="text-xs text-gray-800 font-medium">
        {item.tipo || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Órgão Emissor
  {
    id: 'orgao_emissor',
    label: 'ÓRGÃO EMISSOR',
    width: '180px',
    sortable: true,
    sortValue: (item) => item.orgao_emissor || '',
    render: (item) => (
      <span className="text-xs text-gray-700">
        {item.orgao_emissor || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // Específica: Município
  {
    id: 'municipio',
    label: 'MUNICÍPIO',
    width: '130px',
    sortable: true,
    sortValue: (item) => item.municipio || '',
    render: (item) => (
      <span className="text-xs text-gray-700">
        {item.municipio || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // Específica: Validade (com semáforo e linha secundária calculada)
  {
    id: 'validade',
    label: 'VALIDADE',
    width: '140px',
    sortable: true,
    sortValue: (item) => item.validade || '',
    render: (item) => {
      if (!item.validade) {
        return <CampoFormatado estado="pendente" textoAcao="Informar" />
      }
      const dataFormatada = fmtData(item.validade)
      const calculo = calcularPrazoValidade(item.validade)
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-gray-900">{dataFormatada}</span>
          <span className={`text-[10.5px] font-medium ${calculo.corTexto}`}>
            {calculo.textoAmigavel}
          </span>
        </div>
      )
    },
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('alvaras'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * CONFIGURAÇÃO ESPECÍFICA: CONTRATOS
 * Colunas específicas: Contraparte, Valor Mensal, Vigência, Índice de Reajuste
 */
export const COLUNAS_CONTRATOS: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Contraparte
  {
    id: 'parte',
    label: 'CONTRAPARTE',
    width: '200px',
    sortable: true,
    sortValue: (item) => item.parte || '',
    render: (item) => (
      <span className="text-xs font-medium text-gray-900">
        {item.parte || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Valor (Mensal ou Único/Aquisição conforme modelo_contrato)
  {
    id: 'valor',
    label: 'VALOR',
    width: '145px',
    align: 'right',
    sortable: true,
    sortValue: (item) => {
      const ehUnico = item.modelo_contrato === 'unico_aquisicao'
      return (
        parseNumeroBR(ehUnico ? item.valor_total || item.valor_assinatura : item.valor_mensal) ?? 0
      )
    },
    render: (item) => {
      const ehUnico = item.modelo_contrato === 'unico_aquisicao'
      if (ehUnico) {
        const val = item.valor_total ?? item.valor_assinatura
        const v = fmtMoeda(val)
        return v ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="font-semibold text-xs text-gray-900">{v}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full mt-0.5">
              Único / Aquisição
            </span>
          </div>
        ) : (
          <CampoFormatado estado="pendente" textoAcao="Informar valor" />
        )
      }
      const v = fmtMoeda(item.valor_mensal)
      return v ? (
        <div className="flex flex-col items-end leading-tight">
          <span className="font-semibold text-xs text-gray-900">{v}</span>
          <span className="text-[10px] text-gray-400">/ mês</span>
        </div>
      ) : (
        <CampoFormatado estado="nao_aplicavel" />
      )
    },
  },
  // Específica: Vigência (Início - Fim com linha secundária)
  {
    id: 'vigencia',
    label: 'VIGÊNCIA',
    width: '150px',
    sortable: true,
    sortValue: (item) => item.fim || item.inicio || '',
    render: (item) => {
      if (!item.fim && !item.inicio) {
        return <CampoFormatado estado="pendente" />
      }
      const dataFim = fmtData(item.fim)
      const calculo = item.fim ? calcularPrazoValidade(item.fim) : null
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-gray-900">{dataFim || fmtData(item.inicio)}</span>
          {calculo && (
            <span className={`text-[10.5px] font-medium ${calculo.corTexto}`}>
              {calculo.textoAmigavel}
            </span>
          )}
        </div>
      )
    },
  },
  // Específica: Índice de Reajuste (Não aplicável para contrato único/aquisição)
  {
    id: 'indexador',
    label: 'ÍNDICE REAJUSTE',
    width: '130px',
    sortable: true,
    sortValue: (item) => (item.modelo_contrato === 'unico_aquisicao' ? '' : item.indexador || ''),
    render: (item) => {
      if (item.modelo_contrato === 'unico_aquisicao') {
        return <CampoFormatado estado="nao_aplicavel" />
      }
      return <span className="text-xs text-gray-700">{item.indexador || 'IGP-M'}</span>
    },
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('contratos'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * CONFIGURAÇÃO ESPECÍFICA: LOCAÇÕES
 * Colunas específicas: Imóvel/Unidade, Aluguel, Caução/Garantia, Fim da Vigência
 */
export const COLUNAS_LOCACOES: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Imóvel / Unidade
  {
    id: 'unidade',
    label: 'IMÓVEL / OBJETO',
    width: '200px',
    sortable: true,
    sortValue: (item) => item.unidade || item.objeto || item.parte || '',
    render: (item) => (
      <span className="text-xs font-medium text-gray-900 truncate block max-w-[200px]">
        {item.unidade || item.objeto || item.parte || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Aluguel
  {
    id: 'valor_mensal',
    label: 'ALUGUEL',
    width: '130px',
    align: 'right',
    sortable: true,
    sortValue: (item) => parseNumeroBR(item.valor_mensal) ?? 0,
    render: (item) => {
      const v = fmtMoeda(item.valor_mensal)
      return v ? (
        <span className="font-semibold text-xs text-emerald-800">{v}</span>
      ) : (
        <CampoFormatado estado="nao_aplicavel" />
      )
    },
  },
  // Específica: Caução / Garantia
  {
    id: 'garantia',
    label: 'CAUÇÃO / GARANTIA',
    width: '140px',
    sortable: true,
    sortValue: (item) => item.garantia || '',
    render: (item) => (
      <span className="text-xs text-gray-700 truncate block max-w-[140px]">
        {item.garantia || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // Específica: Fim da Vigência
  {
    id: 'fim',
    label: 'FIM DA VIGÊNCIA',
    width: '140px',
    sortable: true,
    sortValue: (item) => item.fim || '',
    render: (item) => {
      if (!item.fim) {
        return <CampoFormatado estado="pendente" />
      }
      const dataFim = fmtData(item.fim)
      const calculo = calcularPrazoValidade(item.fim)
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-gray-900">{dataFim}</span>
          <span className={`text-[10.5px] font-medium ${calculo.corTexto}`}>
            {calculo.textoAmigavel}
          </span>
        </div>
      )
    },
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('locacoes'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * CONFIGURAÇÃO ESPECÍFICA: ATAS
 * Colunas específicas: Tipo (AGE/AGO), Data, Deliberações, Assinaturas
 */
export const COLUNAS_ATAS: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Tipo (AGE / AGO)
  {
    id: 'tipo_ata',
    label: 'TIPO',
    width: '90px',
    align: 'center',
    sortable: true,
    sortValue: (item) => item.tipo_ata || '',
    render: (item) => (
      <Badge
        variant="outline"
        className="text-[10px] font-bold bg-blue-50 text-blue-700 border-blue-200"
      >
        {item.tipo_ata || 'AGE'}
      </Badge>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Data da Ata
  {
    id: 'data',
    label: 'DATA',
    width: '110px',
    sortable: true,
    sortValue: (item) => item.data || '',
    render: (item) => (
      <span className="text-xs font-medium text-gray-900">
        {fmtData(item.data) || <CampoFormatado estado="pendente" />}
      </span>
    ),
  },
  // Específica: Deliberações
  {
    id: 'deliberacoes',
    label: 'DELIBERAÇÕES',
    width: '240px',
    render: (item) => {
      const texto = item.deliberacoes || item.resumo || item.pauta
      return texto ? (
        <span className="text-xs text-gray-700 truncate block max-w-[240px]" title={texto}>
          {texto}
        </span>
      ) : (
        <CampoFormatado estado="nao_aplicavel" />
      )
    },
  },
  // Específica: Assinaturas
  {
    id: 'assinaturas',
    label: 'ASSINATURAS',
    width: '140px',
    render: (item) => (
      <span className="text-xs text-gray-600 truncate block max-w-[140px]">
        {item.assinatura_eletronica || item.mesa_diretora || 'Coletadas'}
      </span>
    ),
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('atas'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * CONFIGURAÇÃO ESPECÍFICA: JURÍDICOS
 * Colunas específicas: Processo (CNJ), Vara/Comarca, Próximo Prazo / Audiência, Risco
 */
export const COLUNAS_JURIDICOS: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Processo
  {
    id: 'numero_processo',
    label: 'PROCESSO',
    width: '190px',
    sortable: true,
    sortValue: (item) => item.numero_cnj || item.numero_processo || '',
    render: (item) => (
      <span className="font-mono text-xs font-semibold text-gray-900">
        {item.numero_cnj || item.numero_processo || <CampoFormatado estado="pendente" />}
      </span>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Vara / Comarca
  {
    id: 'vara_comarca',
    label: 'VARA / COMARCA',
    width: '170px',
    sortable: true,
    sortValue: (item) => item.vara_comarca || item.orgao || '',
    render: (item) => (
      <span className="text-xs text-gray-700 truncate block max-w-[170px]">
        {item.vara_comarca || item.orgao || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // Específica: Próximo Prazo / Audiência
  {
    id: 'proximo_prazo',
    label: 'PRÓXIMO PRAZO',
    width: '140px',
    sortable: true,
    sortValue: (item) => item.proxima_audiencia || item.data_distribuicao || '',
    render: (item) => {
      const dataRef = item.proxima_audiencia || item.data_distribuicao
      if (!dataRef) {
        return <CampoFormatado estado="nao_aplicavel" />
      }
      const calculo = calcularPrazoValidade(dataRef)
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-gray-900">{fmtData(dataRef)}</span>
          <span className={`text-[10.5px] font-medium ${calculo.corTexto}`}>
            {calculo.textoAmigavel}
          </span>
        </div>
      )
    },
  },
  // Específica: Risco / Probabilidade
  {
    id: 'risco',
    label: 'RISCO',
    width: '110px',
    align: 'center',
    sortable: true,
    sortValue: (item) => item.probabilidade || item.risco || '',
    render: (item) => {
      const r = String(item.probabilidade || item.risco || 'Provável').toLowerCase()
      const ehPerigo = r.includes('provável') || r.includes('alto')
      const ehAlerta = r.includes('possível') || r.includes('médio')
      return (
        <Badge
          variant="outline"
          className={`text-[10px] font-bold ${
            ehPerigo
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : ehAlerta
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          {item.probabilidade || item.risco || 'Possível'}
        </Badge>
      )
    },
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('juridicos'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * Mapeador geral de colunas por tipo de aba
 */
export type TipoAbaDocumento =
  | 'alvaras'
  | 'contratos'
  | 'locacoes'
  | 'atas'
  | 'convencoes'
  | 'seguros'
  | 'juridicos'
export type DocumentoGenericoItem = Record<string, any>

/**
 * CONFIGURAÇÃO ESPECÍFICA: CONVENÇÕES COLETIVAS
 * Colunas específicas: Sindicato, Vigência (fim), Data-base, Reajuste
 */
export const COLUNAS_CONVENCOES: ColunaTipoConfig[] = [
  // 1. Coluna Fixa: Documento
  criarColunaDocumento(),
  // Específica: Sindicato / Parte patronal
  {
    id: 'sindicato',
    label: 'SINDICATO',
    width: '220px',
    sortable: true,
    sortValue: (item) => item.sindicato || '',
    render: (item) => (
      <span
        className="text-xs text-gray-700 block truncate max-w-[220px]"
        title={item.sindicato || ''}
      >
        {item.sindicato || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // 2. Coluna Fixa: Empresa
  criarColunaEmpresa(),
  // Específica: Vigência (fim com semáforo)
  {
    id: 'vigencia',
    label: 'VIGÊNCIA (FIM)',
    width: '140px',
    sortable: true,
    sortValue: (item) => item.vigencia_fim || '',
    render: (item) => {
      if (!item.vigencia_fim) {
        return <CampoFormatado estado="pendente" textoAcao="Informar" />
      }
      const calculo = calcularPrazoValidade(item.vigencia_fim)
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-gray-900">{fmtData(item.vigencia_fim)}</span>
          <span className={`text-[10.5px] font-medium ${calculo.corTexto}`}>
            {calculo.textoAmigavel}
          </span>
        </div>
      )
    },
  },
  // Específica: Data-base
  {
    id: 'data_base',
    label: 'DATA-BASE',
    width: '120px',
    sortable: true,
    sortValue: (item) => item.data_base || '',
    render: (item) => (
      <span className="text-xs text-gray-800 font-medium">
        {item.data_base || <CampoFormatado estado="nao_aplicavel" />}
      </span>
    ),
  },
  // Específica: Reajuste salarial
  {
    id: 'reajuste',
    label: 'REAJUSTE',
    width: '110px',
    align: 'right',
    sortable: true,
    // O schema da coleção usa `reajuste_percentual` (migração 0060). A coluna
    // lia `percentual_reajuste`, que não existe — a célula mostrava sempre
    // "Não aplicável" mesmo com o percentual gravado.
    sortValue: (item) => item.reajuste_percentual ?? item.percentual_reajuste ?? 0,
    render: (item) => {
      const valor = item.reajuste_percentual ?? item.percentual_reajuste
      if (valor === undefined || valor === null || valor === '') {
        return <CampoFormatado estado="nao_aplicavel" />
      }
      return (
        <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          {String(valor).replace('.', ',')}%
        </span>
      )
    },
  },
  // 3. Coluna Fixa: Status
  criarColunaStatus('convencoes'),
  // 4. Coluna Fixa: Anexos
  criarColunaAnexos(),
]

/**
 * CONFIGURAÇÃO ESPECÍFICA: SEGUROS
 * Colunas: Seguradora, Apólice, Vigência (fim), Prêmio
 */
export const COLUNAS_SEGUROS: ColunaTipoConfig[] = [
  criarColunaDocumento(),
  {
    id: 'seguradora',
    label: 'SEGURADORA',
    width: '200px',
    sortable: true,
    render: (item) => <span className="text-xs text-slate-800">{item.seguradora || '—'}</span>,
  },
  {
    id: 'apolice',
    label: 'APÓLICE',
    width: '150px',
    sortable: true,
    render: (item) => (
      <span className="font-mono text-xs text-slate-700">{item.numero_apolice || '—'}</span>
    ),
  },
  {
    id: 'vigencia_fim',
    label: 'VIGÊNCIA (FIM)',
    width: '130px',
    sortable: true,
    sortValue: (item) => (item.vigencia_fim ? String(item.vigencia_fim) : ''),
    render: (item) => {
      if (!item.vigencia_fim) return <CampoFormatado estado="pendente" />
      const s = String(item.vigencia_fim).slice(0, 10)
      const [y, m, d] = s.split('-')
      return (
        <span className="font-mono text-xs tabular-nums text-slate-800">
          {d && m && y ? `${d}/${m}/${y}` : s}
        </span>
      )
    },
  },
  {
    id: 'premio',
    label: 'PRÊMIO',
    width: '130px',
    align: 'right',
    sortable: true,
    sortValue: (item) => parseNumeroBR(item.premio_total) ?? 0,
    render: (item) => {
      const v = fmtMoeda(item.premio_total)
      if (!v) {
        return <CampoFormatado estado="nao_aplicavel" />
      }
      return <span className="font-mono text-xs tabular-nums text-slate-800">{v}</span>
    },
  },
  criarColunaStatus('seguros'),
  criarColunaAnexos(),
]

export const CONFIG_COLUNAS_POR_TIPO: Record<TipoAbaDocumento, ColunaTipoConfig[]> = {
  alvaras: COLUNAS_ALVARAS,
  contratos: COLUNAS_CONTRATOS,
  locacoes: COLUNAS_LOCACOES,
  atas: COLUNAS_ATAS,
  convencoes: COLUNAS_CONVENCOES,
  seguros: COLUNAS_SEGUROS,
  juridicos: COLUNAS_JURIDICOS,
}

export function obterColunasPorTipo(tipoAba: string): ColunaTipoConfig[] {
  switch (tipoAba) {
    case 'alvaras':
      return COLUNAS_ALVARAS
    case 'contratos':
      return COLUNAS_CONTRATOS
    case 'locacoes':
      return COLUNAS_LOCACOES
    case 'atas':
      return COLUNAS_ATAS
    case 'convencoes':
      return COLUNAS_CONVENCOES
    case 'seguros':
      return COLUNAS_SEGUROS
    case 'juridicos':
      return COLUNAS_JURIDICOS
    default:
      return COLUNAS_ALVARAS
  }
}
