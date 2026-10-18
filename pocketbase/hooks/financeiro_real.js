// Fase 6 — Financeiro REAL do Sankhya (admin-only).
// 8 agregados via edge sankhya-proxy-pge (DbExplorerSP): faturamento 12m
// por empresa (TGFCAB), A/P e A/R abertos (mensal + aging + top 5 parceiros),
// nomes de empresa (TSIEMP). Janela padrão: últimos 12 meses.

routerAdd(
  'POST',
  '/backend/v1/financeiro/real',
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

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy não configurado.' })
    }

    const W = "ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12)"
    const SQLS = {
      empresas: 'SELECT CODEMP, RAZAOABREV FROM SANKHYA.TSIEMP ORDER BY CODEMP',
      fat:
        "SELECT TO_CHAR(DTNEG,'YYYY-MM') MES, CODEMP, SUM(VLRNOTA) TOT FROM TGFCAB WHERE DTNEG >= " +
        W +
        " AND STATUSNOTA='L' GROUP BY TO_CHAR(DTNEG,'YYYY-MM'), CODEMP ORDER BY 1",
      ap_mensal:
        "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
        W +
        " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
      ar_mensal:
        "SELECT TO_CHAR(DTVENC,'YYYY-MM') MES, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
        W +
        " GROUP BY TO_CHAR(DTVENC,'YYYY-MM') ORDER BY 1",
      ap_aging:
        "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=-1 AND DHBAIXA IS NULL AND DTVENC >= " +
        W +
        " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
      ar_aging:
        "SELECT CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END FAIXA, SUM(VLRDESDOB) TOT, COUNT(*) N FROM TGFFIN WHERE RECDESP=1 AND DHBAIXA IS NULL AND DTVENC >= " +
        W +
        " GROUP BY CASE WHEN DTVENC < TRUNC(SYSDATE) THEN 'vencido' WHEN DTVENC <= TRUNC(SYSDATE)+30 THEN '0-30d' WHEN DTVENC <= TRUNC(SYSDATE)+60 THEN '31-60d' ELSE '+60d' END",
      ap_top:
        'SELECT * FROM (SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        W +
        ' GROUP BY p.NOMEPARC ORDER BY SUM(f.VLRDESDOB) DESC) WHERE ROWNUM <= 5',
      ar_top:
        'SELECT * FROM (SELECT p.NOMEPARC NOME, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TGFPAR p ON p.CODPARC=f.CODPARC WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        W +
        ' GROUP BY p.NOMEPARC ORDER BY SUM(f.VLRDESDOB) DESC) WHERE ROWNUM <= 5',
    }

    const rodar = function (sql) {
      const res = $http.send({
        url: edgeUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
        body: JSON.stringify({
          op: 'dbExplorer',
          payload: {
            requestBody: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql: sql } },
          },
        }),
        timeout: 45,
      })
      if (res.statusCode !== 200) return { erro: 'edge ' + res.statusCode }
      const d = res.json || {}
      const rb = (d.data && d.data.responseBody) || {}
      if (!rb.rows) return { erro: (d.data && d.data.statusMessage) || 'sem rows' }
      return { rows: rb.rows }
    }

    const out = { ok: true, gerado_em: new DateTime().string() }
    const falhas = []
    const chaves = [
      'empresas',
      'fat',
      'ap_mensal',
      'ar_mensal',
      'ap_aging',
      'ar_aging',
      'ap_top',
      'ar_top',
    ]
    for (let i = 0; i < chaves.length; i++) {
      const k = chaves[i]
      const r = rodar(SQLS[k])
      if (r.erro) {
        falhas.push(k + ': ' + r.erro)
        out[k] = []
      } else {
        out[k] = r.rows
      }
    }
    if (falhas.length) out.falhas = falhas

    // Auditoria (best-effort)
    try {
      const id = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'financeiro_real', 'financeiro', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'consultou financeiro real',
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
