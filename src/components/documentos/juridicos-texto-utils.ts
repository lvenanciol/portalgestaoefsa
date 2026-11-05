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
  // Rodapé completo: "01/11/2026 00:44Pagina 50 de 71" (com ou sem valor colado antes)
  t = t.replace(
    /(?:R\$\s*[\d.,]+)?\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina\s*\d+\s*de\s*\d+/gi,
    '',
  )
  // Sobras de rodapé sem a data: "00:44Pagina 50 de 71"
  t = t.replace(/\d{1,2}:\d{2}\s*P[aá]gina\s*\d+\s*de\s*\d+/gi, '')
  // Rodapé isolado: "Pagina 50 de 71"
  t = t.replace(/P[aá]gina\s*\d+\s*de\s*\d+/gi, '')
  return t
}

/**
 * Detecta texto de entrada que na verdade é resíduo de rodapé de página
 * (ex.: "01/11/2026 00:44Pagina 50 de 71"). Usado pela timeline para ignorar
 * entradas espúrias mesmo que algum rodapé escape da limpeza prévia.
 */
export function ehRodapePagina(texto: string): boolean {
  if (!texto) return false
  const t = texto.slice(0, 160)
  return (
    /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina\s*\d+\s*de\s*\d+/i.test(t) ||
    /\d{1,2}:\d{2}\s*P[aá]gina\s*\d+\s*de\s*\d+/i.test(t) ||
    /^[\sR$0.,]*\d{0,2}P[aá]gina\s*\d+\s*de\s*\d+$/i.test(t)
  )
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
