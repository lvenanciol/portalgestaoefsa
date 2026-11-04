// pocketbase/migrations/0043_contratos_locacao_campos_completos.js
// Campos completos para Contratos de Locação (referência Contrato de Locação Comercial - Petrolina):
// - valor_assinatura (número - 1º aluguel + cauções pagos na assinatura)
// - qtd_caucoes (número - quantidade de cauções)
// - valor_caucao (número - montante de cauções)
// - prazo_meses (número - ex: 36 meses)
// - periodicidade_reajuste (texto - ex: "Anual")
// - multa_rescisao (texto - ex: "02 (dois) meses do aluguel em vigor proporcional")
// - multa_infracao (texto - ex: "01 (um) mês do aluguel em vigor")
// - foro (texto - ex: "Comarca de Petrolina/PE")
// - representantes_locador (texto - nomes, CPF/RG, contato do locador)
// - representantes_locatario (texto - nomes, CPF/RG, contato do locatário)
// - tipo_imovel (texto - ex: "Galpão comercial")
// - endereco_imovel (texto - ex: "Rua Antônio Macedo Filho, 320, Distrito Industrial, Petrolina/PE")
// - clausulas_especiais (texto - ex: sistema de energia solar com faturamento e medição separados)
// - dados_bancarios_locador (texto - banco, agência, conta, chave PIX)

migrate(
  (app) => {
    const contratos = app.findCollectionByNameOrId('contratos')

    const novosCampos = [
      { name: 'valor_assinatura', type: 'number' },
      { name: 'qtd_caucoes', type: 'number' },
      { name: 'valor_caucao', type: 'number' },
      { name: 'prazo_meses', type: 'number' },
      { name: 'periodicidade_reajuste', type: 'text', max: 100 },
      { name: 'multa_rescisao', type: 'text', max: 500 },
      { name: 'multa_infracao', type: 'text', max: 500 },
      { name: 'foro', type: 'text', max: 200 },
      { name: 'representantes_locador', type: 'text', max: 2000 },
      { name: 'representantes_locatario', type: 'text', max: 2000 },
      { name: 'tipo_imovel', type: 'text', max: 150 },
      { name: 'endereco_imovel', type: 'text', max: 500 },
      { name: 'clausulas_especiais', type: 'text', max: 5000 },
      { name: 'dados_bancarios_locador', type: 'text', max: 1000 },
    ]

    for (const f of novosCampos) {
      if (!contratos.fields.getByName(f.name)) {
        if (f.type === 'number') {
          contratos.fields.add(new NumberField({ name: f.name }))
        } else {
          contratos.fields.add(new TextField({ name: f.name, max: f.max || 1000 }))
        }
      }
    }

    // Campos extras também para processos_juridicos caso a planilha tenha colunas ricas
    const juridicos = app.findCollectionByNameOrId('processos_juridicos')
    const novosJuridicos = [
      { name: 'polo', type: 'text', max: 50 }, // Polo ativo, Polo passivo, Interessado
      { name: 'valor_atualizado', type: 'number' }, // Valor envolvido atualizado
      { name: 'probabilidade', type: 'text', max: 100 }, // ex: "Possível - Perda", "Provável - Perda"
      { name: 'orgao_tribunal', type: 'text', max: 200 }, // Órgão (tribunal)
    ]

    for (const f of novosJuridicos) {
      if (!juridicos.fields.getByName(f.name)) {
        if (f.type === 'number') {
          juridicos.fields.add(new NumberField({ name: f.name }))
        } else {
          juridicos.fields.add(new TextField({ name: f.name, max: f.max || 200 }))
        }
      }
    }

    app.save(contratos)
    app.save(juridicos)
  },
  (app) => {
    // Rollback não estrito necessário em desenvolvimento
  },
)
