/**
 * Utilitário central de moeda BRL para as telas de Documentos.
 * Padrão: R$ 15.988,77 (Intl 'pt-BR', estilo currency BRL, sempre 2 casas).
 *
 * Parse tolerante para valores vindos do PocketBase em formatos mistos:
 * number | string numérica ("15988.77", "15988,77", "1.015.023,5",
 * "R$ 15.988,77") | string já formatada.
 * String não numérica é exibida como está (formatarValorBRL).
 * Valor ausente/inválido => '' (as telas já tratam vazio/traço).
 */

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function parseNumeroMoeda(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val === 'boolean') return null

  let s = String(val).trim()
  if (!s) return null
  s = s.replace(/r\$|R\$/g, '').replace(/[\s\u00A0]/g, '')
  if (!s) return null

  const temPonto = s.includes('.')
  const temVirgula = s.includes(',')

  if (temPonto && temVirgula) {
    // O separador que aparece por último é o decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (temVirgula) {
    // Vírgula como decimal (ex.: "15988,77" ou "1.015.023,5")
    s = s.replace(/\./g, '').replace(/,/g, '.')
  } else if (temPonto) {
    const partes = s.split('.')
    // Ponto como milhar (ex.: "15.988" ou "1.015.023") x decimal ("15988.77")
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
      s = s.replace(/\./g, '')
    }
  }

  const num = Number(s)
  return Number.isFinite(num) ? num : null
}

/** Formata somente valores numéricos; vazio/inválido/0 => '' (nunca "R$ 0,00" nem "R$ NaN"). */
export function formatarMoedaBRL(val: unknown): string {
  const num = parseNumeroMoeda(val)
  if (num === null || num === 0) return ''
  return fmtBRL.format(num)
}

/** Como formatarMoedaBRL, mas string não numérica é exibida como está. */
export function formatarValorBRL(val: unknown): string {
  if (val === undefined || val === null || val === '') return ''
  const num = parseNumeroMoeda(val)
  if (num === null) return String(val)
  return fmtBRL.format(num)
}

/** Formata com traço quando vazio (para locais que já usavam '—'). */
export function formatarMoedaOuTraco(val: unknown): string {
  return formatarMoedaBRL(val) || '—'
}

/** Alias curto exigido pelo plano de padronização BRL. */
export const formatarBRL = formatarMoedaBRL

/** Parse tolerante para inputs: "R$ 1.234,56", "1.234,56", "1234.56". */
export const parseNumeroBR = parseNumeroMoeda
