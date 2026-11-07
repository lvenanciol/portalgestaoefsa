// pocketbase/migrations/0054_atas_juridicos_campos_mockups.js
// Campos estruturados para atender os requisitos dos mockups de Atas e Jurídicos:
// ATAS:
// - status ('rascunho' | 'publicada' | 'encerrado')
// - pauta_itens (json: [{ id, numero, titulo, descricao, anos: [{ ano, valor, unidade }], variacao, variacao_label }])
// - deliberacoes_itens (json: [{ id, texto, responsavel, prazo, aprovado_por, data }])
// - assinaturas (json: [{ id, nome, cargo, iniciais, status: 'assinada' | 'pendente', data }])
// - pendencias (json: [{ id, titulo, tipo, link_acao }])
// - historico_versoes / erratas (json)
//
// PROCESSOS_JURIDICOS:
// - valor_provisao (number)
// - percentual_provisao (number)
// - valor_pago (number)
// - proximo_prazo_data (date)
// - proximo_prazo_descricao (text)
// - responsaveis_lista (json: [{ nome, papel, tipo: 'interno' | 'externo', iniciais }])
// - pendencias_alertas (json: [{ id, titulo, gravidade: 'perigo' | 'alerta', texto_acao, acao_tipo }])
// - andamentos_futuros (json: [{ id, data_texto, titulo, descricao, eh_proximo, eh_futuro }])
// - parecer_juridico_data (date)
// - parecer_juridico_status (text)

