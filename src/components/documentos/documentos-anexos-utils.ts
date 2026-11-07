/**
 * Utilitário centralizado para normalização e extração de anexos no módulo Documentos.
 *
 * O PocketBase armazena arquivos em coleções com FileField. Ao longo de migrações e versões,
 * o campo 'anexo' pode retornar formatos mistos:
 * 1) Array real de strings: ['arquivo1.pdf', 'arquivo2.png']
 * 2) String serializada em JSON: '["arquivo1.pdf", "arquivo2.png"]'
 * 3) String simples de nome de arquivo: 'documento_123.pdf'
 * 4) Falsy (null, undefined, '', '[]', 'null')
 *
 * Este extrator garante retorno SEMPRE normalizado como string[], sem valores vazios ou duplicados.
 */

export const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
export const E_ANEXO_PDF = /\.pdf$/i

export function podeVisualizarAnexo(nome: string | null | undefined): boolean {
  if (!nome || typeof nome !== 'string') return false
  return /\.(pdf|png|jpe?g|webp|gif|bmp|svg)$/i.test(nome.trim())
}

export function ehImagemAnexo(nome: string | null | undefined): boolean {
  if (!nome || typeof nome !== 'string') return false
  return E_ANEXO_IMAGEM.test(nome.trim())
}

export function extrairAnexos(val: any): string[] {
  if (!val) return []

  // Caso 1: Array nativo
  if (Array.isArray(val)) {
    const res: string[] = []
    for (const item of val) {
      if (typeof item === 'string') {
        const itemLimpo = item.trim()
        if (itemLimpo && !res.includes(itemLimpo)) res.push(itemLimpo)
      } else if (item && typeof item === 'object') {
        // Objeto com campo filename / file / name
        const nome = String(item.file || item.filename || item.name || '').trim()
        if (nome && !res.includes(nome)) res.push(nome)
      }
    }
    return res
  }

  // Caso 2: String
  if (typeof val === 'string') {
    const limpo = val.trim()
    if (!limpo || limpo === '[]' || limpo === '{}' || limpo === 'null' || limpo === 'undefined') {
      return []
    }

    // Tentar JSON.parse caso seja array serializado como '["a.pdf", "b.png"]'
    if (limpo.startsWith('[') || limpo.startsWith('{')) {
      try {
        const parsed = JSON.parse(limpo)
        if (Array.isArray(parsed)) {
          return extrairAnexos(parsed)
        }
        if (parsed && typeof parsed === 'object') {
          return extrairAnexos(Object.values(parsed))
        }
      } catch {
        // Não é JSON válido, continua como string comum
      }
    }

    // Caso contenha vírgulas ou ponto-e-vírgula separando nomes de arquivos
    if (limpo.includes(',') && !limpo.includes(' ')) {
      const partes = limpo
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      if (partes.length > 1) {
        return partes
      }
    }

    return [limpo]
  }

  // Caso 3: Objeto genérico
  if (typeof val === 'object') {
    return extrairAnexos(Object.values(val))
  }

  return []
}

/**
 * Conta os anexos agrupando por total, PDFs e imagens.
 */
export function contarAnexos(val: any): { total: number; pdfs: number; imagens: number } {
  const lista = extrairAnexos(val)
  let pdfs = 0
  let imagens = 0

  for (const arq of lista) {
    if (E_ANEXO_PDF.test(arq)) pdfs++
    else if (E_ANEXO_IMAGEM.test(arq)) imagens++
  }

  return {
    total: lista.length,
    pdfs,
    imagens,
  }
}
