// Fase 2 — Migração 0003: seed idempotente — 3 empresas, unidades,
// grupos de permissão, árvore de menus completa e usuário Admin.
// Tudo com try/catch (idempotente: replays em cópias não duplicam).
migrate(
  (app) => {
    // ---------- EMPRESAS ----------
    const empresasSeed = [
      { nome: 'Extrafruti', cnpj: '27.318.431/0001-60', cor: '#1B5E20', ativa: true },
      { nome: 'Casafruti', cnpj: '05.092.761/0001-10', cor: '#F59E0B', ativa: true },
      { nome: 'FoldBox', cnpj: '44.558.221/0001-77', cor: '#0F3D13', ativa: true },
    ]
    const empresaIds = {}
    for (const e of empresasSeed) {
      let rec
      try {
        rec = app.findFirstRecordByFilter('empresas', `nome = "${e.nome}"`, '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('empresas')
        rec = new Record(col)
        rec.set('nome', e.nome)
        rec.set('cnpj', e.cnpj)
        rec.set('cor', e.cor)
        rec.set('ativa', e.ativa)
        app.save(rec)
      }
      empresaIds[e.nome] = rec.id
    }

    // ---------- UNIDADES ----------
    const unidadesSeed = [
      { empresa: 'Extrafruti', nome: 'Matriz Cariacica', tipo: 'matriz' },
      { empresa: 'Extrafruti', nome: 'CD Serra', tipo: 'cd' },
      { empresa: 'Extrafruti', nome: 'Loja Vila Velha', tipo: 'loja' },
      { empresa: 'Extrafruti', nome: 'Loja Vitória', tipo: 'loja' },
      { empresa: 'Casafruti', nome: 'Matriz Casafruti', tipo: 'matriz' },
      { empresa: 'Casafruti', nome: 'CD Norte', tipo: 'cd' },
      { empresa: 'FoldBox', nome: 'Fábrica Embalagens', tipo: 'matriz' },
      { empresa: 'FoldBox', nome: 'CD FoldBox', tipo: 'cd' },
    ]
    for (const u of unidadesSeed) {
      try {
        app.findFirstRecordByFilter(
          'unidades',
          `empresa_id = "${empresaIds[u.empresa]}" && nome = "${u.nome}"`,
          '',
          1,
          0,
        )
      } catch (_) {
        const col = app.findCollectionByNameOrId('unidades')
        const rec = new Record(col)
        rec.set('nome', u.nome)
        rec.set('empresa_id', empresaIds[u.empresa])
        rec.set('tipo', u.tipo)
        rec.set('ativa', true)
        app.save(rec)
      }
    }

    // ---------- GRUPOS DE PERMISSÃO ----------
    const gruposSeed = [
      {
        nome: 'Admin',
        descricao: 'Acesso total ao portal',
        escopo: 'grupo',
        permissoes: {
          '*': {
            ver: true,
            criar: true,
            editar: true,
            excluir: true,
            exportar: true,
            aprovar: true,
          },
        },
      },
      {
        nome: 'Financeiro',
        descricao: 'Módulos financeiros e contábeis',
        escopo: 'grupo',
        permissoes: {
          'financeiro-contabil': {
            ver: true,
            criar: true,
            editar: true,
            excluir: false,
            exportar: true,
            aprovar: true,
          },
          'dashboard-executivo': {
            ver: true,
            criar: false,
            editar: false,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
        },
      },
      {
        nome: 'Gestor de Unidade',
        descricao: 'Visão da própria unidade',
        escopo: 'unidade',
        permissoes: {
          'dashboard-executivo': {
            ver: true,
            criar: false,
            editar: false,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
          'desempenho-unidade': {
            ver: true,
            criar: false,
            editar: true,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
        },
      },
      {
        nome: 'Auditor',
        descricao: 'Somente leitura + auditoria',
        escopo: 'grupo',
        permissoes: {
          '*': {
            ver: true,
            criar: false,
            editar: false,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
        },
      },
      {
        nome: 'RH',
        descricao: 'Indicadores de pessoas e turnover',
        escopo: 'grupo',
        permissoes: {
          indicadores: {
            ver: true,
            criar: true,
            editar: true,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
          'dashboard-executivo': {
            ver: true,
            criar: false,
            editar: false,
            excluir: false,
            exportar: false,
            aprovar: false,
          },
        },
      },
      {
        nome: 'Comercial',
        descricao: 'Desempenho comercial e contratos',
        escopo: 'grupo',
        permissoes: {
          'desempenho-unidade': {
            ver: true,
            criar: false,
            editar: false,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
          contratos: {
            ver: true,
            criar: true,
            editar: true,
            excluir: false,
            exportar: true,
            aprovar: false,
          },
        },
      },
    ]
    for (const g of gruposSeed) {
      try {
        app.findFirstRecordByFilter('grupos_permissao', `nome = "${g.nome}"`, '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('grupos_permissao')
        const rec = new Record(col)
        rec.set('nome', g.nome)
        rec.set('descricao', g.descricao)
        rec.set('escopo', g.escopo)
        rec.set('permissoes', g.permissoes)
        app.save(rec)
      }
    }

    // ---------- MENUS (árvore completa da SPEC) ----------
    const menusSeed = [
      { titulo: 'Dashboard Executivo', rota: '/', secao: 'GESTÃO', ordem: 1, icone: 'dashboard' },
      {
        titulo: 'Financeiro & Contábil',
        rota: '/financeiro',
        secao: 'GESTÃO',
        ordem: 2,
        icone: 'briefcase',
      },
      {
        titulo: 'Desempenho por Unidade',
        rota: '/desempenho',
        secao: 'GESTÃO',
        ordem: 3,
        icone: 'bar-chart',
      },
      {
        titulo: 'Indicadores',
        rota: '/indicadores',
        secao: 'GESTÃO',
        ordem: 4,
        icone: 'line-chart',
      },
      {
        titulo: 'Documentos & Importações',
        rota: '/documentos',
        secao: 'OPERAÇÃO',
        ordem: 5,
        icone: 'file-text',
      },
      {
        titulo: 'Tarefas & Agenda',
        rota: '/tarefas',
        secao: 'OPERAÇÃO',
        ordem: 6,
        icone: 'calendar',
      },
      { titulo: 'Projetos', rota: '/projetos', secao: 'OPERAÇÃO', ordem: 7, icone: 'folder' },
      { titulo: 'Atas & Reuniões', rota: '/atas', secao: 'OPERAÇÃO', ordem: 8, icone: 'users' },
      { titulo: 'E-mails', rota: '/emails', secao: 'RELACIONAMENTO', ordem: 9, icone: 'mail' },
      {
        titulo: 'Contratos',
        rota: '/contratos',
        secao: 'RELACIONAMENTO',
        ordem: 10,
        icone: 'file-check',
      },
      { titulo: 'Power BI', rota: '/power-bi', secao: 'PLATAFORMA', ordem: 11, icone: 'chart' },
      { titulo: 'IA Gemini Flash', rota: '/ia', secao: 'PLATAFORMA', ordem: 12, icone: 'sparkles' },
      {
        titulo: 'Árvore de Menus',
        rota: '/menus',
        secao: 'PLATAFORMA',
        ordem: 13,
        icone: 'list-tree',
      },
      {
        titulo: 'Controle de Acessos',
        rota: '/acessos',
        secao: 'PLATAFORMA',
        ordem: 14,
        icone: 'shield',
      },
      {
        titulo: 'Configurações',
        rota: '/configuracoes',
        secao: 'PLATAFORMA',
        ordem: 15,
        icone: 'settings',
      },
    ]
    for (const m of menusSeed) {
      try {
        app.findFirstRecordByFilter('menus', `titulo = "${m.titulo}"`, '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('menus')
        const rec = new Record(col)
        rec.set('titulo', m.titulo)
        rec.set('rota', m.rota)
        rec.set('secao', m.secao)
        rec.set('ordem', m.ordem)
        rec.set('icone', m.icone)
        rec.set('ativo', true)
        app.save(rec)
      }
    }

    // ---------- USUÁRIO ADMIN SEED ----------
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'leo@extrafruti.com.br')
    } catch (_) {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const admin = new Record(users)
      admin.setEmail('leo@extrafruti.com.br')
      admin.setPassword('Extrafruti@2026')
      admin.setVerified(true)
      admin.set('name', 'Leonardo Lourenço')
      admin.set('cargo', 'Diretor')
      admin.set('ativo', true)
      try {
        const adminGrupo = app.findFirstRecordByFilter(
          'grupos_permissao',
          'nome = "Admin"',
          '',
          1,
          0,
        )
        admin.set('grupo_id', adminGrupo.id)
      } catch (_) {}
      app.save(admin)
    }
  },
  (app) => {
    // down: remove seeds (empresas/unidades/grupos/menus/admin)
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'leo@extrafruti.com.br'))
    } catch (_) {}
    for (const nome of [
      'CD FoldBox',
      'Fábrica Embalagens',
      'CD Norte',
      'Matriz Casafruti',
      'Loja Vitória',
      'Loja Vila Velha',
      'CD Serra',
      'Matriz Cariacica',
    ]) {
      try {
        app.delete(app.findFirstRecordByFilter('unidades', `nome = "${nome}"`, '', 1, 0))
      } catch (_) {}
    }
    for (const nome of ['Extrafruti', 'Casafruti', 'FoldBox']) {
      try {
        app.delete(app.findFirstRecordByFilter('empresas', `nome = "${nome}"`, '', 1, 0))
      } catch (_) {}
    }
    for (const nome of ['Admin', 'Financeiro', 'Gestor de Unidade', 'Auditor', 'RH', 'Comercial']) {
      try {
        app.delete(app.findFirstRecordByFilter('grupos_permissao', `nome = "${nome}"`, '', 1, 0))
      } catch (_) {}
    }
    try {
      const menus = app.findRecordsByFilter('menus', "secao != ''", 'ordem', 0, 0)
      for (let i = 0; i < menus.length; i++) app.delete(menus[i])
    } catch (_) {}
  },
)
