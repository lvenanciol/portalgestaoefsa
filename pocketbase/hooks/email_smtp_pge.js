// ============================================================================
// LL5 — SMTP DA OFFICE 365 PARA O PGE (15/11/2026)
//
// Servidor informado pelo dono:
//   host  smtp.office365.com
//   porta 587 (STARTTLS)
//   user  portalpge@extrafruti.com.br
//   senha → SECRET, não literal (pedido explícito: "Quero cadastrar como
//           uma secret")
//
// ORDEM DE LEITURA DA SENHA (primeira que existir vence):
//   1. SMTP_PORTALPGE_PASS   ← a que o dono deve preencher
//   2. SMTP_PASS             ← legado
//
// O endpoint devolve se a senha está configurada e TESTA a conexão,
// para o dono saber se funciona sem adivinhar.
//
// PAYLOAD do teste: um envio real para o próprio remetente. Se o servidor
// recusar credencial, o erro vem na resposta.
// ============================================================================

routerAdd(
  'GET',
  '/backend/v1/email/smtp-status',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let comSecret = ''
    let nomeUsado = ''
    try {
      const a = String($secrets.get('SMTP_PORTALPGE_PASS') || '')
      if (a && a !== '__AGUARDANDO_VALOR__') {
        comSecret = a
        nomeUsado = 'SMTP_PORTALPGE_PASS'
      }
    } catch (_) {}
    if (!comSecret) {
      try {
        const b = String($secrets.get('SMTP_PASS') || '')
        if (b && b !== '__AGUARDANDO_VALOR__' && b !== 'PLACEHOLDER_DEFINIR_DEPOIS') {
          comSecret = b
          nomeUsado = 'SMTP_PASS'
        }
      } catch (_) {}
    }

    const s = $app.settings()
    return e.json(200, {
      success: true,
      smtp: {
        enabled: !!s.smtp.enabled,
        host: String(s.smtp.host || ''),
        port: Number(s.smtp.port || 0),
        username: String(s.smtp.username || ''),
        tls: !!s.smtp.tls,
        tem_senha: !!s.smtp.password,
        senha_da_secret: nomeUsado || '(nenhuma secret válida)',
      },
      remetente: {
        endereco: String(s.meta.senderAddress || ''),
        nome: String(s.meta.senderName || ''),
      },
      pronto: !!(s.smtp.enabled && s.smtp.host && s.smtp.password),
    })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// APLICA A SECRET NO SETTINGS DE E-MAIL
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/email/aplicar-secret',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let senha = ''
    let nomeUsado = ''
    try {
      const a = String($secrets.get('SMTP_PORTALPGE_PASS') || '')
      if (a && a !== '__AGUARDANDO_VALOR__') {
        senha = a
        nomeUsado = 'SMTP_PORTALPGE_PASS'
      }
    } catch (_) {}
    if (!senha) {
      try {
        const b = String($secrets.get('SMTP_PASS') || '')
        if (b && b !== '__AGUARDANDO_VALOR__' && b !== 'PLACEHOLDER_DEFINIR_DEPOIS') {
          senha = b
          nomeUsado = 'SMTP_PASS'
        }
      } catch (_) {}
    }

    if (!senha) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma secret de senha válida. Cadastre SMTP_PORTALPGE_PASS com a senha do portalpge@extrafruti.com.br.',
      })
    }

    try {
      const s = $app.settings()
      s.smtp.enabled = true
      s.smtp.host = 'smtp.office365.com'
      s.smtp.port = 587
      s.smtp.username = 'portalpge@extrafruti.com.br'
      s.smtp.password = senha
      s.smtp.tls = true
      s.smtp.authMethod = 'PLAIN'
      s.meta.senderAddress = 'portalpge@extrafruti.com.br'
      s.meta.senderName = 'Portal de Gestão Executivo — Extrafruti'
      app.save(s)
      console.log('[smtp4] aplicado com senha da secret ' + nomeUsado)
    } catch (err) {
      return e.json(200, {
        success: false,
        erro: 'Falha ao salvar settings: ' + String(err).slice(0, 160),
      })
    }

    return e.json(200, {
      success: true,
      senha_da_secret: nomeUsado,
      host: 'smtp.office365.com',
      porta: 587,
      usuario: 'portalpge@extrafruti.com.br',
    })
  },
  $apis.requireAuth(),
)
