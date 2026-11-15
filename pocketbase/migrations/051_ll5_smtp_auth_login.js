/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — MÉTODO DE AUTENTICAÇÃO SMTP PARA O EXCHANGE ONLINE (15/11/2026)
//
// EVOLUÇÃO DOS ERROS — cada um provou uma coisa:
//
//   1. "tls: first record does not look like a TLS handshake"
//      → TLS IMPLÍCITO na porta 587. Essa porta usa STARTTLS.
//      Corrigido com tls=false (o PocketBase negocia o upgrade).
//
//   2. "dial tcp 52.96.109.130:465: connect: connection timed out"
//      → porta 465 BLOQUEADA na saída do pod. Voltamos para 587.
//
//   3. "504 5.7.4 Unrecognized authentication type"
//      → CONECTOU e o servidor recusou o TIPO de AUTH. Este é o mais
//        informativo: a rede e o TLS estão OK; falta o método certo.
//
// CAUSA DO 3: `authMethod = 'PLAIN'`. O Exchange Online aceita
// LOGIN / XOAUTH2 — não PLAIN. Trocamos para LOGIN.
// ============================================================================
migrate(
  (app) => {
    function seg(nome) {
      try {
        return String($secrets.get(nome) || '').trim()
      } catch (_) {
        return ''
      }
    }

    let senha = seg('SMTP_PORTALPGE_PASS')
    if (!senha || senha === '__AGUARDANDO_VALOR__') senha = seg('SMTP_PASS')

    if (!senha || senha === '__AGUARDANDO_VALOR__') {
      console.log('[smtp6] SEM senha válida nas secrets — não altera')
      return
    }

    try {
      const s = app.settings()
      s.smtp.enabled = true
      s.smtp.host = 'smtp.office365.com'
      s.smtp.port = 587
      s.smtp.username = 'portalpge@extrafruti.com.br'
      s.smtp.password = senha
      // 587 = STARTTLS (tls=false faz o upgrade)
      s.smtp.tls = false
      // Exchange Online NÃO aceita PLAIN — aceita LOGIN
      s.smtp.authMethod = 'LOGIN'
      s.smtp.localName = 'extrafruti.com.br'
      s.meta.senderAddress = 'portalpge@extrafruti.com.br'
      s.meta.senderName = 'Portal de Gestão Executivo — Extrafruti'
      app.save(s)
      console.log('[smtp6] aplicado: 587 STARTTLS + authMethod=LOGIN')
    } catch (err) {
      console.log('[smtp6] falha: ' + String(err).slice(0, 220))
      return
    }

    try {
      const c = app.settings()
      console.log(
        '[smtp6] CONFERÊNCIA port=' +
          String(c.smtp.port) +
          ' auth=' +
          String(c.smtp.authMethod) +
          ' tls=' +
          String(c.smtp.tls) +
          ' user=' +
          String(c.smtp.username) +
          ' senhaLen=' +
          String((c.smtp.password || '').length),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[smtp6] rollback: configuração mantida')
  },
)
