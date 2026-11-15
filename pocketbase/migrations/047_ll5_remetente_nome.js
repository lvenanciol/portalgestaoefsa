/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — REMETENTE COM O NOME DE INTEGRAÇÃO CORRETO (15/11/2026)
//
// CAUSA DO E-MAIL SAIR COMO <noreply@mail.goskp.dev>:
//
// O hook `tarefas_eventos.js` lê o remetente assim:
//   $secrets.get('EMAIL_REMETENTE')                       ← 1ª tentativa
//   integracoes_config WHERE integracao = "email_remetente" ← 2ª tentativa
//   $app.settings().meta.senderAddress                     ← fallback
//
// A migração 110 gravou com `integracao = 'email'` — nome ERRADO. Então o hook
// não achava, caía no relay da plataforma e o e-mail saía de noreply@mail.goskp.dev.
//
// Esta migração cria/atualiza o registro com o nome EXATO que o hook procura.
// ============================================================================
migrate(
  (app) => {
    const ENDERECO = 'portalpge@extrafruti.com.br'
    const NOME = 'Portal de Gestão Executivo — Extrafruti'

    // ---------- 1) registro com o nome que o hook lê ----------
    let rec = null
    try {
      rec = app.findFirstRecordByFilter('integracoes_config', 'integracao = "email_remetente"')
    } catch (_) {
      rec = null
    }

    const cfg = {
      remetente: ENDERECO,
      email_remetente: ENDERECO,
      nome: NOME,
      email_remetente_nome: NOME,
      ativo: true,
    }

    if (rec) {
      try {
        rec.set('config', cfg)
        app.save(rec)
        console.log('[remetente2] atualizado: integracao="email_remetente"')
      } catch (err) {
        console.log('[remetente2] save: ' + String(err).slice(0, 160))
      }
    } else {
      try {
        const col = app.findCollectionByNameOrId('integracoes_config')
        const r = new Record(col)
        r.set('integracao', 'email_remetente')
        r.set('config', cfg)
        app.save(r)
        console.log('[remetente2] criado: integracao="email_remetente"')
      } catch (err) {
        console.log('[remetente2] create: ' + String(err).slice(0, 160))
      }
    }

    // ---------- 2) remove o registro errado que eu criei antes ----------
    try {
      const errado = app.findFirstRecordByFilter('integracoes_config', 'integracao = "email"')
      if (errado) {
        errado.set('config', cfg)
        app.save(errado)
        console.log('[remetente2] registro "email" também atualizado (compatibilidade)')
      }
    } catch (_) {}

    // ---------- 3) settings da plataforma (fallback do hook) ----------
    try {
      const s = app.settings()
      s.meta.senderAddress = ENDERECO
      s.meta.senderName = NOME
      app.save(s)
      console.log('[remetente2] settings da plataforma atualizados')
    } catch (err) {
      console.log('[remetente2] settings: ' + String(err).slice(0, 160))
    }

    // ---------- 4) conferência ----------
    try {
      const conf = app.findFirstRecordByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
      )
      console.log('[remetente2] CONFERÊNCIA: ' + JSON.stringify(conf.get('config')))
    } catch (err) {
      console.log('[remetente2] conferência: ' + String(err).slice(0, 120))
    }
  },
  (app) => {
    console.log('[remetente2] rollback: valores mantidos')
  },
)
