// Verificação 19/10 — prompt 8 da biblioteca IA: honesto sobre limites da
// plataforma (conversão server-side de documentos; imagens puras/OCR não
// suportados — SKP-685).

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('ia_prompts', 'chave = "analise_imagem"')
      rec.set('titulo', 'Análise de documento (PDF/DOCX/XLSX server-side)')
      rec.set(
        'instrucoes',
        'Descreva e analise o documento enviado (PDF, DOCX, XLSX ou CSV): leitura dos números e tabelas, inconsistências e leitura executiva. Nota: a plataforma converte o documento para texto server-side ($documents.toMarkdown); imagens puras (screenshots) e PDFs escaneados sem camada de texto não são suportados (sem OCR).',
      )
      app.save(rec)
    } catch (_) {}
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('ia_prompts', 'chave = "analise_imagem"')
      rec.set('titulo', 'Análise de imagem/tela (multimodal)')
      rec.set(
        'instrucoes',
        'Descreva e analise a imagem/tela enviada (screenshot de dashboard ou relatório): leitura dos números visíveis, inconsistências e leitura executiva.',
      )
      app.save(rec)
    } catch (_) {}
  },
)
