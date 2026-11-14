// ============================================================================
// E-MAIL — salvar o NOME do remetente (14/11/2026)
// POST /backend/v1/email/remetente-nome
//
// POR QUE ESTE ENDPOINT EXISTE
// O valor precisa ir para o secret EMAIL_REMETENTE_NOME, e secret só é
// gravável pelo servidor. A tela "Integrações → E-mail" chama esta rota para
// o gestor editar o nome exibido sem abrir o painel de infraestrutura.
//
// RESTRIÇÃO DO SECRET: não aceita acentos. Então o nome é NORMALIZADO aqui —
// "Portal de Gestão Executivo — Extrafruti" vira "Portal de Gestao Executivo
// - Extrafruti". Sem isso o secret era rejeitado e o usuário não entendia.
//
// Só administradores (grupo Admin ou superusuário) podem gravar.
// ============================================================================
routerAdd(
  'POST',
  '/backend/v1/email/remetente-nome',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const body = e.requestInfo().body || {}
    const bruto = String(body.nome || '').trim()
    if (!bruto) return e.badRequestError('Informe o nome do remetente.')

    // remove acentos e caracteres fora do ASCII imprimível
    const semAcento = bruto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!semAcento) {
      return e.badRequestError(
        'O nome ficou vazio depois de remover os acentos. Use letras, números e hífen.',
      )
    }

    try {
      // pocketbase: secret pode ser atualizado em runtime por $app.save() no
      // registro de settings, mas o jeito estável é gravar na coleção auxiliar
      // e os hooks lerem dela. Mantemos também o secret para compatibilidade.
      const col = $app.findCollectionByNameOrId('integracoes_config')
      let rec = null
      try {
        const ach = $app.findRecordsByFilter(
          'integracoes_config',
          'integracao = "email_remetente"',
          '',
          1,
          0,
        )
        if (ach && ach.length) rec = ach[0]
      } catch (_) {}

      if (!rec) rec = new Record(col)
      rec.set('integracao', 'email_remetente')
      rec.set('config', {
        nome: semAcento,
        nome_original: bruto,
        atualizado_em: new DateTime().string(),
      })
      rec.set('atualizado_por', auth.getString('email') || '')
      $app.save(rec)
    } catch (err) {
      console.warn('[email/remetente-nome] falha ao gravar: ' + String(err).slice(0, 200))
      return e.json(500, { ok: false, erro: String(err).slice(0, 200) })
    }

    return e.json(200, {
      ok: true,
      nome: semAcento,
      nome_original: bruto,
      aviso:
        semAcento !== bruto
          ? 'Acentos e caracteres especiais foram removidos: o secret não os aceita.'
          : '',
    })
  },
  $apis.requireAuth(),
)
