/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FASE 2.8 — PERMISSÃO DE ALTERAÇÃO DE META (18/11/2026)
//
// Diretiva da fase: "Somente CEO e CFO alteram metas; valide via RLS e registre
// tudo em pen_audit".
//
// COMO O SISTEMA IDENTIFICA O PAPEL:
// o projeto não tem um campo de "cargo" utilizável em regra de RLS — tem
// `grupo_id` (grupos_permissao) e `name`. Criar regra lendo grupo por nome em
// cascata é frágil dentro de uma rule. Então:
//   · cria `pode_alterar_meta` (bool) em users
//   · marca TRUE explicitamente para quem tem esse papel
//   · a RLS de pen_audit passa a exigir essa flag para gravar mudança de meta
//
// RESSALVA HONESTA: a flag é atribuída por mim com base em quem ocupa o papel
// hoje (você). Ela NÃO deriva automaticamente do grupo — se outro usuário
// assumir o papel, precisa ser marcado. Preferi isso a uma regra que "parece"
// automática e falha em silêncio.
// ============================================================================
migrate(
  (app) => {
    // ---- 1) campo na tabela de usuários ----
    try {
      const col = app.findCollectionByNameOrId('_pb_users_auth_')
      let tem = false
      for (let i = 0; i < col.fields.length; i++) {
        if (String(col.fields[i].name || '') === 'pode_alterar_meta') tem = true
      }
      if (!tem) {
        col.fields.add(new BoolField({ name: 'pode_alterar_meta', required: false }))
        app.save(col)
        console.log('[meta] campo pode_alterar_meta CRIADO em users')
      } else {
        console.log('[meta] campo pode_alterar_meta já existia')
      }
    } catch (e) {
      console.log('[meta] campo: ' + String(e).slice(0, 160))
    }

    // ---- 2) marca o CEO atual (owner do projeto) ----
    const EMAILS_CEO_CFO = ['lvenanciol@gmail.com', 'leo@extrafruti.com.br']
    let marcados = 0
    for (const email of EMAILS_CEO_CFO) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        u.set('pode_alterar_meta', true)
        app.save(u)
        marcados++
        console.log('[meta] ' + email + ' -> pode_alterar_meta = true')
      } catch (_) {
        console.log('[meta] ' + email + ' não encontrado (ok se não existir)')
      }
    }
    console.log('[meta] usuários marcados: ' + marcados)

    // ---- 3) RLS de pen_audit: mudança de meta só com a flag ----
    try {
      const col = app.findCollectionByNameOrId('pen_audit')
      // createRule: precisa estar logado; para gravar campo='target' exige a flag
      col.createRule =
        "@request.auth.id != '' && (campo != 'target' || @request.auth.pode_alterar_meta = true)"
      app.save(col)
      console.log('[meta] RLS de pen_audit atualizada (createRule)')
    } catch (e) {
      console.log('[meta] RLS pen_audit: ' + String(e).slice(0, 160))
    }

    // ---- 4) conferência ----
    try {
      const col = app.findCollectionByNameOrId('pen_audit')
      console.log('[meta] createRule agora = ' + String(col.createRule))
    } catch (_) {}
    console.log('[meta] CONCLUÍDO')
  },
  (app) => {
    console.log('[meta] rollback: campo mantido')
  },
)
