// Utilitários de limpeza de texto para a aba Jurídicos.
// Compartilhados entre o importador (JuridicosImportModal) e a exibição
// (ProcessoObservacoesTimeline / DocumentoDetalheModal).

/**
 * Remove rodapés de página colados ao texto antes da extração/parsing.
 * Ex.: "R$ 0,0001/11/2026 00:44Pagina 50 de 71" — o rodapé carrega uma data
 * que a timeline tratava como entrada datada espúria, poluindo a cronologia.
 * O prefixo monetário ("R$ 0,00") só é consumido quando seguido do rodapé
 * completo (data + horário + "Pagina N de M"), para nunca apagar valores
 * legítimos do relatório.
 */
export function removerRodapesDePagina(texto: string): string {
  if (!texto) return ''
  let t = texto
  // 1. Rodapé completo colado ao texto ou a valores monetários:
  // ex.: "R$ 0,0001/11/2026 00:44Pagina 50 de 71", "01/11/2026 00:44Pagina 15 de 71"
  // inclusive variantes com "Pagina N de" truncadas no fim da página (sem o total)
  t = t.replace(
    /(?:R\$\s*[\d.,]+)?\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina\s*\d+(?:\s*de\s*\d*)?/gi,
    '',
  )
  // 2. Fragmento de data/hora colado a "Pagina":
  t = t.replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina/gi, '')
  // 3. Sobras de horário coladas a "Pagina": "00:44Pagina 50 de 71" ou "00:44Pagina"
  t = t.replace(/\d{1,2}:\d{2}\s*P[aá]gina\s*\d*(?:\s*de\s*\d*)?/gi, '')
  // 4. Cabeçalhos repetidos de relatório em páginas seguintes: "Relatório de processos..."
  t = t.replace(/(?:^|\n)\s*Relat[oó]rio\s+de\s+processos[^\n]*(?:\n|$)/gi, '\n')
  // 5. Linhas de rodapé isoladas no padrão "Pagina N de M" em qualquer posição
  t = t.replace(/P[aá]gina\s*\d+(?:\s*de\s*\d*)?/gi, '')
  // 6. Linhas de metadados de emissão ou data de atualização como ruído
  t = t.replace(
    /(?:^|\n)\s*(?:Data\s+da\s+[uú]ltima\s+atualiza[cç][aã]o|Data\s+[uú]ltima\s+atualiza[cç][aã]o|[UuÚú]ltima\s+Atualiza[cç][aã]o)\s*[:][^\n]*(?:\n|$)/gi,
    '\n',
  )
  return t
}

/**
 * Detecta texto ou fragmento de entrada que contenha resíduo de rodapé de página ou cabeçalho repetido
 * em QUALQUER posição (ex.: "01/11/2026 00:44Pagina 50 de 71", "01/11/2026 00:44Pagina", "Pagina 59 de",
 * ou quando "Pagina N de M" aparece em qualquer lugar do texto).
 * Usado pela timeline para ignorar entradas espúrias com 100% de precisão.
 */
export function ehRodapePagina(texto: string): boolean {
  if (!texto) return false
  const t = texto.trim()
  return (
    /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina/i.test(t) ||
    /\d{1,2}:\d{2}\s*P[aá]gina/i.test(t) ||
    /P[aá]gina\s*\d+(?:\s*de\s*\d*)?/i.test(t) ||
    /Relat[oó]rio\s+de\s+processos/i.test(t) ||
    /^(?:Data\s+da\s+[uú]ltima\s+atualiza[cç][aã]o|Data\s+[uú]ltima\s+atualiza[cç][aã]o|[UuÚú]ltima\s+Atualiza[cç][aã]o)\s*[:]/i.test(
      t,
    )
  )
}

/**
 * Normaliza o valor do campo anexo do PocketBase (seja string única, array de strings ou nulo)
 * em uma lista de nomes de arquivos não vazia e sem duplicatas.
 */
export function extrairListaAnexos(anexo: any): string[] {
  if (!anexo) return []
  if (Array.isArray(anexo)) {
    return anexo.map((item) => (item ? String(item).trim() : '')).filter((nome) => Boolean(nome))
  }
  if (typeof anexo === 'string') {
    const trimmed = anexo.trim()
    if (!trimmed) return []
    // Se for string serializada em JSON ex: '["arq1.pdf","arq2.pdf"]'
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (item ? String(item).trim() : ''))
            .filter((nome) => Boolean(nome))
        }
      } catch {
        // não é json válido, trata como nome simples
      }
    }
    return [trimmed]
  }
  return []
}

/**
 * Limpa campos de partes que vieram concatenados com rótulos posteriores
 * (ex.: "JOSE CARLOS SILVA ... Responsável principal: NEIMAR ZAVARIZE" ou
 * "Trabalhista Cliente principal: EXTRAFRUTI"). Preserva o conteúdo anterior
 * ao primeiro rótulo estruturado e remove marcações de polo.
 */
export function limparPartes(val: any): string {
  if (!val) return ''
  let str = String(val).trim()
  if (!str) return ''

  // Corte no primeiro rótulo estruturado concatenado (mantém o que vem antes)
  str = str
    .split(
      /\s*(?:Cliente\s+Principal|Contr[aá]rio\s+Principal|Respons[aá]vel\s+Principal|Advogado|Natureza|Polo)\s*[:-]/i,
    )[0]
    .trim()

  // Remove marcações de polo sobrando no texto
  str = str.replace(/\(\s*Polo\s+(?:passivo|ativo|neutro)\s*\)/gi, '').trim()

  // Remove vírgulas/pontuação sobrando no fim
  return str.replace(/[\s,;–-]+$/g, '').trim()
}
