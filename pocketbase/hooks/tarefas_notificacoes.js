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

    var todosNomes = [respNome].concat(nomesParceiros).filter(Boolean)
    for (var k = 0; k < todosNomes.length; k++) {
      var n = todosNomes[k]
      var nLimpo = n.replace(/^\[[^\]]+\]\s*/, '').trim()
      if (!nLimpo) continue

      try {
        var primeiroNome = nLimpo.split(/\s+/)[0]
        if (primeiroNome && primeiroNome.length >= 3) {
          var usersAchados = $app.findRecordsByFilter(
            'users',
            'name ~ "' + primeiroNome + '"',
            '',
            10,
            0,
          )
          for (var u = 0; u < usersAchados.length; u++) {
            var usr = usersAchados[u]
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

    var todosNomes = [respNome].concat(nomesParceiros).filter(Boolean)
    for (var k = 0; k < todosNomes.length; k++) {
      var n = todosNomes[k]
      var nLimpo = n.replace(/^\[[^\]]+\]\s*/, '').trim()
      if (!nLimpo) continue

      try {
        var primeiroNome = nLimpo.split(/\s+/)[0]
        if (primeiroNome && primeiroNome.length >= 3) {
          var usersAchados = $app.findRecordsByFilter(
            'users',
            'name ~ "' + primeiroNome + '"',
            '',
            10,
            0,
          )
          for (var u = 0; u < usersAchados.length; u++) {
            var usr = usersAchados[u]
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

    if (!statusMudou && !respMudou && !parceirosMudou) {
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
        criarNotificacao(env, {
          titulo: tituloNotif,
          mensagem: corpoMensagem,
          tipo: tipoNotif,
          tarefa_id: t.id,
          rota: '/tarefas',
          autor_nome: autor.nome,
          autor_email: autor.email,
        })
      }
    }
  } catch (err) {
    console.warn('Erro no hook onRecordAfterUpdateSuccess de tarefas:', err)
  } finally {
    return e.next()
  }
}, 'tarefas')
