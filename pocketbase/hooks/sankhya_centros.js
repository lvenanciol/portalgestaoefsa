// Ajustes PGE (19/10) — T3: centros de resultado do Sankhya para vínculo de
// parceiros (dropdown busca/filtro). Fonte: TTRBC (Centro de Resultados) via
// edge proxy DbExplorerSP. Cache em sankhya_cache (chave 'centros_resultado',
// TTL 24h) para não bater no ERP a cada digitação.

routerAdd(
  'GET',
  '/backend/v1/sankhya/centros-resultado',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const busca = String(q.busca || '')
      .trim()
      .toLowerCase()

    // cache 24h
    let itens = []
    let fonte = 'cache'
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'centros_resultado'")
      if (rec) {
        const gerado = new Date(rec.getString('gerado_em').replace(' ', 'T') + 'Z').getTime()
        if (Date.now() - gerado < 24 * 3600 * 1000) {
          itens = JSON.parse(rec.getString('payload') || '[]')
        } else {
          rec = null // expirado — rebusca
        }
      }
    } catch (_) {
      rec = null
    }

    if (!itens.length) {
      const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
      const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
      if (!edgeUrl || !edgeSecret) return e.json(502, { ok: false, erro: 'Proxy não configurado.' })
      // TTRBC (Centro de Resultado) sem owner — instância não expõe SANKHYA.TTRBC
      // (ORA-00942 com owner). Se a tabela não existir, cai para Centro de Custo (TTCCU).
      const rodarSql = function (sql) {
        const res = $http.send({
          url: edgeUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
          body: JSON.stringify({
            op: 'dbExplorer',
            payload: {
              requestBody: {
                serviceName: 'DbExplorerSP.executeQuery',
                requestBody: { sql: sql },
              },
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
      // T3 RESOLVIDO (21/10): colunas REAIS da TSICUS confirmadas no Oracle pelo
      // dono (SELECT * direto): CODCENCUS / DESCRCENCUS (16 centros). As tentativas
      // antigas (CODCCU/DESCUS) davam erro de coluna, e o ORA-00942 final vinha das
      // tabelas INEXISTENTES TTRBC/TTCCU — nunca foi grant.
      let tipoDim = 'ccu'
      let r = rodarSql('SELECT CODCENCUS, DESCRCENCUS FROM TSICUS ORDER BY DESCRCENCUS')
      if (r.erro) {
        r = rodarSql('SELECT CODCENCUS, DESCRCENCUS FROM SANKHYA.TSICUS ORDER BY DESCRCENCUS')
      }
      if (r.erro)
        return e.json(502, {
          ok: false,
          erro: r.erro + ' — falha ao consultar TSICUS (centros de custo); use digitação manual.',
        })
      itens = r.rows.map(function (row) {
        return { codigo: String(row[0]), descricao: String(row[1]), tipo: tipoDim }
      })
      fonte = 'sankhya'
      // grava cache
      try {
        const agora = new DateTime().string()
        if (rec) {
          rec.set('payload', JSON.stringify(itens))
          rec.set('gerado_em', agora)
          rec.set('status', 'ok')
          $app.save(rec)
        } else {
          const col = $app.findCollectionByNameOrId('sankhya_cache')
          const novo = new Record(col)
          novo.set('chave', 'centros_resultado')
          novo.set('payload', JSON.stringify(itens))
          novo.set('gerado_em', agora)
          novo.set('status', 'ok')
          $app.save(novo)
        }
      } catch (_) {}
    }

    // filtro busca (descrição ou código)
    let out = itens
    if (busca) {
      out = itens.filter(
        (i) =>
          i.descricao.toLowerCase().includes(busca) ||
          String(i.codigo).toLowerCase().includes(busca),
      )
    }
    return e.json(200, { ok: true, fonte: fonte, total: out.length, itens: out.slice(0, 50) })
  },
  $apis.requireAuth(),
)
