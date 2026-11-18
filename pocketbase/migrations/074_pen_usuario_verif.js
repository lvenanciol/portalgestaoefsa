/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// VERIFICAÇÃO DE LEITURA DO DADO REAL (18/11/2026)
//
// A Fase 3.1 exige que as telas leiam do banco. O teste anônimo devolve 0 —
// isso só prova que a porta está fechada. Para provar que o usuário
// autenticado ENXERGA o dado, é preciso uma sessão válida.
//
// Esta migração cria um usuário de verificação com workspace do PGE, confere a
// contagem de cada coleção pelo aplicativo (superuser, enxerga tudo) e imprime.
// O usuário é REMOVIDO na migração seguinte, junto com o teste HTTP.
// ============================================================================
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const email = 'verif.pen@pge.local'

    let rec = null
    try {
      rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
    } catch (_) {
      rec = null
    }

    if (!rec) {
      rec = new Record(users)
      rec.setEmail(email)
      rec.setPassword('Verif@2026pge')
      rec.setVerified(true)
      rec.set('name', 'Verificação PEN')
      rec.set('ativo', true)
      app.save(rec)
      console.log('[verif] usuário criado: ' + email)
    } else {
      console.log('[verif] usuário já existia: ' + email)
    }

    rec.set('workspace_id', 'ws-pge-001')
    app.save(rec)
    console.log('[verif] workspace_id = ws-pge-001')

    // contagem por coleção (visão do servidor)
    const cols = [
      'pen_company',
      'pen_cycle',
      'pen_objective',
      'pen_kpi',
      'pen_initiative',
      'pen_cause',
      'pen_risk',
    ]
    for (const c of cols) {
      try {
        const todos = app.findRecordsByFilter(c, "id != ''", '', 500, 0)
        console.log('[verif] ' + c + ' = ' + todos.length + ' registro(s) no banco')
      } catch (e) {
        console.log('[verif] ' + c + ' ERRO: ' + String(e).slice(0, 100))
      }
    }
    console.log('[verif] CONCLUÍDO')
  },
  (app) => {
    console.log('[verif] rollback: usuário mantido para o teste HTTP')
  },
)
