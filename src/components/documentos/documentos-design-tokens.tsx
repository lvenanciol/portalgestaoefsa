/**
 * Tokens e Helpers de Design System para o módulo de Documentos
 * Conforme Bloco 1 da Especificação:
 * - Radius: card 16px (rounded-2xl) · botão/pill 999px (rounded-full) · input 10px (rounded-[10px]) · chip 6px (rounded-md)
 * - Espaçamento: múltiplos de 8px (p-2, p-4, p-6, p-8, gap-2, gap-4, etc.)
 * - Tipografia: sans-serif. Escala: display 40/48 · h1 28/36 · h2 20/28 · body 14/22 · label 11-12/16 uppercase letter-spacing .04em · mono para números
 * - Sombra: no máximo 1 nível (0 2px 8px rgba(0,0,0,.06))
 * - Borda: 1px sólida neutra (#E5E7EB / gray-200)
 * - Cores: verde institucional, âmbar para pendência, vermelho para vencido, verde suave para regular
 * - Estados de campo obrigatório (4): preenchido, nao_aplicavel, pendente, erro (PROIBIDO "—")
 * - Estados de documento: rascunho -> ativo/regular -> encerrado/vencido
 */

import React from 'react'
import { AlertCircle, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

export type EstadoCampoObrigatorio = 'preenchido' | 'nao_aplicavel' | 'pendente' | 'erro'

export interface CampoObrigatorioProps {
  label?: string
  valor?: React.ReactNode
  estado?: EstadoCampoObrigatorio
  motivoErro?: string
  onPreencher?: () => void
  textoAcao?: string
  className?: string
  valorClassName?: string
}

/**
 * Renderiza o valor de um campo respeitando rigorosamente os 4 estados obrigatórios:
 * - preenchido: renderiza o valor diretamente
 * - nao_aplicavel: pill cinza explícita "Não aplicável"
 * - pendente: pill âmbar + link "Preencher" / "Anexar"
 * - erro: borda vermelha + motivo abaixo
 * Proibido exibir "—" ou vazio silencioso!
 */
export function CampoFormatado({
  label,
  valor,
  estado,
  motivoErro,
  onPreencher,
  textoAcao = 'Preencher',
  className = '',
  valorClassName = '',
}: CampoObrigatorioProps) {
  // Se estado não for fornecido explicitamente, infere com base no valor
  let estadoCalculado: EstadoCampoObrigatorio = estado || 'preenchido'
  if (!estado) {
    if (valor === undefined || valor === null || valor === '' || valor === '—') {
      estadoCalculado = 'pendente'
    } else {
      estadoCalculado = 'preenchido'
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
          {label}
        </span>
      )}

      {estadoCalculado === 'preenchido' && (
        <div className={`text-sm text-gray-900 font-medium ${valorClassName}`}>{valor}</div>
      )}

      {estadoCalculado === 'nao_aplicavel' && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          Não aplicável
        </span>
      )}

      {estadoCalculado === 'pendente' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
            Pendente
          </span>
          {onPreencher && (
            <button
              type="button"
              onClick={onPreencher}
              className="text-xs text-emerald-700 hover:text-emerald-800 hover:underline font-medium"
            >
              {textoAcao}
            </button>
          )}
        </div>
      )}

      {estadoCalculado === 'erro' && (
        <div className="space-y-1">
          <div className="p-1.5 rounded-[10px] border border-rose-400 bg-rose-50/50 text-xs text-rose-900 font-medium">
            {valor || 'Dado inválido'}
          </div>
          {motivoErro && (
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {motivoErro}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Cálculo inteligente de prazo/validade sem cálculo mental para o gestor:
 * - >90 dias verde "Regular"
 * - 30-90 dias âmbar "Vencendo"
 * - <30 dias âmbar forte
 * - <0 dias vermelho "Vencido"
 */
export interface CalculoPrazo {
  diasRestantes: number
  categoria: 'regular' | 'vencendo' | 'urgente' | 'vencido' | 'sem_data'
  textoAmigavel: string
  labelStatus: string
  corBadge: string
  corBorda: string
  corTexto: string
  corSemaforo: string
}

export function calcularPrazoValidade(dataStr?: string | null): CalculoPrazo {
  if (!dataStr) {
    return {
      diasRestantes: 0,
      categoria: 'sem_data',
      textoAmigavel: 'Validade pendente',
      labelStatus: 'Pendente',
      corBadge: 'bg-amber-50 text-amber-800 border-amber-200',
      corBorda: 'border-amber-300',
      corTexto: 'text-amber-800',
      corSemaforo: '#F59E0B',
    }
  }

  const dataValidade = new Date(dataStr)
  if (isNaN(dataValidade.getTime())) {
    return {
      diasRestantes: 0,
      categoria: 'sem_data',
      textoAmigavel: 'Data inválida',
      labelStatus: 'Pendente',
      corBadge: 'bg-rose-50 text-rose-800 border-rose-200',
      corBorda: 'border-rose-300',
      corTexto: 'text-rose-800',
      corSemaforo: '#EF4444',
    }
  }

  const hoje = new Date()
  // Normaliza horas para comparar apenas datas
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  const fimValidade = new Date(
    dataValidade.getFullYear(),
    dataValidade.getMonth(),
    dataValidade.getDate(),
  ).getTime()

  const diffMs = fimValidade - inicioHoje
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24))

  // Cálculo de texto amigável (anos, meses, dias)
  const absDias = Math.abs(diffDias)
  let textoAmigavel = ''

  if (diffDias < 0) {
    if (absDias >= 365) {
      const anos = Math.floor(absDias / 365)
      textoAmigavel = `vencido há ${anos} ${anos === 1 ? 'ano' : 'anos'}`
    } else if (absDias >= 30) {
      const meses = Math.floor(absDias / 30)
      textoAmigavel = `vencido há ${meses} ${meses === 1 ? 'mês' : 'meses'}`
    } else {
      textoAmigavel = `vencido há ${absDias} ${absDias === 1 ? 'dia' : 'dias'}`
    }

    return {
      diasRestantes: diffDias,
      categoria: 'vencido',
      textoAmigavel,
      labelStatus: 'VENCIDO',
      corBadge: 'bg-rose-50 text-rose-700 border-rose-200',
      corBorda: 'border-rose-300',
      corTexto: 'text-rose-700',
      corSemaforo: '#EF4444',
    }
  }

  if (absDias >= 365) {
    const anos = Math.floor(absDias / 365)
    textoAmigavel = `vence em ${anos} ${anos === 1 ? 'ano' : 'anos'}`
  } else if (absDias >= 30) {
    const meses = Math.floor(absDias / 30)
    textoAmigavel = `vence em ${meses} ${meses === 1 ? 'mês' : 'meses'}`
  } else if (absDias === 0) {
    textoAmigavel = 'vence hoje'
  } else {
    textoAmigavel = `vence em ${absDias} ${absDias === 1 ? 'dia' : 'dias'}`
  }

  if (diffDias > 90) {
    return {
      diasRestantes: diffDias,
      categoria: 'regular',
      textoAmigavel,
      labelStatus: 'REGULAR',
      corBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      corBorda: 'border-emerald-300',
      corTexto: 'text-emerald-700',
      corSemaforo: '#10B981',
    }
  }

  if (diffDias >= 30) {
    return {
      diasRestantes: diffDias,
      categoria: 'vencendo',
      textoAmigavel,
      labelStatus: 'VENCENDO',
      corBadge: 'bg-amber-50 text-amber-700 border-amber-200',
      corBorda: 'border-amber-300',
      corTexto: 'text-amber-700',
      corSemaforo: '#F59E0B',
    }
  }

  return {
    diasRestantes: diffDias,
    categoria: 'urgente',
    textoAmigavel,
    labelStatus: 'VENCENDO',
    corBadge: 'bg-orange-50 text-orange-800 border-orange-200',
    corBorda: 'border-orange-300',
    corTexto: 'text-orange-800',
    corSemaforo: '#F97316',
  }
}

/**
 * Taxonomia única de status por tipo de documento
 */
export type StatusUnificado =
  | 'regular'
  | 'vencendo'
  | 'vencido'
  | 'ativo'
  | 'encerrado'
  | 'suspenso'
  | 'rascunho'
  | 'publicada'
  | 'em_andamento'

export interface StatusInfo {
  label: string
  tipo: 'sucesso' | 'alerta' | 'perigo' | 'neutro'
  badgeClass: string
  icone: React.ReactNode
}

export function obterStatusInfo(statusBruto: string | undefined, tipoAba: string): StatusInfo {
  const norm = String(statusBruto || '')
    .toLowerCase()
    .trim()

  // Alvarás: Regular | Vencendo | Vencido
  if (tipoAba === 'alvaras') {
    if (norm === 'vencido' || norm === 'expirado') {
      return {
        label: 'VENCIDO',
        tipo: 'perigo',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        icone: <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />,
      }
    }
    if (norm === 'vencendo' || norm === 'alerta' || norm === 'em_renovacao') {
      return {
        label: 'VENCENDO',
        tipo: 'alerta',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        icone: <Clock className="h-3 w-3 text-amber-600 shrink-0" />,
      }
    }
    return {
      label: 'REGULAR',
      tipo: 'sucesso',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icone: <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />,
    }
  }

  // Contratos / Locações: Ativo | Encerrado | Suspenso
  if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
    if (norm === 'encerrado' || norm === 'rescindido' || norm === 'finalizado') {
      return {
        label: 'Encerrado',
        tipo: 'neutro',
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
        icone: <AlertCircle className="h-3 w-3 text-gray-500 shrink-0" />,
      }
    }
    if (norm === 'suspenso' || norm === 'em_analise') {
      return {
        label: 'Suspenso',
        tipo: 'alerta',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        icone: <Clock className="h-3 w-3 text-amber-600 shrink-0" />,
      }
    }
    return {
      label: 'Ativo',
      tipo: 'sucesso',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icone: <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />,
    }
  }

  // Atas: Rascunho | Publicada
  if (tipoAba === 'atas') {
    if (norm === 'rascunho' || norm === 'em_edicao') {
      return {
        label: 'Rascunho',
        tipo: 'alerta',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        icone: <Clock className="h-3 w-3 text-amber-600 shrink-0" />,
      }
    }
    return {
      label: 'Publicada',
      tipo: 'sucesso',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icone: <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />,
    }
  }

  // Jurídicos: Em andamento | Suspenso | Encerrado
  if (norm === 'encerrado' || norm === 'arquivado' || norm === 'julgado') {
    return {
      label: 'Encerrado',
      tipo: 'neutro',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      icone: <AlertCircle className="h-3 w-3 text-gray-500 shrink-0" />,
    }
  }
  if (norm === 'suspenso' || norm === 'sobrestado') {
    return {
      label: 'Suspenso',
      tipo: 'alerta',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      icone: <Clock className="h-3 w-3 text-amber-600 shrink-0" />,
    }
  }
  return {
    label: 'Em andamento',
    tipo: 'sucesso',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icone: <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />,
  }
}
