// Sync Sankhya MANUAL (admin-only): POST /backend/v1/sankhya/sync
// ("Sincronizar agora" nas Configurações). Roda as 11 queries em janela 12m
// (full), grava snapshot em sankhya_cache e ATUALIZA o watermark — o cron
// diário (sankhya_sync_cron.js) usa o watermark p/ rodar incremental.
// O cron incremental vive em sankhya_sync_cron.js (job 'sankhya_sync_diario').

routerAdd(
  'POST',
  '/backend/v1/sankhya/sync',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth())
      throw new ForbiddenError('Acesso restrito a administradores.')

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) return e.json(502, { ok: false, erro: 'Proxy não configurado.' })

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
      fluxo:
        "SELECT TO_CHAR(DHBAIXA,'YYYY-MM') MES, SUM(CASE WHEN RECDESP=1 THEN VLRDESDOB ELSE 0 END) ENT, SUM(CASE WHEN RECDESP=-1 THEN VLRDESDOB ELSE 0 END) SAI FROM TGFFIN WHERE DHBAIXA IS NOT NULL AND DHBAIXA >= " +
        W +
        " GROUP BY TO_CHAR(DHBAIXA,'YYYY-MM') ORDER BY 1",
      ap_por_empresa:
        'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=-1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        W +
        ' GROUP BY e.CODEMP, e.RAZAOABREV ORDER BY 3 DESC',
      ar_por_empresa:
        'SELECT e.CODEMP, e.RAZAOABREV, SUM(f.VLRDESDOB) TOT FROM TGFFIN f JOIN SANKHYA.TSIEMP e ON e.CODEMP=f.CODEMP WHERE f.RECDESP=1 AND f.DHBAIXA IS NULL AND f.DTVENC >= ' +
        W +
        ' GROUP BY e.CODEMP, e.RAZAOABREV ORDER BY 3 DESC',
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

    const chaves = [
      'empresas',
      'fat',
      'ap_mensal',
      'ar_mensal',
      'ap_aging',
      'ar_aging',
      'ap_top',
      'ar_top',
      'fluxo',
      'ap_por_empresa',
      'ar_por_empresa',
    ]
    const dados = {}
    const falhas = []
    for (let i = 0; i < chaves.length; i++) {
      const k = chaves[i]
      const r = rodar(SQLS[k])
      if (r.erro) {
        falhas.push(k + ': ' + r.erro)
        dados[k] = []
      } else {
        dados[k] = r.rows
      }
    }

    const resultado = {
      ok: falhas.length === 0,
      gerado_em: new DateTime().string(),
      incremental: false,
      meses_janela: 12,
      dados: dados,
      falhas: falhas,
    }

    // grava snapshot
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
      } catch (_) {}
      if (rec) {
        rec.set('payload', JSON.stringify(resultado))
        rec.set('gerado_em', resultado.gerado_em)
        rec.set('status', resultado.ok ? 'ok' : 'parcial')
        rec.set('falhas', JSON.stringify(falhas))
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('sankhya_cache')
        const novo = new Record(col)
        novo.set('chave', 'financeiro')
        novo.set('payload', JSON.stringify(resultado))
        novo.set('gerado_em', resultado.gerado_em)
        novo.set('status', resultado.ok ? 'ok' : 'parcial')
        novo.set('falhas', JSON.stringify(falhas))
        $app.save(novo)
      }
    } catch (_) {}

    // atualiza watermark (próximo cron roda incremental a partir daqui)
    if (falhas.length === 0) {
      try {
        let wm = null
        try {
          wm = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro_watermark'")
        } catch (_) {}
        const agora = new DateTime().string()
        if (wm) {
          wm.set('gerado_em', agora)
          wm.set('status', 'manual')
          $app.save(wm)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'financeiro_watermark')
          novo.set('gerado_em', agora)
          novo.set('status', 'manual')
          $app.save(novo)
        }
      } catch (_) {}
    }

    // Auditoria
    try {
      const id = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'sankhya_sync', 'configuracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det:
            'sync manual: ' + (falhas.length === 0 ? 'OK (11 queries)' : falhas.length + ' falhas'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, resultado)
  },
  $apis.requireAuth(),
)
