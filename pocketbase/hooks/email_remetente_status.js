// ============================================================================
// E-MAIL — remetente em uso (14/11/2026)
// GET /backend/v1/email/remetente-status
//
// A tela "Integrações → E-mail" mostra o remetente REAL e o estado da
// configuração de notificações. Ordem de leitura do nome:
//   1. secret EMAIL_REMETENTE_NOME
//   2. coleção integracoes_config (integracao = "email_remetente") — editável
//      pela tela, sem acentos
//   3. $app.settings().meta.senderName
//
// Só leitura. Nunca devolve senha.
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

    // nome: FONTE ÚNICA = tela Integrações > E-mail (secret removido 14/11/2026)
    let nomeRemetente = ''
    let nomeOrigem = ''
    {
      try {
        const ach = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_remetente"',
          '',
          1,
          0,
        )
        if (ach && ach.length) {
          const cfg = ach[0].get('config') || {}
          const n = String(cfg.nome || '').trim()
          if (n) {
            nomeRemetente = n
            nomeOrigem = 'configurado na tela'
          }
        }
      } catch (_) {}
    }

    if (!nomeRemetente) {
      try {
        nomeRemetente = String($app.settings().meta.senderName || '').trim()
        if (nomeRemetente) nomeOrigem = 'configuração da plataforma'
      } catch (_) {}
    }
    if (!nomeRemetente) {
      nomeRemetente = 'Portal de Gestao Executivo - Extrafruti'
      nomeOrigem = 'padrão do sistema'
    }

    // SMTP próprio
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

    // matriz de notificações salva
    let temMatriz = false
    let atualizadoPor = ''
    let atualizadoEm = ''
    try {
      const ach = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_notificacoes"',
        '',
        1,
        0,
      )
      if (ach && ach.length) {
        temMatriz = true
        atualizadoPor = ach[0].getString('atualizado_por')
        atualizadoEm = ach[0].getString('updated')
      }
    } catch (_) {}

    const resp = {
      ok: true,
      remetente: remetente || '—',
      nomeRemetente: nomeRemetente,
      origem: origem || 'não configurado',
      nomeOrigem: nomeOrigem,
      usaSmtpProprio: usaSmtpProprio,
      host: host,
      porta: porta,
      matriz: {
        configurada: temMatriz,
        atualizado_por: atualizadoPor,
        atualizado_em: atualizadoEm,
      },
    }

    if (!usaSmtpProprio) {
      resp.aviso =
        'Sem servidor SMTP próprio o "De" é reescrito pela plataforma; o endereço acima vira Responder-para.'
    }

    return e.json(200, resp)
  },
  $apis.requireAuth(),
)
