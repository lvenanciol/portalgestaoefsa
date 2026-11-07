// pocketbase/migrations/0053_contratos_locacoes_campos_mockup.js
// Campos estruturados para atender os cards e regras de Contratos e Locações:
// - logradouro, numero_imovel, complemento, bairro, municipio_uf, cep, link_mapa, area_m2, finalidade_imovel
// - seguro_exigido, vistoria_status, comprovante_deposito_status, apolice_seguro_status
// - data_base_reajuste, reajuste_aplicado, responsaveis (json)
// E atualização consistente dos dados existentes para refletir os mockups reais (Videojet e Galpão Petrolina).

migrate(
  (app) => {
    const contratos = app.findCollectionByNameOrId('contratos')

    const novosCampos = [
      { name: 'logradouro', type: 'text', max: 300 },
      { name: 'numero_imovel', type: 'text', max: 50 },
      { name: 'complemento', type: 'text', max: 150 },
      { name: 'bairro', type: 'text', max: 150 },
      { name: 'municipio_uf', type: 'text', max: 150 },
      { name: 'cep', type: 'text', max: 30 },
      { name: 'link_mapa', type: 'text', max: 500 },
      { name: 'area_m2', type: 'number' },
      { name: 'finalidade_imovel', type: 'text', max: 150 },
      { name: 'seguro_exigido', type: 'text', max: 250 },
      { name: 'comprovante_deposito_status', type: 'text', max: 50 }, // 'anexado' | 'pendente' | 'nao_exigido'
      { name: 'apolice_seguro_status', type: 'text', max: 50 }, // 'anexado' | 'pendente' | 'nao_exigido'
      { name: 'vistoria_status', type: 'text', max: 50 }, // 'registrada' | 'pendente'
      { name: 'data_base_reajuste', type: 'date' },
      { name: 'reajuste_aplicado', type: 'bool' },
      { name: 'responsaveis', type: 'json' },
    ]

    for (const f of novosCampos) {
      if (!contratos.fields.getByName(f.name)) {
        if (f.type === 'number') {
          contratos.fields.add(new NumberField({ name: f.name }))
        } else if (f.type === 'bool') {
          contratos.fields.add(new BoolField({ name: f.name }))
        } else if (f.type === 'date') {
          contratos.fields.add(new DateField({ name: f.name }))
        } else if (f.type === 'json') {
          contratos.fields.add(new JSONField({ name: f.name }))
        } else {
          contratos.fields.add(new TextField({ name: f.name, max: f.max || 300 }))
        }
      }
    }

    app.save(contratos)

    // Atualização dos registros para refletir a fidelidade aos mockups reais do usuário
    try {
      // 1. Contrato de Locação Galpão Petrolina
      const locPetrolina = app.findFirstRecordByFilter(
        'contratos',
        'id = "1521dhh8lanv1xt" || titulo ~ "Petrolina"',
      )
      if (locPetrolina) {
        locPetrolina.set('titulo', 'Contrato de Locação Galpão Petrolina')
        locPetrolina.set('tipo', 'locacao')
        locPetrolina.set('empresa', 'Extrafruti')
        locPetrolina.set('parte', 'Águia Mercantil Ltda · CNPJ 24.356.305/0001-07')
        locPetrolina.set('valor_mensal', 16000)
        locPetrolina.set('valor_caucao', 32000)
        locPetrolina.set('qtd_caucoes', 2)
        locPetrolina.set('inicio', '2026-10-31 00:00:00.000Z')
        locPetrolina.set('fim', '2029-10-31 00:00:00.000Z')
        locPetrolina.set('prazo_meses', 36)
        locPetrolina.set('status', 'ativo')
        locPetrolina.set(
          'objeto',
          'Locação comercial de imóvel tipo galpão para a empresa Extrafruti.',
        )
        locPetrolina.set('finalidade_imovel', 'Armazenagem e distribuição')
        locPetrolina.set('tipo_imovel', 'Galpão logístico')
        locPetrolina.set('area_m2', 1240)
        locPetrolina.set('logradouro', 'Rua Antônio Macedo Filho')
        locPetrolina.set('numero_imovel', '320')
        locPetrolina.set('bairro', 'Distrito Industrial')
        locPetrolina.set('municipio_uf', 'Petrolina/PE')
        locPetrolina.set('cep', '56300-000')
        locPetrolina.set('endereco_imovel', 'Rua Antônio Macedo Filho, 320 — Petrolina/PE')
        locPetrolina.set('garantia', 'Depósito caução — 2 aluguéis (pago na assinatura)')
        locPetrolina.set('rescisao', 'A negociar em 2029')
        locPetrolina.set('indexador', 'IGP-M (anual)')
        locPetrolina.set('periodicidade_reajuste', 'Anual')
        locPetrolina.set('seguro_exigido', 'Apólice exigida do locatário')
        locPetrolina.set('comprovante_deposito_status', 'anexado')
        locPetrolina.set('apolice_seguro_status', 'pendente')
        locPetrolina.set('vistoria_status', 'pendente')
        locPetrolina.set('responsaveis', [
          { nome: 'Ana Jurídico', cargo: 'Jurídico', iniciais: 'AJ' },
          { nome: 'Marcos Facilities', cargo: 'Facilities', iniciais: 'MF' },
        ])
        app.save(locPetrolina)
      }

      // 2. Contrato Videojet Brasil x Extrafruti
      const contVideojet = app.findFirstRecordByFilter(
        'contratos',
        'id = "vx1gjlp3m8272bb" || titulo ~ "Videojet"',
      )
      if (contVideojet) {
        contVideojet.set('titulo', 'Contrato Videojet Brasil x Extrafruti')
        contVideojet.set('tipo', 'servico')
        contVideojet.set('empresa', 'Extrafruti')
        contVideojet.set('parte', 'Videojet Brasil Ltda · CNPJ 24.356.305/0001-07')
        contVideojet.set('objeto', 'Prestação de serviços para a empresa Extrafruti.')
        contVideojet.set('valor_mensal', 16000)
        contVideojet.set('valor_assinatura', 192000)
        contVideojet.set('inicio', '2026-11-03 00:00:00.000Z')
        contVideojet.set('fim', '2027-11-03 00:00:00.000Z')
        contVideojet.set('status', 'ativo')
        contVideojet.set('garantia', 'Retenção técnica contratual')
        contVideojet.set('rescisao', 'Automática por 12 meses')
        contVideojet.set('multa_rescisao', '3 aluguéis')
        contVideojet.set('indexador', 'IGP-M (reajuste anual)')
        contVideojet.set('periodicidade_reajuste', 'Anual')
        contVideojet.set('responsaveis', [
          { nome: 'Ana Jurídico', cargo: 'Jurídico', iniciais: 'AJ' },
          { nome: 'Bruno Compras', cargo: 'Suprimentos', iniciais: 'BC' },
        ])
        app.save(contVideojet)
      }
    } catch (eSeed) {
      console.log('Aviso ao atualizar seed de contratos/locacoes:', eSeed)
    }
  },
  (app) => {
    // Revert opcional
  },
)
