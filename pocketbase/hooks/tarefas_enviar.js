// Envio de tarefas para ciência e acompanhamento de responsáveis e parceiros/contatos.
// POST /backend/v1/tarefas/enviar
// Recebe:
//   destinatarios: Array<{ id?: string, nome: string, email: string, tipo?: string }>
//   tarefas_ids?: string[] (ou tarefas diretas / filtros)
//   assunto_custom?: string
// Para cada destinatário com e-mail válido:
//   - Identifica as tarefas associadas a ele dentro da lista de tarefas_ids fornecidas
//   - Se não houver associação estrita, ou se todas as tarefas selecionadas forem direcionadas
//   - Agrupa as tarefas por empresa
//   - Obtém a logo da empresa (de logomarcas ou logos_publicas)
//   - Monta layout HTML profissional:
//       * Topo com LOGO DA EMPRESA centralizada
//       * Identidade verde #1B5E20, cantos arredondados, visual limpo
//       * Detalhes de cada tarefa: título, descrição, prazo (em vermelho se atrasada),
//         prioridade (P1/P2/P3), status, responsável, empresa e vínculo
//   - Envia e-mail via $app.newMailClient()
//   - Grava histórico em emails e auditoria

routerAdd(
  'POST',
  '/backend/v1/tarefas/enviar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const body = e.requestInfo().body || {}
    const destinatarios = Array.isArray(body.destinatarios) ? body.destinatarios : []
    const tarefaIds = Array.isArray(body.tarefas_ids) ? body.tarefas_ids : []
    const assuntoCustom = String(body.assunto || '').trim()

    if (destinatarios.length === 0) {
      return e.badRequestError('Nenhum destinatário informado para envio.')
    }
    if (tarefaIds.length === 0) {
      return e.badRequestError('Nenhuma tarefa selecionada/filtrada para envio.')
    }

    // 1. Busca todas as tarefas pelos IDs fornecidos
    const tarefas = []
    for (let i = 0; i < tarefaIds.length; i++) {
      try {
        const rec = $app.findRecordById('tarefas', String(tarefaIds[i]))
        if (rec) tarefas.push(rec)
      } catch (_) {}
    }

    if (tarefas.length === 0) {
      return e.badRequestError('Nenhuma das tarefas informadas foi encontrada.')
    }

    // 2. Base URL para imagens/logos
    let base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($secrets.get('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/?$/, '').replace(/\/$/, '')

    // 3. Mapa de logomarcas das empresas ativas
    const logosMap = {}
    try {
      const colLogo = $app.findCollectionByNameOrId('logomarcas')
      const recsLogos = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 50, 0)
      for (let j = 0; j < (recsLogos || []).length; j++) {
        const lrec = recsLogos[j]
        const empNome = String(lrec.getString('empresa') || '')
          .trim()
          .toLowerCase()
        const logoFile = lrec.getString('logo') || lrec.getString('emblema')
        if (empNome && logoFile) {
          logosMap[empNome] = {
            empresa: lrec.getString('empresa'),
            sigla: lrec.getString('sigla'),
            cor: lrec.getString('cor') || '#1B5E20',
            logoUrl: base
              ? base + '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile
              : '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile,
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao mapear logomarcas:', err)
    }

    const hoje = new Date().toISOString().slice(0, 10)

    function formatarPrazo(prazoRaw) {
      if (!prazoRaw) return 'Sem prazo definido'
      try {
        const pStr = String(prazoRaw).slice(0, 10)
        const partes = pStr.split('-')
        if (partes.length === 3) {
          return partes[2] + '/' + partes[1] + '/' + partes[0]
        }
      } catch (_) {}
      return String(prazoRaw).slice(0, 10)
    }

    function labelStatus(s) {
      const val = String(s || '')
        .toLowerCase()
        .trim()
      if (val === 'triagem') return 'Triagem'
      if (val === 'a_fazer') return 'A Fazer'
      if (val === 'em_andamento') return 'Em Andamento'
      if (val === 'bloqueado') return 'Bloqueado'
      if (val === 'concluido' || val === 'concluida') return 'Concluído'
      return 'Pendente'
    }

    function labelPrioridade(p, alt) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return 'Alta (P1)'
      if (prio === 'P2') return 'Normal (P2)'
      if (prio === 'P3') return 'Baixa (P3)'
      const altStr = String(alt || '')
        .toLowerCase()
        .trim()
      if (altStr === 'alta') return 'Alta (P1)'
      if (altStr === 'baixa') return 'Baixa (P3)'
      return 'Normal (P2)'
    }

    function corPrioridadeBg(p) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return '#FEE2E2' // red-100
      if (prio === 'P2') return '#FEF3C7' // amber-100
      return '#E0F2FE' // blue-100
    }

    function corPrioridadeText(p) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return '#991B1B' // red-800
      if (prio === 'P2') return '#92400E' // amber-800
      return '#075985' // blue-800
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const resultados = []

    for (let dIdx = 0; dIdx < destinatarios.length; dIdx++) {
      const dest = destinatarios[dIdx]
      const email = String(dest.email || '')
        .trim()
        .toLowerCase()
      const nome = String(dest.nome || '').trim() || 'Prezado(a)'
      const pId = String(dest.id || '').trim()

      if (!email || !reEmail.test(email)) {
        resultados.push({
          destinatario: nome,
          email: email,
          ok: false,
          erro: 'E-mail inválido ou ausente',
        })
        continue
      }

      // Filtra as tarefas pertinentes a este destinatário:
      // Se a tarefa tem o parceiro vinculado nos parceiro_ids OU o responsável bate com o nome.
      // Se não houver filtro restrito (ex.: usuário enviou especificamente para ele), considera as tarefas associadas
      const tarefasDest = tarefas.filter((t) => {
        // Checa responsável
        const resp = String(t.getString('responsavel') || '')
          .trim()
          .toLowerCase()
        const nomeDestNorm = nome.toLowerCase()
        if (
          resp &&
          (resp === nomeDestNorm || resp.includes(nomeDestNorm) || nomeDestNorm.includes(resp))
        ) {
          return true
        }
        // Checa parceiro_id
        if (pId) {
          try {
            const rawP = t.getString('parceiros')
            const pList = typeof rawP === 'string' ? JSON.parse(rawP || '[]') : rawP || []
            if (Array.isArray(pList) && pList.includes(pId)) return true
          } catch (_) {}
        }
        return false
      })

      // Se não filtrou nenhuma especificamente por match de nome/id, mas o usuário selecionou este destinatário
      // para a lista inteira de tarefas filtradas, usamos a lista de tarefas recebidas
      const listaFinalTarefas = tarefasDest.length > 0 ? tarefasDest : tarefas

      // Agrupa tarefas por empresa
      const gruposEmpresas = {}
      for (let tIdx = 0; tIdx < listaFinalTarefas.length; tIdx++) {
        const t = listaFinalTarefas[tIdx]
        const empNome = String(t.getString('empresa') || '').trim() || 'Geral'
        if (!gruposEmpresas[empNome]) gruposEmpresas[empNome] = []
        gruposEmpresas[empNome].push(t)
      }

      const nomesEmpresas = Object.keys(gruposEmpresas)
      const empPrincipal = nomesEmpresas[0] || 'Extrafruti'
      const logoPrincipalInfo =
        logosMap[empPrincipal.toLowerCase()] || logosMap['extrafruti'] || null

      const assunto =
        assuntoCustom ||
        'Tarefas & Acompanhamento — ' +
          (empPrincipal !== 'Geral' ? empPrincipal + ' · ' : '') +
          listaFinalTarefas.length +
          ' tarefa(s)'

      // Monta HTML completo com estilo inline legível em qualquer cliente de e-mail
      let html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
        escapeHtml(assunto) +
        '</title></head>'
      html +=
        '<body style="margin:0;padding:24px 12px;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">'
      html +=
        '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">'

      // TOPO: LOGO CENTRALIZADA DA EMPRESA
      html +=
        '<div style="background-color:#ffffff;padding:28px 24px 20px;text-align:center;border-bottom:2px solid #f3f4f6;">'
      if (logoPrincipalInfo && logoPrincipalInfo.logoUrl) {
        html +=
          '<img src="' +
          escapeHtml(logoPrincipalInfo.logoUrl) +
          '" alt="' +
          escapeHtml(empPrincipal) +
          '" style="max-height:68px;max-width:220px;height:auto;display:inline-block;margin:0 auto;object-fit:contain;" />'
      } else {
        html +=
          '<div style="display:inline-block;padding:10px 22px;background:#1B5E20;color:#ffffff;border-radius:10px;font-weight:bold;font-size:18px;letter-spacing:-0.5px;">' +
          escapeHtml(empPrincipal) +
          '</div>'
      }
      html +=
        '<div style="margin-top:10px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Portal de Gestão Executivo</div>'
      html += '</div>'

      // FAIXA DE APRESENTAÇÃO
      html +=
        '<div style="background:#1B5E20;color:#ffffff;padding:18px 24px;border-top:1px solid rgba(255,255,255,0.1);">'
      html +=
        '<h1 style="margin:0;font-size:18px;font-weight:700;line-height:1.3;color:#ffffff;">Ciência e Acompanhamento de Tarefas</h1>'
      html +=
        '<p style="margin:6px 0 0;font-size:13px;color:#d1fae5;line-height:1.4;">Olá, <strong>' +
        escapeHtml(nome) +
        '</strong>. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:</p>'
      html += '</div>'

      // CORPO DO E-MAIL: LISTA DE TAREFAS AGRUPADAS POR EMPRESA
      html += '<div style="padding:24px;">'

      for (let g = 0; g < nomesEmpresas.length; g++) {
        const empNome = nomesEmpresas[g]
        const tList = gruposEmpresas[empNome]
        const logoEmp = logosMap[empNome.toLowerCase()]

        if (nomesEmpresas.length > 1) {
          html +=
            '<div style="margin:20px 0 12px;padding-bottom:6px;border-bottom:2px solid #1B5E20;display:flex;align-items:center;justify-content:space-between;">'
          html +=
            '<span style="font-size:14px;font-weight:700;color:#1B5E20;text-transform:uppercase;letter-spacing:0.5px;">' +
            escapeHtml(empNome) +
            ' (' +
            tList.length +
            ')</span>'
          html += '</div>'
        }

        for (let i = 0; i < tList.length; i++) {
          const t = tList[i]
          const titulo = t.getString('titulo') || 'Sem título'
          const desc = t.getString('descricao') || ''
          const status = labelStatus(t.getString('status_kanban') || t.getString('status'))
          const prioP = t.getString('prioridade_p') || 'P2'
          const prioLabel = labelPrioridade(prioP, t.getString('prioridade'))
          const prioBg = corPrioridadeBg(prioP)
          const prioColor = corPrioridadeText(prioP)
          const resp = t.getString('responsavel') || 'Não atribuído'
          const prazoRaw = t.getString('prazo')
          const prazoFormatado = formatarPrazo(prazoRaw)
          const prazoAtrasado = Boolean(
            prazoRaw && String(prazoRaw).slice(0, 10) < hoje && status !== 'Concluído',
          )
          const vinculoTipo = t.getString('vinculo_tipo') || ''
          const recorrencia = t.getString('recorrencia') || ''

          html +=
            '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid ' +
            (prazoAtrasado ? '#dc2626' : '#1B5E20') +
            ';border-radius:10px;padding:16px;margin-bottom:16px;">'

          // Header da tarefa: Prioridade badge + Empresa
          html += '<div style="margin-bottom:8px;font-size:11px;">'
          html +=
            '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:' +
            prioBg +
            ';color:' +
            prioColor +
            ';font-weight:700;margin-right:8px;">' +
            escapeHtml(prioLabel) +
            '</span>'
          html +=
            '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#e5e7eb;color:#374151;font-weight:600;margin-right:8px;">' +
            escapeHtml(status) +
            '</span>'
          if (empNome && empNome !== 'Geral') {
            html +=
              '<span style="color:#6b7280;font-weight:500;">· ' + escapeHtml(empNome) + '</span>'
          }
          html += '</div>'

          // Título
          html +=
            '<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;line-height:1.35;">' +
            escapeHtml(titulo) +
            '</h3>'

          // Descrição (se houver)
          if (desc) {
            html +=
              '<div style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#4b5563;white-space:pre-wrap;background:#ffffff;padding:10px 12px;border-radius:6px;border:1px solid #e5e7eb;">' +
              escapeHtml(desc) +
              '</div>'
          }

          // Grid de Detalhes
          html +=
            '<table style="width:100%;border-collapse:collapse;font-size:12px;color:#374151;margin-top:6px;">'

          // Prazo (destacado em vermelho se atrasado)
          html += '<tr>'
          html += '<td style="padding:4px 0;width:110px;color:#6b7280;font-weight:600;">Prazo:</td>'
          if (prazoAtrasado) {
            html +=
              '<td style="padding:4px 0;color:#b91c1c;font-weight:700;"><span style="background:#fee2e2;padding:2px 6px;border-radius:4px;">⚠️ ' +
              escapeHtml(prazoFormatado) +
              ' (ATRASADA)</span></td>'
          } else {
            html +=
              '<td style="padding:4px 0;font-weight:600;color:#111827;">📅 ' +
              escapeHtml(prazoFormatado) +
              '</td>'
          }
          html += '</tr>'

          // Responsável
          html += '<tr>'
          html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Responsável:</td>'
          html += '<td style="padding:4px 0;font-weight:500;">👤 ' + escapeHtml(resp) + '</td>'
          html += '</tr>'

          // Vínculo / Origem (se houver)
          if (vinculoTipo) {
            html += '<tr>'
            html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Vínculo:</td>'
            html +=
              '<td style="padding:4px 0;font-weight:500;text-transform:capitalize;">🔗 ' +
              escapeHtml(vinculoTipo) +
              '</td>'
            html += '</tr>'
          }

          // Recorrência (se houver)
          if (recorrencia && recorrencia !== 'Nenhuma') {
            html += '<tr>'
            html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Recorrência:</td>'
            html +=
              '<td style="padding:4px 0;font-weight:500;">🔁 ' + escapeHtml(recorrencia) + '</td>'
            html += '</tr>'
          }

          html += '</table>'
          html += '</div>' // Fim do card da tarefa
        }
      }

      html += '</div>' // Fim do padding

      // RODAPÉ DO LAYOUT
      html +=
        '<div style="background:#f9fafb;padding:18px 24px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.5;">'
      html +=
        '<strong style="color:#6b7280;">Portal de Gestão Executivo</strong> · Grupo Extrafruti · Casafruti · FoldBox<br/>'
      html += 'Este e-mail foi gerado automaticamente para ciência e acompanhamento operacional.'
      html += '</div>'

      html += '</div></body></html>'

      // Versão texto plano alternativa
      let textoPlano = 'CIÊNCIA E ACOMPANHAMENTO DE TAREFAS\n'
      textoPlano += 'Portal de Gestão Executivo — ' + empPrincipal + '\n\n'
      textoPlano += 'Olá, ' + nome + '.\nSeguem as tarefas sob seu acompanhamento:\n\n'
      for (let i = 0; i < listaFinalTarefas.length; i++) {
        const t = listaFinalTarefas[i]
        textoPlano += i + 1 + ') ' + (t.getString('titulo') || 'Sem título') + '\n'
        textoPlano +=
          'Status: ' + labelStatus(t.getString('status_kanban') || t.getString('status')) + '\n'
        textoPlano += 'Prioridade: ' + (t.getString('prioridade_p') || 'P2') + '\n'
        textoPlano += 'Prazo: ' + formatarPrazo(t.getString('prazo')) + '\n'
        textoPlano += 'Responsável: ' + (t.getString('responsavel') || '—') + '\n'
        textoPlano += 'Empresa: ' + (t.getString('empresa') || '—') + '\n'
        if (t.getString('descricao')) {
          textoPlano += 'Descrição: ' + t.getString('descricao') + '\n'
        }
        textoPlano += '-----------------------------------------\n\n'
      }

      let statusEnvio = 'enviado'
      let erroEnvio = ''

      try {
        const sender = $app.settings().meta.senderAddress || 'gestao@extrafruti.com.br'
        const senderName = 'Portal de Gestão Executivo'

        const message = new MailerMessage({
          from: { address: sender, name: senderName },
          to: [{ address: email }],
          subject: assunto,
          html: html,
          text: textoPlano,
        })
        $app.newMailClient().send(message)
      } catch (err) {
        statusEnvio = 'erro'
        erroEnvio = String(err).slice(0, 500)
      }

      // Salva no histórico de emails
      try {
        const colEmails = $app.findCollectionByNameOrId('emails')
        const recEmail = new Record(colEmails)
        recEmail.set('para', email)
        recEmail.set('assunto', assunto)
        recEmail.set('corpo', textoPlano.slice(0, 20000))
        recEmail.set('status', statusEnvio)
        recEmail.set('erro', erroEnvio)
        recEmail.set('modelo', 'tarefas_acompanhamento')
        recEmail.set('criado_por', auth.getString('email'))
        $app.save(recEmail)
      } catch (_) {}

      // Grava auditoria
      try {
        const aid = $security.randomString(15)
        $app
          .db()
          .newQuery(
            "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'enviar_tarefas_email', 'tarefas', {:det}, {:now}, {:now})",
          )
          .bind({
            id: aid,
            uid: auth.id,
            uemail: auth.getString('email'),
            det:
              'Tarefas (' +
              listaFinalTarefas.length +
              ') enviadas para ' +
              nome +
              ' <' +
              email +
              '>' +
              (erroEnvio ? ' (ERRO: ' + erroEnvio.slice(0, 80) + ')' : ''),
            now: new DateTime().string(),
          })
          .execute()
      } catch (_) {}

      resultados.push({
        destinatario: nome,
        email: email,
        total_tarefas: listaFinalTarefas.length,
        ok: statusEnvio === 'enviado',
        erro: erroEnvio || undefined,
      })
    }

    const totalEnviados = resultados.filter((r) => r.ok).length
    const totalFalhas = resultados.filter((r) => !r.ok).length

    if (totalEnviados === 0 && totalFalhas > 0) {
      return e.json(502, {
        ok: false,
        erro: resultados[0]?.erro || 'Falha no envio dos e-mails.',
        resultados: resultados,
      })
    }

    return e.json(200, {
      ok: true,
      enviados: totalEnviados,
      falhas: totalFalhas,
      resultados: resultados,
    })
  },
  $apis.requireAuth(),
)
