/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// AUDITORIA DE NOTIFICAÇÕES PROGRAMADAS (18/11/2026)
//
// Responde: os crons/alertas do PGE existem, rodaram nos últimos 5 dias e
// enviaram? Roda como superuser e reporta tudo no log.
// ============================================================================
migrate(
  (app) => {
    // Em MIGRAÇÃO o app vem por parâmetro (app), não pelo global $app — o
    // $app só existe dentro de hooks/routes.
    // Em migração o global $app EXISTE (ao contrário do que dizem os tipos),
    // mas o parâmetro `app` é a forma documentada. Uso app.db() para dados e
    // $app.cron() para listar jobs (não há equivalente no parâmetro).
    const db = app.db()

    // ---- 1) JOBS REGISTRADOS (API do PocketBase, sem depender de tabela) ----
    console.log('[audit-notif] === CRONS REGISTRADOS ===')
    try {
      const jobs = $app.cron().jobs()
      let n = 0
      for (const id in jobs) {
        const j = jobs[id]
        n++
        console.log(
          '[audit-notif] ' +
            id +
            ' | cron=' +
            String(j.expression) +
            ' | ativo=' +
            String(j.active),
        )
      }
      if (n === 0) console.log('[audit-notif] NENHUM cron ativo')
    } catch (e) {
      console.log('[audit-notif] $app.cron falhou: ' + String(e).slice(0, 120))
    }

    // ---- 2) E-MAILS enviados nos últimos 5 dias ----
    console.log('[audit-notif] === E-MAILS (ultimos 5 dias) ===')
    try {
      const r = db
        .newQuery(
          'SELECT DATE(created) AS dia, status, COUNT(*) AS n FROM emails ' +
            "WHERE created >= datetime('now','-5 days') GROUP BY dia, status ORDER BY dia DESC",
        )
        .all()
      if (r.length === 0) console.log('[audit-notif] nenhum e-mail registrado em 5 dias')
      for (const x of r) {
        console.log(
          '[audit-notif] ' +
            String(x.get('dia')) +
            ' | ' +
            String(x.get('status')) +
            ' | ' +
            String(x.get('n')),
        )
      }
    } catch (e) {
      console.log('[audit-notif] emails: ' + String(e).slice(0, 140))
    }

    // ---- 3) NOTIFICAÇÕES (sino) nos últimos 5 dias ----
    console.log('[audit-notif] === SINO (ultimos 5 dias) ===')
    try {
      const r = db
        .newQuery(
          'SELECT DATE(created) AS dia, COUNT(*) AS n FROM notificacoes ' +
            "WHERE created >= datetime('now','-5 days') GROUP BY dia ORDER BY dia DESC",
        )
        .all()
      if (r.length === 0) console.log('[audit-notif] nenhuma notificacao em 5 dias')
      for (const x of r) {
        console.log('[audit-notif] ' + String(x.get('dia')) + ' | ' + String(x.get('n')))
      }
    } catch (e) {
      console.log('[audit-notif] notificacoes: ' + String(e).slice(0, 140))
    }

    // ---- 4) FALHAS de e-mail recentes (o que importa corrigir) ----
    console.log('[audit-notif] === FALHAS DE E-MAIL (5 dias) ===')
    try {
      const r = db
        .newQuery(
          "SELECT created, para, assunto, substr(COALESCE(erro,''),1,90) AS erro FROM emails " +
            "WHERE status = 'erro' AND created >= datetime('now','-5 days') ORDER BY created DESC LIMIT 15",
        )
        .all()
      if (r.length === 0) console.log('[audit-notif] nenhuma falha registrada')
      for (const x of r) {
        console.log(
          '[audit-notif] ' +
            String(x.get('created')).slice(0, 16) +
            ' | ' +
            String(x.get('para')) +
            ' | ' +
            String(x.get('erro')),
        )
      }
    } catch (e) {
      console.log('[audit-notif] falhas: ' + String(e).slice(0, 140))
    }

    // ---- 5) Modelos de e-mail usados (para ver se os programados rodam) ----
    console.log('[audit-notif] === MODELOS USADOS (5 dias) ===')
    try {
      const r = db
        .newQuery(
          'SELECT modelo, COUNT(*) AS n, MAX(created) AS ultimo FROM emails ' +
            "WHERE created >= datetime('now','-5 days') GROUP BY modelo ORDER BY n DESC",
        )
        .all()
      for (const x of r) {
        console.log(
          '[audit-notif] modelo=' +
            String(x.get('modelo') || '(vazio)') +
            ' | n=' +
            String(x.get('n')) +
            ' | ultimo=' +
            String(x.get('ultimo')).slice(0, 16),
        )
      }
    } catch (e) {
      console.log('[audit-notif] modelos: ' + String(e).slice(0, 140))
    }

    console.log('[audit-notif] FIM')
  },
  (app) => {
    console.log('[audit-notif] rollback nao aplicavel')
  },
)
