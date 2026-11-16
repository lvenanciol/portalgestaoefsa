// ============================================================================
// SESSÃO CONCLUÍDA ⇒ TAREFA CONCLUÍDA (16/11/2026)
//
// DIRETIVA: quando uma sessão/registro de Tratamentos tem status "concluído",
// a tarefa vinculada DEVE ir para "concluído" no kanban.
//
// As migrações 123/125/126 rodaram e as tarefas do print continuaram em
// "A Fazer". O problema não é rodar uma vez: é MANTER a coerência a cada
// mudança. Por isso um hook no salvamento do tratamento.
//
// O kanban lê `status_kanban`; o tratamento guarda a conclusão em
// `sessoes_concluidas`. São duas fontes que precisam falar.
// ============================================================================

onRecordAfterUpdateSuccess(function (e) {
  try {
    var tr = e.record
    if (!tr) return e.next()

    // datas concluídas
    var concluidas = []
    try {
      var bc = tr.get('sessoes_concluidas')
      if (Array.isArray(bc)) concluidas = bc
      else if (typeof bc === 'string') {
        var pc = JSON.parse(bc)
        concluidas = Array.isArray(pc) ? pc : []
      }
    } catch (_) {
      concluidas = []
    }
    if (!concluidas.length) return e.next()

    var setConc = {}
    for (var i = 0; i < concluidas.length; i++) {
      var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(concluidas[i] || ''))
      if (m) setConc[m[1] + '-' + m[2] + '-' + m[3]] = true
    }
    var dias = Object.keys(setConc)
    if (!dias.length) return e.next()

    // ids conhecidos do tratamento
    var ids = {}
    try {
      var bi = tr.get('tarefa_ids')
      var arr = []
      if (Array.isArray(bi)) arr = bi
      else if (typeof bi === 'string') {
        var pi = JSON.parse(bi)
        arr = Array.isArray(pi) ? pi : []
      }
      for (var a = 0; a < arr.length; a++) ids[String(arr[a])] = true
    } catch (_) {}
    try {
      var bm = tr.get('tarefa_por_data')
      if (bm && typeof bm === 'object' && !Array.isArray(bm)) {
        for (var k in bm) {
          if (bm[k]) ids[String(bm[k])] = true
        }
      }
    } catch (_) {}

    var tipo = ''
    try {
      tipo = String(tr.getString('tipo_nome') || '').trim()
    } catch (_) {}

    // indexa as tarefas conhecidas por dia do prazo (texto puro)
    var porDia = {}
    for (var idc in ids) {
      var rec = null
      try {
        rec = $app.findRecordById('tarefas', idc)
      } catch (_) {
        rec = null
      }
      if (!rec) continue
      var prazoStr = ''
      try {
        prazoStr = String(rec.get('prazo') || '')
      } catch (_) {}
      var dm = /(\d{4})-(\d{2})-(\d{2})/.exec(prazoStr)
      if (!dm) continue
      var dia = dm[1] + '-' + dm[2] + '-' + dm[3]
      if (!porDia[dia]) porDia[dia] = []
      porDia[dia].push(rec)
    }

    var alteradas = 0
    for (var d = 0; d < dias.length; d++) {
      var diaAlvo = dias[d]
      var lista = porDia[diaAlvo] || []

      // fallback por título dd/mm/aaaa quando o mapa não tem a data
      if (!lista.length) {
        var diaBR = diaAlvo.split('-').reverse().join('/')
        try {
          var ach = $app.findRecordsByFilter('tarefas', "titulo ~ '" + diaBR + "'", '', 10, 0)
          for (var q = 0; q < ach.length; q++) {
            var tit = String(ach[q].getString('titulo') || '')
            if (!tipo || tit.indexOf(tipo) === 0) lista.push(ach[q])
          }
        } catch (_) {}
      }

      for (var l = 0; l < lista.length; l++) {
        var t = lista[l]
        var st = ''
        var sk = ''
        try {
          st = String(t.getString('status') || '')
          sk = String(t.getString('status_kanban') || '')
        } catch (_) {}
        if (st === 'concluida' && sk === 'concluido') continue

        try {
          $app
            .db()
            .newQuery(
              "UPDATE tarefas SET status = 'concluida', status_kanban = 'concluido' WHERE id = {:id}",
            )
            .bind({ id: String(t.id) })
            .execute()
          alteradas++
        } catch (err) {
          console.log('[sync-sessao] falha em ' + String(t.id) + ': ' + String(err).slice(0, 120))
        }
      }
    }

    if (alteradas > 0) {
      console.log('[sync-sessao] ' + tr.id + ' → tarefas concluídas: ' + alteradas)
    }
  } catch (err) {
    console.log('[sync-sessao] update: ' + String(err).slice(0, 160))
  } finally {
    e.next()
  }
}, 'll5_treatments')
