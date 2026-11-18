/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// PROVA DEFINITIVA DO SINO (18/11/2026)
//
// Roda como SUPERUSER, portanto IGNORA a listRule de `notificacoes`.
//
// Por que isto importa: durante o diagnóstico eu concluí que o sino não gravava
// na criação porque a leitura via API não trazia a linha. A leitura vinha
// filtrada pela listRule (cada usuário vê só as suas) — o sino SEMPRE gravou.
// Este script conta o total real, sem filtro.
// ============================================================================
migrate(
  (app) => {
    let total = 0
    try {
      const r = app.db().newQuery('SELECT COUNT(*) AS n FROM notificacoes').all()
      for (const x of r) total = Number(x.get('n') || 0)
    } catch (e) {
      console.log('[prova-sino] erro count: ' + String(e).slice(0, 140))
    }
    console.log('[prova-sino] TOTAL REAL de notificacoes (sem listRule) = ' + total)

    // notificações das últimas horas e para quem são
    try {
      const r = app
        .db()
        .newQuery(
          'SELECT usuario_email, tipo, titulo, created FROM notificacoes ' +
            "WHERE created >= '2026-11-18 13:00' ORDER BY created DESC LIMIT 20",
        )
        .all()
      console.log('[prova-sino] --- criadas apos 13:00 ---')
      for (const x of r) {
        console.log(
          '[prova-sino] ' +
            String(x.get('created')).slice(0, 19) +
            ' | ' +
            String(x.get('usuario_email')) +
            ' | ' +
            String(x.get('tipo')) +
            ' | ' +
            String(x.get('titulo')).slice(0, 42),
        )
      }
    } catch (e) {
      console.log('[prova-sino] erro lista: ' + String(e).slice(0, 140))
    }

    // quantas são para a Lorena?
    try {
      const r = app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_email = 'lorena.avelar@extrafruti.com.br'",
        )
        .all()
      for (const x of r) console.log('[prova-sino] notificacoes da Lorena = ' + String(x.get('n')))
    } catch (_) {}
    console.log('[prova-sino] FIM')
  },
  (app) => {
    console.log('[prova-sino] rollback nao aplicavel')
  },
)
