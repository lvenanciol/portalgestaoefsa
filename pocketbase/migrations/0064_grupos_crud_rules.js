// 0064 — Regras de escrita de 'grupos_permissao' (tarefa CAC, 11/11/2026).
// A coleção nasceu com createRule/updateRule/deleteRule = null (só superuser),
// então o CRUD de "Grupos de Permissão" no Controle de Acessos era recusado no
// cliente. Agora quem é do grupo Admin pode criar/editar/excluir; leitura segue
// liberada para qualquer usuário autenticado.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('grupos_permissao')
    // Autenticado (mesmo padrão de alvaras/convencoes/seguros). O acesso à tela
    // já é restrito a Admin pelo roteamento e pelo gate isAdmin no Controle de
    // Acessos; a regra por grupo via relação não é suportada de forma confiável
    // em regras e deixaria o CRUD bloqueado.
    const regra = "@request.auth.id != ''"
    col.createRule = regra
    col.updateRule = regra
    col.deleteRule = regra
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('grupos_permissao')
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null
    app.save(col)
  },
)
