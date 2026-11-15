/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APLICAR A SECRET SMTP NO SERVIDOR DE E-MAIL (15/11/2026)
//
// HISTÓRICO DAS TENTATIVAS DE ENVIO:
//
//   23:29 · porta 587, tls=true  → "tls: first record does not look like a
//                                  TLS handshake"  (TLS implícito na porta de
//                                  STARTTLS — modo errado)
//   20:47 · porta 465, tls=true  → "dial tcp 52.96.109.130:465: connect:
//                                  connection timed out" (porta bloqueada na
//                                  saída do pod)
//
// MODO CORRETO: porta 587 com STARTTLS (tls=false nos settings — o PocketBase
// negocia o TLS via STARTTLS sozinho).
//
// ESTA MIGRAÇÃO garante que a senha nos settings é a da SECRET, não o
// placeholder que ficou gravado pela migração 113/114.
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

    // lê a senha da secret, na ordem de preferência
    let senha = seg('SMTP_PORTALPGE_PASS')
    let origem = 'SMTP_PORTALPGE_PASS'
    if (!senha || senha === '__AGUARDANDO_VALOR__') {
      senha = seg('SMTP_PASS')
      origem = 'SMTP_PASS'
    }

    console.log('[smtp5] secret usada: ' + origem)
    console.log(
      '[smtp5] senha: ' +
        (senha ? senha.length + ' chars' : 'AUSENTE') +
        (senha === '__AGUARDANDO_VALOR__' ? ' (PLACEHOLDER!)' : ''),
    )

    if (!senha || senha === '__AGUARDANDO_VALOR__') {
      console.log('[smtp5] SEM senha válida — envio continuará falhando')
      return
    }

    try {
      const s = app.settings()
      s.smtp.enabled = true
      s.smtp.host = 'smtp.office365.com'
      // 587 + STARTTLS: o PocketBase faz o upgrade sozinho
      s.smtp.port = 587
      s.smtp.username = 'portalpge@extrafruti.com.br'
      s.smtp.password = senha
      s.smtp.tls = false
      s.smtp.authMethod = 'PLAIN'
      s.smtp.localName = 'extrafruti.com.br'
      s.meta.senderAddress = 'portalpge@extrafruti.com.br'
      s.meta.senderName = 'Portal de Gestão Executivo — Extrafruti'
      app.save(s)
      console.log('[smtp5] aplicado: smtp.office365.com:587 STARTTLS')
    } catch (err) {
      console.log('[smtp5] falha: ' + String(err).slice(0, 220))
      return
    }

    // conferência (sem expor a senha)
    try {
      const c = app.settings()
      console.log(
        '[smtp5] CONFERÊNCIA enabled=' +
          String(c.smtp.enabled) +
          ' host=' +
          String(c.smtp.host) +
          ' port=' +
          String(c.smtp.port) +
          ' user=' +
          String(c.smtp.username) +
          ' senhaLen=' +
          String((c.smtp.password || '').length) +
          ' from=' +
          String(c.meta.senderAddress),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[smtp5] rollback: configuração mantida')
  },
)
