// ============================================================================
// NOTIFICAÇÕES DE TAREFAS — e-mail + sino (matriz de canais)
// Eventos: alterada · concluida · chat
//
// ============================================================================
// 19/11/2026 — FILA DE E-MAIL (o botão "Enviar" do chat travava ~8 s)
//
// MEDIDO no log do PocketBase:
//   "[chat_email] SMTP para ...: 3230ms"
//   "[chat_email] SMTP para ...: 3507ms"
//   "[chat_email] TOTAL no hook: 7ms"   <- o hook em si leva 7 ms
//
// Caminhos testados e DESCARTADOS neste JSVM:
//   · $app.onTerminate().add -> "Object has no member 'add'"
//   · $app.go(...)           -> "Object has no member 'go'"
//   · setTimeout(fn, 0)      -> existe, mas roda o callback ANTES de a
//                               resposta HTTP sair: era ele o gargalo.
//
// SOLUÇÃO: 1 insert em `emails_fila` (~1 ms) e resposta imediata. O hook
// `emails_fila_cron.js` drena a fila a cada minuto, fora do request.
//
// ATENÇÃO DE RUNTIME (lição cara): o JSVM executa cada callback num pool de
// VM separado — função declarada no TOPO do arquivo NÃO é visível dentro do
// callback ("Hook scoping error"). TODO helper tem de ficar DENTRO do corpo
// de cada callback. É por isso que este arquivo repete blocos.
// ============================================================================