migrate(
  (app) => {
    // 1. Coleção atas
    const atas = app.findCollectionByNameOrId('atas')

    const novosCamposAtas = [
      { name: 'status', type: 'text', max: 50 },
      { name: 'pauta_itens', type: 'json' },
      { name: 'deliberacoes_itens', type: 'json' },
      { name: 'assinaturas', type: 'json' },
      { name: 'pendencias', type: 'json' },
      { name: 'erratas', type: 'json' },
      { name: 'publicada_em', type: 'date' },
      { name: 'publicada_por', type: 'text', max: 150 },
    ]

    for (const f of novosCamposAtas) {
      if (!atas.fields.getByName(f.name)) {
        if (f.type === 'json') {
          atas.fields.add(new JSONField({ name: f.name }))
        } else if (f.type === 'date') {
          atas.fields.add(new DateField({ name: f.name }))
        } else if (f.type === 'number') {
          atas.fields.add(new NumberField({ name: f.name }))
        } else {
          atas.fields.add(new TextField({ name: f.name, max: f.max || 250 }))
        }
      }
    }
    app.save(atas)

    // 2. Coleção processos_juridicos
    const jur = app.findCollectionByNameOrId('processos_juridicos')

    const novosCamposJur = [
      { name: 'valor_provisao', type: 'number' },
      { name: 'percentual_provisao', type: 'number' },
      { name: 'valor_pago', type: 'number' },
      { name: 'proximo_prazo_data', type: 'date' },
      { name: 'proximo_prazo_descricao', type: 'text', max: 250 },
      { name: 'responsaveis_lista', type: 'json' },
      { name: 'pendencias_alertas', type: 'json' },
      { name: 'andamentos_futuros', type: 'json' },
      { name: 'parecer_juridico_data', type: 'date' },
      { name: 'parecer_juridico_status', type: 'text', max: 50 },
    ]

    for (const f of novosCamposJur) {
      if (!jur.fields.getByName(f.name)) {
        if (f.type === 'json') {
          jur.fields.add(new JSONField({ name: f.name }))
        } else if (f.type === 'date') {
          jur.fields.add(new DateField({ name: f.name }))
        } else if (f.type === 'number') {
          jur.fields.add(new NumberField({ name: f.name }))
        } else {
          jur.fields.add(new TextField({ name: f.name, max: f.max || 250 }))
        }
      }
    }
    app.save(jur)

    // 3. Atualização fiel dos registros do mockup
    try {
      // ATA: ORÇAMENTO VENDAS EXTRABOM 2027
      const ataExtrabom = app.findFirstRecordByFilter(
        'atas',
        'id = "prxptg4otgbemej" || titulo ~ "EXTRABOM"',
      )
      if (ataExtrabom) {
        ataExtrabom.set('titulo', 'ORÇAMENTO VENDAS EXTRABOM 2027')
        ataExtrabom.set('tipo_ata', 'AGE')
        ataExtrabom.set('status', 'rascunho')
        ataExtrabom.set('data', '2026-11-04 00:00:00.000Z')
        // No mockup: Empresa está "Não vinculada" (pendência) e Mesa diretora "Não informada" (pendência)
        ataExtrabom.set('empresa', '')
        ataExtrabom.set('mesa_diretora', '')
        ataExtrabom.set('resumo', 'Assembleia Geral Extraordinária · 04/11/2026')
        ataExtrabom.set(
          'pauta',
          'a) SSS 2025 ( 354MM ) x 2027 (406MM ) = 5,81% 2026 (358MM ) x 2027 (375MM ) = 4,88% b) FULL 2025 (356MM ) x 2027 (406MM ) = 13,99% 2026 (373MM ) x 2027 (406MM ) = 8,81%',
        )
        ataExtrabom.set('pauta_itens', [
          {
            id: 'pauta-1',
            numero: 1,
            titulo: 'SSS — Sell-out',
            descricao:
              'Definição do orçamento de vendas para o canal de sell-out, com foco no crescimento sustentável da categoria e na ampliação da presença regional.',
            comparativo: [
              { ano: 2025, valor: '354 MM' },
              { ano: 2026, valor: '358 MM' },
              { ano: 2027, valor: '406 MM' },
            ],
            variacao: '+5,81%',
          },
          {
            id: 'pauta-2',
            numero: 2,
            titulo: 'FULL — Sell-in',
            descricao:
              'Definição do orçamento de vendas para o canal de sell-in, com foco na eficiência comercial e na expansão da distribuição.',
            comparativo: [
              { ano: 2025, valor: '356 MM' },
              { ano: 2026, valor: '373 MM' },
              { ano: 2027, valor: '406 MM' },
            ],
            variacao: '+13,99%',
          },
        ])
        // Mockup: Nenhuma deliberação registrada
        ataExtrabom.set('deliberacoes', '')
        ataExtrabom.set('deliberacoes_itens', [])
        ataExtrabom.set('assinaturas', [
          {
            id: 'ass-1',
            nome: 'Ana Jurídico',
            cargo: 'Secretária',
            iniciais: 'AJ',
            status: 'assinada',
          },
          {
            id: 'ass-2',
            nome: 'Carlos Diretor',
            cargo: 'Presidente da mesa',
            iniciais: 'CD',
            status: 'assinada',
          },
          {
            id: 'ass-3',
            nome: 'Marcos Sócio',
            cargo: 'Sócio',
            iniciais: 'MS',
            status: 'pendente',
          },
          {
            id: 'ass-4',
            nome: 'Renata Sócio',
            cargo: 'Sócia',
            iniciais: 'RS',
            status: 'pendente',
          },
        ])
        ataExtrabom.set('pendencias', [
          {
            id: 'pend-empresa',
            titulo: 'Empresa não vinculada',
            link_acao: 'Vincular',
            campo: 'empresa',
          },
          {
            id: 'pend-delib',
            titulo: 'Deliberações não registradas',
            link_acao: 'Registrar',
            campo: 'deliberacoes',
          },
        ])
        app.save(ataExtrabom)
      }

      // JURÍDICO MOCKUP:
      // Se não existir o processo com número 0001234-56.2026.5.17.0001 do mockup, criamos ou atualizamos
      let procMockup = null
      try {
        procMockup = app.findFirstRecordByFilter(
          'processos_juridicos',
          'numero_processo = "0001234-56.2026.5.17.0001" || titulo ~ "Reclamação Trabalhista — Vara do Trabalho de Vitória"',
        )
      } catch (_e) {
        procMockup = null
      }

      if (!procMockup) {
        const novoProc = new Record(jur)
        novoProc.set('numero_processo', '0001234-56.2026.5.17.0001')
        novoProc.set('numero_cnj', '0001234-56.2026.5.17.0001')
        novoProc.set('titulo', 'Reclamação Trabalhista — Vara do Trabalho de Vitória')
        novoProc.set('empresa', 'Extrafruti S/A')
        novoProc.set('autor', 'J. da Silva')
        novoProc.set('reu', 'Extrafruti S/A')
        novoProc.set('advogado', 'Ribeiro & Lima Advogados')
        novoProc.set('vara_comarca', '1ª Vara do Trabalho de Vitória/ES')
        novoProc.set('orgao', '1ª Vara do Trabalho de Vitória/ES')
        novoProc.set('orgao_tribunal', 'TRT 17ª Região - Vitória/ES')
        novoProc.set('fase_instancia', 'Instrução')
        novoProc.set('status', 'ativo')
        novoProc.set('risco', 'possivel') // Médio
        novoProc.set('probabilidade', 'Perda Possível')
        novoProc.set('tipo', 'Reclamação trabalhista')
        novoProc.set('natureza', 'Trabalhista')
        novoProc.set('assunto_tipo', 'Trabalhista')
        novoProc.set('valor_causa', 128000)
        novoProc.set('valor_base', 128000)
        novoProc.set('valor_provisao', 51200)
        novoProc.set('percentual_provisao', 40)
        novoProc.set('valor_pago', 12400)
        novoProc.set('proxima_audiencia', '2026-11-18 00:00:00.000Z')
        novoProc.set('proximo_prazo_data', '2026-11-18 00:00:00.000Z')
        novoProc.set(
          'proximo_prazo_descricao',
          'Audiência de instrução em 18/11/2026 · Prazo para juntada de documentos encerra em 11 dias.',
        )
        novoProc.set(
          'observacoes',
          '12/03/2026: Distribuição: reclamação ajuizada\n\n28/05/2026: Contestação apresentada\n\n10/09/2026: Despacho: audiência designada\n\n18/11/2026: Audiência de instrução\n\nA definir: Sentença',
        )
        novoProc.set('andamentos_futuros', [
          {
            data_texto: '18/11/2026',
            titulo: 'Audiência de instrução',
            descricao: 'Audiência de instrução e julgamento',
            eh_proximo: true,
          },
          {
            data_texto: 'A definir',
            titulo: 'Sentença',
            descricao: 'Prolação de sentença pelo juízo',
            eh_futuro: true,
          },
        ])
        novoProc.set('responsaveis_lista', [
          {
            nome: 'Dra. Renata Lima',
            papel: 'Ribeiro & Lima',
            tipo: 'externo',
            iniciais: 'RL',
          },
          {
            nome: 'Ana Jurídico',
            papel: 'Jurídico',
            tipo: 'interno',
            iniciais: 'AJ',
          },
        ])
        novoProc.set('pendencias_alertas', [
          {
            id: 'pend-doc',
            titulo: 'Documentos para audiência não anexados',
            gravidade: 'perigo',
            texto_acao: 'Anexar',
            acao_tipo: 'anexar',
          },
          {
            id: 'pend-testem',
            titulo: 'Testemunha não confirmada',
            gravidade: 'perigo',
            texto_acao: 'Confirmar',
            acao_tipo: 'confirmar',
          },
          {
            id: 'pend-parecer',
            titulo: 'Parecer jurídico vencido em 30/10/2026',
            gravidade: 'alerta',
            texto_acao: 'Solicitar novo',
            acao_tipo: 'parecer',
          },
        ])
        app.save(novoProc)
      } else {
        procMockup.set('titulo', 'Reclamação Trabalhista — Vara do Trabalho de Vitória')
        procMockup.set('empresa', 'Extrafruti S/A')
        procMockup.set('autor', 'J. da Silva')
        procMockup.set('advogado', 'Ribeiro & Lima Advogados')
        procMockup.set('vara_comarca', '1ª Vara do Trabalho de Vitória/ES')
        procMockup.set('fase_instancia', 'Instrução')
        procMockup.set('valor_causa', 128000)
        procMockup.set('valor_provisao', 51200)
        procMockup.set('percentual_provisao', 40)
        procMockup.set('valor_pago', 12400)
        procMockup.set('proxima_audiencia', '2026-11-18 00:00:00.000Z')
        procMockup.set('proximo_prazo_data', '2026-11-18 00:00:00.000Z')
        procMockup.set(
          'proximo_prazo_descricao',
          'Audiência de instrução em 18/11/2026 · Prazo para juntada de documentos encerra em 11 dias.',
        )
        procMockup.set('responsaveis_lista', [
          {
            nome: 'Dra. Renata Lima',
            papel: 'Ribeiro & Lima',
            tipo: 'externo',
            iniciais: 'RL',
          },
          {
            nome: 'Ana Jurídico',
            papel: 'Jurídico',
            tipo: 'interno',
            iniciais: 'AJ',
          },
        ])
        procMockup.set('pendencias_alertas', [
          {
            id: 'pend-doc',
            titulo: 'Documentos para audiência não anexados',
            gravidade: 'perigo',
            texto_acao: 'Anexar',
            acao_tipo: 'anexar',
          },
          {
            id: 'pend-testem',
            titulo: 'Testemunha não confirmada',
            gravidade: 'perigo',
            texto_acao: 'Confirmar',
            acao_tipo: 'confirmar',
          },
          {
            id: 'pend-parecer',
            titulo: 'Parecer jurídico vencido em 30/10/2026',
            gravidade: 'alerta',
            texto_acao: 'Solicitar novo',
            acao_tipo: 'parecer',
          },
        ])
        app.save(procMockup)
      }
    } catch (eSeed) {
      console.log('Aviso ao atualizar seed de atas/juridicos:', eSeed)
    }
  },
  (app) => {
    // Revert opcional
  },
)
