// CAC — "Enviar Login" (11/11/2026)
// POST /backend/v1/usuarios/{id}/enviar-login
//
// Envia ao usuário as instruções e o endereço de acesso ao Portal de Gestão
// Executivo. Decisão de segurança: a SENHA NÃO vai no corpo do e-mail.
//
// v2 (11/11/2026):
//  - topo da arte com as LOGOMARCAS das empresas às quais o usuário tem vínculo
//    (empresa_id + empresa da unidade). As imagens de /api/files são servidas
//    publicamente sem autenticação, então carregam no e-mail.
// - endereço do portal passa a ser https://portalefsa.goskip.app
// v3 (11/11/2026): o link "Trocar minha senha" e o botão "Cadastrar / trocar senha"
//  apontavam para /configuracoes (rota protegida) — quem clicava sem sessão caía no
//  login. Agora apontam para /reset-password?token=... (rota pública da SPA), com um
//  token de redefinição de senha gerado aqui para o próprio usuário.
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
    const portalUrl = 'https://portalefsa.goskip.app'
    // Link de troca de senha: rota pública /reset-password com token de redefinição
    // (funciona sem sessão ativa, direto do e-mail).
    let linkSenha = portalUrl + '/reset-password'
    try {
      linkSenha += '?token=' + encodeURIComponent(usuario.newPasswordResetToken())
    } catch (err) {
      console.log('enviar-login: falha ao gerar token de redefinição: ' + String(err))
    }

    // ===== Empresas vinculadas ao usuário =====
    // Origem: empresa_id do próprio usuário + empresa da unidade (quando houver).
    // Nomes normalizados para casar com a coleção `logomarcas`.
    const norm = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

    const nomesEmpresas = []
    const addEmpresa = (n) => {
      const v = String(n || '').trim()
      if (!v) return
      for (const ja of nomesEmpresas) {
        if (norm(ja) === norm(v)) return
      }
      nomesEmpresas.push(v)
    }

    try {
      const empId = usuario.getString('empresa_id')
      if (empId) addEmpresa($app.findRecordById('empresas', empId).getString('nome'))
    } catch (_) {}

    try {
      const uniId = usuario.getString('unidade_id')
      if (uniId) {
        const uni = $app.findRecordById('unidades', uniId)
        // `unidades` só tem a relação empresa_id (não existe campo texto 'empresa')
        const empDaUnidade = uni.getString('empresa_id')
        if (empDaUnidade) {
          addEmpresa($app.findRecordById('empresas', empDaUnidade).getString('nome'))
        }
      }
    } catch (_) {}

    // ===== Logomarcas das empresas vinculadas =====
    let base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($secrets.get('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/$/, '').replace(/\/$/, '')
    const colLogosId = 'pbc_3701359284' // coleção logomarcas

    const logos = []
    if (base) {
      for (const nomeEmpresa of nomesEmpresas) {
        try {
          // Assinatura: (collection, filter, sort, limit, offset) — 5 args, sem objeto de bind
          const empEscapada = nomeEmpresa.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          const filtro = 'ativo = true && empresa = "' + empEscapada + '"'
          const achados = $app.findRecordsByFilter('logomarcas', filtro, 'empresa', 1, 0)
          if (achados && achados.length > 0) {
            const rec = achados[0]
            const arquivo = rec.getString('logo') || rec.getString('emblema')
            if (arquivo) {
              logos.push({
                empresa: rec.getString('empresa'),
                url: base + '/api/files/' + colLogosId + '/' + rec.id + '/' + arquivo,
              })
            }
          }
        } catch (_) {}
      }

      // Fallback: nenhuma logo encontrada por vínculo -> usa todas as ativas,
      // para a arte nunca aparecer sem identidade visual.
      if (logos.length === 0) {
        try {
          const todas = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 6, 0)
          for (const rec of todas || []) {
            const arquivo = rec.getString('logo') || rec.getString('emblema')
            if (arquivo) {
              logos.push({
                empresa: rec.getString('empresa'),
                url: base + '/api/files/' + colLogosId + '/' + rec.id + '/' + arquivo,
              })
            }
          }
        } catch (_) {}
      }
    }

    // Faixa de logomarcas no topo da arte
    const logomarcasHtml =
      logos.length > 0
        ? '<tr><td style="background:#ffffff;padding:18px 20px;border:1px solid #e5e7eb;' +
          'border-top:0;border-bottom:0;text-align:center">' +
          logos
            .map(
              (l) =>
                '<img src="' +
                l.url +
                '" alt="' +
                l.empresa +
                '" title="' +
                l.empresa +
                '" height="42" style="height:42px;width:auto;max-height:42px;max-width:140px;' +
                'margin:0 12px;vertical-align:middle;border:0;outline:none;text-decoration:none" />',
            )
            .join('') +
          '</td></tr>'
        : ''

    // Grupo do usuário (só informativo no corpo)
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
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse">' +
      // 1. Faixa com as logomarcas das empresas do usuário
      logomarcasHtml +
      // 2. Barra de marca
      '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:0">' +
      '<strong style="font-size:15px">Portal de Gestão Executivo</strong>' +
      '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Grupo Extrafruti · Casafruti · FoldBox</span></td></tr>' +
      '</table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">Seu acesso está liberado</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      nome +
      '</strong>!</p>' +
      '<p style="font-size:14px;line-height:1.6">Seu acesso ao <strong>Portal de Gestão Executivo</strong> está disponível.</p>' +
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
      (nomesEmpresas.length > 0
        ? '<tr><td style="padding:6px 0;color:#6b7280">Empresa(s)</td><td style="padding:6px 0">' +
          nomesEmpresas.join(' · ') +
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
          det:
            email +
            ' | empresas: ' +
            (nomesEmpresas.join(',') || '-') +
            ' | logos: ' +
            logos.length +
            (erro ? ' (ERRO: ' + erro.slice(0, 80) + ')' : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    if (status === 'erro') {
      return e.json(502, { ok: false, erro: erro || 'falha no envio' })
    }
    return e.json(200, {
      ok: true,
      para: email,
      empresas: nomesEmpresas,
      logos: logos.length,
    })
  },
  $apis.requireAuth(),
)
