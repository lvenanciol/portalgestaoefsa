// pocketbase/migrations/0042_seed_documentos_dados.js
// Backfill de dados reais / plausíveis para as coleções de Documentos:
// - alvaras (ALV-2026/0891)
// - atas (Ata de AGE - Casafruti Conde de Bonfim)
// - contratos (Contrato Petrolina - Revisado assinado)
// - processos_juridicos (Processo 0012845-67.2025.8.08.0001)
// - atualiza menu Documentos

migrate(
  (app) => {
    const now = new DateTime().string()

    // 1. Seed em alvaras
    try {
      const colAlv = app.findCollectionByNameOrId('alvaras')
      const recAlv = new Record(colAlv)
      recAlv.set('numero', 'ALV-2026/0891')
      recAlv.set('tipo', 'Alvará de Localização e Funcionamento')
      recAlv.set('orgao_emissor', 'Secretaria Municipal da Fazenda')
      recAlv.set('municipio', 'Viana - ES')
      recAlv.set('empresa', 'Extrafruti')
      recAlv.set('validade', '2027-12-31 00:00:00.000Z')
      recAlv.set('status', 'regular')
      recAlv.set(
        'observacoes',
        'Centro de distribuição matriz - renovação aprovada sem pendências.',
      )
      app.save(recAlv)
    } catch (err) {
      // ignore se ja existir
    }

    // 2. Seed em atas
    try {
      const colAta = app.findCollectionByNameOrId('atas')
      const recAta = new Record(colAta)
      recAta.set('titulo', 'Ata de AGE - Casafruti Conde de Bonfim')
      recAta.set('tipo_ata', 'AGE')
      recAta.set('data', '2026-09-15 14:00:00.000Z')
      recAta.set('empresa', 'Casafruti')
      recAta.set('participantes', 'Acionistas majoritários e membros do conselho')
      recAta.set('mesa_diretora', 'Presidente: Diretor Geral; Secretário: Coordenador Jurídico')
      recAta.set(
        'pauta',
        'Aprovação de abertura de filial Conde de Bonfim, investimento em instalações e alteração de capital social.',
      )
      recAta.set(
        'deliberacoes',
        'Aprovada por unanimidade a implantação da nova unidade com aporte orçamentário e consolidação estatutária.',
      )
      recAta.set(
        'assinatura_eletronica',
        'Assinatura digital padrão ICP-Brasil / DocuSign coletada de todos os presentes.',
      )
      recAta.set(
        'resumo',
        'AGE deliberando e autorizando a nova unidade Casafruti Conde de Bonfim.',
      )
      recAta.set(
        'decisoes',
        '1. Abertura autorizada. 2. Adequação orçamentária vinculada ao projeto de expansão.',
      )
      app.save(recAta)
    } catch (err) {
      // ignore
    }

    // 3. Seed em contratos
    try {
      const colCont = app.findCollectionByNameOrId('contratos')
      const recCont = new Record(colCont)
      recCont.set('titulo', 'Contrato Petrolina - Revisado assinado')
      recCont.set('parte', 'Locadora Petrolina Empreendimentos Imobiliários Ltda')
      recCont.set('tipo', 'locacao')
      recCont.set('empresa', 'Extrafruti')
      recCont.set('valor_mensal', 42500)
      recCont.set('inicio', '2026-08-01 00:00:00.000Z')
      recCont.set('fim', '2031-07-31 00:00:00.000Z')
      recCont.set('status', 'ativo')
      recCont.set(
        'objeto',
        'Locação de galpão frigorificado e pátio de triagem para distribuição regional em Petrolina/PE.',
      )
      recCont.set('indexador', 'IGP-M (reajuste anual)')
      recCont.set('forma_pagamento', 'Boleto bancário até o dia 10 de cada mês')
      recCont.set('garantia', 'Carta de fiança bancária no valor de 3 aluguéis vigentes')
      recCont.set('vistoria', 'Laudo de vistoria inicial assinado e anexo ao instrumento')
      recCont.set('multa_pct', 10)
      recCont.set('rescisao', 'Aviso prévio de 90 dias com multa proporcional ao prazo residual')
      recCont.set(
        'observacao',
        'Contrato de locação comercial estratégica para expansão da cadeia de suprimentos.',
      )
      app.save(recCont)
    } catch (err) {
      // ignore
    }

    // 4. Seed em processos_juridicos
    try {
      const colJur = app.findCollectionByNameOrId('processos_juridicos')
      const recJur = new Record(colJur)
      recJur.set('numero_processo', '0012845-67.2025.8.08.0001')
      recJur.set('vara_comarca', '3ª Vara Cível de Vitória / ES')
      recJur.set('autor', 'Logística Expressa Transportes Ltda')
      recJur.set('reu', 'Extrafruti Distribuidora de Hortifruti Ltda')
      recJur.set('empresa', 'Extrafruti')
      recJur.set('fase_instancia', 'Fase Instrutória / 1ª Instância')
      recJur.set('assunto_tipo', 'Cobrança de frete extraordinário / Contratual')
      recJur.set('valor_causa', 145000)
      recJur.set('data_distribuicao', '2025-11-10 00:00:00.000Z')
      recJur.set('advogado', 'Dra. Camila Bittencourt (OAB/ES 18.234)')
      recJur.set('status', 'ativo')
      recJur.set('risco', 'possivel')
      recJur.set('proxima_audiencia', '2026-12-04 14:30:00.000Z')
      recJur.set(
        'observacoes',
        'Contestação apresentada demonstrando que a entrega ocorreu fora dos padrões de temperatura contratados.',
      )
      app.save(recJur)
    } catch (err) {
      // ignore
    }

    // 5. Renomear menu
    try {
      app
        .db()
        .newQuery("UPDATE menus SET titulo = 'Documentos' WHERE rota = '/documentos'")
        .execute()
    } catch (_) {}
  },
  (app) => {},
)
