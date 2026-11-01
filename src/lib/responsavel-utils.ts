/**
 * Utilitários para formatação e limpeza de nomes de responsáveis no Portal PGE.
 *
 * Mantém a tag de cargo entre colchetes seguida do nome do responsável
 * (ex: "[ CEO ] LÉO", "[ SUP ] Luke", "[ FLOR ] Lídia", "[ FBX ] Tiago").
 *
 * Elimina sujeiras de caracteres soltos/colchetes duplicados antes da tag de cargo,
 * como "[L [ CEO ] LÉO" ou "L [ CEO ] LÉO" -> "[ CEO ] LÉO".
 */

/**
 * Limpa o texto do responsável eliminando sujeiras de prefixos/colchetes quebrados
 * antes da tag de cargo, preservando a tag de cargo entre colchetes e o nome.
 *
 * Exemplos:
 *  - "[L [ CEO ] LÉO" -> "[ CEO ] LÉO"
 *  - "L [ CEO ] LÉO"  -> "[ CEO ] LÉO"
 *  - "[ [ CEO ] LÉO"  -> "[ CEO ] LÉO"
 *  - "[ CEO ] LÉO"    -> "[ CEO ] LÉO"
 *  - "[ SUP ] Luke"   -> "[ SUP ] Luke"
 *  - "[ FLOR ] Lídia" -> "[ FLOR ] Lídia"
 *  - "Pedro Mariano"  -> "Pedro Mariano"
 */
export function limparTextoResponsavel(nome?: string): string {
  if (!nome) return ''
  let s = String(nome).trim()

  // Se houver uma tag de cargo válida [...] mais adiante precedida de lixo como "[L [", "L [", "[ [", etc.:
  // Ex: "[L [ CEO ] LÉO" -> "[ CEO ] LÉO"
  // Procura padrão onde há sujeira antes de um colchete que fecha uma tag
  const matchTag = s.match(/\[\s*([A-Za-z0-9_À-ÿ]{2,10})\s*\]\s*(.*)$/)
  if (matchTag) {
    const cargo = matchTag[1].trim()
    const resto = matchTag[2].trim()
    if (resto) {
      return `[ ${cargo} ] ${resto}`
    }
    return `[ ${cargo} ]`
  }

  // Se não encontrar uma tag estruturada [ CARGO ], remove fragmentos quebrados de colchetes no início
  s = s.replace(/^\[+/, '').replace(/^\]+/, '').trim()

  return s
}

/**
 * Extrai apenas o nome da pessoa, removendo a tag entre colchetes se houver.
 * Útil para calcular iniciais do avatar ou buscas por nome puro.
 * Ex: "[ CEO ] LÉO" -> "LÉO"
 *     "[ FBX ] Tiago" -> "Tiago"
 *     "Pedro Mariano" -> "Pedro Mariano"
 */
export function extrairNomeSemTag(nome?: string): string {
  if (!nome) return ''
  let s = String(nome).trim()

  // Remove sujeiras preliminares e a tag entre colchetes
  s = s.replace(/^.*?\[\s*[^\]]+\s*\]\s*/, '').trim()

  // Remove eventuais colchetes residuais
  s = s.replace(/^\[+/, '').replace(/^\]+/, '').trim()

  return s || limparTextoResponsavel(nome)
}

/**
 * Obtém 1 ou 2 letras limpas para o avatar, desconsiderando a tag de cargo entre colchetes.
 * Ex: "[ CEO ] LÉO" -> "LÉ" (ou "L") (nunca "[L" ou "[C")
 *     "[ FBX ] Tiago" -> "TI"
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
