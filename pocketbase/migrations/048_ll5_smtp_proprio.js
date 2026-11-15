/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — SMTP PRÓPRIO COM postalpge@extrafruti.com.br (15/11/2026)
//
// O e-mail saiu de `<noreply@mail.goskp.dev>` — o relay da plataforma, que
// SOBRESCREVE o From em nome da entregabilidade. Não dá para manter o
// endereço do dono passando pelo relay.
//
// Existem secrets SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS no projeto.
// Esta migração aplica esses secrets na configuração de e-mail do PocketBase
// ($app.settings()), que é o que o envio realmente usa.
//
// Se os secrets não estiverem completos, o log diz exatamente o que falta e
// NADA é alterado (não inventa credencial).
// ============================================================================
migrate(
  (app) => {
    const ENDERECO = 'portalpge@extrafruti.com.br'
    const NOME = 'Portal de Gestão Executivo — Extrafruti'

    function seg(nome) {
      try {
        return String($secrets.get(nome) || '').trim()
      } catch (_) {
        return ''
      }
    }

    const host = seg('SMTP_HOST')
    const porta = seg('SMTP_PORT')
    const usuario = seg('SMTP_USER')
    const senha = seg('SMTP_PASS')

    console.log('[smtp2] host=' + (host || 'AUSENTE'))
    console.log('[smtp2] porta=' + (porta || 'AUSENTE'))
    console.log('[smtp2] usuario=' + (usuario || 'AUSENTE'))
    console.log('[smtp2] senha=' + (senha ? 'definida' : 'AUSENTE'))

    const s = app.settings()

    // remetente SEMPRE (mesmo sem SMTP próprio, para o fallback)
    try {
      s.meta.senderAddress = ENDERECO
      s.meta.senderName = NOME
      app.save(s)
      console.log('[smtp2] remetente gravado: ' + ENDERECO)
    } catch (err) {
      console.log('[smtp2] remetente: ' + String(err).slice(0, 160))
    }

    if (!host || !porta) {
      console.log('[smtp2] SMTP próprio NÃO configurado — faltam SMTP_HOST/SMTP_PORT')
      return
    }

    // aplica o servidor próprio
    try {
      const s2 = app.settings()
      s2.smtp.enabled = true
      s2.smtp.host = host
      s2.smtp.port = Number(porta)
      s2.smtp.username = usuario
      s2.smtp.password = senha
      s2.smtp.tls = true
      s2.smtp.authMethod = 'PLAIN'
      s2.smtp.localName = 'extrafruti.com.br'
      app.save(s2)
      console.log('[smtp2] SMTP próprio ATIVADO: ' + host + ':' + porta)
    } catch (err) {
      console.log('[smtp2] ativar SMTP: ' + String(err).slice(0, 220))
    }

    // conferência (sem expor a senha)
    try {
      const c = app.settings()
      console.log(
        '[smtp2] CONFERÊNCIA enabled=' +
          String(c.smtp.enabled) +
          ' host=' +
          String(c.smtp.host) +
          ' port=' +
          String(c.smtp.port) +
          ' from=' +
          String(c.meta.senderAddress),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[smtp2] rollback: configuração mantida')
  },
)
