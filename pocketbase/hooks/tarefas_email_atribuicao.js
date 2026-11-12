// E-mail de "Nova tarefa atribuída" (12/11/2026)
// Quando uma tarefa é criada (ou editada) atribuindo usuários, cada usuário
// atribuído (NUNCA o autor) recebe um e-mail PT-BR com:
//   (a) a NOVA tarefa em DESTAQUE (badge "Nova tarefa atribuída");
//   (b) a lista das tarefas existentes não concluídas em que ele é
//       responsável ou participante (mesmo critério de vínculo do sino).
// Resolução de envolvidos IGUAL ao hook do sino (tarefas_notificacoes.js):
// campo real de atribuição é o texto 'responsavel' (ex.: "[ MNT ] Alexandre")
// + o JSON 'parceiros' (ids de parceiros) — 'responsaveis_ids' NÃO é usado
// pela interface (fica vazio; legado).
// Regras do projeto respeitadas:
//  - toda a lógica INLINE dentro de cada callback (JSVM não vê top-level);
//  - falha de e-mail NUNCA impede a criação/edição da tarefa (try/catch + e.next());
//  - mesmo padrão visual dos e-mails transacionais (logomarcas + barra verde);
//  - usuário sem e-mail válido é simplesmente pulado.

// Disparador ao CRIAR tarefa
onRecordAfterCreateSuccess(function (e) {
  try {
    var t = e.record
    if (!t) return e.next()

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

    function limparNome(n) {
      return String(n || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .trim()
    }

    function semAcento(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/á|à|â|ã/g, 'a')
        .replace(/é|ê/g, 'e')
        .replace(/í/g, 'i')
        .replace(/ó|ô|õ/g, 'o')
        .replace(/ú|ü/g, 'u')
        .replace(/ç/g, 'c')
    }

    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    function dataBR(iso) {
      var s = String(iso || '')
      if (s.length < 10) return ''
      return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
    }

    // Envolvidos: usuários vinculados aos parceiros da tarefa + usuário cujo
    // nome casa com o texto do campo responsavel (mesma heurística do sino).
    function resolverEnvolvidos(tarefa) {
      var vistos = {}
      var envolvidos = []

      function pushUser(usr) {
        if (!usr) return
        if (vistos[usr.id]) return
        vistos[usr.id] = true
        envolvidos.push({
          id: usr.id,
          email: usr.getString('email') || '',
          nome: usr.getString('name') || usr.getString('email') || '',
          pid: usr.getString('parceiro_id') || '',
        })
      }

      var parceiroIds = parseIds(tarefa.getString('parceiros'))
      for (var i = 0; i < parceiroIds.length; i++) {
        var pRecord = null
        try {
          pRecord = $app.findRecordById('parceiros', parceiroIds[i])
        } catch (_) {}
        if (!pRecord) continue

        // 1) usuário do portal com parceiro_id apontando para o parceiro
        try {
          var usersVinc = $app.findRecordsByFilter(
            'users',
            'parceiro_id = "' + parceiroIds[i] + '"',
            '',
            5,
            0,
          )
          for (var a = 0; a < usersVinc.length; a++) pushUser(usersVinc[a])
        } catch (_) {}

        // 2) fallback: e-mail do parceiro igual ao login de um usuário
        var emParc = (pRecord.getString('email') || '').trim().toLowerCase()
        if (emParc && emParc.indexOf('@') !== -1) {
          try {
            pushUser($app.findAuthRecordByEmail('users', emParc))
          } catch (_) {}
        }
      }

      var respNome = limparNome(tarefa.getString('responsavel'))
      if (respNome) {
        var primeiro = respNome.split(/\s+/)[0]
        if (primeiro && primeiro.length >= 3) {
          try {
            var usersNome = $app.findRecordsByFilter(
              'users',
              'name ~ "' + primeiro.replace(/"/g, '\\"') + '"',
              '',
              10,
              0,
            )
            var respNorm = semAcento(respNome)
            for (var b = 0; b < usersNome.length; b++) {
              var nomeUser = semAcento(limparNome(usersNome[b].getString('name')))
              if (respNorm === nomeUser || respNorm.indexOf(nomeUser) !== -1) {
                pushUser(usersNome[b])
              }
            }
          } catch (_) {}
        }
      }

      return envolvidos
    }

    // Lista (título/prazo/empresa) das tarefas em aberto do usuário
    function linhasListaPara(usuario) {
      var linhas = []
      var pid = usuario.pid
      var primeiroUsuario = limparNome(usuario.nome).split(/\s+/)[0]
      var primeiroNorm = semAcento(primeiroUsuario)
      try {
        var todas = $app.findRecordsByFilter(
          'tarefas',
          'id != "' + t.id + '" && status != "concluida" && status_kanban != "concluido"',
          '-created',
          200,
          0,
        )
        for (var k = 0; k < todas.length; k++) {
          var tt = todas[k]
          var ehDele = false
          if (pid) {
            var pids = parseIds(tt.getString('parceiros'))
            if (pids.indexOf(pid) !== -1) ehDele = true
          }
          if (!ehDele && primeiroNorm && primeiroNorm.length >= 3) {
            var respTarefa = semAcento(limparNome(tt.getString('responsavel')))
            if (respTarefa.indexOf(primeiroNorm) !== -1) ehDele = true
          }
          if (!ehDele) continue
          linhas.push({
            titulo: tt.getString('titulo') || 'Sem título',
            prazo: tt.getString('prazo') || '',
            empresa: tt.getString('empresa') || '',
          })
          if (linhas.length >= 15) break
        }
      } catch (_) {}
      // Mais antigas primeiro na exibição
      linhas.sort(function (a, b) {
        return String(a.prazo).localeCompare(String(b.prazo))
      })
      return linhas
    }

    function logomarcasHtmlPara(usuario) {
      var nomes = []
      try {
        var empId = usuario.empresaId
        if (empId) nomes.push($app.findRecordById('empresas', empId).getString('nome'))
      } catch (_) {}
      try {
        var uniId = usuario.unidadeId
        if (uniId) {
          var empU = $app.findRecordById('unidades', uniId).getString('empresa_id')
          if (empU) nomes.push($app.findRecordById('empresas', empU).getString('nome'))
        }
      } catch (_) {}

      var logos = []
      if (base) {
        for (var i = 0; i < nomes.length; i++) {
          try {
            var empEsc = nomes[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            var ach = $app.findRecordsByFilter(
              'logomarcas',
              'ativo = true && empresa = "' + empEsc + '"',
              'empresa',
              1,
              0,
            )
            if (ach && ach.length > 0) {
              var rec = ach[0]
              var arq = rec.getString('logo') || rec.getString('emblema')
              if (arq)
                logos.push({
                  empresa: rec.getString('empresa'),
                  url: base + '/api/files/pbc_3701359284/' + rec.id + '/' + arq,
                })
            }
          } catch (_) {}
        }
        if (logos.length === 0) {
          try {
            var todasL = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
            for (var j = 0; j < todasL.length; j++) {
              var r2 = todasL[j]
              var arq2 = r2.getString('logo') || r2.getString('emblema')
              if (arq2)
                logos.push({
                  empresa: r2.getString('empresa'),
                  url: base + '/api/files/pbc_3701359284/' + r2.id + '/' + arq2,
                })
            }
          } catch (_) {}
        }
      }
      if (logos.length === 0) return ''
      return (
        '<tr><td style="background:#ffffff;padding:18px 20px;border:1px solid #e5e7eb;' +
        'border-top:0;border-bottom:0;text-align:center">' +
        logos
          .map(function (l) {
            return (
              '<img src="' +
              l.url +
              '" alt="' +
              esc(l.empresa) +
              '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
              'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />'
            )
          })
          .join('') +
        '</td></tr>'
      )
    }

    // Autor (quem criou) — nunca recebe o próprio e-mail
    var autorId = ''
    var autorEmail = ''
    var autorNome = 'Sistema'
    try {
      var reqInfo = e.requestInfo ? e.requestInfo() : null
      var auth = reqInfo && reqInfo.authRecord ? reqInfo.authRecord : null
      if (auth) {
        autorId = auth.id
        autorEmail = auth.getString('email') || ''
        autorNome = auth.getString('name') || autorEmail || 'Sistema'
      }
    } catch (_) {}

    var tituloTarefa = t.getString('titulo') || 'Sem título'
    var descricao = t.getString('descricao') || ''
    var prazo = t.getString('prazo') || ''
    var empresa = t.getString('empresa') || ''
    var statusK = t.getString('status_kanban') || t.getString('status') || ''

    var base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($os.getenv('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/$/, '').replace(/\/$/, '')

    var envolvidos = resolverEnvolvidos(t)
    for (var ui = 0; ui < envolvidos.length; ui++) {
      var usuario = envolvidos[ui]
      if (autorId && usuario.id === autorId) continue
      if (autorEmail && usuario.email.toLowerCase() === autorEmail.toLowerCase()) continue

      var emailDest = (usuario.email || '').trim()
      if (!emailDest || emailDest.indexOf('@') === -1) continue // sem e-mail válido: pula
      var nomeDest = usuario.nome || emailDest

      try {
        var uFull = $app.findRecordById('users', usuario.id)
        usuario.empresaId = uFull.getString('empresa_id') || ''
        usuario.unidadeId = uFull.getString('unidade_id') || ''
      } catch (_) {}

      var lista = linhasListaPara(usuario)

      var linhasHtml = lista
        .map(function (it, ix) {
          return (
            '<li style="padding:4px 0;border-bottom:1px solid #f3f4f6">' +
            '<strong>' +
            esc(it.titulo) +
            '</strong>' +
            (it.prazo
              ? ' <span style="color:#6b7280">— prazo ' + esc(dataBR(it.prazo)) + '</span>'
              : '') +
            (it.empresa ? ' <span style="color:#6b7280">[' + esc(it.empresa) + ']</span>' : '') +
            '</li>'
          )
        })
        .join('')

      var blocoNova =
        '<div style="border:2px solid #1B5E20;border-radius:8px;padding:14px;margin:14px 0;background:#f0fdf4">' +
        '<span style="display:inline-block;background:#1B5E20;color:#fff;font-size:11px;font-weight:bold;' +
        'padding:3px 10px;border-radius:999px;margin-bottom:8px">NOVA TAREFA ATRIBUÍDA</span>' +
        '<h3 style="margin:0 0 6px;font-size:16px;color:#111827">' +
        esc(tituloTarefa) +
        '</h3>' +
        (descricao
          ? '<p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 8px;white-space:pre-line">' +
            esc(descricao) +
            '</p>'
          : '') +
        '<table style="font-size:13px;border-collapse:collapse">' +
        (prazo
          ? '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Prazo</td>' +
            '<td style="padding:4px 0;font-weight:bold">' +
            esc(dataBR(prazo)) +
            '</td></tr>'
          : '') +
        (empresa
          ? '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Empresa</td>' +
            '<td style="padding:4px 0">' +
            esc(empresa) +
            '</td></tr>'
          : '') +
        '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Fase</td><td style="padding:4px 0">' +
        esc(statusK || 'triagem') +
        '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Atribuída por</td>' +
        '<td style="padding:4px 0">' +
        esc(autorNome) +
        '</td></tr>' +
        '</table></div>'

      var blocoLista = linhasHtml
        ? '<p style="font-size:14px;font-weight:bold;margin:18px 0 4px">' +
          'Suas tarefas em aberto (' +
          lista.length +
          ')</p>' +
          '<ul style="font-size:13px;color:#374151;margin:0 0 0 18px;padding:0">' +
          linhasHtml +
          '</ul>'
        : '<p style="font-size:13px;color:#6b7280;margin:16px 0 0">Você não tem outras tarefas em aberto no momento.</p>'

      var assunto = 'Nova tarefa atribuída: ' + tituloTarefa + ' — Portal de Gestão Executivo'

      var linhasTxt = lista
        .map(function (it) {
          return (
            '- ' +
            it.titulo +
            (it.prazo ? ' (prazo ' + dataBR(it.prazo) + ')' : '') +
            (it.empresa ? ' [' + it.empresa + ']' : '')
          )
        })
        .join('\n')

      var corpoTexto =
        'Olá, ' +
        nomeDest +
        '!\n\n' +
        'Uma nova tarefa foi atribuída a você no Portal de Gestão Executivo.\n\n' +
        '=== NOVA TAREFA ATRIBUÍDA ===\n' +
        tituloTarefa +
        '\n' +
        (prazo ? 'Prazo: ' + dataBR(prazo) + '\n' : '') +
        (empresa ? 'Empresa: ' + empresa + '\n' : '') +
        'Atribuída por: ' +
        autorNome +
        '\n\n' +
        '=== SUAS TAREFAS EM ABERTO ===\n' +
        (linhasTxt || 'Nenhuma outra tarefa em aberto.') +
        '\n\nAcesse: ' +
        (base ? base : 'https://portalefsa.goskip.app') +
        '/tarefas\n\n' +
        'Equipe de TI — Grupo Extrafruti · Casafruti · FoldBox'

      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
        'style="border-collapse:collapse">' +
        logomarcasHtmlPara(usuario) +
        '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
        '<strong style="font-size:15px">Portal de Gestão Executivo</strong>' +
        '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
        'Grupo Extrafruti · Casafruti · FoldBox</span></td></tr>' +
        '</table>' +
        '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
        '<h2 style="margin:0 0 12px;font-size:16px">Olá, ' +
        esc(nomeDest) +
        '! Uma nova tarefa foi atribuída a você</h2>' +
        blocoNova +
        blocoLista +
        '<p style="margin:18px 0 0">' +
        '<a href="' +
        (base || 'https://portalefsa.goskip.app') +
        '/tarefas" ' +
        'style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
        'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">Abrir Tarefas &amp; Agenda</a>' +
        '</p>' +
        '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso restrito. ' +
        'Grupo Extrafruti · Casafruti · FoldBox</p>' +
        '</div></div>'

      var status = 'enviado'
      var erro = ''
      try {
        var msg = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress,
            name: 'Portal de Gestão Executivo — Extrafruti',
          },
          to: [{ address: emailDest }],
          subject: assunto,
          html: html,
          text: corpoTexto,
        })
        $app.newMailClient().send(msg)
      } catch (err) {
        status = 'erro'
        erro = String(err).slice(0, 500)
        console.warn('tarefa_email: falha ao enviar para ' + emailDest + ': ' + erro)
      }

      // Histórico na coleção emails (mesmo padrão dos demais hooks)
      try {
        var col = $app.findCollectionByNameOrId('emails')
        var rec = new Record(col)
        rec.set('para', emailDest)
        rec.set('assunto', assunto)
        rec.set('corpo', corpoTexto.slice(0, 20000))
        rec.set('status', status)
        rec.set('erro', erro)
        rec.set('modelo', 'tarefa_atribuicao')
        rec.set('criado_por', autorNome)
        $app.save(rec)
      } catch (_) {}
    }
  } catch (err) {
    // JAMAIS impedir a criação da tarefa por falha de e-mail
    console.warn('Erro no hook de e-mail (create) de tarefas:', err)
  } finally {
    return e.next()
  }
}, 'tarefas')

// Disparador ao ATUALIZAR tarefa: e-mail SOMENTE para usuários ATRIBUÍDOS
// nesta edição (adicionados) — mudança só de status não reenvia.
onRecordAfterUpdateSuccess(function (e) {
  try {
    var t = e.record
    var orig = e.record.original()
    if (!t || !orig) return e.next()

    function parseIds2(raw) {
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

    function limparNome2(n) {
      return String(n || '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .trim()
    }

    var statusK2 = t.getString('status_kanban') || t.getString('status') || ''
    if (statusK2 === 'concluido' || statusK2 === 'concluida') return e.next()

    var parcAntigos = parseIds2(orig.getString('parceiros'))
    var parcNovos = parseIds2(t.getString('parceiros'))
    var respAntigo = limparNome2(orig.getString('responsavel'))
    var respNovo = limparNome2(t.getString('responsavel'))

    var atribuicaoMudou =
      JSON.stringify(parcAntigos.slice().sort()) !== JSON.stringify(parcNovos.slice().sort()) ||
      respAntigo.toLowerCase() !== respNovo.toLowerCase()
    if (!atribuicaoMudou) return e.next()

    // Envolvidos atuais (mesma resolução do sino/criação)
    var vistos = {}
    var envolvidos = []
    function pushUser2(usr) {
      if (!usr || vistos[usr.id]) return
      vistos[usr.id] = true
      envolvidos.push({
        id: usr.id,
        email: usr.getString('email') || '',
        nome: usr.getString('name') || usr.getString('email') || '',
        pid: usr.getString('parceiro_id') || '',
      })
    }
    for (var i = 0; i < parcNovos.length; i++) {
      var pRecord = null
      try {
        pRecord = $app.findRecordById('parceiros', parcNovos[i])
      } catch (_) {}
      if (!pRecord) continue
      try {
        var usersVinc = $app.findRecordsByFilter(
          'users',
          'parceiro_id = "' + parcNovos[i] + '"',
          '',
          5,
          0,
        )
        for (var a = 0; a < usersVinc.length; a++) pushUser2(usersVinc[a])
      } catch (_) {}
      var emParc = (pRecord.getString('email') || '').trim().toLowerCase()
      if (emParc && emParc.indexOf('@') !== -1) {
        try {
          pushUser2($app.findAuthRecordByEmail('users', emParc))
        } catch (_) {}
      }
    }
    var primeiroResp = respNovo.split(/\s+/)[0]
    if (primeiroResp && primeiroResp.length >= 3) {
      try {
        var usersNome = $app.findRecordsByFilter(
          'users',
          'name ~ "' + primeiroResp.replace(/"/g, '\\"') + '"',
          '',
          10,
          0,
        )
        for (var b = 0; b < usersNome.length; b++) {
          var nu = limparNome2(usersNome[b].getString('name')).toLowerCase()
          if (respNovo.toLowerCase() === nu || respNovo.toLowerCase().indexOf(nu) !== -1) {
            pushUser2(usersNome[b])
          }
        }
      } catch (_) {}
    }

    if (envolvidos.length === 0) return e.next()

    // Autor
    var autorId = ''
    var autorEmail = ''
    var autorNome = 'Sistema'
    try {
      var reqInfo = e.requestInfo ? e.requestInfo() : null
      var auth = reqInfo && reqInfo.authRecord ? reqInfo.authRecord : null
      if (auth) {
        autorId = auth.id
        autorEmail = auth.getString('email') || ''
        autorNome = auth.getString('name') || autorEmail || 'Sistema'
      }
    } catch (_) {}

    var tituloTarefa = t.getString('titulo') || 'Sem título'
    var descricao = t.getString('descricao') || ''
    var prazo = t.getString('prazo') || ''
    var empresa = t.getString('empresa') || ''

    var base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($os.getenv('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/$/, '').replace(/\/$/, '')

    function esc2(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    function dataBR2(iso) {
      var s = String(iso || '')
      if (s.length < 10) return ''
      return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
    }

    function logomarcasHtml2(usuario) {
      var nomes = []
      try {
        var empId = usuario.empresaId
        if (empId) nomes.push($app.findRecordById('empresas', empId).getString('nome'))
      } catch (_) {}
      try {
        var uniId = usuario.unidadeId
        if (uniId) {
          var empU = $app.findRecordById('unidades', uniId).getString('empresa_id')
          if (empU) nomes.push($app.findRecordById('empresas', empU).getString('nome'))
        }
      } catch (_) {}
      var logos = []
      if (base) {
        for (var i = 0; i < nomes.length; i++) {
          try {
            var empEsc = nomes[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            var ach = $app.findRecordsByFilter(
              'logomarcas',
              'ativo = true && empresa = "' + empEsc + '"',
              'empresa',
              1,
              0,
            )
            if (ach && ach.length > 0) {
              var recL = ach[0]
              var arq = recL.getString('logo') || recL.getString('emblema')
              if (arq)
                logos.push({
                  empresa: recL.getString('empresa'),
                  url: base + '/api/files/pbc_3701359284/' + recL.id + '/' + arq,
                })
            }
          } catch (_) {}
        }
        if (logos.length === 0) {
          try {
            var todasL = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
            for (var j = 0; j < todasL.length; j++) {
              var r2 = todasL[j]
              var arq2 = r2.getString('logo') || r2.getString('emblema')
              if (arq2)
                logos.push({
                  empresa: r2.getString('empresa'),
                  url: base + '/api/files/pbc_3701359284/' + r2.id + '/' + arq2,
                })
            }
          } catch (_) {}
        }
      }
      if (logos.length === 0) return ''
      return (
        '<tr><td style="background:#ffffff;padding:18px 20px;border:1px solid #e5e7eb;' +
        'border-top:0;border-bottom:0;text-align:center">' +
        logos
          .map(function (l) {
            return (
              '<img src="' +
              l.url +
              '" alt="' +
              esc2(l.empresa) +
              '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
              'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />'
            )
          })
          .join('') +
        '</td></tr>'
      )
    }

    for (var ui = 0; ui < envolvidos.length; ui++) {
      var usuario = envolvidos[ui]
      if (autorId && usuario.id === autorId) continue
      if (autorEmail && usuario.email.toLowerCase() === autorEmail.toLowerCase()) continue

      var emailDest = (usuario.email || '').trim()
      if (!emailDest || emailDest.indexOf('@') === -1) continue
      var nomeDest = usuario.nome || emailDest

      try {
        var uFull = $app.findRecordById('users', usuario.id)
        usuario.empresaId = uFull.getString('empresa_id') || ''
        usuario.unidadeId = uFull.getString('unidade_id') || ''
      } catch (_) {}

      // Lista das tarefas em aberto do usuário (fora a atual)
      var pid = usuario.pid
      var primeiroNorm = String(limparNome2(usuario.nome).split(/\s+/)[0].toLowerCase())
      var lista = []
      try {
        var todas = $app.findRecordsByFilter(
          'tarefas',
          'id != "' + t.id + '" && status != "concluida" && status_kanban != "concluido"',
          '-created',
          200,
          0,
        )
        for (var k = 0; k < todas.length; k++) {
          var tt = todas[k]
          var ehDele = false
          if (pid) {
            var pidsT = parseIds2(tt.getString('parceiros'))
            if (pidsT.indexOf(pid) !== -1) ehDele = true
          }
          if (!ehDele && primeiroNorm && primeiroNorm.length >= 3) {
            var respT = limparNome2(tt.getString('responsavel')).toLowerCase()
            if (respT.indexOf(primeiroNorm) !== -1) ehDele = true
          }
          if (!ehDele) continue
          lista.push({
            titulo: tt.getString('titulo') || 'Sem título',
            prazo: tt.getString('prazo') || '',
            empresa: tt.getString('empresa') || '',
          })
          if (lista.length >= 15) break
        }
      } catch (_) {}
      lista.sort(function (a, b) {
        return String(a.prazo).localeCompare(String(b.prazo))
      })

      var linhasHtml = lista
        .map(function (it) {
          return (
            '<li style="padding:4px 0;border-bottom:1px solid #f3f4f6"><strong>' +
            esc2(it.titulo) +
            '</strong>' +
            (it.prazo
              ? ' <span style="color:#6b7280">— prazo ' + esc2(dataBR2(it.prazo)) + '</span>'
              : '') +
            (it.empresa ? ' <span style="color:#6b7280">[' + esc2(it.empresa) + ']</span>' : '') +
            '</li>'
          )
        })
        .join('')

      var blocoNova =
        '<div style="border:2px solid #1B5E20;border-radius:8px;padding:14px;margin:14px 0;background:#f0fdf4">' +
        '<span style="display:inline-block;background:#1B5E20;color:#fff;font-size:11px;font-weight:bold;' +
        'padding:3px 10px;border-radius:999px;margin-bottom:8px">NOVA TAREFA ATRIBUÍDA</span>' +
        '<h3 style="margin:0 0 6px;font-size:16px;color:#111827">' +
        esc2(tituloTarefa) +
        '</h3>' +
        (descricao
          ? '<p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 8px;white-space:pre-line">' +
            esc2(descricao) +
            '</p>'
          : '') +
        '<table style="font-size:13px;border-collapse:collapse">' +
        (prazo
          ? '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Prazo</td>' +
            '<td style="padding:4px 0;font-weight:bold">' +
            esc2(dataBR2(prazo)) +
            '</td></tr>'
          : '') +
        (empresa
          ? '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Empresa</td>' +
            '<td style="padding:4px 0">' +
            esc2(empresa) +
            '</td></tr>'
          : '') +
        '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Atribuída por</td>' +
        '<td style="padding:4px 0">' +
        esc2(autorNome) +
        '</td></tr>' +
        '</table></div>'

      var blocoLista = linhasHtml
        ? '<p style="font-size:14px;font-weight:bold;margin:18px 0 4px">' +
          'Suas tarefas em aberto (' +
          lista.length +
          ')</p>' +
          '<ul style="font-size:13px;color:#374151;margin:0 0 0 18px;padding:0">' +
          linhasHtml +
          '</ul>'
        : '<p style="font-size:13px;color:#6b7280;margin:16px 0 0">Você não tem outras tarefas em aberto no momento.</p>'

      var assunto = 'Nova tarefa atribuída: ' + tituloTarefa + ' — Portal de Gestão Executivo'

      var linhasTxt = lista
        .map(function (it) {
          return (
            '- ' +
            it.titulo +
            (it.prazo ? ' (prazo ' + dataBR2(it.prazo) + ')' : '') +
            (it.empresa ? ' [' + it.empresa + ']' : '')
          )
        })
        .join('\n')

      var corpoTexto =
        'Olá, ' +
        nomeDest +
        '!\n\n' +
        'Uma nova tarefa foi atribuída a você no Portal de Gestão Executivo.\n\n' +
        '=== NOVA TAREFA ATRIBUÍDA ===\n' +
        tituloTarefa +
        '\n' +
        (prazo ? 'Prazo: ' + dataBR2(prazo) + '\n' : '') +
        (empresa ? 'Empresa: ' + empresa + '\n' : '') +
        'Atribuída por: ' +
        autorNome +
        '\n\n' +
        '=== SUAS TAREFAS EM ABERTO ===\n' +
        (linhasTxt || 'Nenhuma outra tarefa em aberto.') +
        '\n\nAcesse: ' +
        (base || 'https://portalefsa.goskip.app') +
        '/tarefas\n\n' +
        'Equipe de TI — Grupo Extrafruti · Casafruti · FoldBox'

      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
        'style="border-collapse:collapse">' +
        logomarcasHtml2(usuario) +
        '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
        '<strong style="font-size:15px">Portal de Gestão Executivo</strong>' +
        '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
        'Grupo Extrafruti · Casafruti · FoldBox</span></td></tr>' +
        '</table>' +
        '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
        '<h2 style="margin:0 0 12px;font-size:16px">Olá, ' +
        esc2(nomeDest) +
        '! Uma nova tarefa foi atribuída a você</h2>' +
        blocoNova +
        blocoLista +
        '<p style="margin:18px 0 0">' +
        '<a href="' +
        (base || 'https://portalefsa.goskip.app') +
        '/tarefas" ' +
        'style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
        'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">Abrir Tarefas &amp; Agenda</a>' +
        '</p>' +
        '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso restrito. ' +
        'Grupo Extrafruti · Casafruti · FoldBox</p>' +
        '</div></div>'

      var status = 'enviado'
      var erro = ''
      try {
        var msg = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress,
            name: 'Portal de Gestão Executivo — Extrafruti',
          },
          to: [{ address: emailDest }],
          subject: assunto,
          html: html,
          text: corpoTexto,
        })
        $app.newMailClient().send(msg)
      } catch (err) {
        status = 'erro'
        erro = String(err).slice(0, 500)
        console.warn('tarefa_email: falha ao enviar para ' + emailDest + ': ' + erro)
      }

      try {
        var col = $app.findCollectionByNameOrId('emails')
        var recE = new Record(col)
        recE.set('para', emailDest)
        recE.set('assunto', assunto)
        recE.set('corpo', corpoTexto.slice(0, 20000))
        recE.set('status', status)
        recE.set('erro', erro)
        recE.set('modelo', 'tarefa_atribuicao')
        recE.set('criado_por', autorNome)
        $app.save(recE)
      } catch (_) {}
    }
  } catch (err) {
    console.warn('Erro no hook de e-mail (update) de tarefas:', err)
  } finally {
    return e.next()
  }
}, 'tarefas')
