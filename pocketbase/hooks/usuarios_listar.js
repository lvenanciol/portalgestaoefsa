// Fase 3 — Lista usuários com grupo/empresa/unidade (Controle de Acessos). Somente Admin.
// v3 (11/11/2026): corrige BUG DE BUILD introduzido na v2 — o ternário
// `prev.some(...) ? : [...]` ficou solto dentro do push() e o bundle não compilava.
// Passa também: lista de empresas (empresas[]) e os dados herdados do parceiro.
routerAdd(
  'GET',
  '/backend/v1/usuarios',
  (e) => {
    const auth = e.auth
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

    const rows = $app.findRecordsByFilter('users', "id != ''", '-created', 200, 0)
    const out = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]

      let grupoNome = ''
      let empresaNome = ''
      let unidadeNome = ''
      try {
        grupoNome = $app
          .findRecordById('grupos_permissao', r.getString('grupo_id'))
          .getString('nome')
      } catch (_) {}
      try {
        empresaNome = $app.findRecordById('empresas', r.getString('empresa_id')).getString('nome')
      } catch (_) {}
      try {
        unidadeNome = $app.findRecordById('unidades', r.getString('unidade_id')).getString('nome')
      } catch (_) {}

      // Lista completa de empresas vinculadas (v3). `empresa_id` é a principal.
      let empresasIds = []
      try {
        const raw = r.getString('empresas')
        if (raw) {
          const arr = JSON.parse(raw)
          if (Array.isArray(arr)) empresasIds = arr.map(String).filter(Boolean)
        }
      } catch (_) {
        empresasIds = []
      }
      if (empresasIds.length === 0) {
        const principal = r.getString('empresa_id')
        if (principal) empresasIds = [principal]
      }

      const empresasNomes = []
      for (const empId of empresasIds) {
        try {
          empresasNomes.push($app.findRecordById('empresas', empId).getString('nome'))
        } catch (_) {}
      }

      // Parceiro vinculado + dados que o preenchem na tela de edição.
      let parceiroId = ''
      let parceiroNome = ''
      let parceiroDoc = ''
      let parceiroCargo = ''
      let parceiroTelefone = ''
      let parceiroWhatsapp = ''
      let parceiroEmail = ''
      try {
        parceiroId = r.getString('parceiro_id')
        if (parceiroId) {
          const p = $app.findRecordById('parceiros', parceiroId)
          parceiroNome = p.getString('nome')
          parceiroDoc = p.getString('documento')
          parceiroCargo = p.getString('cargo')
          parceiroTelefone = p.getString('telefone')
          parceiroWhatsapp = p.getString('whatsapp')
          parceiroEmail = p.getString('email')
        }
      } catch (_) {
        parceiroNome = ''
      }

      out.push({
        id: r.id,
        nome: r.getString('name'),
        email: r.getString('email'),
        cargo: r.getString('cargo'),
        ativo: r.getBool('ativo'),
        ultimo_login: r.getDateTime('ultimo_login').string(),
        grupo: grupoNome,
        empresa: empresaNome,
        unidade: unidadeNome,
        empresas_ids: empresasIds,
        empresas_nomes: empresasNomes,
        parceiro_id: parceiroId,
        parceiro_nome: parceiroNome,
        parceiro_documento: parceiroDoc,
        parceiro_cargo: parceiroCargo,
        parceiro_telefone: parceiroTelefone,
        parceiro_whatsapp: parceiroWhatsapp,
        parceiro_email: parceiroEmail,
        telefone: r.getString('telefone'),
        whatsapp: r.getString('whatsapp'),
        centro_resultado: r.getString('centro_resultado'),
        centro_resultado_codigo: r.getString('centro_resultado_codigo'),
        observacao: r.getString('observacao'),
      })
    }

    return e.json(200, { usuarios: out })
  },
  $apis.requireAuth(),
)
