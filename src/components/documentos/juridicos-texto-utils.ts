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
  // 4. Rodapé isolado: "Pagina 50 de 71", "Pagina 59 de", "Pagina 15"
  t = t.replace(/P[aá]gina\s*\d+(?:\s*de\s*\d*)?/gi, '')
  return t
}

/**
 * Detecta texto ou fragmento de entrada que é resíduo de rodapé de página
 * (ex.: "01/11/2026 00:44Pagina 50 de 71", "01/11/2026 00:44Pagina", "Pagina 59 de").
 * Usado pela timeline para ignorar entradas espúrias com 100% de precisão.
 */
export function ehRodapePagina(texto: string): boolean {
  if (!texto) return false
  const t = texto.trim().slice(0, 180)
  return (
    /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*\d{1,2}:\d{2}\s*P[aá]gina/i.test(t) ||
    /\d{1,2}:\d{2}\s*P[aá]gina/i.test(t) ||
    /P[aá]gina\s*\d+\s*de\s*\d*/i.test(t) ||
    /^[\sR$0.,]*\d{0,2}\s*P[aá]gina\s*\d*(?:\s*de\s*\d*)?$/i.test(t)
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
