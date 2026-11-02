// Migration 0036 — Renomeia empresa CPF para LL5 e garante registro ativo de logomarca da LL5
migrate(
  (app) => {
    // 1. Atualizar tarefas que referenciam CPF para LL5
    try {
      app
        .db()
        .newQuery("UPDATE tarefas SET empresa = 'LL5' WHERE empresa = 'CPF' OR empresa = 'cpf'")
        .execute()
    } catch (_) {}

    // 2. Renomear ou criar empresa LL5 na coleção empresas
    let empLL5 = null
    try {
      const empCpf = app.findFirstRecordByFilter('empresas', 'nome = "CPF" || nome = "cpf"')
      empCpf.set('nome', 'LL5')
      empCpf.set('cor', '#1B5E20')
      empCpf.set('ativa', true)
      app.save(empCpf)
      empLL5 = empCpf
    } catch (_) {}

    if (!empLL5) {
      try {
        empLL5 = app.findFirstRecordByFilter('empresas', 'nome = "LL5"')
        empLL5.set('ativa', true)
        app.save(empLL5)
      } catch (_) {
        try {
          const colEmp = app.findCollectionByNameOrId('empresas')
          const rEmp = new Record(colEmp)
          rEmp.set('nome', 'LL5')
          rEmp.set('cor', '#1B5E20')
          rEmp.set('ativa', true)
          app.save(rEmp)
        } catch (_) {}
      }
    }

    // 3. Garantir registro de logomarca para LL5 ativo
    try {
      const logoCpf = app.findFirstRecordByFilter(
        'logomarcas',
        'empresa = "CPF" || empresa = "cpf"',
      )
      logoCpf.set('empresa', 'LL5')
      logoCpf.set('sigla', 'LL5')
      logoCpf.set('ativo', true)
      app.save(logoCpf)
    } catch (_) {}

    try {
      const logoLL5 = app.findFirstRecordByFilter('logomarcas', 'empresa = "LL5"')
      logoLL5.set('ativo', true)
      if (!logoLL5.getString('logo') && !logoLL5.getString('emblema')) {
        logoLL5.set('logo', 'icon_512_ajustado_10pk3eahuq.png')
        logoLL5.set('emblema', 'icon_512_ajustado_8hqrpiqas9.png')
      }
      app.save(logoLL5)
    } catch (_) {
      try {
        const colLogo = app.findCollectionByNameOrId('logomarcas')
        const rLogo = new Record(colLogo)
        rLogo.set('empresa', 'LL5')
        rLogo.set('sigla', 'LL5')
        rLogo.set('cor', '#1B5E20')
        rLogo.set('logo', 'icon_512_ajustado_10pk3eahuq.png')
        rLogo.set('emblema', 'icon_512_ajustado_8hqrpiqas9.png')
        rLogo.set('ativo', true)
        app.save(rLogo)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      app.db().newQuery("UPDATE tarefas SET empresa = 'CPF' WHERE empresa = 'LL5'").execute()
    } catch (_) {}
  },
)
