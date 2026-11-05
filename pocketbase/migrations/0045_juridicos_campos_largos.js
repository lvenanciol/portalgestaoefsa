// v0045 (05/11/2026): amplia campos de texto da coleção 'processos_juridicos' para
// eliminar o erro "Failed to update record." na importação de relatórios em PDF.
//
// Causa do erro dos screenshots: a importação grava a cronologia completa em
// 'observacoes', 'autor', 'reu', 'contrario_principal', 'cliente_principal' e
// 'responsavel_principal', mas esses campos foram criados com max entre 120 e
// 3000 caracteres (migração 0041/0044). O relatório da área trabalhista traz
// cronologias com milhares de caracteres por processo; qualquer update com texto
// acima do max era rejeitado pelo PocketBase (validation "length cannot be more
// than N"), e o registro aparecia na lista de "Falhas" do lote.
//
// Ajuste: observa-oes vira EditorField (long-form, sem limite prático),
// campos de partes/advogado sobem para 2000 e demais textos para 1000+.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('processos_juridicos')

    // 1. 'observacoes' -> EditorField com margem ampla (2 MB)
    if (col.fields.getByName('observacoes')) {
      const idx = col.fields.indexOf(col.fields.getByName('observacoes'))
      col.fields.remove(idx)
      col.fields.add(new EditorField({ name: 'observacoes', maxSize: 2000000 }))
    }

    // 2. Campos de partes que hoje acumulam vários dados concatenados
    const partes = [
      'autor',
      'reu',
      'contrario_principal',
      'cliente_principal',
      'responsavel_principal',
    ]
    for (const nome of partes) {
      if (col.fields.getByName(nome)) {
        const idx = col.fields.indexOf(col.fields.getByName(nome))
        col.fields.remove(idx)
        col.fields.add(new TextField({ name: nome, max: 2000 }))
      }
    }

    // 3. Campos de texto do processo, com margem para relatórios longos
    const textos = [
      { name: 'vara_comarca', max: 500 },
      { name: 'assunto_tipo', max: 500 },
      { name: 'titulo', max: 600 },
      { name: 'orgao', max: 500 },
      { name: 'orgao_tribunal', max: 500 },
      { name: 'acao', max: 400 },
      { name: 'numero_processo', max: 200 },
      { name: 'numero_cnj', max: 150 },
      { name: 'numeros_alternativos', max: 600 },
      { name: 'advogado', max: 400 },
      { name: 'natureza', max: 200 },
      { name: 'empresa', max: 200 },
      { name: 'polo', max: 150 },
      { name: 'probabilidade', max: 150 },
    ]
    for (const c of textos) {
      if (col.fields.getByName(c.name)) {
        const idx = col.fields.indexOf(col.fields.getByName(c.name))
        col.fields.remove(idx)
        col.fields.add(new TextField({ name: c.name, max: c.max }))
      }
    }

    app.save(col)
  },
  (app) => {
    // Reverso: volta aos limites originais (melhor esforço; dados maiores são truncados pelo PB)
    const col = app.findCollectionByNameOrId('processos_juridicos')
    const revert = [
      { name: 'observacoes', type: 'editor', maxSize: 500000 },
      { name: 'autor', max: 200 },
      { name: 'reu', max: 200 },
      { name: 'contrario_principal', max: 200 },
      { name: 'cliente_principal', max: 200 },
      { name: 'responsavel_principal', max: 200 },
      { name: 'vara_comarca', max: 200 },
      { name: 'assunto_tipo', max: 200 },
      { name: 'titulo', max: 300 },
      { name: 'orgao', max: 250 },
      { name: 'orgao_tribunal', max: 250 },
      { name: 'acao', max: 150 },
      { name: 'numero_processo', max: 120 },
      { name: 'numero_cnj', max: 100 },
      { name: 'numeros_alternativos', max: 300 },
      { name: 'advogado', max: 150 },
      { name: 'natureza', max: 100 },
      { name: 'empresa', max: 100 },
      { name: 'polo', max: 150 },
      { name: 'probabilidade', max: 150 },
    ]
    for (const c of revert) {
      try {
        const f = col.fields.getByName(c.name)
        const idx = col.fields.indexOf(f)
        col.fields.remove(idx)
        if (c.type === 'editor') {
          col.fields.add(new EditorField({ name: c.name, maxSize: c.maxSize }))
        } else {
          col.fields.add(new TextField({ name: c.name, max: c.max }))
        }
      } catch (_) {}
    }
    app.save(col)
  },
)
