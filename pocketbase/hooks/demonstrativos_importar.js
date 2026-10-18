// Fase 8 — Importação de demonstrativos contábeis (admin-only).
// POST /backend/v1/demonstrativos/importar  — body: { tipo: 'balancete'|'dre',
//   periodo: 'YYYY-MM', empresa?, linhas: [{conta,nome,grau?,saldo_anterior,
//   debitos,creditos,saldo_atual} | {ordem?,conta?,nome,nivel,valor}] }
// Substitutivo: apaga as linhas do mesmo tipo+periodo antes de inserir.
// GET /backend/v1/demonstrativos?tipo=balancete&periodo=YYYY-MM — leitura
// (qualquer autenticado) com totais e quadratura.

routerAdd(
  'POST',
  '/backend/v1/demonstrativos/importar',
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
    const tipo = String(body.tipo || '')
    const periodo = String(body.periodo || '')
    if (!['balancete', 'dre'].includes(tipo))
      return e.badRequestError('tipo deve ser balancete ou dre')
    if (!/^\d{4}-\d{2}$/.test(periodo)) return e.badRequestError('periodo deve ser YYYY-MM')
    const empresa = String(body.empresa || '').slice(0, 120)
    const linhas = body.linhas
    if (!Array.isArray(linhas) || linhas.length === 0) return e.badRequestError('linhas vazias')
    if (linhas.length > 5000) return e.badRequestError('máximo de 5000 linhas')

    const tabela = tipo === 'balancete' ? 'balancete_linhas' : 'dre_linhas'
    const agora = new DateTime().string()
    const uid = auth.id
    const uemail = auth.getString('email')

    try {
      $app.runInTransaction((tx) => {
        tx.db()
          .newQuery('DELETE FROM ' + tabela + ' WHERE periodo = {:p}')
          .bind({ p: periodo })
          .execute()

        if (tipo === 'balancete') {
          for (let i = 0; i < linhas.length; i++) {
            const l = linhas[i]
            const id = $security.randomString(15)
            tx.db()
              .newQuery(
                'INSERT INTO balancete_linhas (id, periodo, empresa, conta, nome, grau, saldo_anterior, debitos, creditos, saldo_atual, fonte, importado_por, created, updated) VALUES ({:id}, {:p}, {:emp}, {:cta}, {:nome}, {:grau}, {:sa}, {:d}, {:c}, {:sat}, {:fonte}, {:imp}, {:now}, {:now})',
              )
              .bind({
                id: id,
                p: periodo,
                emp: empresa,
                cta: String(l.conta || '').slice(0, 40),
                nome: String(l.nome || '').slice(0, 190),
                grau: Number(l.grau || 0),
                sa: Number(l.saldo_anterior || 0),
                d: Number(l.debitos || 0),
                c: Number(l.creditos || 0),
                sat: Number(l.saldo_atual || 0),
                fonte: String(l.fonte || '').slice(0, 40),
                imp: uemail,
                now: agora,
              })
              .execute()
          }
        } else {
          for (let i = 0; i < linhas.length; i++) {
            const l = linhas[i]
            const id = $security.randomString(15)
            tx.db()
              .newQuery(
                'INSERT INTO dre_linhas (id, periodo, empresa, ordem, conta, nome, nivel, valor, importado_por, created, updated) VALUES ({:id}, {:p}, {:emp}, {:ord}, {:cta}, {:nome}, {:nivel}, {:valor}, {:imp}, {:now}, {:now})',
              )
              .bind({
                id: id,
                p: periodo,
                emp: empresa,
                ord: Number(l.ordem !== undefined ? l.ordem : i),
                cta: String(l.conta || '').slice(0, 40),
                nome: String(l.nome || '').slice(0, 190),
                nivel: ['grupo', 'subtotal', 'linha'].includes(l.nivel) ? l.nivel : 'linha',
                valor: Number(l.valor || 0),
                imp: uemail,
                now: agora,
              })
              .execute()
          }
        }
      })
    } catch (err) {
      $app.logger().error('demonstrativos_importar falhou', 'error', String(err))
      return e.json(500, { ok: false, erro: 'Falha ao gravar: ' + String(err) })
    }

    // Auditoria
    try {
      const id = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'importar_demonstrativo', 'financeiro', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: uid,
          uemail: uemail,
          det: tipo + ' ' + periodo + ' (' + linhas.length + ' linhas)',
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, tipo: tipo, periodo: periodo, linhas: linhas.length })
  },
  $apis.requireAuth(),
)
