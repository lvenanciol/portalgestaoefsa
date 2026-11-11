/// <reference path="../pb_data/types.d.ts" />
// 0071 — ACESSO POR MÓDULO DO GRUPO NAS REGRAS DAS COLEÇÕES (11/11/2026)
//
// PROBLEMA: as coleções operacionais estavam com "@request.auth.id != ''".
// Consequência: quem não tinha o módulo no grupo continuava lendo e gravando
// pela API (o PocketBase é chamado direto pelo cliente) — esconder a tela não
// protegia nada. Cenário real: usuário de RH abrindo Contratos por curl.
//
// SOLUÇÃO: a própria regra da coleção passa a exigir a permissão do GRUPO:
//   leitura  → 'ver' em QUALQUER módulo dono (leitura cruzada legítima entre
//              telas: Tarefas lê `projetos`, Documentos lê `contratos`)
//   create   → 'criar' no módulo DONO
//   update   → 'editar' no módulo DONO
//   delete   → 'excluir' no módulo DONO
// Admin do grupo passa direto. Sem grupo/permissão = negado (fail-closed),
// que é a direção segura: erra fechando, nunca abrindo.
//
// Nada de hook aqui: hooks rodam em VM por callback (sem acesso a variável de
// topo), então a tabela abaixo não sobreviveria lá. Regra de coleção é
// declarativa, avaliada pelo próprio PocketBase e validada no save.

migrate(
  (app) => {
    // [coleção, módulos de LEITURA, módulo DONO da escrita]
    const MAPA = [
      ['contratos', ['contratos', 'documentos-importacoes', 'tarefas-agenda', 'dashboard-executivo'], 'contratos'],
      ['alvaras', ['documentos-importacoes', 'atas-reunioes'], 'documentos-importacoes'],
      ['convencoes', ['documentos-importacoes'], 'documentos-importacoes'],
      ['seguros', ['documentos-importacoes'], 'documentos-importacoes'],
      ['processos_juridicos', ['documentos-importacoes'], 'documentos-importacoes'],
      ['audiencias', ['documentos-importacoes', 'atas-reunioes'], 'documentos-importacoes'],
      ['documentos', ['documentos-importacoes', 'financeiro-contabil'], 'documentos-importacoes'],
      ['atas', ['documentos-importacoes', 'atas-reunioes'], 'documentos-importacoes'],
      ['atas_reunioes', ['atas-reunioes', 'documentos-importacoes'], 'atas-reunioes'],
      ['projetos', ['projetos', 'tarefas-agenda'], 'projetos'],
      ['marcos', ['projetos', 'tarefas-agenda'], 'projetos'],
      ['indicadores', ['indicadores', 'dashboard-executivo', 'desempenho-unidade'], 'indicadores'],
      ['emails', ['emails'], 'emails'],
      ['emails_inbox', ['emails'], 'emails'],
      ['parceiros', ['parceiros', 'tarefas-agenda', 'controle-acessos', 'projetos', 'atas-reunioes', 'indicadores', 'documentos-importacoes'], 'parceiros'],
    ]

    const adminBypass = '@request.auth.grupo_id.nome = "Admin"'

    // Monte a expressão: autenticado E (Admin OU permissão nos módulos)
    const regraLeitura = (mods) => {
      const partes = mods.map((m) => '@request.auth.grupo_id.permissoes.' + m + '.ver = true')
      return '@request.auth.id != "" && (' + adminBypass + ' || ' + partes.join(' || ') + ')'
    }
    const regraEscrita = (mod, acao) =>
      '@request.auth.id != "" && (' +
      adminBypass +
      ' || @request.auth.grupo_id.permissoes.' +
      mod +
      '.' +
      acao +
      ' = true)'

    for (const [nome, leitura, dono] of MAPA) {
      let col
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue // coleção ausente nesta instância: segue as demais
      }
      col.listRule = regraLeitura(leitura)
      col.viewRule = regraLeitura(leitura)
      col.createRule = regraEscrita(dono, 'criar')
      col.updateRule = regraEscrita(dono, 'editar')
      col.deleteRule = regraEscrita(dono, 'excluir')
      app.save(col)
    }
  },
  (app) => {
    // Rollback: volta todas para "qualquer autenticado".
    const nomes = [
      'contratos', 'alvaras', 'convencoes', 'seguros', 'processos_juridicos',
      'audiencias', 'documentos', 'atas', 'atas_reunioes', 'projetos', 'marcos',
      'indicadores', 'emails', 'emails_inbox', 'parceiros',
    ]
    for (const nome of nomes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        col.listRule = '@request.auth.id != ""'
        col.viewRule = '@request.auth.id != ""'
        col.createRule = '@request.auth.id != ""'
        col.updateRule = '@request.auth.id != ""'
        col.deleteRule = '@request.auth.id != ""'
        app.save(col)
      } catch (_) {}
    }
  },
)
