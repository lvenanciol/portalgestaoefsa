// ============================================================================
// NOTIFICAÇÕES DE TAREFAS — e-mail + sino com MATRIZ DE CANAIS (14/11/2026 v3)
//
// v3 acrescenta o gate da matriz configurada em Integrações > E-mail:
// desligar o toggle "E-mail" ou "Sino" de um evento REALMENTE impede o canal.
// Eventos: criada · alterada · concluida · chat
//
// Fail-open de propósito: sem registro na matriz (ou erro de leitura), os dois
// canais disparam. Perder uma notificação é pior do que ignorar uma preferência.
//
// O nome do remetente passa a vir também da tela (coleção integracoes_config,
// integracao="email_remetente") porque o secret não aceita acentos.
//
// REGRAS do runtime (JSVM/goja): todo helper DENTRO do callback; try/catch com
// e.next() no finally; autor da ação nunca recebe aviso.
// ============================================================================

onRecordAfterUpdateSuccess(function (e) {
  var t = e.record
  var orig = e.record ? e.record.original() : null
  if (!t || !orig) {
    e.next()
    return
  }

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
    // FONTE ÚNICA: a tela Integrações > E-mail (coleção integracoes_config,
    // integracao="email_remetente"). O secret EMAIL_REMETENTE_NOME foi
    // REMOVIDO em 14/11/2026 a pedido do dono — não existe mais e não é lido.
    // Fallback: settings da plataforma -> padrão ASCII.
    var n = ''
    {
      try {
        var ach = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_remetente"',
          '',
          1,
          0,
        )
        if (ach && ach.length) {
          var cfg = ach[0].get('config') || {}
          n = String(cfg.nome || '').trim()
        }
      } catch (_) {}
    }
    if (!n) {
      try {
        n = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    return n || 'Portal de Gestao Executivo - Extrafruti'
  }

  // Matriz de canais por evento (tela Integrações > E-mail).
  // Fail-open: sem registro ou erro de leitura, dispara os dois.
  function canaisDoEvento(evento) {
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

  // URL pública do Portal.
  //
  // BUG CORRIGIDO 14/11/2026: o link "clique para abrir" do e-mail caía no
  // host INTERNO do Skip (portal-...-b4d94.shrd01.internal.goskip.dev), que
  // responde {"message":"File not found.","status":404} para qualquer rota da
  // SPA. Causa: SITE_URL (secret) aponta para o host interno e era usado como
  // fallback. Agora a ordem é:
  //   1. PUBLIC_SITE_URL (secret novo, explícito)
  //   2. domínio público fixo do PGE
  //   3. settings().meta.appURL
  //   4. SITE_URL — só se for público (nunca *.shrd01.internal.goskip.dev)
  function baseUrl() {
    function publico(u) {
      var s = String(u || '').trim()
      if (!s) return ''
      if (s.indexOf('internal.goskip.dev') !== -1) return ''
      if (s.indexOf('localhost') !== -1) return ''
      return s
    }

    var b = ''
    try {
      b = publico($secrets.get('PUBLIC_SITE_URL'))
    } catch (_) {}
    if (!b) b = 'https://portalefsa.goskip.app'
    if (!b) {
      try {
        b = publico($app.settings().meta.appURL)
      } catch (_) {}
    }
    if (!b) {
      try {
        b = publico($secrets.get('SITE_URL'))
      } catch (_) {}
    }
    if (!b) b = 'https://portalefsa.goskip.app'
    return b.replace(/\/+$/, '')
  }

  // logos que devem ser anexados (cid) no próximo envio
  var logosAnexar = []

  function faixaLogos(usuarioRecord, empresaNome) {
    var base = baseUrl()
    var colLogosId = 'pbc_3701359284'
    var logos = []
    logosAnexar = []

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
              arquivo: arq,
              recId: rec.id,
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
              arquivo: a,
              recId: r.id,
              url: base + '/api/files/' + colLogosId + '/' + r.id + '/' + a,
            })
          }
        }
      } catch (_) {}
    }
    if (!logos.length) return ''
    // ------------------------------------------------------------------
    // 15/11/2026 — LOGO INLINE (cid), NÃO URL.
    //
    // O e-mail chegava com dois quadrados de imagem quebrada. Causa: o src
    // apontava para <host>/api/files/... e esse host é o INTERNO
    // (*.shrd01.internal.goskip.dev), que o Gmail não alcança. No domínio
    // público, /api/* devolve a SPA (HTML), não a imagem — testado.
    //
    // Solução: embutir a imagem no próprio e-mail como anexo com
    // `contentId` (referência cid:). É o formato que Gmail, Outlook e Apple
    // Mail respeitam, e não depende de rede nem de rota pública.
    //
    // O src de cada <img> passa a ser cid:<chave>, e as imagens são anexadas
    // pela função anexosLogos() na hora de enviar.
    // ------------------------------------------------------------------
    var imgs = ''
    for (var j = 0; j < logos.length; j++) {
      // o cid tem de ser o NOME DO ARQUIVO — é a chave do mapa
      // inlineAttachments que o PocketBase envia
      var nomeArq = String(logos[j].arquivo || '')
      if (!nomeArq) continue
      imgs +=
        '<img src="cid:' +
        nomeArq +
        '" alt="' +
        (logos[j].empresa || '') +
        '" title="' +
        (logos[j].empresa || '') +
        '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
        'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />'
    }
    // guarda no escopo do hook para o envio anexar as imagens
    try {
      logosAnexar = logos
    } catch (_) {}
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

  // -------------------------------------------------------------------------
  // 16/11/2026 — E-MAIL DESLIGADO PARA TAREFAS DE TRATAMENTO.
  //
  // Diretiva do dono: "desligue o e-mail em eventos de tratamento".
  //
  // MOTIVO: o Office 365 recusa conexões SMTP simultâneas. Salvar um
  // tratamento cria/atualiza várias tarefas de uma vez, e cada evento abria
  // uma conexão — o log encheu de:
  //     432 "4.3.2 Concurrent connections limit exceeded"
  //
  // O SINO continua funcionando: a notificação in-app é gravada normalmente.
  // Só o e-mail é suprimido, e SÓ para tarefas cujo vínculo é tratamento —
  // tarefas normais do PGE seguem enviando e-mail como antes.
  //
  // A detecção olha o registro da tarefa, sem consultar o banco (rápido).
  // -------------------------------------------------------------------------
  function ehTarefaDeTratamento(reg) {
    try {
      if (!reg) return false
      var vt = String((reg.getString ? reg.getString('vinculo_tipo') : reg.vinculo_tipo) || '')
        .trim()
        .toLowerCase()
      if (vt === 'tratamento') return true

      // fallback: origem/título do padrão da agenda
      var origem = String((reg.getString ? reg.getString('origem') : reg.origem) || '')
        .trim()
        .toLowerCase()
      var titulo = String((reg.getString ? reg.getString('titulo') : reg.titulo) || '')

      // "Tratamento · dd/mm/aaaa" ou "<Tipo> · dd/mm/aaaa"
      var padraoAgenda = /^(.+?)\s*·\s*\d{2}\/\d{2}\/\d{4}\s*$/.test(titulo)
      if (padraoAgenda && origem === 'projeto') return true

      return false
    } catch (_) {
      return false
    }
  }

  function enviarEmail(dest, assunto, html, texto, tarefaRef) {
    // e-mail suprimido para tarefa de tratamento (o sino já foi gravado)
    if (ehTarefaDeTratamento(tarefaRef)) {
      try {
        console.log(
          '[tarefa_eventos] e-mail suprimido (tarefa de tratamento): ' + String(dest.email || ''),
        )
      } catch (_) {}
      return
    }

    var status = 'enviado'
    var erro = ''
    try {
      // ------------------------------------------------------------------
      // 15/11/2026 — LOGO INLINE COM A API CORRETA.
      //
      // O Gmail mostrou "?" nos quadrados: o anexo não foi reconhecido.
      // Eu usava `attachments: [{filename, contentId, content}]` — formato
      // ERRADO. O MailerMessage do PocketBase espera um MAPA de readers:
      //
      //   attachments       : { "arquivo.png": <reader> }  → vai como arquivo
      //   inlineAttachments : { "arquivo.png": <reader> }  → resolvido via cid
      //
      // E o HTML referencia por `cid:<nome do arquivo>`.
      // Doc: pocketbase.io/jsvm/classes/MailerMessage.html (inlineAttachments)
      // ------------------------------------------------------------------
      var anexosInline = {}
      var readers = []
      try {
        for (var li = 0; li < logosAnexar.length; li++) {
          var lg = logosAnexar[li]
          if (!lg || !lg.arquivo) continue

          var caminhoCompleto = $filepath.join(
            $app.dataDir(),
            'storage',
            'pbc_3701359284',
            String(lg.recId),
            String(lg.arquivo),
          )

          try {
            var fL = $filesystem.fileFromPath(caminhoCompleto)
            if (!fL) {
              console.warn('tarefa_eventos: arquivo não encontrado ' + caminhoCompleto)
              continue
            }
            var rd = fL.reader.open()
            anexosInline[String(lg.arquivo)] = rd
            readers.push(rd)
          } catch (errArq) {
            console.warn(
              'tarefa_eventos: falha ao abrir ' + lg.arquivo + ': ' + String(errArq).slice(0, 120),
            )
          }
        }
      } catch (errL) {
        console.warn('tarefa_eventos: logos inline falharam: ' + String(errL).slice(0, 140))
      }

      var msg = new MailerMessage({
        from: { address: remetente(), name: nomeRemetente() },
        to: [{ address: dest.email }],
        subject: assunto,
        html: html,
        text: texto,
        inlineAttachments: anexosInline,
      })
      $app.newMailClient().send(msg)

      // fecha os readers depois do envio
      for (var ai = 0; ai < readers.length; ai++) {
        try {
          readers[ai].close()
        } catch (_c) {}
      }
      // limpa para o próximo destinatário não repetir os mesmos anexos
      logosAnexar = []
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

    // 18/11/2026 — SUBTAREFA NÃO DISPARA E-MAIL.
    // Medido: um PATCH de subtarefa levava ~7-8 s. O tempo era todo do envio
    // SÍNCRONO de e-mail: marcar um item de checklist mandava e-mail para
    // todos os envolvidos. Subtarefa é trabalho DENTRO da tarefa, não um
    // recado para terceiros — o sino registra, o e-mail não.
    // (Mantido comentado para não confundir quem ler o histórico.)
    // try {
    //   var sA = orig.get('subtarefas')
    //   var sB = t.get('subtarefas')
    //   var nA = Array.isArray(sA) ? sA.length : 0
    //   var nB = Array.isArray(sB) ? sB.length : 0
    //   if (nA !== nB) mudancas.push('subtarefas (' + nA + ' → ' + nB + ')')
    // } catch (_) {}
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
    var evento = statusMudou && stNov === 'concluido' ? 'concluida' : 'alterada'
    var canais = canaisDoEvento(evento)

    for (var n = 0; n < lista.length; n++) {
      var d = lista[n]
      var chave = d.id || d.email
      if (!chave || jaFoi[chave]) continue
      if (d.id && autor.id && d.id === autor.id) continue
      if (d.email && autor.email && d.email.toLowerCase() === autor.email.toLowerCase()) continue
      jaFoi[chave] = true
      if (d.silenciado) continue
      if (!d.email || d.email.indexOf('@') === -1) continue
      if (!canais.sino && !canais.email) continue

      if (canais.sino) {
        gravarSino(d, {
          titulo: assunto,
          mensagem: autor.nome + ' atualizou "' + titulo + '": ' + resumo + '.',
          tipo: statusMudou ? 'tarefa_status' : 'tarefa_atribuicao',
          tarefa_id: t.id,
          autor_nome: autor.nome,
          autor_email: autor.email,
        })
      }

      if (!canais.email) continue

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

      // passa o registro: o gate de tratamento suprime o e-mail (sino mantido)
      enviarEmail(d, assunto, html, texto, t)
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
    // FONTE ÚNICA: tela Integrações > E-mail. O secret EMAIL_REMETENTE_NOME
    // foi removido em 14/11/2026 e não é lido aqui.
    var n = ''
    {
      try {
        var ach = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_remetente"',
          '',
          1,
          0,
        )
        if (ach && ach.length) {
          var cfg = ach[0].get('config') || {}
          n = String(cfg.nome || '').trim()
        }
      } catch (_) {}
    }
    if (!n) {
      try {
        n = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    return n || 'Portal de Gestao Executivo - Extrafruti'
  }

  function canaisDoEvento(evento) {
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

  // Ver comentário no callback de atualização: URL sempre PÚBLICA.
  function baseUrl() {
    function publico(u) {
      var s = String(u || '').trim()
      if (!s) return ''
      if (s.indexOf('internal.goskip.dev') !== -1) return ''
      if (s.indexOf('localhost') !== -1) return ''
      return s
    }
    var b = ''
    try {
      b = publico($secrets.get('PUBLIC_SITE_URL'))
    } catch (_) {}
    if (!b) b = 'https://portalefsa.goskip.app'
    if (!b) {
      try {
        b = publico($app.settings().meta.appURL)
      } catch (_) {}
    }
    if (!b) {
      try {
        b = publico($secrets.get('SITE_URL'))
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

  // 16/11/2026 — mesmo gate do hook de tarefas: e-mail suprimido quando a
  // tarefa do chat pertence a um tratamento (o sino continua).
  function ehTarefaDeTratamentoChat(reg) {
    try {
      if (!reg) return false
      var vt = String((reg.getString ? reg.getString('vinculo_tipo') : reg.vinculo_tipo) || '')
        .trim()
        .toLowerCase()
      return vt === 'tratamento'
    } catch (_) {
      return false
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

  try {
    var texto = (msg.getString('texto') || '').trim()
    if (!texto) {
      e.next()
      return
    }

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

    var canais = canaisDoEvento('chat')
    if (!canais.sino && !canais.email) {
      e.next()
      return
    }

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

      if (canais.sino) {
        gravarSino(d, {
          titulo: assunto,
          mensagem: autorMsg + ': ' + trecho,
          tarefa_id: tarefaId,
          autor_nome: autorMsg,
          autor_email: autor.email,
        })
      }

      if (!canais.email) continue

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

      // e-mail suprimido se a tarefa do chat é de tratamento (sino mantido)
      var tarefaDoChat = null
      try {
        tarefaDoChat = $app.findRecordById('tarefas', tarefaId)
      } catch (_) {}
      if (ehTarefaDeTratamentoChat(tarefaDoChat)) {
        console.log('[chat_email] e-mail suprimido (tarefa de tratamento)')
      } else {
        enviarEmail(d, assunto, html, txtPlano)
      }
    }
  } catch (err) {
    console.warn('chat_email (create): ' + String(err).slice(0, 200))
  } finally {
    e.next()
  }
}, 'tarefas_chat')
