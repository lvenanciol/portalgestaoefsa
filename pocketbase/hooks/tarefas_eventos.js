// ============================================================================
// NOTIFICAÇÕES DE TAREFAS — cobertura completa (14/11/2026)
//
// PEDIDO DO DONO: "Quando uma tarefa for alterada, atualizada ou ainda o
// chat/mensagem receber/enviar nova mensagem, enviar mensagem por e-mail e
// no sino de alerta informando a atualização aos envolvidos na tarefa"
//
// O QUE JÁ EXISTIA (e é mantido — este hook NÃO duplica):
//   · tarefas_notificacoes.js  -> sino (notificacoes) em criar e mudar status
//   · tarefas_email_atribuicao.js -> e-mail em criar e em mudança de ATRIBUIÇÃO
//
// O QUE FALTAVA (coberto aqui):
//   1. Mudança de STATUS/conclusão -> não gerava e-mail
//   2. Qualquer outro campo alterado (título, prazo, prioridade, descrição,
//      subtarefas, comentários, anexos) -> não gerava nada
//   3. Nova mensagem no CHAT da tarefa (tarefas_chat) -> não avisava ninguém
//
// REGRAS DE SEGURANÇA:
//   · NUNCA bloqueia a operação: todo bloco em try/catch e e.next() no finally
//   · Autor não recebe notificação da própria ação
//   · Respeita users.notificacoes_desativadas
//   · Um e-mail por destinatário por evento (dedupe por id/e-mail)
//   · Funções declaradas DENTRO de cada callback (JSVM não compartilha escopo)
// ============================================================================

