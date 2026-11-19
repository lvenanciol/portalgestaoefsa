/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// CRON: DRENA A FILA DE E-MAIL (19/11/2026)
//
// Roda a cada minuto e envia o que o hook gravou como 'pendente' em
// `emails_fila`. Existe porque o SMTP é SÍNCRONO e caro (3.600–4.900 ms por
// mensagem) e o JSVM do PocketBase NÃO tem `$app.go` nem `setTimeout` — não
// havia como tirar o envio do ciclo de resposta sem uma fila persistida.
//
// Regras:
//  · no máximo 20 por rodada (não estourar o tempo do cron);
//  · 3 tentativas; depois marca 'erro' com o motivo (não fica tentando para
//    sempre nem perde o registro);
//  · cada mensagem é marcada 'enviado' ANTES de seguir para a próxima, para
//    que uma falha no meio não reenvie as anteriores.
// ============================================================================

cronAdd('emails_fila_enviar', '* * * * *', () => {
  let pendentes = []
  try {
    pendentes = $app.findRecordsByFilter('emails_fila', 'status = "pendente"', 'created', 20, 0)
  } catch (err) {
    // sem a coleção ainda (migração não rodou) ou erro de consulta
    console.log('[emails_fila] nada a fazer: ' + String(err).slice(0, 120))
    return
  }
  if (!pendentes || !pendentes.length) return

  let enviados = 0
  let falhas = 0
  for (let i = 0; i < pendentes.length; i++) {
    const rec = pendentes[i]
    const dest = (rec.getString('para') || '').trim()
    const assunto = rec.getString('assunto') || '(sem assunto)'
    const html = rec.getString('corpo_html') || ''
    const texto = rec.getString('corpo_texto') || ''
    const tent = rec.getInt('tentativas') || 0

    if (!dest || dest.indexOf('@') === -1) {
      rec.set('status', 'erro')
      rec.set('erro', 'destinatario invalido')
      try {
        $app.save(rec)
      } catch (_) {}
      falhas++
      continue
    }

    try {
      const remetente = (() => {
        let a = ''
        try {
          a = String($secrets.get('EMAIL_REMETENTE') || '').trim()
        } catch (_) {}
        if (!a) {
          try {
            a = String($app.settings().meta.senderAddress || '').trim()
          } catch (_) {}
        }
        return a
      })()

      const msg = new MailerMessage({
        from: { address: remetente },
        to: [{ address: dest }],
        subject: assunto,
        html: html,
        text: texto,
      })
      $app.newMailClient().send(msg)

      rec.set('status', 'enviado')
      rec.set('erro', '')
      try {
        rec.set('enviado_em', new Date().toISOString())
      } catch (_) {}
      $app.save(rec)
      enviados++
      console.log('[emails_fila] enviado para ' + dest)
    } catch (errS) {
      const n = tent + 1
      rec.set('tentativas', n)
      rec.set('status', n >= 3 ? 'erro' : 'pendente')
      rec.set('erro', String(errS).slice(0, 480))
      try {
        $app.save(rec)
      } catch (_) {}
      falhas++
      console.log(
        '[emails_fila] falha (' + n + '/3) para ' + dest + ': ' + String(errS).slice(0, 100),
      )
    }
  }

  try {
    console.log('[emails_fila] rodada: enviados=' + enviados + ' falhas=' + falhas)
  } catch (_) {}
})
