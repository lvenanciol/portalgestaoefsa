/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — DESTINATÁRIO DAS TAREFAS DE TRATAMENTO (15/11/2026)
//
// DIAGNÓSTICO (log de e-mails de produção, 15/11 22:29):
//   100 registros seguidos com "email recipient dropped" + "email not sent".
//   Nenhum e-mail de notificação saiu. O sistema ENFILEIRA, mas descarta por
//   falta de destinatário.
//
// CAUSA: o hook `tarefas_eventos.js` resolve o destinatário por
//   1. `responsaveis_ids`  → vazio nas tarefas criadas pelo reconciliar
//   2. `parceiros`         → vazio
//   3. `responsavel` (texto) → busca o PRIMEIRO NOME em `users`
// A busca por primeiro nome falha quando o nome no campo não bate com o
// `name` do usuário (ou quando o campo está vazio).
//
// CORREÇÃO: preencher `responsaveis_ids` com o usuário real do tratamento
// (`responsavel_id`), e `responsavel` com o nome completo — o que dá ao hook
// um destinatário resolvível.
// ============================================================================
migrate(
  (app) => {
    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[dest] falha ao listar tratamentos: ' + String(err).slice(0, 140))
      return
    }

    console.log('[dest] tratamentos: ' + tratamentos.length)
    let corrigidas = 0
    let semUsuario = 0

    for (const t of tratamentos) {
      let paciente = ''
      let respId = ''
      try {
        paciente = String(t.get('paciente_nome') || '').trim()
      } catch (_) {}
      try {
        respId = String(t.get('responsavel_id') || '').trim()
      } catch (_) {}

      if (!paciente) continue

      // ---- 1) valida o usuário do tratamento; se inválido, procura pelo nome ----
      let usuarioId = ''
      if (respId) {
        try {
          const u = app.findRecordById('users', respId)
          usuarioId = String(u.id)
        } catch (_) {
          usuarioId = ''
        }
      }

      if (!usuarioId) {
        // procura por nome completo e depois pelo primeiro nome
        try {
          const porNome = app.findRecordsByFilter(
            'users',
            "name = '" + paciente.replace(/'/g, "\\'") + "'",
            '',
            1,
            0,
          )
          if (porNome.length > 0) usuarioId = String(porNome[0].id)
        } catch (_) {}
      }

      if (!usuarioId) {
        const primeiro = paciente.split(/\s+/)[0]
        if (primeiro && primeiro.length >= 3) {
          try {
            const ach = app.findRecordsByFilter(
              'users',
              "name ~ '" + primeiro.replace(/'/g, "\\'") + "'",
              '',
              1,
              0,
            )
            if (ach.length > 0) usuarioId = String(ach[0].id)
          } catch (_) {}
        }
      }

      if (!usuarioId) {
        semUsuario++
        console.log('[dest] sem usuário para "' + paciente + '"')
        continue
      }

      // grava o responsável no TRATAMENTO (para os próximos reconciliar)
      if (usuarioId !== respId) {
        try {
          t.set('responsavel_id', usuarioId)
          app.save(t)
        } catch (_) {}
      }

      // ---- 2) corrige as tarefas vinculadas ----
      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
      } catch (_) {}

      for (const id of ids) {
        let tarefa = null
        try {
          tarefa = $app.findRecordById('tarefas', String(id))
        } catch (_) {
          tarefa = null
        }
        if (!tarefa) continue

        try {
          tarefa.set('responsaveis_ids', [usuarioId])
          tarefa.set('responsavel', paciente)
          $app.save(tarefa)
          corrigidas++
        } catch (err) {
          console.log('[dest] tarefa ' + id + ': ' + String(err).slice(0, 100))
        }
      }
    }

    console.log(
      '[dest] tarefas com destinatário: ' +
        corrigidas +
        ' · tratamentos sem usuário: ' +
        semUsuario,
    )
  },
  (app) => {
    console.log('[dest] rollback: destinatários mantidos')
  },
)