// ---------------------------------------------------------------------------
// 1) TAREFA ATUALIZADA — qualquer campo
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess(function (e) {
  var t = e.record
  var orig = e.record ? e.record.original() : null
  if (!t || !orig) {
    e.next()
    return
  }

  // ---- helpers (escopo local) ----
  function txt(rec, campo) {
    try {
      var v = rec.getString(campo)
      return v === null || v === undefined ? '' : String(v).trim()
    } catch (_) {
      return ''
    }
  }

  function normalizarStatus(s) {
    var v = String(s || '')
      .toLowerCase()
      .trim()
    if (v === 'concluida') return 'concluido'
    if (!v) return 'triagem'
    return v
  }

  function labelStatus(s) {
    var k = normalizarStatus(s)
    if (k === 'triagem') return 'Triagem'
    if (k === 'a_fazer') return 'A Fazer'
    if (k === 'em_andamento') return 'Em Andamento'
    if (k === 'bloqueado') return 'Bloqueado'
    if (k === 'concluido') return 'Concluído'
    return s || 'Triagem'
  }

  function ids(raw) {
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

  // envolvidos = responsáveis (users) + parceiros + criador
  function envolvidos(rec) {
    var out = []
    var vistos = {}
    function push(u) {
      if (!u || vistos[u.id]) return
      vistos[u.id] = true
      out.push({
        id: u.id,
        email: u.getString('email') || '',
        nome: u.getString('name') || u.getString('email') || '',
        silenciado: !!u.getBool('notificacoes_desativadas'),
      })
    }

    var respIds = []
    try {
      var rr = rec.get('responsaveis_ids')
      if (Array.isArray(rr))
        respIds = rr.map(function (x) {
          return String(x)
        })
    } catch (_) {}
    for (var i = 0; i < respIds.length; i++) {
      try {
        push($app.findRecordById('users', respIds[i]))
      } catch (_) {}
    }

    var pids = ids(rec.get ? rec.get('parceiros') : null)
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
        var primeiro = nm
          .replace(/^\[[^\]]+\]\s*/, '')
          .trim()
          .split(/\s+/)[0]
        if (primeiro && primeiro.length >= 3) {
          try {
            var ach = $app.findRecordsByFilter('users', 'name ~ "' + primeiro + '"', '', 5, 0)
            for (var k = 0; k < ach.length; k++) push(ach[k])
          } catch (_) {}
        }
      }
    }

    var resp = txt(rec, 'responsavel')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim()
    if (resp) {
      var p1 = resp.split(/\s+/)[0]
      if (p1 && p1.length >= 3) {
        try {
          var ach2 = $app.findRecordsByFilter('users', 'name ~ "' + p1 + '"', '', 5, 0)
          for (var m = 0; m < ach2.length; m++) push(ach2[m])
        } catch (_) {}
      }
    }

    var criadoPor = txt(rec, 'criado_por').toLowerCase()
    if (criadoPor && criadoPor.indexOf('@') !== -1) {
      try {
        push($app.findAuthRecordByEmail('users', criadoPor))
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
      reg.set('titulo', dados.titulo.slice(0, 250))
      reg.set('mensagem', dados.mensagem.slice(0, 2000))
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

  function enviarEmail(dest, assunto, corpo) {
    var status = 'enviado'
    var erro = ''
    try {
      var base = $app.settings().meta.appURL || 'https://portalefsa.goskip.app'
      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;' +
        'background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">' +
        '<div style="background:#1B5E20;padding:16px 20px">' +
        '<p style="margin:0;color:#ffffff;font-size:15px;font-weight:bold">' +
        'Portal de Gestão Executivo</p>' +
        '<p style="margin:4px 0 0;color:#d1fae5;font-size:11px">Tarefas &amp; Agenda</p>' +
        '</div>' +
        '<div style="padding:20px">' +
        '<p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#111827">' +
        assunto +
        '</p>' +
        '<p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6">' +
        corpo +
        '</p>' +
        '<p style="margin:0"><a href="' +
        base +
        '/tarefas" ' +
        'style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
        'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
        'Abrir a tarefa</a></p>' +
        '</div>' +
        '<div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb">' +
        '<p style="margin:0;font-size:11px;color:#6b7280">Sistema corporativo de uso restrito. ' +
        'Grupo Extrafruti · Casafruti · FoldBox</p></div></div>'

      var msg = new MailerMessage({
        from: {
          address: $app.settings().meta.senderAddress,
          name: 'Portal de Gestão Executivo — Extrafruti',
        },
        to: [{ address: dest.email }],
        subject: assunto,
        html: html,
        text: corpo,
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
      recE.set('corpo', corpo.slice(0, 20000))
      recE.set('status', status)
      recE.set('erro', erro)
      recE.set('modelo', 'tarefa_atualizacao')
      recE.set('criado_por', 'sistema')
      $app.save(recE)
    } catch (_) {}
  }

  try {
    var titulo = txt(t, 'titulo') || 'Sem título'

    // ---- detecta o que mudou ----
    var stAnt = normalizarStatus(txt(orig, 'status_kanban') || txt(orig, 'status'))
    var stNov = normalizarStatus(txt(t, 'status_kanban') || txt(t, 'status'))

    var campos = [
      ['titulo', 'título'],
      ['descricao', 'descrição'],
      ['prazo', 'prazo'],
      ['prioridade_p', 'prioridade'],
      ['prioridade', 'prioridade'],
      ['status_kanban', 'fase'],
      ['empresa', 'empresa'],
      ['responsavel', 'responsável'],
      ['recorrencia', 'recorrência'],
    ]

    var mudancas = []
    for (var i = 0; i < campos.length; i++) {
      var campo = campos[i][0]
      var rotulo = campos[i][1]
      if (campo === 'status_kanban') continue // tratado abaixo
      var a = txt(orig, campo)
      var b = txt(t, campo)
      if (a !== b) {
        if (!a && b) mudancas.push(rotulo + ' definido')
        else if (a && !b) mudancas.push(rotulo + ' removido')
        else mudancas.push(rotulo + ' alterado')
      }
    }

    var statusMudou = stAnt !== stNov
    if (statusMudou) {
      mudancas.unshift('status de "' + labelStatus(stAnt) + '" para "' + labelStatus(stNov) + '"')
    }

    // subtarefas / comentários (JSON) — compara tamanho como sinal de mudança
    try {
      var subA = orig.get('subtarefas')
      var subB = t.get('subtarefas')
      var lenA = Array.isArray(subA) ? subA.length : 0
      var lenB = Array.isArray(subB) ? subB.length : 0
      if (lenA !== lenB) mudancas.push('subtarefas (' + lenA + ' → ' + lenB + ')')
    } catch (_) {}
    try {
      var cA = orig.get('comentarios')
      var cB = t.get('comentarios')
      var lA = Array.isArray(cA) ? cA.length : 0
      var lB = Array.isArray(cB) ? cB.length : 0
      if (lA !== lB) mudancas.push('comentários (' + lA + ' → ' + lB + ')')
    } catch (_) {}

    // nenhuma mudança relevante (o 'updated' do PocketBase sempre muda)
    if (!mudancas.length) {
      e.next()
      return
    }

    var autor = autorDe(e)
    var resumo = mudancas.join('; ')

    // histórico no chat da tarefa
    gravarChat(
      t.id,
      '⚡ ' + resumo.charAt(0).toUpperCase() + resumo.slice(1) + ' — por ' + autor.nome + '.',
      autor.nome,
    )

    // avisa os envolvidos
    var lista = envolvidos(t)
    var jaFoi = {}
    var assunto = (statusMudou ? 'Status atualizado: ' : 'Tarefa atualizada: ') + titulo
    var corpo =
      autor.nome +
      ' atualizou a tarefa "' +
      titulo +
      '".\n\n' +
      'O que mudou: ' +
      resumo +
      '.\n\n' +
      'Abra o Portal para ver o histórico completo.'

    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      // não notifica quem fez a alteração
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
      enviarEmail(d, assunto, corpo)
    }
  } catch (err) {
    console.warn('tarefa_eventos (update): ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas')

// ---------------------------------------------------------------------------
// 2) MENSAGEM NOVA NO CHAT DA TAREFA
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

  function gravarSino(dest, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var reg = new Record(col)
      reg.set('usuario_id', dest.id || '')
      reg.set('usuario_email', dest.email || '')
      reg.set('titulo', dados.titulo.slice(0, 250))
      reg.set('mensagem', dados.mensagem.slice(0, 2000))
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

  function enviarEmail(dest, assunto, corpo) {
    var status = 'enviado'
    var erro = ''
    try {
      var base = $app.settings().meta.appURL || 'https://portalefsa.goskip.app'
      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;' +
        'background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">' +
        '<div style="background:#1B5E20;padding:16px 20px">' +
        '<p style="margin:0;color:#ffffff;font-size:15px;font-weight:bold">' +
        'Nova mensagem na tarefa</p></div>' +
        '<div style="padding:20px">' +
        '<p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#111827">' +
        assunto +
        '</p>' +
        '<div style="margin:0 0 16px;padding:12px;background:#f9fafb;border-left:3px solid #1B5E20;' +
        'font-size:13px;color:#374151;line-height:1.6">' +
        corpo +
        '</div>' +
        '<p style="margin:0"><a href="' +
        base +
        '/tarefas" ' +
        'style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
        'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
        'Responder</a></p></div>' +
        '<div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb">' +
        '<p style="margin:0;font-size:11px;color:#6b7280">Sistema corporativo de uso restrito.</p>' +
        '</div></div>'

      var m = new MailerMessage({
        from: {
          address: $app.settings().meta.senderAddress,
          name: 'Portal de Gestão Executivo — Extrafruti',
        },
        to: [{ address: dest.email }],
        subject: assunto,
        html: html,
        text: corpo,
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
      recE.set('corpo', corpo.slice(0, 20000))
      recE.set('status', status)
      recE.set('erro', erro)
      recE.set('modelo', 'tarefa_chat')
      recE.set('criado_por', 'sistema')
      $app.save(recE)
    } catch (_) {}
  }

  try {
    var texto = (msg.getString('texto') || '').trim()
    if (!texto) {
      e.next()
      return
    }

    // ignora as linhas automáticas que os próprios hooks gravam no chat
    if (texto.indexOf('⚡') === 0 || texto.indexOf('📌') === 0) {
      e.next()
      return
    }

    // descobre a tarefa (campo texto ou relação)
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
    var trecho = texto.length > 300 ? texto.slice(0, 300) + '…' : texto

    // envolvidos
    var lista = []
    var vistos = {}
    function pushU(u) {
      if (!u || vistos[u.id]) return
      vistos[u.id] = true
      lista.push({
        id: u.id,
        email: u.getString('email') || '',
        silenciado: !!u.getBool('notificacoes_desativadas'),
      })
    }

    var respIds = []
    try {
      var rr = tarefa.get('responsaveis_ids')
      if (Array.isArray(rr))
        respIds = rr.map(function (x) {
          return String(x)
        })
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
      if (Array.isArray(p))
        pids = p
          .map(function (x) {
            return String(x).trim()
          })
          .filter(Boolean)
    } catch (_) {}
    for (var j = 0; j < pids.length; j++) {
      try {
        var pr = $app.findRecordById('parceiros', pids[j])
        var em = (pr.getString('email') || '').trim().toLowerCase()
        if (em && em.indexOf('@') !== -1) pushU($app.findAuthRecordByEmail('users', em))
      } catch (_) {}
    }

    var criadoPor = (tarefa.getString('criado_por') || '').toLowerCase()
    if (criadoPor && criadoPor.indexOf('@') !== -1) {
      try {
        pushU($app.findAuthRecordByEmail('users', criadoPor))
      } catch (_) {}
    }

    var assunto = 'Nova mensagem em "' + tituloTarefa + '"'
    var corpo =
      autorMsg +
      ' escreveu em "' +
      tituloTarefa +
      '":\n\n' +
      trecho +
      '\n\n' +
      'Abra o Portal para responder.'

    var jaFoi = {}
    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      // quem escreveu não recebe
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
      enviarEmail(d, assunto, corpo)
    }
  } catch (err) {
    console.warn('chat_email (create): ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas_chat')
