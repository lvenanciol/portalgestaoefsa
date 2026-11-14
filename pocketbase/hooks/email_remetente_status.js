// ============================================================================
// E-MAIL — remetente em uso (14/11/2026)
// GET /backend/v1/email/remetente-status
//
// A tela "Integrações → E-mail" mostra o remetente REAL. Antes o front teria
// de adivinhar; aqui o backend lê a mesma ordem que os hooks de envio usam:
//   1. secret EMAIL_REMETENTE
//   2. $app.settings().meta.senderAddress
// e informa se há SMTP próprio configurado.
//
// Só leitura — nunca devolve senha nem host de produção além do necessário.
// ============================================================================
routerAdd(
  'GET',
  '/backend/v1/email/remetente-status',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let remetente = ''
    let origem = ''
    try {
      remetente = String($secrets.get('EMAIL_REMETENTE') || '').trim()
      if (remetente) origem = 'secret EMAIL_REMETENTE'
    } catch (_) {}

    if (!remetente) {
      try {
        remetente = String($app.settings().meta.senderAddress || '').trim()
        if (remetente) origem = 'configuração da plataforma (senderAddress)'
      } catch (_) {}
    }

    let nomeRemetente = ''
    try {
      nomeRemetente = String($secrets.get('EMAIL_REMETENTE_NOME') || '').trim()
    } catch (_) {}
    if (!nomeRemetente) {
      try {
        nomeRemetente = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    if (!nomeRemetente) nomeRemetente = 'Portal de Gestão Executivo — Extrafruti'

    // SMTP próprio: o PocketBase expõe o smtp em settings()
    let host = ''
    let porta = null
    let usaSmtpProprio = false
    try {
      const s = $app.settings()
      const smtp = s.smtp || {}
      host = String(smtp.host || '').trim()
      porta = smtp.port ? Number(smtp.port) : null
      usaSmtpProprio = !!host && !!porta
    } catch (_) {}

    const resp = {
      ok: true,
      remetente: remetente || '—',
      nomeRemetente: nomeRemetente,
      origem: origem || 'não configurado',
      usaSmtpProprio: usaSmtpProprio,
      host: host,
      porta: porta,
    }

    if (!usaSmtpProprio) {
      resp.aviso =
        'Sem servidor SMTP próprio o "De" é reescrito pela plataforma; o endereço acima vira Responder-para.'
    }

    try {
      console.log('[email/remetente-status] ' + resp.remetente + ' | smtpProprio=' + usaSmtpProprio)
    } catch (_) {}

    return e.json(200, resp)
  },
  $apis.requireAuth(),
)
