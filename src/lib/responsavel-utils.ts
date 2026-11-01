/**
 * Utilitários para formatação e limpeza de nomes de responsáveis no Portal PGE.
 *
 * Evita sujeira de texto em avatares e labels quando nomes possuem tags de cargo
 * entre colchetes, como "[ CEO ] LÉO" ou "[ FBX ] Tiago".
 */

/**
 * Limpa prefixos/fragmentos duplicados ou corrompidos de responsável.
 * Exemplo: "[L [ CEO ] LÉO" -> "[ CEO ] LÉO"
 *          "LÉO" -> "LÉO"
 *          "[ CEO ] LÉO" -> "[ CEO ] LÉO"
 */
export function limparTextoResponsavel(nome?: string): string {
  if (!nome) return ''
  let s = String(nome).trim()

  // Se houver sujeira antes do primeiro colchete válido (ex: "[L [ CEO ] LÉO" ou "L [ CEO ]")
  // Procura padrão [ TAG ] Resto
  const matchTag = s.match(/\[\s*[^\]]+\s*\]\s*.*$/)
  if (matchTag && matchTag.index && matchTag.index > 0) {
    s = s.slice(matchTag.index)
  }

  // Remove múltiplos colchetes aninhados ou aberturas soltas no início como "[L ["
  s = s.replace(/^(\[\s*[A-Za-z0-9_]+\s*\[)/, '[')

  return s.trim()
}

/**
 * Extrai apenas o nome da pessoa, removendo a tag entre colchetes se houver.
 * Ex: "[ CEO ] LÉO" -> "LÉO"
 *     "[ FBX ] Tiago" -> "Tiago"
 *     "Pedro Mariano" -> "Pedro Mariano"
 */
export function extrairNomeSemTag(nome?: string): string {
  const limpo = limparTextoResponsavel(nome)
  if (!limpo) return ''
  const semTag = limpo.replace(/^\[[^\]]+\]\s*/, '').trim()
  return semTag || limpo
}

/**
 * Obtém 1 ou 2 letras limpas para o avatar, desconsiderando a tag de cargo entre colchetes.
 * Ex: "[ CEO ] LÉO" -> "LE" ou "L" (não "[L" ou "[C")
 *     "[ FBX ] Tiago" -> "TI" ou "T"
 *     "Pedro Mariano" -> "PM"
 */
export function obterIniciaisResponsavel(nome?: string): string {
  const nomeReal = extrairNomeSemTag(nome)
  if (!nomeReal) return '—'

  // Remove caracteres que não sejam letras/dígitos no início
  const limpo = nomeReal.replace(/^[^a-zA-Z0-9À-ÿ]+/, '').trim()
  if (!limpo) return '—'

  const partes = limpo.split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '—'
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase()
  }
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
