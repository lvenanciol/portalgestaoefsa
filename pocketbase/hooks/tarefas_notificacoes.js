// Hook centralizado de notificações para o módulo Tarefas & Agenda
// Em PocketBase JSVM, todas as funções auxiliares precisam estar declaradas
// DENTRO de cada callback para evitar escopo compartilhado/ReferenceError.

// Disparador ao CRIAR tarefa
onRecordAfterCreateSuccess(function (e) {
  function normalizarStatus(s) {
    if (!s) return 'triagem'
    var val = String(s).toLowerCase().trim()
    if (val === 'concluida') return 'concluido'
    return val
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

  function parseParceiroIds(raw) {
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

  function resolverEnvolvidos(tarefa) {
    var envolvidos = []
    var vistos = {}
    var respNome = (tarefa.getString ? tarefa.getString('responsavel') : tarefa.responsavel) || ''
    respNome = String(respNome).trim()

    var parceiroIds = parseParceiroIds(
      tarefa.getString ? tarefa.getString('parceiros') : tarefa.parceiros,
    )

    var emailsParceiros = []
    var nomesParceiros = []
    for (var i = 0; i < parceiroIds.length; i++) {
      try {
        var pRecord = $app.findRecordById('parceiros', parceiroIds[i])
        if (pRecord) {
          var em = pRecord.getString('email')
          if (em && em.trim()) emailsParceiros.push(em.trim().toLowerCase())
          var nm = pRecord.getString('nome')
          if (nm && nm.trim()) nomesParceiros.push(nm.trim())
        }
      } catch (_) {}
    }

    for (var j = 0; j < emailsParceiros.length; j++) {
      var emailBusca = emailsParceiros[j]
      try {
        var uRecord = $app.findAuthRecordByEmail('users', emailBusca)
        if (uRecord && !vistos[uRecord.id]) {
          vistos[uRecord.id] = true
          envolvidos.push({
            id: uRecord.id,
            email: uRecord.getString('email'),
            nome: uRecord.getString('name') || uRecord.getString('email'),
            desativadas: !!uRecord.getBool('notificacoes_desativadas'),
          })
        }
      } catch (_) {}
    }

    // =====================================================================
    // 18/11/2026 — CASAMENTO ESTRITO POR NOME.
    //
    // DEFEITO ENCONTRADO NO LOG: a busca era `name ~ "<primeiroNome>"`, então
    // "Leonardo Lourenço" (responsável) casava TAMBÉM com "[ CEO ] Leonardo".
    // A tarefa de uma pessoa notificava a outra — notificação para quem não é
    // responsável nem parceiro, exatamente o que a diretiva proíbe.
    //
    // Correção: primeiro tenta o NOME COMPLETO normalizado (sem tag, sem
    // acento, case-insensitive). Só aceita o casamento por primeiro nome se
    // houver UM único candidato — com dois "Leonardo" na base, ninguém é
    // notificado por aproximação (melhor não avisar do que avisar errado).
    // =====================================================================
    function normNome(v) {
      return String(v || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/\[[^\]]*\]/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    var todosNomes = [respNome].concat(nomesParceiros).filter(Boolean)
    for (var k = 0; k < todosNomes.length; k++) {
      var n = todosNomes[k]
      var alvoNorm = normNome(n)
      if (!alvoNorm) continue

      try {
        // 1) nome completo exato
        var exatos = []
        var candidatos = $app.findRecordsByFilter('users', "id != ''", '', 500, 0)
        for (var c = 0; c < candidatos.length; c++) {
          if (normNome(candidatos[c].getString('name')) === alvoNorm) exatos.push(candidatos[c])
        }

        // 2) sem exato, primeiro nome — só se for único
        if (exatos.length === 0) {
          var primeiroNome = alvoNorm.split(' ')[0]
          if (primeiroNome && primeiroNome.length >= 3) {
            var porPrimeiro = []
            for (var c2 = 0; c2 < candidatos.length; c2++) {
              if (normNome(candidatos[c2].getString('name')).split(' ')[0] === primeiroNome)
                porPrimeiro.push(candidatos[c2])
            }
            if (porPrimeiro.length === 1) exatos = porPrimeiro
          }
        }

        for (var u = 0; u < exatos.length; u++) {
          var usr = exatos[u]
          if (!vistos[usr.id]) {
            vistos[usr.id] = true
            envolvidos.push({
              id: usr.id,
              email: usr.getString('email'),
              nome: usr.getString('name') || usr.getString('email'),
              desativadas: !!usr.getBool('notificacoes_desativadas'),
            })
          }
        }
      } catch (_) {}
    }

    return envolvidos
  }

  function obterAutorInfo(ev) {
    var authRecord = null
    try {
      var reqInfo = ev.requestInfo ? ev.requestInfo() : null
      authRecord = reqInfo && reqInfo.authRecord ? reqInfo.authRecord : null
    } catch (_) {}

    var id = authRecord ? authRecord.id : ''
    var email = authRecord ? authRecord.getString('email') : ''
    var nome = authRecord ? authRecord.getString('name') || email : 'Sistema'

    return { id: id, email: email, nome: nome }
  }

  function registrarNoChat(tarefaId, texto, autorNome) {
    var tid = String(tarefaId || '').trim()
    if (!tid) {
      // Não grava registro órfão se não tiver tarefa válida
      return
    }
    try {
      var col = $app.findCollectionByNameOrId('tarefas_chat')
      var reg = new Record(col)
      reg.set('tarefa_id', tid)
      reg.set('autor', autorNome || 'Sistema')
      // Schema de tarefas_chat permite apenas 'portal' | 'parceiro'
      reg.set('autor_tipo', 'portal')
      reg.set('texto', texto)
      $app.save(reg)
    } catch (err) {
      console.warn('Erro ao registrar histórico no tarefas_chat:', err)
    }
  }

  function criarNotificacao(destinatario, dados) {
    // ===================================================================
    // 18/11/2026 — GRAVAÇÃO POR SQL DIRETO.
    //
    // DIAGNÓSTICO (com log em produção): no CREATE o hook disparava,
    // resolvia o envolvido corretamente (1 pessoa) e NÃO pulava ninguém —
    // mas nada era gravado e nenhum erro aparecia. Via API REST os mesmos
    // campos gravavam 200. Ou seja: o `$app.save(new Record(...))` dentro
    // deste callback de CREATE não persistia, sem exceção.
    //
    // Solução: INSERT direto, que não depende de getter/setter nem da
    // validação da coleção — mesmo padrão já usado na auditoria deste
    // projeto. O UPDATE continua pelo caminho normal (funciona).
    // ===================================================================
    try {
      var nid = $security.randomString(15)
      var agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          'INSERT INTO notificacoes (id, usuario_id, usuario_email, titulo, mensagem, tipo, tarefa_id, rota, autor_nome, autor_email, lida, created, updated) ' +
            'VALUES ({:id}, {:uid}, {:uemail}, {:tit}, {:msg}, {:tipo}, {:tarefa}, {:rota}, {:anome}, {:aemail}, false, {:now}, {:now})',
        )
        .bind({
          id: nid,
          uid: String(destinatario.id || ''),
          uemail: String(destinatario.email || ''),
          tit: String(dados.titulo || '').slice(0, 250),
          msg: String(dados.mensagem || '').slice(0, 2000),
          tipo: String(dados.tipo || 'sistema'),
          tarefa: String(dados.tarefa_id || ''),
          rota: String(dados.rota || '/tarefas'),
          anome: String(dados.autor_nome || ''),
          aemail: String(dados.autor_email || ''),
          now: agora,
        })
        .execute()
      console.log(
        '[notif-sino] GRAVOU via SQL: ' +
          String(destinatario.email) +
          ' tipo=' +
          String(dados.tipo),
      )
    } catch (errSql) {
      console.log('[notif-sino] FALHA SQL: ' + String(errSql))
    }
  }

  function criarNotificacaoAntiga(destinatario, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var reg = new Record(col)
      reg.set('usuario_id', destinatario.id || '')
      reg.set('usuario_email', destinatario.email || '')
      reg.set('titulo', dados.titulo)
      reg.set('mensagem', dados.mensagem)
      reg.set('tipo', dados.tipo)
      reg.set('tarefa_id', dados.tarefa_id)
      reg.set('rota', dados.rota || '/tarefas')
      reg.set('autor_nome', dados.autor_nome)
      reg.set('autor_email', dados.autor_email)
      reg.set('lida', false)
      $app.save(reg)
    } catch (err) {
      // 18/11/2026 — o catch anterior engolia a causa com console.warn e o
      // registro simplesmente não existia. Agora sobe o motivo real.
      console.log('[notif-sino] FALHA ao salvar notificacao: ' + String(err))
      try {
        console.log(
          '[notif-sino] campos: usuario_id=' +
            String(destinatario.id) +
            ' email=' +
            String(destinatario.email) +
            ' tipo=' +
            String(dados.tipo) +
            ' tarefa_id=' +
            String(dados.tarefa_id),
        )
      } catch (_) {}
    }
  }

  try {
    var t = e.record
    if (!t) return e.next()

    var status = normalizarStatus(t.getString('status_kanban') || t.getString('status'))
    var resp = (t.getString('responsavel') || '').trim()
    var parceiros = parseParceiroIds(t.getString('parceiros'))
    var autor = obterAutorInfo(e)

    var estaNaTriagem = status === 'triagem'
    var temAtribuicao = resp.length > 0 || parceiros.length > 0
    var saiuDaTriagem = !estaNaTriagem

    if (estaNaTriagem && !temAtribuicao) {
      return e.next()
    }

    var tituloTarefa = t.getString('titulo') || 'Sem título'

    if (saiuDaTriagem || temAtribuicao) {
      var tipoEvento = saiuDaTriagem ? 'tarefa_triagem' : 'tarefa_atribuicao'
      var textoMudanca = saiuDaTriagem
        ? 'Tarefa iniciada diretamente na fase "' + labelStatus(status) + '"'
        : 'Tarefa criada com atribuição de responsável'

      registrarNoChat(t.id, '📌 ' + textoMudanca + ' por ' + autor.nome + '.', autor.nome)

      var envolvidos = resolverEnvolvidos(t)
      for (var i = 0; i < envolvidos.length; i++) {
        var env = envolvidos[i]
        if (env.id && autor.id && env.id === autor.id) continue
        if (env.email && autor.email && env.email.toLowerCase() === autor.email.toLowerCase())
          continue

        if (!env.desativadas) {
          criarNotificacao(env, {
            titulo: 'Nova tarefa atribuída: ' + tituloTarefa,
            mensagem:
              autor.nome +
              ' atribuiu a tarefa "' +
              tituloTarefa +
              '" na fase "' +
              labelStatus(status) +
              '".',
            tipo: tipoEvento,
            tarefa_id: t.id,
            rota: '/tarefas',
            autor_nome: autor.nome,
            autor_email: autor.email,
          })
        }
      }
    }
  } catch (err) {
    console.warn('Erro no hook onRecordAfterCreateSuccess de tarefas:', err)
  } finally {
    return e.next()
  }
}, 'tarefas')

// Disparador ao ATUALIZAR tarefa (mudança de status, atribuição ou saída de triagem)
onRecordAfterUpdateSuccess(function (e) {
  function normalizarStatus(s) {
    if (!s) return 'triagem'
    var val = String(s).toLowerCase().trim()
    if (val === 'concluida') return 'concluido'
    return val
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

  function parseParceiroIds(raw) {
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

  function resolverEnvolvidos(tarefa) {
    var envolvidos = []
    var vistos = {}
    var respNome = (tarefa.getString ? tarefa.getString('responsavel') : tarefa.responsavel) || ''
    respNome = String(respNome).trim()

    var parceiroIds = parseParceiroIds(
      tarefa.getString ? tarefa.getString('parceiros') : tarefa.parceiros,
    )

    var emailsParceiros = []
    var nomesParceiros = []
    for (var i = 0; i < parceiroIds.length; i++) {
      try {
        var pRecord = $app.findRecordById('parceiros', parceiroIds[i])
        if (pRecord) {
          var em = pRecord.getString('email')
          if (em && em.trim()) emailsParceiros.push(em.trim().toLowerCase())
          var nm = pRecord.getString('nome')
          if (nm && nm.trim()) nomesParceiros.push(nm.trim())
        }
      } catch (_) {}
    }

    for (var j = 0; j < emailsParceiros.length; j++) {
      var emailBusca = emailsParceiros[j]
      try {
        var uRecord = $app.findAuthRecordByEmail('users', emailBusca)
        if (uRecord && !vistos[uRecord.id]) {
          vistos[uRecord.id] = true
          envolvidos.push({
            id: uRecord.id,
            email: uRecord.getString('email'),
            nome: uRecord.getString('name') || uRecord.getString('email'),
            desativadas: !!uRecord.getBool('notificacoes_desativadas'),
          })
        }
      } catch (_) {}
    }

    // 18/11/2026 — mesmo casamento ESTRITO do create (ver explicação lá):
    // nome completo primeiro; primeiro nome só se for único na base.
    function normNome(v) {
      return String(v || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/\[[^\]]*\]/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    var todosNomes = [respNome].concat(nomesParceiros).filter(Boolean)
    for (var k = 0; k < todosNomes.length; k++) {
      var alvoNorm = normNome(todosNomes[k])
      if (!alvoNorm) continue

      try {
        var exatos = []
        var candidatos = $app.findRecordsByFilter('users', "id != ''", '', 500, 0)
        for (var c = 0; c < candidatos.length; c++) {
          if (normNome(candidatos[c].getString('name')) === alvoNorm) exatos.push(candidatos[c])
        }
        if (exatos.length === 0) {
          var primeiroNome = alvoNorm.split(' ')[0]
          if (primeiroNome && primeiroNome.length >= 3) {
            var porPrimeiro = []
            for (var c2 = 0; c2 < candidatos.length; c2++) {
              if (normNome(candidatos[c2].getString('name')).split(' ')[0] === primeiroNome)
                porPrimeiro.push(candidatos[c2])
            }
            if (porPrimeiro.length === 1) exatos = porPrimeiro
          }
        }
        for (var u = 0; u < exatos.length; u++) {
          var usr = exatos[u]
          if (!vistos[usr.id]) {
            vistos[usr.id] = true
            envolvidos.push({
              id: usr.id,
              email: usr.getString('email'),
              nome: usr.getString('name') || usr.getString('email'),
              desativadas: !!usr.getBool('notificacoes_desativadas'),
            })
          }
        }
      } catch (_) {}
    }

    return envolvidos
  }

  function obterAutorInfo(ev) {
    var authRecord = null
    try {
      var reqInfo = ev.requestInfo ? ev.requestInfo() : null
      authRecord = reqInfo && reqInfo.authRecord ? reqInfo.authRecord : null
    } catch (_) {}

    var id = authRecord ? authRecord.id : ''
    var email = authRecord ? authRecord.getString('email') : ''
    var nome = authRecord ? authRecord.getString('name') || email : 'Sistema'

    return { id: id, email: email, nome: nome }
  }

  function registrarNoChat(tarefaId, texto, autorNome) {
    var tid = String(tarefaId || '').trim()
    if (!tid) {
      return
    }
    try {
      var col = $app.findCollectionByNameOrId('tarefas_chat')
      var reg = new Record(col)
      reg.set('tarefa_id', tid)
      reg.set('autor', autorNome || 'Sistema')
      reg.set('autor_tipo', 'portal')
      reg.set('texto', texto)
      $app.save(reg)
    } catch (err) {
      console.warn('Erro ao registrar histórico no tarefas_chat:', err)
    }
  }

  function criarNotificacao(destinatario, dados) {
    try {
      var col = $app.findCollectionByNameOrId('notificacoes')
      var reg = new Record(col)
      reg.set('usuario_id', destinatario.id || '')
      reg.set('usuario_email', destinatario.email || '')
      reg.set('titulo', dados.titulo)
      reg.set('mensagem', dados.mensagem)
      reg.set('tipo', dados.tipo)
      reg.set('tarefa_id', dados.tarefa_id)
      reg.set('rota', dados.rota || '/tarefas')
      reg.set('autor_nome', dados.autor_nome)
      reg.set('autor_email', dados.autor_email)
      reg.set('lida', false)
      $app.save(reg)
    } catch (err) {
      console.warn('Erro ao criar registro em notificacoes:', err)
    }
  }

  /**
   * (4) 17/11/2026 — E-MAIL ALÉM DO SINO.
   *
   * A diretiva pede "e-mail E sino" em toda atualização. O envio usa o mesmo
   * cliente de e-mail já configurado no projeto, com o mesmo remetente das
   * notificações de tarefa. Falha de e-mail NÃO impede o sino: só registra.
   */
  function enviarEmailAlerta(destinatario, dados, tituloTarefa) {
    var email = String(destinatario.email || '').trim()
    if (!email || email.indexOf('@') < 0) return
    try {
      // respeita a matriz de canais (Integrações > E-mail)
      var usaEmail = true
      try {
        var cfg = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_notificacoes"',
          '',
          1,
          0,
        )
        if (cfg && cfg.length) {
          var c = cfg[0].get('config') || {}
          var no = c['tarefas'] && c['tarefas']['alterada']
          if (no && no.email === false) usaEmail = false
        }
      } catch (_) {}
      if (!usaEmail) return

      var remetente = ''
      var nomeRemetente = 'Portal de Gestão Executivo'
      try {
        var cfgR = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_remetente"',
          '',
          1,
          0,
        )
        if (cfgR && cfgR.length) {
          var cr = cfgR[0].get('config') || {}
          if (cr.remetente) remetente = String(cr.remetente)
          if (cr.nome) nomeRemetente = String(cr.nome)
        }
      } catch (_) {}
      if (!remetente) {
        try {
          remetente = String($app.settings().meta.senderAddress || '')
        } catch (_) {}
      }
      if (!remetente) return

      var base = 'https://portal-de-gestao-executivo-b4d94.goskip.app'
      var link = base + '/tarefas?tarefa=' + dados.tarefa_id

      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">' +
        '<div style="background:#1B5E20;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">' +
        '<h2 style="margin:0;font-size:17px;">' +
        dados.titulo +
        '</h2></div>' +
        '<div style="border:1px solid #E5E7EB;border-top:0;padding:20px 22px;border-radius:0 0 8px 8px;">' +
        '<p style="margin:0 0 12px;font-size:14px;color:#111827;">' +
        'Olá, ' +
        (destinatario.nome || '') +
        '.</p>' +
        '<p style="margin:0 0 16px;font-size:14px;color:#374151;">' +
        dados.mensagem +
        '</p>' +
        '<a href="' +
        link +
        '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
        'padding:11px 20px;border-radius:999px;font-size:13px;font-weight:700;">Abrir a tarefa</a>' +
        '<p style="margin:18px 0 0;font-size:11px;color:#6B7280;">' +
        'Sistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox</p>' +
        '</div></div>'

      var texto = dados.titulo + '\n\n' + dados.mensagem + '\n\nAbrir a tarefa: ' + link

      var msg = new MailerMessage({
        from: { address: remetente, name: nomeRemetente },
        to: [{ address: email }],
        subject: dados.titulo,
        html: html,
        text: texto,
      })
      $app.newMailClient().send(msg)
    } catch (err) {
      console.warn('[notificacoes] e-mail falhou para ' + email + ': ' + String(err).slice(0, 140))
    }
  }

  try {
    var t = e.record
    if (!t) return e.next()
    var orig = e.record.original()
    if (!orig) return e.next()

    var statusAntigo = normalizarStatus(orig.getString('status_kanban') || orig.getString('status'))
    var statusNovo = normalizarStatus(t.getString('status_kanban') || t.getString('status'))

    var respAntigo = (orig.getString('responsavel') || '').trim()
    var respNovo = (t.getString('responsavel') || '').trim()

    var parcAntigos = parseParceiroIds(orig.getString('parceiros'))
    var parcNovos = parseParceiroIds(t.getString('parceiros'))

    var statusMudou = statusAntigo !== statusNovo
    var respMudou = respAntigo !== respNovo
    var parceirosMudou = JSON.stringify(parcAntigos.sort()) !== JSON.stringify(parcNovos.sort())

    // ---------------------------------------------------------------------
    // 17/11/2026 — (4) NOTIFICAR EM QUALQUER ATUALIZAÇÃO.
    //
    // DIRETIVA: "sempre que uma tarefa for atualizada de qualquer forma,
    // enviar e-mail e sino de alerta para os usuários envolvidos".
    //
    // Antes eu saía cedo quando status, responsável e parceiros não mudavam —
    // então alterar título, descrição, prazo, prioridade, subtarefas ou anexos
    // não avisava ninguém.
    //
    // Agora detecto QUALQUER campo relevante alterado e descrevo a mudança.
    // ---------------------------------------------------------------------
    function txt(reg, campo) {
      try {
        var v = reg.getString ? reg.getString(campo) : reg[campo]
        return v === null || v === undefined ? '' : String(v).trim()
      } catch (_) {
        return ''
      }
    }

    // =====================================================================
    // 18/11/2026 — LENTIDÃO AO MARCAR SUBTAREFA (7 s por clique)
    //
    // CAUSA MEDIDA: um PATCH de subtarefa levava ~7.000 ms, enquanto a mesma
    // leitura levava 26 ms. O tempo ia todo no envio SÍNCRONO de e-mail
    // disparado porque `subtarefas` estava entre os campos vigiados — marcar
    // um item de checklist mandava e-mail para todos os envolvidos.
    //
    // REGRA NOVA: subtarefa e anexo são trabalho DENTRO da tarefa, não
    // "atualização da tarefa" para terceiros. Mudam o registro e o sino fica
    // silencioso; e-mail só para o que a pessoa precisa saber (título,
    // descrição, prazo, prioridade, recorrência, empresa).
    //
    // O SINO continua registrando a alteração (não custa rede).
    // =====================================================================
    var camposVigiados = [
      ['titulo', 'título'],
      ['descricao', 'descrição'],
      ['prazo', 'prazo'],
      ['prioridade_p', 'prioridade'],
      ['recorrencia', 'recorrência'],
      ['empresa', 'empresa'],
    ]

    var mudancas = []
    for (var ci = 0; ci < camposVigiados.length; ci++) {
      var campoC = camposVigiados[ci][0]
      var rotuloC = camposVigiados[ci][1]
      var aC = txt(orig, campoC)
      var bC = txt(t, campoC)
      if (aC !== bC) {
        if (!aC && bC) mudancas.push(rotuloC + ' definido')
        else if (aC && !bC) mudancas.push(rotuloC + ' removido')
        else mudancas.push(rotuloC + ' alterado')
      }
    }

    if (!statusMudou && !respMudou && !parceirosMudou && !mudancas.length) {
      return e.next()
    }

    var autor = obterAutorInfo(e)
    var tituloTarefa = t.getString('titulo') || 'Sem título'

    var saiuDaTriagem = statusAntigo === 'triagem' && statusNovo !== 'triagem'

    var partesMudanca = []
    if (saiuDaTriagem) {
      partesMudanca.push('saiu da Triagem e entrou em "' + labelStatus(statusNovo) + '"')
    } else if (statusMudou) {
      partesMudanca.push(
        'status alterado de "' +
          labelStatus(statusAntigo) +
          '" para "' +
          labelStatus(statusNovo) +
          '"',
      )
    }

    if (respMudou) {
      if (respNovo) {
        partesMudanca.push('responsável definido como "' + respNovo + '"')
      } else {
        partesMudanca.push('responsável removido')
      }
    }

    if (parceirosMudou) {
      partesMudanca.push(
        'parceiros/contatos responsáveis atualizados (' + parcNovos.length + ' vinculados)',
      )
    }

    // (4) campos gerais alterados (título, descrição, prazo, prioridade...)
    for (var mi = 0; mi < mudancas.length; mi++) {
      partesMudanca.push(mudancas[mi])
    }

    var resumoMudanca = partesMudanca.join('; ')

    registrarNoChat(t.id, '⚡ ' + resumoMudanca + ' por ' + autor.nome + '.', autor.nome)

    var envolvidos = resolverEnvolvidos(t)
    var notificados = {}

    var tipoNotif = statusMudou ? 'tarefa_status' : 'tarefa_atribuicao'
    var tituloNotif = statusMudou
      ? 'Mudança de status: ' + tituloTarefa
      : 'Atribuição atualizada: ' + tituloTarefa

    var corpoMensagem =
      autor.nome + ' alterou a tarefa "' + tituloTarefa + '": ' + resumoMudanca + '.'

    for (var i = 0; i < envolvidos.length; i++) {
      var env = envolvidos[i]
      var chave = env.id || env.email
      if (!chave || notificados[chave]) continue

      if (env.id && autor.id && env.id === autor.id) continue
      if (env.email && autor.email && env.email.toLowerCase() === autor.email.toLowerCase())
        continue

      notificados[chave] = true

      if (!env.desativadas) {
        var dadosNotif = {
          titulo: tituloNotif,
          mensagem: corpoMensagem,
          tipo: tipoNotif,
          tarefa_id: t.id,
          rota: '/tarefas',
          autor_nome: autor.nome,
          autor_email: autor.email,
        }
        criarNotificacao(env, dadosNotif)
        // (4) e-mail além do sino, na mesma atualização
        enviarEmailAlerta(env, dadosNotif, tituloTarefa)
      }
    }
  } catch (err) {
    console.warn('Erro no hook onRecordAfterUpdateSuccess de tarefas:', err)
  } finally {
    return e.next()
  }
}, 'tarefas')
