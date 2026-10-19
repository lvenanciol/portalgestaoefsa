// Ajustes PGE (19/10) — T2c: compartilhar tarefa com parceiro/contato via
// WhatsApp (link wa.me — abre no aparelho com texto pronto) ou E-mail
// (envio real via relay, mesmo motor do compositor). Auditoria em ambos.

routerAdd(
  'POST',
  '/backend/v1/tarefas/compartilhar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const body = e.requestInfo().body || {}
    const canal = String(body.canal || '') // 'whatsapp' | 'email'
    const parceiroId = String(body.parceiro_id || '')
    const tarefaId = String(body.tarefa_id || '')
    if (!canal || !parceiroId || !tarefaId) {
      return e.badRequestError('canal, parceiro_id e tarefa_id são obrigatórios')
    }

    let parceiro
    try {
      parceiro = $app.findRecordById('parceiros', parceiroId)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Parceiro não encontrado.' })
    }
    let tarefa
    try {
      tarefa = $app.findRecordById('tarefas', tarefaId)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Tarefa não encontrada.' })
    }

    // monta o texto da tarefa
    const prazo = tarefa.getString('prazo')
      ? String(tarefa.getString('prazo')).slice(0, 10)
      : 'sem prazo'
    const texto =
      'Tarefa: ' +
      tarefa.getString('titulo') +
      '\nPrioridade: ' +
      (tarefa.getString('prioridade_p') || 'P3') +
      '\nPrazo: ' +
      prazo +
      '\nResponsável: ' +
      (tarefa.getString('responsavel') || '—') +
      (tarefa.getString('descricao') ? '\n\n' + tarefa.getString('descricao') : '') +
      '\n\nEnviado via Portal de Gestão Executivo — Extrafruti'

    if (canal === 'whatsapp') {
      let fone = parceiro.getString('whatsapp') || parceiro.getString('telefone') || ''
      if (!fone)
        return e.json(400, { ok: false, erro: 'Parceiro sem WhatsApp/telefone cadastrado.' })
      const digitos = fone.replace(/\D/g, '')
      const link = 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto)
      try {
        const aid = $security.randomString(15)
        $app
          .db()
          .newQuery(
            "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'compartilhar_tarefa', 'tarefas', {:det}, {:now}, {:now})",
          )
          .bind({
            id: aid,
            uid: auth.id,
            uemail: auth.getString('email'),
            det:
              'WhatsApp → ' +
              parceiro.getString('nome') +
              ' (tarefa ' +
              tarefa.getString('titulo') +
              ')',
            now: new DateTime().string(),
          })
          .execute()
      } catch (_) {}
      return e.json(200, { ok: true, canal: 'whatsapp', link: link })
    }

    if (canal === 'email') {
      const email = parceiro.getString('email') || ''
      if (!email) return e.json(400, { ok: false, erro: 'Parceiro sem e-mail cadastrado.' })
      const html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
        '<div style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">' +
        '<strong style="font-size:15px">Portal de Gestão Executivo — Extrafruti</strong></div>' +
        '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
        '<h2 style="margin:0 0 12px;font-size:16px">' +
        tarefa.getString('titulo') +
        '</h2>' +
        '<div style="font-size:14px;line-height:1.8;white-space:pre-wrap">' +
        'Prioridade: ' +
        (tarefa.getString('prioridade_p') || 'P3') +
        '\n' +
        'Prazo: ' +
        prazo +
        '\n' +
        'Responsável: ' +
        (tarefa.getString('responsavel') || '—') +
        (tarefa.getString('descricao') ? '\n\n' + tarefa.getString('descricao') : '') +
        '</div>' +
        '<p style="margin-top:24px;font-size:11px;color:#9ca3af">Grupo Extrafruti · Casafruti · FoldBox</p>' +
        '</div></div>'
      try {
        const message = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress,
            name: 'Portal de Gestão Executivo — Extrafruti',
          },
          to: [{ address: email }],
          subject: 'Tarefa: ' + tarefa.getString('titulo'),
          html: html,
          text: texto,
        })
        $app.newMailClient().send(message)
      } catch (err) {
        return e.json(502, { ok: false, erro: 'Falha no envio: ' + String(err).slice(0, 200) })
      }
      try {
        const aid = $security.randomString(15)
        $app
          .db()
          .newQuery(
            "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'compartilhar_tarefa', 'tarefas', {:det}, {:now}, {:now})",
          )
          .bind({
            id: aid,
            uid: auth.id,
            uemail: auth.getString('email'),
            det:
              'E-mail → ' +
              parceiro.getString('nome') +
              ' (' +
              email +
              ') tarefa ' +
              tarefa.getString('titulo'),
            now: new DateTime().string(),
          })
          .execute()
      } catch (_) {}
      return e.json(200, { ok: true, canal: 'email' })
    }

    return e.badRequestError('canal deve ser whatsapp ou email')
  },
  $apis.requireAuth(),
)
