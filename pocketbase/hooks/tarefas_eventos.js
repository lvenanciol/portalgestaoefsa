// ============================================================================
// NOTIFICAÇÕES DE TAREFAS — e-mail + sino (14/11/2026, v2)
//
// PEDIDO DO DONO:
//   a) clique no alerta abre a TAREFA (feito no Topbar: /tarefas?tarefa=<id>)
//   b) e-mail no MESMO LAYOUT do e-mail de acesso ao PGE:
//      faixa de logomarcas → barra verde → cartão com tabela de dados →
//      botão de ação → rodapé de uso restrito
//   c) remetente configurável: secret EMAIL_REMETENTE (fallback
//      $app.settings().meta.senderAddress)
//
// O QUE JÁ EXISTIA (mantido, este hook NÃO duplica):
//   · tarefas_notificacoes.js  -> sino em criar e mudar status
//   · tarefas_email_atribuicao.js -> e-mail só em ATRIBUIÇÃO
//
// O QUE ESTE HOOK COBRE:
//   1. QUALQUER campo alterado na tarefa -> chat + sino + e-mail
//   2. Nova mensagem em tarefas_chat      -> sino + e-mail
//
// REGRAS (obrigatórias neste runtime — JSVM/goja):
//   · Todo helper DENTRO do callback (top-level não é visível em runtime)
//   · Um arquivo por responsabilidade; nada de módulo compartilhado
//   · try/catch + e.next() no finally: e-mail nunca bloqueia a operação
//   · Autor da ação não recebe aviso; respeita notificacoes_desativadas
// ============================================================================

