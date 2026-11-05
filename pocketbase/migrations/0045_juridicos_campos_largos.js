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
// Correção do bug de deploy desta rodada: a versão anterior usava
// `col.fields.indexOf(...)`, método que NÃO existe em FieldsList no JSVM
// (ReferenceError na linha 20, derrubando o apply inteiro). A API correta é
// `col.fields.add(...)`, que já substitui o campo existente pelo mesmo nome, e
// para TextField existente basta atribuir `.max` no ponteiro retornado por
// getByName (modificação direta, preserva id/ordem).
//
// Ajuste: observacoes vira EditorField (long-form, 2 MB), campos de
// partes/advogado sobem para 2000 e demais textos para 400–600.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('processos_juridicos')

    // 1. 'observacoes' -> EditorField com margem ampla (2 MB).
    //    O PocketBase não permite trocar o tipo de um campo existente
    //    ("Field type cannot be changed"), então preservamos o conteúdo atual
    //    em memória, removemos o campo de texto e recriamos como EditorField,
    //    gravando de volta os valores preservados.
    const obsSalvas = []
    try {
      const registros = app.findRecordsByFilter(
        'processos_juridicos',
        "observacoes != ''",
        '-created',
        0,
        0,
      )
      for (const r of registros) {
        const valor = r.getString('observacoes')
        if (valor) {
          obsSalvas.push({ id: r.id, valor: valor })
        }
      }
    } catch (e) {
      console.log('0045: leitura de observacoes existentes falhou: ' + e)
    }
    col.fields.removeByName('observacoes')
    col.fields.add(new EditorField({ name: 'observacoes', maxSize: 2000000 }))

    // 2. Campos de partes que hoje acumulam vários dados concatenados
    const partes = [
      'autor',
      'reu',
      'contrario_principal',
      'cliente_principal',
      'responsavel_principal',
    ]
    for (const nome of partes) {
      const f = col.fields.getByName(nome)
      if (f && f.type === 'text') {
        f.max = 2000
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
      { name: 'fase_instancia', max: 400 },
      { name: 'tipo', max: 400 },
    ]
    for (const c of textos) {
      const f = col.fields.getByName(c.name)
      if (f && f.type === 'text') {
        f.max = c.max
      }
    }

    app.save(col)

    // Restaura as observações preservadas (agora sem limite prático de tamanho)
    for (const item of obsSalvas) {
      try {
        const rec = app.findRecordById('processos_juridicos', item.id)
        rec.set('observacoes', item.valor)
        app.save(rec)
      } catch (e) {
        console.log('0045: restauracao de observacoes falhou para ' + item.id + ': ' + e)
      }
    }
  },
  (app) => {
    // Reverso: volta aos limites originais (melhor esforço; add() substitui
    // o campo existente pelo mesmo nome).
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
      if (c.type === 'editor') {
        col.fields.add(new EditorField({ name: c.name, maxSize: c.maxSize }))
      } else {
        const f = col.fields.getByName(c.name)
        if (f && f.type === 'text') {
          f.max = c.max
        }
      }
    }
    app.save(col)
  },
)
