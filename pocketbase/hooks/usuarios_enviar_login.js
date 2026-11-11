// CAC — "Enviar Login" (11/11/2026)
// POST /backend/v1/usuarios/{id}/enviar-login
//
// Envia ao usuário as instruções e o endereço de acesso ao Portal de Gestão
// Executivo. Decisão de segurança: a SENHA NÃO vai no corpo do e-mail.
// Ela é definida no cadastro e só o administrador a conhece; enviá-la em claro
// criaria uma credencial permanente na caixa de entrada de terceiros.
// O e-mail leva o link, o login (e-mail) e o passo a passo de primeiro acesso.
routerAdd(
  'POST',
  '/backend/v1/usuarios/{id}/enviar-login',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    if (auth) {
      try {
        const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
        isAdmin = g.getString('nome') === 'Admin'
      } catch (_) {}
    }
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const id = e.request.pathValue('id')
    let usuario
    try {
      usuario = $app.findRecordById('users', id)
    } catch (_) {
      return e.notFoundError('Usuário não encontrado.')
    }

    const email = usuario.getString('email')
    if (!email) return e.badRequestError('Usuário sem e-mail cadastrado.')

    const nome = usuario.getString('name') || email
    const portalUrl = 'https://portal-de-gestao-executivo-b4d94.goskip.app'
    // Link direto para cadastro/troca de senha dentro do PGE
    const linkSenha = portalUrl + '/configuracoes?secao=seguranca'

    // Grupo do usuário, quando houver (só informativo no corpo)
    let grupoNome = ''
    try {
      const grupoId = usuario.getString('grupo_id')
      if (grupoId) grupoNome = $app.findRecordById('grupos_permissao', grupoId).getString('nome')
    } catch (_) {}

    const assunto = 'Acesso ao Portal de Gestão Executivo — Grupo Extrafruti'

    const corpoTexto =
      'Olá, ' +
      nome +
      '!\n\n' +
      'Seu acesso ao Portal de Gestão Executivo do Grupo Extrafruti está liberado.\n\n' +
      'Endereço de acesso: ' +
      portalUrl +
      '\n' +
      'Login (e-mail): ' +
      email +
      '\n' +
      (grupoNome ? 'Perfil de acesso: ' + grupoNome + '\n' : '') +
      '\n' +
      'Primeiro acesso:\n' +
      '1. Abra o endereço acima no navegador.\n' +
      '2. Informe o e-mail acima como login, junto com a senha que lhe foi entregue.\n' +
      '3. Cadastre ou troque sua senha em: ' +
      linkSenha +
      '\n\n' +
      'Por segurança, a senha não é enviada por e-mail. Se você não a recebeu ou\n' +
      'precisar redefini-la, use o link acima ou solicite ao administrador do sistema.\n\n' +
      'Atenção: este é um sistema corporativo de uso restrito. Não compartilhe suas\n' +
      'credenciais e encerre a sessão ao usar computadores compartilhados.\n\n' +
      'Equipe de TI — Grupo Extrafruti · Casafruti · FoldBox'

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<div style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">' +
      '<strong style="font-size:15px">Portal de Gestão Executivo — Extrafruti</strong></div>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">Seu acesso está liberado</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      nome +
      '</strong>!</p>' +
      '<p style="font-size:14px;line-height:1.6">Seu acesso ao <strong>Portal de Gestão Executivo</strong> do Grupo Extrafruti está disponível.</p>' +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      '<tr><td style="padding:6px 0;color:#6b7280;width:130px">Endereço</td>' +
      '<td style="padding:6px 0"><a href="' +
      portalUrl +
      '" style="color:#1B5E20;font-weight:bold">' +
      portalUrl +
      '</a></td></tr>' +
      '<tr><td style="padding:6px 0;color:#6b7280">Login</td>' +
      '<td style="padding:6px 0;font-weight:bold">' +
      email +
      '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#6b7280">Nome</td>' +
      '<td style="padding:6px 0">' +
      nome +
      '</td></tr>' +
      (grupoNome
        ? '<tr><td style="padding:6px 0;color:#6b7280">Perfil</td><td style="padding:6px 0">' +
          grupoNome +
          '</td></tr>'
        : '') +
      '</table>' +
      '<p style="font-size:14px;line-height:1.6;margin:16px 0 6px"><strong>Primeiro acesso</strong></p>' +
      '<ol style="font-size:13px;line-height:1.7;color:#374151;margin:0 0 16px 18px;padding:0">' +
      '<li>Abra o endereço acima no navegador.</li>' +
      '<li>Informe o e-mail como login e a senha que lhe foi entregue.</li>' +
      '<li>Cadastre ou troque a senha neste link: ' +
      '<a href="' +
      linkSenha +
      '" style="color:#1B5E20;font-weight:bold">Trocar minha senha</a></li>' +
      '</ol>' +
      '<p style="margin:0 0 16px"><a href="' +
      linkSenha +
      '" style="display:inline-block;background:#1B5E20;color:#fff;text-decoration:none;' +
      'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:bold">Cadastrar / trocar senha</a></p>' +
      '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e;line-height:1.6">' +
      '<strong>Por segurança, a senha não é enviada por e-mail.</strong> Use o botão acima ' +
      'para definir a sua, ou solicite ao administrador do sistema.</div>' +
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
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 500)
    }

    // Histórico na coleção `emails` (mesmo padrão de emails_enviar.js)
    try {
      const col = $app.findCollectionByNameOrId('emails')
      const rec = new Record(col)
      rec.set('para', email)
      rec.set('assunto', assunto)
      rec.set('corpo', corpoTexto.slice(0, 20000))
      rec.set('status', status)
      rec.set('erro', erro)
      rec.set('modelo', 'envio_login')
      rec.set('criado_por', auth.getString('email'))
      $app.save(rec)
    } catch (_) {}

    // Auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'login_enviado', 'usuarios', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: email + (erro ? ' (ERRO: ' + erro.slice(0, 80) + ')' : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    if (status === 'erro') {
      return e.json(502, { ok: false, erro: erro || 'falha no envio' })
    }
    return e.json(200, { ok: true, para: email })
  },
  $apis.requireAuth(),
)
