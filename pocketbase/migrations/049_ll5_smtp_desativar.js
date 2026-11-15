/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — DESATIVAR O SMTP INVÁLIDO (15/11/2026)
//
// ERRO MEU: a migração 113 leu os secrets SMTP_HOST/SMTP_USER e ativou SMTP
// próprio sem verificar o CONTEÚDO. Os valores eram placeholders
// ("PLACEHOLDER_DEFINIR_DEPOIS"), não um servidor real. Resultado: o envio de
// e-mail ficaria mudo.
//
// Esta migração garante que o envio volte ao relay da plataforma (que
// funcionava) e mantém o remetente display como portalpge@extrafruti.com.br.
//
// RESSALVA HONESTA ao dono: pelo relay, o endereço técnico do From é
// reescrito pela plataforma (noreply@mail.goskp.dev) em nome da
// entregabilidade. Para o From sair EXATAMENTE como portalpge@extrafruti.com.br
// é preciso SMTP próprio real (host, porta, usuário e senha do servidor de
// e-mail da Extrafruti) — os secrets atuais contêm placeholders.
// ============================================================================
migrate(
  (app) => {
    try {
      const s = app.settings()
      // desliga o servidor próprio (os valores eram placeholder)
      s.smtp.enabled = false
      s.smtp.host = ''
      s.smtp.port = 0
      s.smtp.username = ''
      s.smtp.password = ''
      s.smtp.tls = false
      // mantém o remetente display pedido pelo dono
      s.meta.senderAddress = 'portalpge@extrafruti.com.br'
      s.meta.senderName = 'Portal de Gestão Executivo — Extrafruti'
      app.save(s)
      console.log('[smtp3] SMTP próprio desativado (valores eram placeholder)')
      console.log('[smtp3] remetente display: portalpge@extrafruti.com.br')
    } catch (err) {
      console.log('[smtp3] falha: ' + String(err).slice(0, 200))
    }

    // conferência
    try {
      const c = app.settings()
      console.log(
        '[smtp3] CONFERÊNCIA enabled=' +
          String(c.smtp.enabled) +
          ' host="' +
          String(c.smtp.host) +
          '" from=' +
          String(c.meta.senderAddress),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[smtp3] rollback: configuração mantida')
  },
)
