/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — REMETENTE DE E-MAIL = portalpge@extrafruti.com.br (15/11/2026)
//
// PEDIDO DO DONO: "o e-mail enviado deve utilizar portalpge@extrafruti.com.br
// como remetente".
//
// O log de e-mails mostrava o remetente configurado como
// `extrafruti@extrafruti.com.br` (do get_smtp_config da plataforma), mas o
// hook `tarefas_eventos.js` lê o remetente de `integracoes_config`
// ('email_remetente'). Este é o registro que a tela de Configurações edita e
// que o envio realmente usa.
//
// Esta migração garante que esse registro exista com o endereço correto.
// ============================================================================
migrate(
  (app) => {
    const ENDERECO = 'portalpge@extrafruti.com.br'
    const NOME = 'Portal de Gestão Executivo — Extrafruti'

    let rec = null
    try {
      rec = app.findFirstRecordByFilter('integracoes_config', "integracao = 'email'")
    } catch (_) {
      rec = null
    }

    if (rec) {
      console.log('[remetente] registro existente encontrado')
      try {
        rec.set('config', {
          email_remetente: ENDERECO,
          email_remetente_nome: NOME,
          email_ativo: true,
        })
        app.save(rec)
        console.log('[remetente] atualizado para ' + ENDERECO)
      } catch (err) {
        console.log('[remetente] save falhou: ' + String(err).slice(0, 180))
      }
    } else {
      try {
        const col = app.findCollectionByNameOrId('integracoes_config')
        const r = new Record(col)
        r.set('integracao', 'email')
        r.set('config', {
          email_remetente: ENDERECO,
          email_remetente_nome: NOME,
          email_ativo: true,
        })
        app.save(r)
        console.log('[remetente] registro criado com ' + ENDERECO)
      } catch (err) {
        console.log('[remetente] create falhou: ' + String(err).slice(0, 180))
      }
    }

    // ---------- conferência ----------
    try {
      const conf = app.findFirstRecordByFilter('integracoes_config', "integracao = 'email'")
      const cfg = conf.get('config') || {}
      console.log('[remetente] CONFERÊNCIA: ' + JSON.stringify(cfg))
    } catch (err) {
      console.log('[remetente] conferência: ' + String(err).slice(0, 140))
    }
  },
  (app) => {
    console.log('[remetente] rollback: valor mantido')
  },
)