onRecordAfterUpdateSuccess(function (e) {
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
    var m = {
      triagem: 'Triagem',
      a_fazer: 'A Fazer',
      em_andamento: 'Em Andamento',
      bloqueado: 'Bloqueado',
      concluido: 'Concluído',
    }
    return m[k] || s || 'Triagem'
  }
  function idsDe(raw) {
    if (!raw) return []
    try {
      var p = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(p))
        return p
          .map(function (x) {
            return String(x).trim()
          })
          .filter(Boolean)
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
  function remetente() {
    var a = ''
    try {
      a = String($secrets.get('EMAIL_REMETENTE') || '').trim()
    } catch (_) {}
    if (!a) {
      try {
        a = String($app.settings().meta.senderAddress || '').trim()
      } catch (_) {}
    }
    return a
  }
  function nomeRemetente() {
    var n = ''
    try {
      var ach = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
        '',
        1,
        0,
      )
      if (ach && ach.length) n = String((ach[0].get('config') || {}).nome || '').trim()
    } catch (_) {}
    if (!n) {
      try {
        n = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    return n || 'Portal de Gestao Executivo - Extrafruti'
  }
  function canais(evento) {
    var padrao = { email: true, sino: true }
    try {
      var ach = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_notificacoes"',
        '',
        1,
        0,
      )
      if (!ach || !ach.length) return padrao
      var cfg = ach[0].get('config') || {}
      var no = cfg['tarefas'] && cfg['tarefas'][evento]
      if (!no) return padrao
      return {
        email: no.email === undefined ? true : !!no.email,
        sino: no.sino === undefined ? true : !!no.sino,
      }
    } catch (_) {
      return padrao
    }
  }
  function baseUrl() {
    function pub(u) {
      var s = String(u || '').trim()
      if (!s) return ''
      if (s.indexOf('internal.goskip.dev') !== -1) return ''
      if (s.indexOf('localhost') !== -1) return ''
      return s
    }
    var b = ''
    try {
      b = pub($secrets.get('PUBLIC_SITE_URL'))
    } catch (_) {}
    if (!b) b = 'https://portalefsa.goskip.app'
    return b.replace(/\/+$/, '')
  }
  function agora() {
    try {
      var d = new Date()
      function p(n) {
        return String(n).padStart(2, '0')
      }
      return (
        p(d.getDate()) +
        '/' +
        p(d.getMonth() + 1) +
        '/' +
        d.getFullYear() +
        ' ' +
        p(d.getHours()) +
        ':' +
        p(d.getMinutes())
      )
    } catch (_) {
      return ''
    }
  }
  function sino(dest, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var r = new Record(col)
      r.set('usuario_id', dest.id || '')
      r.set('usuario_email', dest.email || '')
      r.set('titulo', String(dados.titulo).slice(0, 250))
      r.set('mensagem', String(dados.mensagem).slice(0, 2000))
      r.set('tipo', dados.tipo || 'sistema')
      r.set('tarefa_id', String(dados.tarefa_id || ''))
      r.set('rota', '/tarefas')
      r.set('autor_nome', dados.autor_nome || '')
      r.set('autor_email', dados.autor_email || '')
      r.set('lida', false)
      $app.save(r)
    } catch (err) {
      console.warn('[sino] falhou: ' + String(err).slice(0, 140))
    }
  }
  function chat(tarefaId, texto, autorNome) {
    if (!tarefaId) return
    try {
      var col = $app.findCollectionByNameOrId('tarefas_chat')
      var reg = new Record(col)
      reg.set('tarefa_id', String(tarefaId))
      reg.set('tarefa', String(tarefaId))
      reg.set('autor', autorNome || 'Sistema')
      reg.set('autor_tipo', 'portal')
      reg.set('texto', texto)
      $app.save(reg)
    } catch (err) {
      console.warn('[chat] falhou: ' + String(err).slice(0, 140))
    }
  }
  // logos inline (cid) — URL do host interno não carrega no Gmail
  function logosCid(usuarioRecord, empresaNome) {
    var colId = 'pbc_3701359284'
    var logos = []
    function add(nomeEmp) {
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
          if (arq) logos.push({ empresa: rec.getString('empresa'), arquivo: arq, recId: rec.id })
        }
      } catch (_) {}
    }
    if (empresaNome) add(empresaNome)
    if (!logos.length) {
      try {
        var todas = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
        for (var i = 0; i < (todas || []).length; i++) {
          var r = todas[i]
          var a = r.getString('logo') || r.getString('emblema')
          if (a) logos.push({ empresa: r.getString('empresa'), arquivo: a, recId: r.id })
        }
      } catch (_) {}
    }
    if (!logos.length) return { html: '', anexos: {}, readers: [] }
    var imgs = ''
    var anexos = {}
    var readers = []
    for (var j = 0; j < logos.length; j++) {
      var lg = logos[j]
      if (!lg.arquivo) continue
      try {
        var cam = $filepath.join(
          $app.dataDir(),
          'storage',
          colId,
          String(lg.recId),
          String(lg.arquivo),
        )
        var f = $filesystem.fileFromPath(cam)
        if (f) {
          var rd = f.reader.open()
          anexos[String(lg.arquivo)] = rd
          readers.push(rd)
        }
      } catch (_) {}
      imgs +=
        '<img src="cid:' +
        lg.arquivo +
        '" alt="' +
        (lg.empresa || '') +
        '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
        'margin:0 12px;vertical-align:middle;border:0" />'
    }
    return {
      html:
        '<div style="background:#fff;padding:18px 20px;border:1px solid #e5e7eb;' +
        'border-bottom:0;text-align:center">' +
        imgs +
        '</div>',
      anexos: anexos,
      readers: readers,
    }
  }
  function htmlMsg(o) {
    var linhas = ''
    function l(rot, val) {
      if (!val) return
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280;width:130px">' +
        rot +
        '</td><td style="padding:6px 0">' +
        val +
        '</td></tr>'
    }
    l('Tarefa', o.tarefa ? '<b>' + o.tarefa + '</b>' : '')
    l('Empresa', o.empresa)
    l('De', o.autor)
    l('Quando', o.quando)
    if (o.link)
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Acesso direto</td>' +
        '<td style="padding:6px 0"><a href="' +
        o.link +
        '" style="color:#1B5E20;font-weight:bold">clique para abrir</a></td></tr>'
    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      (o.logos || '') +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse"><tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
      '<strong style="font-size:15px">' +
      o.barra +
      '</strong><span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Portal de Gestão Executivo · Grupo Extrafruti</span></td></tr></table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0">' +
      '<h2 style="margin:0 0 12px;font-size:16px">' +
      o.destaque +
      '</h2><p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      o.destinatario +
      '</strong>!</p>' +
      (o.intro ? '<p style="font-size:14px;line-height:1.6">' + o.intro + '</p>' : '') +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      linhas +
      '</table>' +
      (o.conteudo || '') +
      (o.link
        ? '<p style="margin:0 0 16px"><a href="' +
          o.link +
          '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
          'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
          (o.botao || 'Abrir a tarefa') +
          '</a></p>'
        : '') +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;' +
      'font-size:12px;color:#92400e">Você recebe este aviso por participar da tarefa. ' +
      'O histórico completo fica no Portal.</div>' +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso ' +
      'restrito. Grupo Extrafruti · Casafruti · FoldBox</p></div></div>'
    )
  }
  // envio síncrono: só fallback (fila falhou)
  function enviarAgora(destEmail, assunto, h, texto) {
    var status = 'enviado'
    var erro = ''
    try {
      var m = new MailerMessage({
        from: { address: remetente(), name: nomeRemetente() },
        to: [{ address: destEmail }],
        subject: assunto,
        html: h,
        text: texto,
      })
      var t0 = new Date().getTime()
      $app.newMailClient().send(m)
      console.log('[email] SMTP ' + destEmail + ': ' + (new Date().getTime() - t0) + 'ms')
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 480)
      console.warn('[email] falhou ' + destEmail + ': ' + erro)
    }
    try {
      var colE = $app.findCollectionByNameOrId('emails')
      var rE = new Record(colE)
      rE.set('para', destEmail)
      rE.set('assunto', assunto)
      rE.set('corpo', String(texto).slice(0, 20000))
      rE.set('status', status)
      rE.set('erro', erro)
      rE.set('modelo', 'tarefa')
      rE.set('criado_por', 'sistema')
      $app.save(rE)
    } catch (_) {}
  }
  function enfileirar(destEmail, assunto, h, texto, modelo) {
    try {
      var col = $app.findCollectionByNameOrId('emails_fila')
      var r = new Record(col)
      r.set('para', String(destEmail || '').slice(0, 190))
      r.set('assunto', String(assunto || '').slice(0, 190))
      r.set('corpo_texto', String(texto || '').slice(0, 40000))
      r.set('corpo_html', String(h || '').slice(0, 200000))
      r.set('status', 'pendente')
      r.set('modelo', String(modelo || 'tarefa').slice(0, 60))
      r.set('tentativas', 0)
      $app.save(r)
      return true
    } catch (errF) {
      console.log('[fila] falhou, enviando sincrono: ' + String(errF).slice(0, 140))
      return false
    }
  }
  function envia(destEmail, assunto, h, texto, modelo) {
    if (!enfileirar(destEmail, assunto, h, texto, modelo)) enviarAgora(destEmail, assunto, h, texto)
  }
  function ehTratamento(reg) {
    try {
      if (!reg) return false
      return (
        String(reg.getString('vinculo_tipo') || '')
          .toLowerCase()
          .trim() === 'tratamento'
      )
    } catch (_) {
      return false
    }
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
    var rIds = idsDe(rec.get('responsaveis_ids'))
    for (var i = 0; i < rIds.length; i++) {
      try {
        push($app.findRecordById('users', rIds[i]))
      } catch (_) {}
    }
    var pIds = idsDe(rec.get('parceiros'))
    for (var j = 0; j < pIds.length; j++) {
      var em = ''
      var nm = ''
      try {
        var pr = $app.findRecordById('parceiros', pIds[j])
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
            var a = $app.findRecordsByFilter('users', 'name ~ "' + p1 + '"', '', 5, 0)
            for (var k = 0; k < a.length; k++) push(a[k])
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
          var b = $app.findRecordsByFilter('users', 'name ~ "' + pr1 + '"', '', 5, 0)
          for (var m = 0; m < b.length; m++) push(b[m])
        } catch (_) {}
      }
    }
    var cr = txt(rec, 'criado_por').toLowerCase()
    if (cr && cr.indexOf('@') !== -1) {
      try {
        push($app.findAuthRecordByEmail('users', cr))
      } catch (_) {}
    }
    return out
  }

  try {
    var t = e.record
    var orig = t ? t.original() : null
    if (!t || !orig) {
      e.next()
      return
    }
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
      var a1 = txt(orig, campos[i][0])
      var b1 = txt(t, campos[i][0])
      if (a1 !== b1) {
        if (!a1 && b1) mudancas.push(campos[i][1] + ' definido')
        else if (a1 && !b1) mudancas.push(campos[i][1] + ' removido')
        else mudancas.push(campos[i][1] + ' alterado')
      }
    }
    var statusMudou = stAnt !== stNov
    if (statusMudou)
      mudancas.unshift('status de "' + labelStatus(stAnt) + '" para "' + labelStatus(stNov) + '"')

    if (!mudancas.length) {
      e.next()
      return
    }

    var autor = autorDe(e)
    var resumo = mudancas.join('; ')
    var empresaNome = txt(t, 'empresa')
    chat(
      t.id,
      '⚡ ' + resumo.charAt(0).toUpperCase() + resumo.slice(1) + ' — por ' + autor.nome + '.',
      autor.nome,
    )

    var lista = envolvidos(t)
    var jaFoi = {}
    var assunto = (statusMudou ? 'Tarefa atualizada: ' : 'Tarefa alterada: ') + titulo
    var link = baseUrl() + '/tarefas?tarefa=' + encodeURIComponent(String(t.id))
    var quando = agora()
    var evento = statusMudou && stNov === 'concluido' ? 'concluida' : 'alterada'
    var cn = canais(evento)

    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      if (d.id && autor.id && d.id === autor.id) continue
      if (d.email && autor.email && d.email.toLowerCase() === autor.email.toLowerCase()) continue
      jaFoi[chave] = true
      if (d.silenciado) continue
      if (!d.email || d.email.indexOf('@') === -1) continue
      if (!cn.sino && !cn.email) continue

      if (cn.sino)
        sino(d, {
          titulo: assunto,
          mensagem: autor.nome + ' atualizou "' + titulo + '": ' + resumo + '.',
          tipo: statusMudou ? 'tarefa_status' : 'tarefa_atribuicao',
          tarefa_id: t.id,
          autor_nome: autor.nome,
          autor_email: autor.email,
        })
      if (!cn.email) continue
      if (ehTratamento(t)) {
        console.log('[tarefa_email] e-mail suprimido (tratamento): ' + d.email)
        continue
      }

      var lg = logosCid(d.rec, empresaNome)
      var h = htmlMsg({
        logos: lg.html,
        barra: statusMudou ? 'Tarefa atualizada' : 'Tarefa alterada',
        destaque: assunto,
        destinatario: d.nome,
        intro: autor.nome + ' fez uma atualização em uma tarefa da qual você participa.',
        tarefa: titulo,
        empresa: empresaNome,
        autor: autor.nome + (autor.email ? ' (' + autor.email + ')' : ''),
        quando: quando,
        link: link,
        botao: 'Abrir a tarefa',
        conteudo:
          '<div style="margin:14px 0;padding:12px;background:#f9fafb;border-left:3px solid #1B5E20;' +
          'font-size:13px;color:#374151;line-height:1.6"><strong>O que mudou</strong><br/>' +
          resumo +
          '</div>',
      })
      var txtP =
        'Olá, ' +
        d.nome +
        '!\n\n' +
        autor.nome +
        ' atualizou a tarefa "' +
        titulo +
        '".\n\nO que mudou: ' +
        resumo +
        '\n' +
        (empresaNome ? 'Empresa: ' + empresaNome + '\n' : '') +
        'Quando: ' +
        quando +
        '\n\nAbrir a tarefa: ' +
        link +
        '\n\nSistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox'
      envia(d.email, assunto, h, txtP, 'tarefa_atualizacao')
      for (var ri = 0; ri < lg.readers.length; ri++) {
        try {
          lg.readers[ri].close()
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[tarefa_eventos] update: ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas')

// ===========================================================================
// NOVA MENSAGEM NO CHAT DA TAREFA
// ===========================================================================
onRecordAfterCreateSuccess(function (e) {
  function idsDe(raw) {
    if (!raw) return []
    try {
      var p = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (Array.isArray(p))
        return p
          .map(function (x) {
            return String(x).trim()
          })
          .filter(Boolean)
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
  function remetente() {
    var a = ''
    try {
      a = String($secrets.get('EMAIL_REMETENTE') || '').trim()
    } catch (_) {}
    if (!a) {
      try {
        a = String($app.settings().meta.senderAddress || '').trim()
      } catch (_) {}
    }
    return a
  }
  function nomeRemetente() {
    var n = ''
    try {
      var ach = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
        '',
        1,
        0,
      )
      if (ach && ach.length) n = String((ach[0].get('config') || {}).nome || '').trim()
    } catch (_) {}
    if (!n) {
      try {
        n = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    return n || 'Portal de Gestao Executivo - Extrafruti'
  }
  function canais(evento) {
    var padrao = { email: true, sino: true }
    try {
      var ach = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_notificacoes"',
        '',
        1,
        0,
      )
      if (!ach || !ach.length) return padrao
      var cfg = ach[0].get('config') || {}
      var no = cfg['tarefas'] && cfg['tarefas'][evento]
      if (!no) return padrao
      return {
        email: no.email === undefined ? true : !!no.email,
        sino: no.sino === undefined ? true : !!no.sino,
      }
    } catch (_) {
      return padrao
    }
  }
  function baseUrl() {
    function pub(u) {
      var s = String(u || '').trim()
      if (!s) return ''
      if (s.indexOf('internal.goskip.dev') !== -1) return ''
      if (s.indexOf('localhost') !== -1) return ''
      return s
    }
    var b = ''
    try {
      b = pub($secrets.get('PUBLIC_SITE_URL'))
    } catch (_) {}
    if (!b) b = 'https://portalefsa.goskip.app'
    return b.replace(/\/+$/, '')
  }
  function agora() {
    try {
      var d = new Date()
      function p(n) {
        return String(n).padStart(2, '0')
      }
      return (
        p(d.getDate()) +
        '/' +
        p(d.getMonth() + 1) +
        '/' +
        d.getFullYear() +
        ' ' +
        p(d.getHours()) +
        ':' +
        p(d.getMinutes())
      )
    } catch (_) {
      return ''
    }
  }
  function sino(dest, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var r = new Record(col)
      r.set('usuario_id', dest.id || '')
      r.set('usuario_email', dest.email || '')
      r.set('titulo', String(dados.titulo).slice(0, 250))
      r.set('mensagem', String(dados.mensagem).slice(0, 2000))
      // 19/11/2026 — o select de `notificacoes.tipo` aceita apenas
      // tarefa_status | tarefa_atribuicao | tarefa_triagem | sistema.
      // Eu gravava 'tarefa_chat' e o PocketBase rejeitava a gravação
      // ("tipo: Invalid value tarefa_chat") — o sino do chat nunca entrava.
      // Uso 'sistema' (valor válido); o vínculo com a tarefa segue em
      // `tarefa_id` + `rota`.
      r.set('tipo', 'sistema')
      r.set('tarefa_id', String(dados.tarefa_id || ''))
      r.set('rota', '/tarefas')
      r.set('autor_nome', dados.autor_nome || '')
      r.set('autor_email', dados.autor_email || '')
      r.set('lida', false)
      $app.save(r)
    } catch (err) {
      console.warn('[sino] falhou: ' + String(err).slice(0, 140))
    }
  }
  function logosCid(usuarioRecord, empresaNome) {
    var colId = 'pbc_3701359284'
    var logos = []
    function add(nomeEmp) {
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
          if (arq) logos.push({ empresa: rec.getString('empresa'), arquivo: arq, recId: rec.id })
        }
      } catch (_) {}
    }
    if (empresaNome) add(empresaNome)
    if (!logos.length) {
      try {
        var todas = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
        for (var i = 0; i < (todas || []).length; i++) {
          var r = todas[i]
          var a = r.getString('logo') || r.getString('emblema')
          if (a) logos.push({ empresa: r.getString('empresa'), arquivo: a, recId: r.id })
        }
      } catch (_) {}
    }
    if (!logos.length) return { html: '', anexos: {}, readers: [] }
    var imgs = ''
    var anexos = {}
    var readers = []
    for (var j = 0; j < logos.length; j++) {
      var lg = logos[j]
      if (!lg.arquivo) continue
      try {
        var cam = $filepath.join(
          $app.dataDir(),
          'storage',
          colId,
          String(lg.recId),
          String(lg.arquivo),
        )
        var f = $filesystem.fileFromPath(cam)
        if (f) {
          var rd = f.reader.open()
          anexos[String(lg.arquivo)] = rd
          readers.push(rd)
        }
      } catch (_) {}
      imgs +=
        '<img src="cid:' +
        lg.arquivo +
        '" alt="' +
        (lg.empresa || '') +
        '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
        'margin:0 12px;vertical-align:middle;border:0" />'
    }
    return {
      html:
        '<div style="background:#fff;padding:18px 20px;border:1px solid #e5e7eb;' +
        'border-bottom:0;text-align:center">' +
        imgs +
        '</div>',
      anexos: anexos,
      readers: readers,
    }
  }
  function htmlMsg(o) {
    var linhas = ''
    function l(rot, val) {
      if (!val) return
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280;width:130px">' +
        rot +
        '</td><td style="padding:6px 0">' +
        val +
        '</td></tr>'
    }
    l('Tarefa', o.tarefa ? '<b>' + o.tarefa + '</b>' : '')
    l('Empresa', o.empresa)
    l('De', o.autor)
    l('Quando', o.quando)
    if (o.link)
      linhas +=
        '<tr><td style="padding:6px 0;color:#6b7280">Acesso direto</td>' +
        '<td style="padding:6px 0"><a href="' +
        o.link +
        '" style="color:#1B5E20;font-weight:bold">clique para abrir</a></td></tr>'
    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      (o.logos || '') +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse"><tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
      '<strong style="font-size:15px">' +
      o.barra +
      '</strong><span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Portal de Gestão Executivo · Grupo Extrafruti</span></td></tr></table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0">' +
      '<h2 style="margin:0 0 12px;font-size:16px">' +
      o.destaque +
      '</h2><p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      o.destinatario +
      '</strong>!</p>' +
      (o.intro ? '<p style="font-size:14px;line-height:1.6">' + o.intro + '</p>' : '') +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      linhas +
      '</table>' +
      (o.conteudo || '') +
      (o.link
        ? '<p style="margin:0 0 16px"><a href="' +
          o.link +
          '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
          'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">' +
          (o.botao || 'Responder no Portal') +
          '</a></p>'
        : '') +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;' +
      'font-size:12px;color:#92400e">Você recebe este aviso por participar da tarefa. ' +
      'O histórico completo fica no Portal.</div>' +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso ' +
      'restrito. Grupo Extrafruti · Casafruti · FoldBox</p></div></div>'
    )
  }
  function enviarAgora(destEmail, assunto, h, texto) {
    var status = 'enviado'
    var erro = ''
    try {
      var m = new MailerMessage({
        from: { address: remetente(), name: nomeRemetente() },
        to: [{ address: destEmail }],
        subject: assunto,
        html: h,
        text: texto,
      })
      var t0 = new Date().getTime()
      $app.newMailClient().send(m)
      console.log('[chat_email] SMTP ' + destEmail + ': ' + (new Date().getTime() - t0) + 'ms')
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 480)
      console.warn('[chat_email] falhou ' + destEmail + ': ' + erro)
    }
    try {
      var colE = $app.findCollectionByNameOrId('emails')
      var rE = new Record(colE)
      rE.set('para', destEmail)
      rE.set('assunto', assunto)
      rE.set('corpo', String(texto).slice(0, 20000))
      rE.set('status', status)
      rE.set('erro', erro)
      rE.set('modelo', 'tarefa_chat')
      rE.set('criado_por', 'sistema')
      $app.save(rE)
    } catch (_) {}
  }
  function enfileirar(destEmail, assunto, h, texto) {
    try {
      var col = $app.findCollectionByNameOrId('emails_fila')
      var r = new Record(col)
      r.set('para', String(destEmail || '').slice(0, 190))
      r.set('assunto', String(assunto || '').slice(0, 190))
      r.set('corpo_texto', String(texto || '').slice(0, 40000))
      r.set('corpo_html', String(h || '').slice(0, 200000))
      r.set('status', 'pendente')
      r.set('modelo', 'tarefa_chat')
      r.set('tentativas', 0)
      $app.save(r)
      return true
    } catch (errF) {
      console.log('[chat_email] fila falhou: ' + String(errF).slice(0, 140))
      return false
    }
  }

  try {
    var msg = e.record
    if (!msg) {
      e.next()
      return
    }
    var texto = (msg.getString('texto') || '').trim()
    if (!texto) {
      e.next()
      return
    }
    // linhas automáticas do sistema não notificam
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

    var cn = canais('chat')
    if (!cn.sino && !cn.email) {
      e.next()
      return
    }

    // participantes: responsáveis + parceiros/contatos + criador
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
    var rIds = idsDe(tarefa.get('responsaveis_ids'))
    for (var i = 0; i < rIds.length; i++) {
      try {
        pushU($app.findRecordById('users', rIds[i]))
      } catch (_) {}
    }
    var pIds = idsDe(tarefa.get('parceiros'))
    for (var j = 0; j < pIds.length; j++) {
      try {
        var pr = $app.findRecordById('parceiros', pIds[j])
        var em = (pr.getString('email') || '').trim().toLowerCase()
        if (em && em.indexOf('@') !== -1) pushU($app.findAuthRecordByEmail('users', em))
      } catch (_) {}
    }
    var cr = (tarefa.getString('criado_por') || '').toLowerCase()
    if (cr && cr.indexOf('@') !== -1) {
      try {
        pushU($app.findAuthRecordByEmail('users', cr))
      } catch (_) {}
    }

    var ehTrat = false
    try {
      ehTrat =
        String(tarefa.getString('vinculo_tipo') || '')
          .toLowerCase()
          .trim() === 'tratamento'
    } catch (_) {}
    if (ehTrat) console.log('[chat_email] e-mail suprimido (tratamento)')

    var assunto = 'Nova mensagem em "' + tituloTarefa + '"'
    var link = baseUrl() + '/tarefas?tarefa=' + encodeURIComponent(tarefaId)
    var quando = agora()
    var jaFoi = {}
    var enfileirados = 0

    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      if (d.id && autor.id && d.id === autor.id) continue
      if (d.email && autor.email && d.email.toLowerCase() === autor.email.toLowerCase()) continue
      jaFoi[chave] = true
      if (d.silenciado || !d.email || d.email.indexOf('@') === -1) continue

      if (cn.sino)
        sino(d, {
          titulo: assunto,
          mensagem: autorMsg + ': ' + trecho,
          tarefa_id: tarefaId,
          autor_nome: autorMsg,
          autor_email: autor.email,
        })
      if (!cn.email || ehTrat) continue

      var lg = logosCid(d.rec, empresaNome)
      var h = htmlMsg({
        logos: lg.html,
        barra: 'Nova mensagem na tarefa',
        destaque: assunto,
        destinatario: d.nome,
        intro: autorMsg + ' enviou uma mensagem em uma tarefa da qual você participa.',
        tarefa: tituloTarefa,
        empresa: empresaNome,
        autor: autorMsg + (autor.email ? ' (' + autor.email + ')' : ''),
        quando: quando,
        link: link,
        botao: 'Responder no Portal',
        conteudo:
          '<div style="margin:14px 0;padding:12px;background:#f9fafb;border-left:3px solid #1B5E20;' +
          'font-size:13px;color:#374151;line-height:1.6"><strong>' +
          autorMsg +
          '</strong> escreveu:<br/>' +
          trecho +
          '</div>',
      })
      var txtP =
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
        '\n\nResponder: ' +
        link +
        '\n\nSistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox'

      if (!enfileirar(d.email, assunto, h, txtP)) enviarAgora(d.email, assunto, h, txtP)
      enfileirados++
      for (var ri = 0; ri < lg.readers.length; ri++) {
        try {
          lg.readers[ri].close()
        } catch (_) {}
      }
    }

    console.log('[chat_email] destinatarios=' + lista.length + ' enfileirados=' + enfileirados)
  } catch (err) {
    console.warn('[chat_email] create: ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas_chat')