onRecordAfterUpdateSuccess(function (e) {
  var t = e.record
  var orig = e.record ? e.record.original() : null
  if (!t || !orig) {
    e.next()
    return
  }

  // ---------------------------- helpers -----------------------------------
  function txt(rec, campo) {
    try {
      var v = rec.getString(campo)
      return v === null || v === undefined ? '' : String(v).trim()
    } catch (_) {
      return ''
    }
  }

  function normStatus(s) {
    var v = String(s || '')
      .toLowerCase()
      .trim()
    if (v === 'concluida') return 'concluido'
    if (!v) return 'triagem'
    return v
  }

  function labelStatus(s) {
    var k = normStatus(s)
    if (k === 'triagem') return 'Triagem'
    if (k === 'a_fazer') return 'A Fazer'
    if (k === 'em_andamento') return 'Em Andamento'
    if (k === 'bloqueado') return 'Bloqueado'
    if (k === 'concluido') return 'Concluído'
    return s || 'Triagem'
  }

  function parseIds(raw) {
    if (!raw) return []
    try {
      var p = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(p)) {
        return p
          .map(function (x) {
            return String(x).trim()
          })
          .filter(Boolean)
      }
    } catch (_) {}
    return []
  }

  function autorDe(ev) {
    var a = null
    try {
      var ri = ev.requestInfo ? ev.requestInfo() : null
      a = ri && ri.authRecord ? ri.authRecord : null
    } catch (_) {}
    if (!a) return { id: '', email: '', nome: 'Sistema' }
    var em = a.getString('email') || ''
    return { id: a.id || '', email: em, nome: a.getString('name') || em || 'Sistema' }
  }

  // remetente: secret EMAIL_REMETENTE > senderAddress do PocketBase
  function remetente() {
    var addr = ''
    try {
      addr = String($secrets.get('EMAIL_REMETENTE') || '').trim()
    } catch (_) {}
    if (!addr) {
      try {
        addr = String($app.settings().meta.senderAddress || '').trim()
      } catch (_) {}
    }
    return addr
  }

  function nomeRemetente() {
    var n = ''
    try {
      n = String($secrets.get('EMAIL_REMETENTE_NOME') || '').trim()
    } catch (_) {}
    return n || 'Portal de Gestão Executivo — Extrafruti'
  }

  function baseUrl() {
    var b = ''
    try {
      b = String($app.settings().meta.appURL || '')
    } catch (_) {}
    if (!b) {
      try {
        b = String($secrets.get('SITE_URL') || '')
      } catch (_) {}
    }
    if (!b) b = 'https://portalefsa.goskip.app'
    return b.replace(/\/+$/, '')
  }

  // Logomarcas: as das empresas vinculadas ao usuário; sem vínculo, todas.
  function faixaLogos(usuarioRecord, empresaNome) {
    var base = baseUrl()
    var colLogosId = 'pbc_3701359284'
    var logos = []

    function addLogo(nomeEmp) {
      if (!nomeEmp) return
      try {
        var esc = String(nomeEmp).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        var ach = $app.findRecordsByFilter(
          'logomarcas',
          'ativo = true && empresa = "' + esc + '"',
          'empresa',
          1,
          0,
        )
        if (ach && ach.length) {
          var rec = ach[0]
          var arq = rec.getString('logo') || rec.getString('emblema')
          if (arq) {
            logos.push({
              empresa: rec.getString('empresa'),
              url: base + '/api/files/' + colLogosId + '/' + rec.id + '/' + arq,
            })
          }
        }
      } catch (_) {}
    }

    if (empresaNome) addLogo(empresaNome)

    if (usuarioRecord) {
      try {
        var empId = usuarioRecord.getString('empresa_id')
        if (empId) addLogo($app.findRecordById('empresas', empId).getString('nome'))
      } catch (_) {}
      try {
        var uniId = usuarioRecord.getString('unidade_id')
        if (uniId) {
          var empUni = $app.findRecordById('unidades', uniId).getString('empresa_id')
          if (empUni) addLogo($app.findRecordById('empresas', empUni).getString('nome'))
        }
      } catch (_) {}
    }

    if (!logos.length) {
      try {
        var todas = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
        for (var i = 0; i < (todas || []).length; i++) {
          var r = todas[i]
          var a = r.getString('logo') || r.getString('emblema')
          if (a) {
            logos.push({
              empresa: r.getString('empresa'),
              url: base + '/api/files/' + colLogosId + '/' + r.id + '/' + a,
            })
          }
        }
      } catch (_) {}
    }

    if (!logos.length) return ''
    var imgs = ''
    for (var j = 0; j < logos.length; j++) {
      imgs +=
        '<img src="' +
        logos[j].url +
        '" alt="' +
        (logos[j].empresa || '') +
        '" title="' +
        (logos[j].empresa || '') +
        '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
        'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />'
    }
    return (
      '<tr><td style="background:#ffffff;padding:18px 20px;border:1px solid #e5e7eb;' +
      'border-top:0;border-bottom:0;text-align:center">' +
      imgs +
      '</td></tr>'
    )
  }

  // ------------------------------------------------------------------
  // LAYOUT PGE — espelha o e-mail "Seu acesso está liberado"
  // ------------------------------------------------------------------
  function montarHtml(opts) {
    var linhas = ''
    if (opts.tarefa) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280;width:130px">Tarefa</td>' +
        '<td style="padding:6px 0;font-weight:bold">' +
        opts.tarefa +
        '</td></tr>'
    }
    if (opts.empresa) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Empresa</td>' +
        '<td style="padding:6px 0">' +
        opts.empresa +
        '</td></tr>'
    }
    if (opts.autor) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">De</td>' +
        '<td style="padding:6px 0">' +
        opts.autor +
        '</td></tr>'
    }
    if (opts.quando) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Quando</td>' +
        '<td style="padding:6px 0">' +
        opts.quando +
        '</td></tr>'
    }
    if (opts.link) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Acesso direto</td>' +
        '<td style="padding:6px 0"><a href="' +
        opts.link +
        '" style="color:#1B5E20;font-weight:bold">clique para abrir</a></td></tr>'
    }

    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse">' +
      (opts.logosHtml || '') +
      '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:0">' +
      '<strong style="font-size:15px">' +
      opts.tituloBarra +
      '</strong>' +
      '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Portal de Gestão Executivo · Grupo Extrafruti</span></td></tr>' +
      '</table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">' +
      opts.destaque +
      '</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      opts.destinatario +
      '</strong>!</p>' +
      (opts.intro ? '<p style="font-size:14px;line-height:1.6">' + opts.intro + '</p>' : '') +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      linhas +
      '</table>' +
      (opts.conteudoHtml || '') +
      (opts.link
        ? '<p style="margin:0 0 16px"><a href="' +
          opts.link +
          '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
          'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
          (opts.textoBotao || 'Abrir a tarefa') +
          '</a></p>'
        : '') +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;' +
      'font-size:12px;color:#92400e;line-height:1.6">' +
      'Você recebe este aviso por participar da tarefa. O histórico completo fica no Portal.' +
      '</div>' +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso ' +
      'restrito. Não compartilhe suas credenciais. Grupo Extrafruti · Casafruti · FoldBox</p>' +
      '</div></div>'
    )
  }

  function envolvidos(rec) {
    var out = []
    var vistos = {}
    function push(u) {
      if (!u || vistos[u.id]) return
      vistos[u.id] = true
      out.push({
        rec: u,
        id: u.id,
        email: u.getString('email') || '',
        nome: u.getString('name') || u.getString('email') || '',
        silenciado: !!u.getBool('notificacoes_desativadas'),
      })
    }

    var respIds = []
    try {
      var rr = rec.get('responsaveis_ids')
      if (Array.isArray(rr)) {
        respIds = rr.map(function (x) {
          return String(x)
        })
      }
    } catch (_) {}
    for (var i = 0; i < respIds.length; i++) {
      try {
        push($app.findRecordById('users', respIds[i]))
      } catch (_) {}
    }

    var pids = parseIds(rec.get ? rec.get('parceiros') : null)
    for (var j = 0; j < pids.length; j++) {
      var em = ''
      var nm = ''
      try {
        var pr = $app.findRecordById('parceiros', pids[j])
        em = (pr.getString('email') || '').trim().toLowerCase()
        nm = (pr.getString('nome') || '').trim()
      } catch (_) {}
      if (em && em.indexOf('@') !== -1) {
        try {
          push($app.findAuthRecordByEmail('users', em))
        } catch (_) {}
      }
      if (nm) {
        var p1 = nm
          .replace(/^\[[^\]]+\]\s*/, '')
          .trim()
          .split(/\s+/)[0]
        if (p1 && p1.length >= 3) {
          try {
            var ach = $app.findRecordsByFilter('users', 'name ~ "' + p1 + '"', '', 5, 0)
            for (var k = 0; k < ach.length; k++) push(ach[k])
          } catch (_) {}
        }
      }
    }

    var resp = txt(rec, 'responsavel')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim()
    if (resp) {
      var pr1 = resp.split(/\s+/)[0]
      if (pr1 && pr1.length >= 3) {
        try {
          var ach2 = $app.findRecordsByFilter('users', 'name ~ "' + pr1 + '"', '', 5, 0)
          for (var m = 0; m < ach2.length; m++) push(ach2[m])
        } catch (_) {}
      }
    }

    var criador = txt(rec, 'criado_por').toLowerCase()
    if (criador && criador.indexOf('@') !== -1) {
      try {
        push($app.findAuthRecordByEmail('users', criador))
      } catch (_) {}
    }

    return out
  }

  function gravarChat(tarefaId, texto, autorNome) {
    if (!tarefaId) return
    try {
      var col = $app.findCollectionByNameOrId('tarefas_chat')
      var reg = new Record(col)
      reg.set('tarefa_id', String(tarefaId))
      reg.set('autor', autorNome || 'Sistema')
      reg.set('autor_tipo', 'portal')
      reg.set('texto', texto)
      $app.save(reg)
    } catch (err) {
      console.warn('tarefa_eventos: chat falhou: ' + String(err).slice(0, 150))
    }
  }

  function gravarSino(dest, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var reg = new Record(col)
      reg.set('usuario_id', dest.id || '')
      reg.set('usuario_email', dest.email || '')
      reg.set('titulo', String(dados.titulo).slice(0, 250))
      reg.set('mensagem', String(dados.mensagem).slice(0, 2000))
      reg.set('tipo', dados.tipo)
      reg.set('tarefa_id', String(dados.tarefa_id || ''))
      reg.set('rota', '/tarefas')
      reg.set('autor_nome', dados.autor_nome)
      reg.set('autor_email', dados.autor_email)
      reg.set('lida', false)
      $app.save(reg)
    } catch (err) {
      console.warn('tarefa_eventos: sino falhou: ' + String(err).slice(0, 150))
    }
  }

  function enviarEmail(dest, assunto, html, texto) {
    var status = 'enviado'
    var erro = ''
    try {
      var msg = new MailerMessage({
        from: { address: remetente(), name: nomeRemetente() },
        to: [{ address: dest.email }],
        subject: assunto,
        html: html,
        text: texto,
      })
      $app.newMailClient().send(msg)
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 500)
      console.warn('tarefa_eventos: e-mail falhou para ' + dest.email + ': ' + erro)
    }
    try {
      var colE = $app.findCollectionByNameOrId('emails')
      var recE = new Record(colE)
      recE.set('para', dest.email)
      recE.set('assunto', assunto)
      recE.set('corpo', texto.slice(0, 20000))
      recE.set('status', status)
      recE.set('erro', erro)
      recE.set('modelo', 'tarefa_atualizacao')
      recE.set('criado_por', 'sistema')
      $app.save(recE)
    } catch (_) {}
  }

  function dataHoraBR() {
    // PocketBase entrega DateTime em UTC; formata em pt-BR
    try {
      var d = new Date()
      var dd = String(d.getDate()).padStart(2, '0')
      var mm = String(d.getMonth() + 1).padStart(2, '0')
      var hh = String(d.getHours()).padStart(2, '0')
      var mi = String(d.getMinutes()).padStart(2, '0')
      return dd + '/' + mm + '/' + d.getFullYear() + ' ' + hh + ':' + mi
    } catch (_) {
      return ''
    }
  }

  // ---------------------------- fluxo -------------------------------------
  try {
    var titulo = txt(t, 'titulo') || 'Sem título'

    var stAnt = normStatus(txt(orig, 'status_kanban') || txt(orig, 'status'))
    var stNov = normStatus(txt(t, 'status_kanban') || txt(t, 'status'))

    var campos = [
      ['titulo', 'título'],
      ['descricao', 'descrição'],
      ['prazo', 'prazo'],
      ['prioridade_p', 'prioridade'],
      ['prioridade', 'prioridade'],
      ['empresa', 'empresa'],
      ['responsavel', 'responsável'],
      ['recorrencia', 'recorrência'],
    ]

    var mudancas = []
    for (var i = 0; i < campos.length; i++) {
      var cp = campos[i][0]
      var rot = campos[i][1]
      var a = txt(orig, cp)
      var b = txt(t, cp)
      if (a !== b) {
        if (!a && b) mudancas.push(rot + ' definido')
        else if (a && !b) mudancas.push(rot + ' removido')
        else mudancas.push(rot + ' alterado')
      }
    }

    var statusMudou = stAnt !== stNov
    if (statusMudou) {
      mudancas.unshift('status de "' + labelStatus(stAnt) + '" para "' + labelStatus(stNov) + '"')
    }

    try {
      var sA = orig.get('subtarefas')
      var sB = t.get('subtarefas')
      var nA = Array.isArray(sA) ? sA.length : 0
      var nB = Array.isArray(sB) ? sB.length : 0
      if (nA !== nB) mudancas.push('subtarefas (' + nA + ' → ' + nB + ')')
    } catch (_) {}
    try {
      var cA = orig.get('comentarios')
      var cB = t.get('comentarios')
      var m1 = Array.isArray(cA) ? cA.length : 0
      var m2 = Array.isArray(cB) ? cB.length : 0
      if (m1 !== m2) mudancas.push('comentários (' + m1 + ' → ' + m2 + ')')
    } catch (_) {}

    if (!mudancas.length) {
      e.next()
      return
    }

    var autor = autorDe(e)
    var resumo = mudancas.join('; ')
    var empresaNome = txt(t, 'empresa')

    gravarChat(
      t.id,
      '⚡ ' + resumo.charAt(0).toUpperCase() + resumo.slice(1) + ' — por ' + autor.nome + '.',
      autor.nome,
    )

    var lista = envolvidos(t)
    var jaFoi = {}
    var assunto = (statusMudou ? 'Tarefa atualizada: ' : 'Tarefa alterada: ') + titulo
    var link = baseUrl() + '/tarefas?tarefa=' + encodeURIComponent(String(t.id))
    var quando = dataHoraBR()

    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      if (d.id && autor.id && d.id === autor.id) continue
      if (d.email && autor.email && d.email.toLowerCase() === autor.email.toLowerCase()) continue
      jaFoi[chave] = true
      if (d.silenciado) continue
      if (!d.email || d.email.indexOf('@') === -1) continue

      gravarSino(d, {
        titulo: assunto,
        mensagem: autor.nome + ' atualizou "' + titulo + '": ' + resumo + '.',
        tipo: statusMudou ? 'tarefa_status' : 'tarefa_atribuicao',
        tarefa_id: t.id,
        autor_nome: autor.nome,
        autor_email: autor.email,
      })

      var html = montarHtml({
        logosHtml: faixaLogos(d.rec, empresaNome),
        tituloBarra: statusMudou ? 'Tarefa atualizada' : 'Tarefa alterada',
        destaque: assunto,
        destinatario: d.nome,
        intro: autor.nome + ' fez uma atualização em uma tarefa da qual você participa.',
        tarefa: titulo,
        empresa: empresaNome,
        autor: autor.nome + (autor.email ? ' (' + autor.email + ')' : ''),
        quando: quando,
        link: link,
        textoBotao: 'Abrir a tarefa',
        conteudoHtml:
          '<div style="margin:14px 0;padding:12px;background:#f9fafb;border-left:3px solid #1B5E20;' +
          'font-size:13px;color:#374151;line-height:1.6"><strong>O que mudou</strong><br/>' +
          resumo +
          '</div>',
      })

      var texto =
        'Olá, ' +
        d.nome +
        '!\n\n' +
        autor.nome +
        ' atualizou a tarefa "' +
        titulo +
        '".\n\n' +
        'O que mudou: ' +
        resumo +
        '\n' +
        (empresaNome ? 'Empresa: ' + empresaNome + '\n' : '') +
        'Quando: ' +
        quando +
        '\n\n' +
        'Abrir a tarefa: ' +
        link +
        '\n\n' +
        'Sistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox'

      enviarEmail(d, assunto, html, texto)
    }
  } catch (err) {
    console.warn('tarefa_eventos (update): ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas')

// ---------------------------------------------------------------------------
// NOVA MENSAGEM NO CHAT DA TAREFA
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess(function (e) {
  var msg = e.record
  if (!msg) {
    e.next()
    return
  }

  function autorDe(ev) {
    var a = null
    try {
      var ri = ev.requestInfo ? ev.requestInfo() : null
      a = ri && ri.authRecord ? ri.authRecord : null
    } catch (_) {}
    if (!a) return { id: '', email: '', nome: 'Sistema' }
    var em = a.getString('email') || ''
    return { id: a.id || '', email: em, nome: a.getString('name') || em || 'Sistema' }
  }

  function remetente() {
    var addr = ''
    try {
      addr = String($secrets.get('EMAIL_REMETENTE') || '').trim()
    } catch (_) {}
    if (!addr) {
      try {
        addr = String($app.settings().meta.senderAddress || '').trim()
      } catch (_) {}
    }
    return addr
  }

  function nomeRemetente() {
    var n = ''
    try {
      n = String($secrets.get('EMAIL_REMETENTE_NOME') || '').trim()
    } catch (_) {}
    return n || 'Portal de Gestão Executivo — Extrafruti'
  }

  function baseUrl() {
    var b = ''
    try {
      b = String($app.settings().meta.appURL || '')
    } catch (_) {}
    if (!b) {
      try {
        b = String($secrets.get('SITE_URL') || '')
      } catch (_) {}
    }
    if (!b) b = 'https://portalefsa.goskip.app'
    return b.replace(/\/+$/, '')
  }

  function faixaLogos(usuarioRecord, empresaNome) {
    var base = baseUrl()
    var colLogosId = 'pbc_3701359284'
    var logos = []

    function addLogo(nomeEmp) {
      if (!nomeEmp) return
      try {
        var esc = String(nomeEmp).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        var ach = $app.findRecordsByFilter(
          'logomarcas',
          'ativo = true && empresa = "' + esc + '"',
          'empresa',
          1,
          0,
        )
        if (ach && ach.length) {
          var rec = ach[0]
          var arq = rec.getString('logo') || rec.getString('emblema')
          if (arq) {
            logos.push({
              empresa: rec.getString('empresa'),
              url: base + '/api/files/' + colLogosId + '/' + rec.id + '/' + arq,
            })
          }
        }
      } catch (_) {}
    }

    if (empresaNome) addLogo(empresaNome)
    if (usuarioRecord) {
      try {
        var empId = usuarioRecord.getString('empresa_id')
        if (empId) addLogo($app.findRecordById('empresas', empId).getString('nome'))
      } catch (_) {}
      try {
        var uniId = usuarioRecord.getString('unidade_id')
        if (uniId) {
          var empUni = $app.findRecordById('unidades', uniId).getString('empresa_id')
          if (empUni) addLogo($app.findRecordById('empresas', empUni).getString('nome'))
        }
      } catch (_) {}
    }
    if (!logos.length) {
      try {
        var todas = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
        for (var i = 0; i < (todas || []).length; i++) {
          var r = todas[i]
          var a = r.getString('logo') || r.getString('emblema')
          if (a) {
            logos.push({
              empresa: r.getString('empresa'),
              url: base + '/api/files/' + colLogosId + '/' + r.id + '/' + a,
            })
          }
        }
      } catch (_) {}
    }
    if (!logos.length) return ''
    var imgs = ''
    for (var j = 0; j < logos.length; j++) {
      imgs +=
        '<img src="' +
        logos[j].url +
        '" alt="' +
        (logos[j].empresa || '') +
        '" title="' +
        (logos[j].empresa || '') +
        '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
        'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />'
    }
    return (
      '<tr><td style="background:#ffffff;padding:18px 20px;border:1px solid #e5e7eb;' +
      'border-top:0;border-bottom:0;text-align:center">' +
      imgs +
      '</td></tr>'
    )
  }

  function montarHtml(opts) {
    var linhas = ''
    if (opts.tarefa) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280;width:130px">Tarefa</td>' +
        '<td style="padding:6px 0;font-weight:bold">' +
        opts.tarefa +
        '</td></tr>'
    }
    if (opts.empresa) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Empresa</td>' +
        '<td style="padding:6px 0">' +
        opts.empresa +
        '</td></tr>'
    }
    if (opts.autor) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">De</td>' +
        '<td style="padding:6px 0">' +
        opts.autor +
        '</td></tr>'
    }
    if (opts.quando) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Quando</td>' +
        '<td style="padding:6px 0">' +
        opts.quando +
        '</td></tr>'
    }
    if (opts.link) {
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Acesso direto</td>' +
        '<td style="padding:6px 0"><a href="' +
        opts.link +
        '" style="color:#1B5E20;font-weight:bold">clique para abrir</a></td></tr>'
    }

    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse">' +
      (opts.logosHtml || '') +
      '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:0">' +
      '<strong style="font-size:15px">' +
      opts.tituloBarra +
      '</strong>' +
      '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Portal de Gestão Executivo · Grupo Extrafruti</span></td></tr>' +
      '</table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">' +
      opts.destaque +
      '</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      opts.destinatario +
      '</strong>!</p>' +
      (opts.intro ? '<p style="font-size:14px;line-height:1.6">' + opts.intro + '</p>' : '') +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      linhas +
      '</table>' +
      (opts.conteudoHtml || '') +
      (opts.link
        ? '<p style="margin:0 0 16px"><a href="' +
          opts.link +
          '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
          'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
          (opts.textoBotao || 'Abrir a tarefa') +
          '</a></p>'
        : '') +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;' +
      'font-size:12px;color:#92400e;line-height:1.6">' +
      'Você recebe este aviso por participar da tarefa. O histórico completo fica no Portal.' +
      '</div>' +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso ' +
      'restrito. Não compartilhe suas credenciais. Grupo Extrafruti · Casafruti · FoldBox</p>' +
      '</div></div>'
    )
  }

  function gravarSino(dest, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var reg = new Record(col)
      reg.set('usuario_id', dest.id || '')
      reg.set('usuario_email', dest.email || '')
      reg.set('titulo', String(dados.titulo).slice(0, 250))
      reg.set('mensagem', String(dados.mensagem).slice(0, 2000))
      reg.set('tipo', 'sistema')
      reg.set('tarefa_id', String(dados.tarefa_id || ''))
      reg.set('rota', '/tarefas')
      reg.set('autor_nome', dados.autor_nome)
      reg.set('autor_email', dados.autor_email)
      reg.set('lida', false)
      $app.save(reg)
    } catch (err) {
      console.warn('chat_email: sino falhou: ' + String(err).slice(0, 150))
    }
  }

  function enviarEmail(dest, assunto, html, texto) {
    var status = 'enviado'
    var erro = ''
    try {
      var m = new MailerMessage({
        from: { address: remetente(), name: nomeRemetente() },
        to: [{ address: dest.email }],
        subject: assunto,
        html: html,
        text: texto,
      })
      $app.newMailClient().send(m)
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 500)
      console.warn('chat_email: falhou para ' + dest.email + ': ' + erro)
    }
    try {
      var colE = $app.findCollectionByNameOrId('emails')
      var recE = new Record(colE)
      recE.set('para', dest.email)
      recE.set('assunto', assunto)
      recE.set('corpo', texto.slice(0, 20000))
      recE.set('status', status)
      recE.set('erro', erro)
      recE.set('modelo', 'tarefa_chat')
      recE.set('criado_por', 'sistema')
      $app.save(recE)
    } catch (_) {}
  }

  function dataHoraBR() {
    try {
      var d = new Date()
      var dd = String(d.getDate()).padStart(2, '0')
      var mm = String(d.getMonth() + 1).padStart(2, '0')
      var hh = String(d.getHours()).padStart(2, '0')
      var mi = String(d.getMinutes()).padStart(2, '0')
      return dd + '/' + mm + '/' + d.getFullYear() + ' ' + hh + ':' + mi
    } catch (_) {
      return ''
    }
  }

  // ---------------------------- fluxo -------------------------------------
  try {
    var texto = (msg.getString('texto') || '').trim()
    if (!texto) {
      e.next()
      return
    }

    // ignora as linhas automáticas dos próprios hooks
    if (texto.indexOf('⚡') === 0 || texto.indexOf('📌') === 0) {
      e.next()
      return
    }

    var tarefaId = (msg.getString('tarefa_id') || '').trim()
    if (!tarefaId) {
      try {
        var rel = msg.get('tarefa')
        if (rel) tarefaId = String(rel)
      } catch (_) {}
    }
    if (!tarefaId) {
      e.next()
      return
    }

    var tarefa = null
    try {
      tarefa = $app.findRecordById('tarefas', tarefaId)
    } catch (_) {}
    if (!tarefa) {
      e.next()
      return
    }

    var autor = autorDe(e)
    var tituloTarefa = (tarefa.getString('titulo') || 'Sem título').trim()
    var autorMsg = (msg.getString('autor') || autor.nome || 'Sistema').trim()
    var empresaNome = (tarefa.getString('empresa') || '').trim()
    var trecho = texto.length > 300 ? texto.slice(0, 300) + '…' : texto

    // envolvidos
    var lista = []
    var vistos = {}
    function pushU(u) {
      if (!u || vistos[u.id]) return
      vistos[u.id] = true
      lista.push({
        rec: u,
        id: u.id,
        email: u.getString('email') || '',
        nome: u.getString('name') || u.getString('email') || '',
        silenciado: !!u.getBool('notificacoes_desativadas'),
      })
    }

    var respIds = []
    try {
      var rr = tarefa.get('responsaveis_ids')
      if (Array.isArray(rr)) {
        respIds = rr.map(function (x) {
          return String(x)
        })
      }
    } catch (_) {}
    for (var i = 0; i < respIds.length; i++) {
      try {
        pushU($app.findRecordById('users', respIds[i]))
      } catch (_) {}
    }

    var pids = []
    try {
      var raw = tarefa.get('parceiros')
      var p = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(p)) {
        pids = p
          .map(function (x) {
            return String(x).trim()
          })
          .filter(Boolean)
      }
    } catch (_) {}
    for (var j = 0; j < pids.length; j++) {
      try {
        var pr = $app.findRecordById('parceiros', pids[j])
        var em = (pr.getString('email') || '').trim().toLowerCase()
        if (em && em.indexOf('@') !== -1) pushU($app.findAuthRecordByEmail('users', em))
      } catch (_) {}
    }

    var criador = (tarefa.getString('criado_por') || '').toLowerCase()
    if (criador && criador.indexOf('@') !== -1) {
      try {
        pushU($app.findAuthRecordByEmail('users', criador))
      } catch (_) {}
    }

    var assunto = 'Nova mensagem em "' + tituloTarefa + '"'
    var link = baseUrl() + '/tarefas?tarefa=' + encodeURIComponent(tarefaId)
    var quando = dataHoraBR()

    var jaFoi = {}
    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      if (d.id && autor.id && d.id === autor.id) continue
      if (d.email && autor.email && d.email.toLowerCase() === autor.email.toLowerCase()) continue
      jaFoi[chave] = true
      if (d.silenciado || !d.email || d.email.indexOf('@') === -1) continue

      gravarSino(d, {
        titulo: assunto,
        mensagem: autorMsg + ': ' + trecho,
        tarefa_id: tarefaId,
        autor_nome: autorMsg,
        autor_email: autor.email,
      })

      var html = montarHtml({
        logosHtml: faixaLogos(d.rec, empresaNome),
        tituloBarra: 'Nova mensagem na tarefa',
        destaque: assunto,
        destinatario: d.nome,
        intro: autorMsg + ' enviou uma mensagem em uma tarefa da qual você participa.',
        tarefa: tituloTarefa,
        empresa: empresaNome,
        autor: autorMsg + (autor.email ? ' (' + autor.email + ')' : ''),
        quando: quando,
        link: link,
        textoBotao: 'Responder no Portal',
        conteudoHtml:
          '<div style="margin:14px 0;padding:12px;background:#f9fafb;border-left:3px solid #1B5E20;' +
          'font-size:13px;color:#374151;line-height:1.6"><strong>' +
          autorMsg +
          '</strong> escreveu:<br/>' +
          trecho +
          '</div>',
      })

      var txtPlano =
        'Olá, ' +
        d.nome +
        '!\n\n' +
        autorMsg +
        ' enviou uma mensagem na tarefa "' +
        tituloTarefa +
        '":\n\n' +
        trecho +
        '\n\n' +
        (empresaNome ? 'Empresa: ' + empresaNome + '\n' : '') +
        'Quando: ' +
        quando +
        '\n\n' +
        'Responder: ' +
        link +
        '\n\n' +
        'Sistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox'

      enviarEmail(d, assunto, html, txtPlano)
    }
  } catch (err) {
    console.warn('chat_email (create): ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas_chat')
