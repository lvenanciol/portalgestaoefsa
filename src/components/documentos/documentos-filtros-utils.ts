// Função auxiliar para normalizar texto removendo acentos e pontuação dos dois lados da busca
// Exemplo: "João Paulo" -> "joao paulo", "Nº 22.433.675-4" -> "no 224336754"
export function normalizarParaBusca(texto: any): string {
  if (texto === null || texto === undefined) return ''
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos/acentos
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // substitui pontuações por espaço
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Remove pontuação de processos/documentos (pontos, traços, barras) para
 * permitir busca direta por dígitos contíguos (ex: "0000267" encontra "0000267-89.2023.5.17.0001")
 */
export function normalizarDigitosParaBusca(texto: any): string {
  if (!texto) return ''
  return String(texto).replace(/\D+/g, '')
}

// Extrai somente a categoria de natureza, limpando clientes ou rótulos concatenados
export function extrairCategoriaNatureza(naturezaCrua: any): string {
  if (!naturezaCrua) return 'Trabalhista'
  let str = String(naturezaCrua).trim()
  if (!str) return 'Trabalhista'

  // Remove ruídos concatenados caso venham de bases legadas
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

  return str || 'Trabalhista'
}

// Normaliza texto de probabilidade para agrupamento e exibição amigável
export function normalizarProbabilidade(probCrua: any): string {
  if (!probCrua) return 'Perda Possível'
  const str = String(probCrua).trim()
  if (!str) return 'Perda Possível'
  const lower = str.toLowerCase()

  if (lower.includes('provável') || lower.includes('provavel')) {
    return lower.includes('êxito') || lower.includes('exito') ? 'Êxito Provável' : 'Perda Provável'
  }
  if (lower.includes('possível') || lower.includes('possivel')) {
    return lower.includes('êxito') || lower.includes('exito') ? 'Êxito Possível' : 'Perda Possível'
  }
  if (lower.includes('remot')) {
    return lower.includes('êxito') || lower.includes('exito') ? 'Êxito Remoto' : 'Perda Remota'
  }

  return str
}
