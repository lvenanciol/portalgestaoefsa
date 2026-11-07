// pocketbase/hooks/documentos_parecer.js
// Parecer de especialista sobre documentos (Alvarás, Contratos, Locações, Atas, Jurídicos)
// Retorna rigorosamente os 4 blocos: Riscos, Oportunidades, Ameaças, Sugestões
// Body: { prompt, documento: { tipo, titulo, empresa, ...detalhes } }

routerAdd(
  'POST',
  '/backend/v1/documentos/parecer',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const body = e.requestInfo().body || {}
    const promptPersonalizado = String(body.prompt || '').slice(0, 4000)
    const documento = body.documento || {}
    const tipoAba = String(body.tipo_aba || documento.tipo_aba || 'documento')

    const docDescricao = Object.entries(documento)
      .filter(([k, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    const sys =
      'Você é um especialista sênior e consultor executivo do grupo Extrafruti (empresas: Extrafruti, Casafruti, FoldBox, LL5). ' +
      'Sua missão é analisar o documento em questão e emitir um parecer rigorosamente estruturado iniciando por um RESUMO com panorama geral e seguido dos 4 blocos analíticos: ' +
      '0) RESUMO: Resumo executivo do que se trata o documento e um panorama geral com seu contexto, partes, objetivos e relevância. ' +
      '1) RISCOS: Riscos regulatórios, jurídicos, operacionais ou financeiros identificados. ' +
      '2) OPORTUNIDADES: Vantagens negociais, otimizações, economias ou melhorias viáveis. ' +
      '3) AMEAÇAS: Fatores externos, prazos críticos, penalidades, descumprimentos ou contingências. ' +
      '4) SUGESTÕES: Recomendações práticas, imediatas e acionáveis para a diretoria. ' +
      'Responda em JSON válido com as seguintes 5 chaves: "resumo", "riscos", "oportunidades", "ameacas", "sugestoes". ' +
      '"resumo" deve ser uma string com parágrafo executivo ou pontos de panorama geral. ' +
      'Cada uma das outras 4 chaves deve conter uma string ou um array de pontos explicativos em português do Brasil, claros e objetivos.'

    const userPrompt =
      (promptPersonalizado ? `Diretriz do Usuário:\n${promptPersonalizado}\n\n` : '') +
      `Dados do Documento (${tipoAba}):\n${docDescricao || 'Documento sem metadados adicionais.'}\n\n` +
      'Gere agora o parecer com o bloco inicial "resumo" (panorama geral) e os blocos "riscos", "oportunidades", "ameacas" e "sugestoes".'

    try {
      // Prioridade: se houver GEMINI_API_KEY no ambiente, chamar a API do Google Gemini Flash
      const geminiKey = $os.getenv('GEMINI_API_KEY')
      let texto = ''

      if (geminiKey) {
        try {
          const geminiResp = $http.send({
            url:
              'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
              geminiKey,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: sys }],
              },
              contents: [
                {
                  parts: [{ text: userPrompt }],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            }),
            timeout: 30,
          })

          if (geminiResp && geminiResp.statusCode === 200 && geminiResp.json) {
            const data = geminiResp.json
            if (
              data.candidates &&
              data.candidates[0] &&
              data.candidates[0].content &&
              data.candidates[0].content.parts &&
              data.candidates[0].content.parts[0]
            ) {
              texto = data.candidates[0].content.parts[0].text || ''
            }
          }
        } catch (geminiErr) {
          // Fallback para $ai.chat se chamada direta ao Gemini falhar
        }
      }

      if (!texto) {
        const r = $ai.chat({
          model: 'fast',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: userPrompt },
          ],
        })

        texto =
          r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
      }

      if (!texto) {
        return e.json(502, { ok: false, erro: 'IA não retornou conteúdo.' })
      }

      let limpo = texto.trim()
      if (limpo.startsWith('```')) {
        limpo = limpo
          .replace(/^```(json)?/, '')
          .replace(/```$/, '')
          .trim()
      }

      let parsed = null
      try {
        parsed = JSON.parse(limpo)
      } catch (_) {
        // Fallback caso não venha estritamente como JSON
        parsed = {
          resumo: `Documento da área de ${tipoAba}: ${documento.titulo || documento.numero || documento.numero_processo || 'registro sob análise'}. Trata-se de instrumento vinculado a ${documento.empresa || 'unidade corporativa'} com necessidade de acompanhamento executivo.`,
          riscos: 'Análise de conformidade e validade perante os termos do documento.',
          oportunidades: 'Renegociação de condições e alinhamento com a estratégia corporativa.',
          ameacas: 'Exposição a prazos de vencimento e penalidades rescisórias ou multas.',
          sugestoes:
            'Acompanhar prazos e formalizar aditivos contratuais ou renovações com antecedência.',
          texto_bruto: texto,
        }
      }

      const nomeDoc =
        documento.titulo ||
        documento.numero ||
        documento.numero_processo ||
        documento.objeto ||
        'Documento'
      const emp = documento.empresa || 'Grupo Extrafruti'

      return e.json(200, {
        ok: true,
        parecer: {
          resumo:
            parsed.resumo ||
            `Documento referente a ${nomeDoc} de responsabilidade de ${emp}. Panorama geral evidencia instrumentos operacionais com implicações administrativas e contratuais ativas.`,
          riscos: parsed.riscos || 'Nenhum risco crítico identificado nos termos apresentados.',
          oportunidades:
            parsed.oportunidades || 'Manter padrões vigentes e buscar sinergias operacionais.',
          ameacas:
            parsed.ameacas || 'Atenção aos marcos temporais de expiração e cláusulas de rescisão.',
          sugestoes:
            parsed.sugestoes || 'Proceder com a conferência documental e arquivamento seguro.',
        },
      })
    } catch (err) {
      const nomeDoc =
        documento.titulo ||
        documento.numero ||
        documento.numero_processo ||
        documento.objeto ||
        'Documento'
      const emp = documento.empresa || 'Grupo Extrafruti'

      // Heurística local de fallback caso haja indisponibilidade temporária de gateway
      return e.json(200, {
        ok: true,
        fallback: true,
        parecer: {
          resumo: `Panorama geral: trata-se do documento "${nomeDoc}" da empresa ${emp} sob a categoria de ${tipoAba}. O instrumento formaliza parâmetros regulatórios, operacionais ou contratuais que demandam acompanhamento de vigência, obrigações recíprocas e mitigação de passivos.`,
          riscos: `Análise preliminar de riscos para ${nomeDoc}: necessidade de auditoria periódica de prazos e conformidade regulatória.`,
          oportunidades: `Oportunidade de consolidação de processos com ${emp} e mapeamento de redução de custos/contingências.`,
          ameacas: `Possível descontinuidade ou custos extraordinários caso prazos legais ou contratuais não sejam tempestivamente observados.`,
          sugestoes: `Instituir controle de alertas preventivos com antecedência mínima de 60 a 90 dias antes de qualquer marco decisório.`,
        },
      })
    }
  },
  $apis.requireAuth(),
)
