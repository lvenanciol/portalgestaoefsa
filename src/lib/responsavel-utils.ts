/**
 * Utilitários para formatação e limpeza de nomes de responsáveis no Portal PGE.
 *
 * Remove sujeiras de prefixos duplicados/corrompidos (ex: "[L [ CEO ] LÉO")
 * e remove completamente a tag de cargo entre colchetes (ex: "[ CEO ] LÉO" -> "LÉO",
 * "[ SUP ] Luke" -> "Luke", "[ FBX ] Tiago" -> "Tiago"), exibindo SOMENTE o nome
 * do responsável em todas as visões (Lista, Board, Calendário, Detalhe, Seletores).
 */

/**
 * Limpa o texto do responsável removendo fragmentos corrompidos e eliminando
 * completamente a tag de cargo entre colchetes (ex.: "[ CEO ]", "[ SUP ]").
 * Mantém exclusivamente o nome real da pessoa.
 *
 * Exemplos:
 *  - "[L [ CEO ] LÉO" -> "LÉO"
 *  - "[ CEO ] LÉO"     -> "LÉO"
 *  - "[ SUP ] Luke"    -> "Luke"
 *  - "[ FBX ] Tiago"   -> "Tiago"
 *  - "Pedro Mariano"   -> "Pedro Mariano"
 */
export function limparTextoResponsavel(nome?: string): string {
  if (!nome) return ''
  let s = String(nome).trim()

  // Remove sujeiras preliminares como "[L [" ou letras soltas antes de colchetes
  // Procura o último início de tag antes do nome ou remove prefixos quebrados
  s = s.replace(/^(\[\s*[A-Za-z0-9_À-ÿ]+\s*\[)/, '[')

  // Se houver qualquer tag entre colchetes no início (ex: "[ CEO ]", "[ SUP ]", "[ FBX ]", etc.)
  // ou sujeiras como "[L [ CEO ] LÉO" ou "L [ CEO ] LÉO"
  // Remove repetidamente tags entre colchetes e sujeiras no início até sobrar apenas o nome
  while (
    /^\[\s*[^\]]+\s*\]/.test(s) ||
    /^[A-Za-z0-9_À-ÿ]\s*\[\s*[^\]]+\s*\]/.test(s) ||
    /^\[\s*[A-Za-z0-9_À-ÿ]+\s*\[/.test(s)
  ) {
    s = s
      .replace(/^\[\s*[^\]]+\s*\]\s*/, '')
      .replace(/^[A-Za-z0-9_À-ÿ]\s*\[\s*[^\]]+\s*\]\s*/, '')
      .replace(/^\[\s*[A-Za-z0-9_À-ÿ]+\s*\[\s*/, '[')
      .trim()
  }

  // Também limpa caso haja tag solta com colchetes (ex.: qualquer [ TAG ] residual em qualquer posição inicial)
  s = s.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim()

  // Remove qualquer fragmento solto residual de colchetes se houver no início
  s = s.replace(/^\[+/, '').replace(/^\]+/, '').trim()

  return s
}

/**
 * Extrai apenas o nome da pessoa, removendo a tag entre colchetes se houver.
 * Ex: "[ CEO ] LÉO" -> "LÉO"
 *     "[ FBX ] Tiago" -> "Tiago"
 *     "Pedro Mariano" -> "Pedro Mariano"
 */
export function extrairNomeSemTag(nome?: string): string {
  return limparTextoResponsavel(nome)
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
