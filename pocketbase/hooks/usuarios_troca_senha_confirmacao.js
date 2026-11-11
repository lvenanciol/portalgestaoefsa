// CONFIRMAÇÃO DE E-MAIL DE REDEFINIÇÃO DE SENHA (11/11/2026)
//
// Quando o usuário conclui a troca de senha pela tela pública /reset-password
// (pb.collection('users').confirmPasswordReset(...)), o PocketBase dispara
// onRecordAfterUpdateSuccess na coleção `users`. Este hook intercepta esse
// evento e envia um e-mail de confirmação de segurança ao usuário (PT-BR):
//
//   "Sua senha do Portal de Gestão Executivo foi alterada com sucesso em [data/hora].
//    Se você não fez esta alteração, contate o administrador."
//
// Decisões de design (pedido do usuário):
// - O e-mail sai SOMENTE quando a troca realmente aconteceu (o hook só roda
//   depois de a senha ter sido persistida com sucesso).
// - Se o envio do e-mail falhar, a troca NÃO é desfeita: o erro é apenas
//   logado no backend. A tela de redefinição segue exibindo a confirmação
//   de sucesso normalmente (o estado `ok` é setado por confirmPasswordReset,
//   não pelo resultado do envio).
// - Mesmo mecanismo do hook usuarios_enviar_login.js: MailerMessage +
//   $app.newMailClient().send(...) (SMTP já configurado no PocketBase),
//   com registro do histórico na coleção `emails` (modelo 'troca_senha').
//
// Como o evento onRecordAfterUpdateSuccess da coleção `users` também dispara
// em QUALQUER outra atualização de perfil (edição de nome, empresa, etc.),
// o hook filtra precisamente por troca de senha: só envia quando o hash
// da senha realmente mudou em relação ao estado ANTES da atualização.

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return e.next()

    // 1. A senha precisa ter mudado de fato (comparação com o estado pré-save).
    const senhaAtual = String(record.getString('password') || '')
    const senhaAnterior = record.original()
      ? String(record.original().getString('password') || '')
      : ''
    if (!senhaAtual || !senhaAnterior || senhaAtual === senhaAnterior) {
      return e.next()
    }

    // 2. Garante que é uma conta real do portal (com e-mail).
    const email = record.getString('email')
    if (!email) return e.next()

    // 3. Data/hora da alteração em PT-BR (formato 11/11/2026 às 14:35).
    let dataHora = ''
    try {
      const iso = new Date().toISOString()
      dataHora =
        iso.slice(8, 10) +
        '/' +
        iso.slice(5, 7) +
        '/' +
        iso.slice(0, 4) +
        ' às ' +
        iso.slice(11, 13) +
        ':' +
        iso.slice(14, 16)
    } catch (_) {
      dataHora = new DateTime().string()
    }
    dataHora = dataHora + ' (horário de Brasília)' // ajustado abaixo
    try {
      // Ajuste de fuso: PocketBase grava tudo em UTC — aplicamos -3h (BRT).
      const agora = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const y = agora.getUTCFullYear()
      const m = String(agora.getUTCMonth() + 1).padStart(2, '0')
      const d = String(agora.getUTCDate()).padStart(2, '0')
      const hh = String(agora.getUTCHours()).padStart(2, '0')
      const mm = String(agora.getUTCMinutes()).padStart(2, '0')
      dataHora = d + '/' + m + '/' + y + ' às ' + hh + ':' + mm + ' (horário de Brasília)'
    } catch (_) {}

    const nome = record.getString('name') || email
    const portalUrl = 'https://portalefsa.goskip.app'

    const assunto = 'Sua senha do Portal de Gestão Executivo foi alterada'

    const corpoTexto =
      'Olá, ' +
      nome +
      '!\n\n' +
      'Sua senha do Portal de Gestão Executivo foi alterada com sucesso em ' +
      dataHora +
      '.\n\n' +
      'Se você não fez esta alteração, contate o administrador do sistema imediatamente.\n\n' +
      'Endereço de acesso: ' +
      portalUrl +
      '\n\n' +
      'Equipe de TI — Grupo Extrafruti · Casafruti · FoldBox'

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse">' +
      '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
      '<strong style="font-size:15px">Portal de Gestão Executivo</strong>' +
      '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Grupo Extrafruti · Casafruti · FoldBox</span></td></tr>' +
      '</table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">Confirmação de alteração de senha</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      nome +
      '</strong>!</p>' +
      '<p style="font-size:14px;line-height:1.6">Sua senha do <strong>Portal de Gestão Executivo</strong> foi alterada com sucesso em <strong>' +
      dataHora +
      '</strong>.</p>' +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e;line-height:1.6">' +
      '<strong>Se você não fez esta alteração, contate o administrador do sistema imediatamente.</strong>' +
      '</div>' +
      '<p style="margin:16px 0 4px;font-size:14px"><strong>Endereço de acesso:</strong> ' +
      '<a href="' +
      portalUrl +
      '" style="color:#1B5E20;font-weight:bold">' +
      portalUrl +
      '</a></p>' +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso restrito. ' +
      'Não compartilhe suas credenciais. Grupo Extrafruti · Casafruti · FoldBox</p>' +
      '</div></div>'

    let status = 'enviado'
    let erro = ''
    try {
      const message = new MailerMessage({
        from: {
          address: $app.settings().meta.senderAddress,
          name: 'Portal de Gestão Executivo — Extrafruti',
        },
        to: [{ address: email }],
        subject: assunto,
        html: html,
        text: corpoTexto,
      })
      $app.newMailClient().send(message)
    } catch (errEnvio) {
      // A troca de senha NÃO é desfeita: apenas registramos o erro.
      status = 'erro'
      erro = String(errEnvio).slice(0, 500)
      console.error('troca_senha: falha ao enviar e-mail de confirmação: ' + erro)
    }

    // Histórico na coleção `emails` (mesmo padrão de usuarios_enviar_login.js).
    try {
      const col = $app.findCollectionByNameOrId('emails')
      const rec = new Record(col)
      rec.set('para', email)
      rec.set('assunto', assunto)
      rec.set('corpo', corpoTexto.slice(0, 20000))
      rec.set('status', status)
      rec.set('erro', erro)
      rec.set('modelo', 'troca_senha')
      rec.set('criado_por', 'sistema')
      $app.save(rec)
    } catch (errHist) {
      console.warn('troca_senha: falha ao registrar histórico de e-mail: ' + String(errHist))
    }
  } catch (err) {
    // Nunca quebra o fluxo de redefinição: loga e segue.
    console.warn('Erro no hook de confirmação de troca de senha:', err)
  } finally {
    return e.next()
  }
}, 'users')
