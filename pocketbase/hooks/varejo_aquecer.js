// VAREJO — aquecimento de cache da tela "Desempenho Unidades" (13/11/2026)
//
// OBJETIVO: o usuário NUNCA espera pelo Sankhya. Este job recalcula as 5 abas
// e grava tudo no `sankhya_cache`; a tela só lê o cache e responde em ms.
//
// HORÁRIO: 22:00 BRT = '0 1 * * *' UTC (o cron do PocketBase roda em UTC).
// Também roda um reforço de madrugada ('0 5 * * *' UTC = 02:00 BRT) para o caso
// de a rodada das 22h falhar com o Sankhya fora do ar.
//
// POR QUE UMA CONSULTA SÓ: antes, cada aba fazia 7 consultas em série (~11-15 s
// cada aba). Aqui é UMA consulta com GROUP BY por bandeira, que devolve as 4
// bandeiras de uma vez; o resultado é distribuído nas chaves de cache de cada
// aba. As consultas auxiliares (série 12m, lojas, cidades, CMV, quebra) rodam
// uma vez e são reaproveitadas para todas as abas.
//
// Rota de teste manual: GET /backend/v1/varejo/aquecer (admin) ou ?aba=carone
//
// Toda a lógica vive DENTRO do callback: a VM do PocketBase executa callbacks
// em pools separados e não enxerga declarações de topo ("Hook scoping error").

// ---------- worker reaproveitado pelo cron e pela rota de teste ----------
// (declarado dentro de uma função e chamado dentro de cada callback)
function aquecerVarejo(app, http, secrets, DateTime, abaFiltro) {
  const edgeUrl = secrets.get('PGE_EDGE_URL') || ''
  const edgeSecret = secrets.get('PGE_PROXY_SECRET') || ''
  if (!edgeUrl || !edgeSecret) {
    return { ok: false, erro: 'Proxy Sankhya não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).' }
  }

  const rodar = function (sql) {
    try {
      const res = http.send({
        url: edgeUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
        body: JSON.stringify({
          op: 'dbExplorer',
          payload: {
            requestBody: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql: sql } },
          },
        }),
        timeout: 90,
      })
      if (res.statusCode !== 200) return { erro: 'edge HTTP ' + res.statusCode }
      const d = res.json || {}
      const rb = (d.data && d.data.responseBody) || {}
      const rows = rb.rows || []
      if (!rows.length) {
        return { erro: (d.data && d.data.statusMessage) || 'sem linhas', rows: [] }
      }
      return { rows: rows }
    } catch (err) {
      return { erro: 'excecao: ' + String(err).slice(0, 160) }
    }
  }

  const falhas = {}
  const diag = {}
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }

  const MED = "C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"

  // -------- 1) CONSULTA MESTRA: as 4 bandeiras em uma passada --------
  const CASE_BAND =
    "CASE WHEN P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' " +
    " WHEN P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 THEN 'CARONE' " +
    ' WHEN C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) THEN ' +
    "'ATACADO' ELSE 'DISTRIBUICAO' END"

  const rBand = rodar(
    'SELECT ' +
      CASE_BAND +
      ' BAND, ' +
      'COUNT(DISTINCT C.NUMNOTA) CUPONS, COUNT(*) NOTAS, ' +
      'ROUND(SUM(C.VLRNOTA),2) FAT, ROUND(AVG(C.VLRNOTA),2) TICKET ' +
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      ' WHERE ' +
      MED +
      ' AND C.CODEMP < 100 ' +
      ' GROUP BY ' +
      CASE_BAND,
  )
  if (rBand.erro) {
    falhas.bandeiras = rBand.erro
    diag.bandeiras = 'ERRO: ' + rBand.erro
  } else {
    diag.bandeiras = 'ok ' + rBand.rows.length
  }
  const porBandeira = {}
  ;(rBand.rows || []).forEach(function (row) {
    porBandeira[String(row.BAND)] = row
  })

  // -------- 2) Volume (itens) por bandeira --------
  const rQtd = rodar(
    'SELECT ' +
      CASE_BAND +
      ' BAND, ROUND(SUM(I.QTDNEG),2) QTD ' +
      ' FROM SANKHYA.TGFITE I JOIN SANKHYA.TGFCAB C ON C.NUNOTA=I.NUNOTA ' +
      ' JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      ' WHERE ' +
      MED +
      ' AND C.CODEMP < 100 ' +
      ' GROUP BY ' +
      CASE_BAND,
  )
  if (rQtd.erro) {
    falhas.volume = rQtd.erro
    diag.volume = 'ERRO: ' + rQtd.erro
  } else {
    diag.volume = 'ok ' + rQtd.rows.length
  }
  const qtdPorBandeira = {}
  ;(rQtd.rows || []).forEach(function (row) {
    qtdPorBandeira[String(row.BAND)] = num(row.QTD)
  })

  // -------- 3) Série 12m por bandeira (uma passada) --------
  const rSerie = rodar(
    "SELECT TO_CHAR(C.DTNEG,'YYYY-MM') MES, " +
      ' ROUND(SUM(CASE WHEN P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 THEN C.VLRNOTA ELSE 0 END),2) EXTRABOM, ' +
      ' ROUND(SUM(CASE WHEN P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 THEN C.VLRNOTA ELSE 0 END),2) CARONE, ' +
      ' ROUND(SUM(CASE WHEN NOT(P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000) AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) THEN C.VLRNOTA ELSE 0 END),2) ATACADO, ' +
      ' ROUND(SUM(CASE WHEN NOT(P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000) AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) THEN C.VLRNOTA ELSE 0 END),2) DISTRIBUICAO ' +
      ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
      " WHERE C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND NVL(C.PENDENTE,'N')='N' " +
      " AND C.STATUSNOTA='L' AND C.CODEMP < 100 " +
      " GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM') ORDER BY 1",
  )
  if (rSerie.erro) {
    falhas.serie = rSerie.erro
    diag.serie = 'ERRO: ' + rSerie.erro
  } else {
    diag.serie = 'ok ' + rSerie.rows.length
  }
  const seriePorBandeira = { EXTRABOM: [], CARONE: [], ATACADO: [], DISTRIBUICAO: [] }
  ;(rSerie.rows || []).forEach(function (row) {
    const mes = String(row.MES || '')
    Object.keys(seriePorBandeira).forEach(function (b) {
      const v = num(row[b])
      if (v !== null && v !== 0) seriePorBandeira[b].push({ MES: mes, FAT: v })
    })
  })

  // -------- 4) Lojas por bandeira (top 30) — uma passada por bandeira --------
  const lojasPorBandeira = { EXTRABOM: [], CARONE: [], ATACADO: [], DISTRIBUICAO: [] }
  ;['EXTRABOM', 'CARONE', 'ATACADO', 'DISTRIBUICAO'].forEach(function (band) {
    if (abaFiltro && abaFiltro.toUpperCase() !== band) return
    const condBand =
      band === 'EXTRABOM'
        ? ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 '
        : band === 'CARONE'
          ? ' AND P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 '
          : band === 'ATACADO'
            ? ' AND NOT (P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000)' +
              ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) '
            : ' AND NOT (P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000)' +
              ' AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) '
    const r = rodar(
      'SELECT * FROM (SELECT P.NOMEPARC LOJA, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE ' +
        MED +
        ' AND C.CODEMP < 100 ' +
        condBand +
        ' GROUP BY P.NOMEPARC ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 30',
    )
    if (r.erro) {
      falhas['lojas_' + band] = r.erro
    } else {
      lojasPorBandeira[band] = r.rows
    }
  })

  // -------- 5) Cidades por bandeira --------
  const cidadesPorBandeira = { EXTRABOM: [], CARONE: [], ATACADO: [], DISTRIBUICAO: [] }
  ;['EXTRABOM', 'CARONE'].forEach(function (band) {
    if (abaFiltro && abaFiltro.toUpperCase() !== band) return
    const condBand =
      band === 'EXTRABOM'
        ? ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 '
        : ' AND P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 '
    const r = rodar(
      'SELECT * FROM (SELECT CI.NOMECID CIDADE, ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
        ' WHERE ' +
        MED +
        condBand +
        ' GROUP BY CI.NOMECID ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 15',
    )
    if (!r.erro) cidadesPorBandeira[band] = r.rows
  })

  // -------- 6) CMV por bandeira (AD_RESUMOLOJAS) --------
  const cmvPorBandeira = {}
  ;[
    ['EXTRABOM', ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 '],
    ['CARONE', ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 '],
    [
      'VAREJO',
      ' AND ((CODCENCUS >= 10105000 AND CODCENCUS < 10106000) OR (CODCENCUS >= 10106000 AND CODCENCUS < 10107000)) ',
    ],
  ].forEach(function (par) {
    const r = rodar(
      'SELECT * FROM (SELECT MES, ANO, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
        ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= 2026 ' +
        par[1] +
        'GROUP BY MES, ANO ORDER BY ANO DESC, MES DESC) WHERE ROWNUM <= 1',
    )
    cmvPorBandeira[par[0]] = r.erro ? {} : r.rows[0] || {}
  })

  // -------- 7) Quebra (varejo Resumo Lojas + geral TGFCAB) --------
  const rQuebraVar = rodar(
    "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
      'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
      ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
      ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
      'ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
  )
  const quebraRow = rQuebraVar.erro ? {} : rQuebraVar.rows[0] || {}

  const rQgeral = rodar(
    'SELECT ' +
      " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
      ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
      ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
      " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'",
  )
  const qGeral = rQgeral.erro ? {} : rQgeral.rows[0] || {}

  const rVendaTotal = rodar(
    'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
      "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
  )
  const vendaTotalMes = rVendaTotal.erro ? 0 : Number((rVendaTotal.rows[0] || {}).VENDA_MES || 0)
  const quebraGeralPct =
    vendaTotalMes > 0 && num(qGeral.VLR_MES) !== null
      ? Number(((Number(qGeral.VLR_MES) / vendaTotalMes) * 100).toFixed(2))
      : null

  // -------- 8) Monta e grava o cache de cada aba --------
  const ABAS = {
    extrabom: { band: 'EXTRABOM', label: 'Extrabom' },
    carone: { band: 'CARONE', label: 'Carone' },
    atacado: { band: 'ATACADO', label: 'Atacado' },
    distribuicao: { band: 'DISTRIBUICAO', label: 'Distribuição' },
  }

  const gravados = []
  const col = app.findCollectionByNameOrId('sankhya_cache')
  const agora = new DateTime().string()

  const gravar = function (chave, payload, parcial) {
    let rec = null
    try {
      rec = app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chave })
    } catch (_) {
      rec = new Record(col)
      rec.set('chave', chave)
    }
    rec.set('payload', JSON.stringify(payload))
    rec.set('gerado_em', agora)
    rec.set('status', parcial ? 'parcial' : 'ok')
    rec.set('falhas', Object.keys(parcial || {}))
    app.save(rec)
    gravados.push(chave)
  }

  const montarAba = function (band) {
    const b = porBandeira[band] || {}
    const fat = num(b.FAT)
    const qtd = qtdPorBandeira[band]
    const cmv =
      band === 'EXTRABOM' ? cmvPorBandeira.EXTRABOM : band === 'CARONE' ? cmvPorBandeira.CARONE : {}
    const cmvPct = cmv ? num(cmv.CMV_PCT) : null
    const quebraPct = num(quebraRow.QUEBRA)
    return {
      ok: true,
      aba: band.toLowerCase(),
      gerado_em: agora,
      periodo: 'Mês corrente',
      kpis: {
        faturamento: fat,
        quantidade_kg: qtd,
        preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
        cupons: num(b.CUPONS),
        ticket_medio: num(b.TICKET),
        cmv_pct: cmvPct,
        quebra_pct: quebraPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: num(qGeral.VLR_MES),
        quebra_geral_valor_12m: num(qGeral.VLR_12M),
        quebra_geral_notas_12m: num(qGeral.NOTAS_12M),
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS para esta bandeira'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
              (cmv.MES || '?') +
              '/' +
              (cmv.ANO || '?'),
        quebra_pct:
          quebraPct === null
            ? 'sem dado na tela Resumo Lojas'
            : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
              (quebraRow.REF || '?') +
              ' · acumulado R$ ' +
              (Number(quebraRow.QUEBRAACUM || 0) / 1000000).toFixed(1) +
              'M · a fonte só publica o total da rede',
        quebra_geral_pct:
          quebraGeralPct === null
            ? 'sem nota de perda no mês'
            : 'TGFCAB · TOPs 1111 e 1014 · quebra lançada em nota · R$ ' +
              (Number(qGeral.VLR_MES || 0) / 1000).toFixed(0) +
              ' mil no mês · ' +
              (qGeral.NOTAS_12M || 0) +
              ' notas em 12 meses',
      },
      serie: seriePorBandeira[band] || [],
      lojas: lojasPorBandeira[band] || [],
      cidades: cidadesPorBandeira[band] || [],
      participacao:
        band === 'EXTRABOM' || band === 'CARONE'
          ? [
              { BANDEIRA: 'EXTRABOM', FAT: num((porBandeira.EXTRABOM || {}).FAT) || 0 },
              { BANDEIRA: 'CARONE', FAT: num((porBandeira.CARONE || {}).FAT) || 0 },
            ]
          : [],
      aquecido: true,
    }
  }

  // abas simples
  Object.keys(ABAS).forEach(function (aba) {
    if (abaFiltro && abaFiltro !== aba) return
    const band = ABAS[aba].band
    if (!porBandeira[band] && !falhas.bandeiras) return
    try {
      gravar('varejo_desempenho_' + aba, montarAba(band), falhas)
    } catch (err) {
      falhas['gravar_' + aba] = String(err).slice(0, 160)
    }
  })

  // aba consolidada (Varejo = Extrabom + Carone)
  if (!abaFiltro || abaFiltro === 'varejo') {
    try {
      const eb = porBandeira.EXTRABOM || {}
      const cr = porBandeira.CARONE || {}
      const fatEb = num(eb.FAT) || 0
      const fatCr = num(cr.FAT) || 0
      const fat = fatEb + fatCr
      const cupons = (num(eb.CUPONS) || 0) + (num(cr.CUPONS) || 0)
      const notas = (num(eb.NOTAS) || 0) + (num(cr.NOTAS) || 0)
      const qtdEb = qtdPorBandeira.EXTRABOM || 0
      const qtdCr = qtdPorBandeira.CARONE || 0
      const qtd = qtdEb + qtdCr

      const serieConsolidada = []
      const mapaMes = {}
      ;(seriePorBandeira.EXTRABOM || []).forEach(function (s) {
        mapaMes[s.MES] = (mapaMes[s.MES] || 0) + s.FAT
      })
      ;(seriePorBandeira.CARONE || []).forEach(function (s) {
        mapaMes[s.MES] = (mapaMes[s.MES] || 0) + s.FAT
      })
      Object.keys(mapaMes)
        .sort()
        .forEach(function (m) {
          serieConsolidada.push({ MES: m, FAT: mapaMes[m] })
        })

      const lojasConsolidadas = (lojasPorBandeira.EXTRABOM || [])
        .concat(lojasPorBandeira.CARONE || [])
        .sort(function (a, b) {
          return Number(b.FAT) - Number(a.FAT)
        })
        .slice(0, 30)

      const cmvV = cmvPorBandeira.VAREJO || {}
      const cmvPct = num(cmvV.CMV_PCT)
      const quebraPct = num(quebraRow.QUEBRA)

      gravar(
        'varejo_desempenho_varejo',
        {
          ok: true,
          aba: 'varejo',
          gerado_em: agora,
          periodo: 'Mês corrente',
          kpis: {
            faturamento: fat,
            quantidade_kg: qtd,
            preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
            cupons: cupons,
            ticket_medio: notas ? Number((fat / notas).toFixed(2)) : null,
            cmv_pct: cmvPct,
            quebra_pct: quebraPct,
            quebra_geral_pct: quebraGeralPct,
            quebra_geral_valor_mes: num(qGeral.VLR_MES),
            quebra_geral_valor_12m: num(qGeral.VLR_12M),
            quebra_geral_notas_12m: num(qGeral.NOTAS_12M),
          },
          origem: {
            cmv_pct:
              cmvPct === null
                ? 'sem fechamento na AD_RESUMOLOJAS'
                : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
                  (cmvV.MES || '?') +
                  '/' +
                  (cmvV.ANO || '?') +
                  ' · Extrabom + Carone',
            quebra_pct:
              quebraPct === null
                ? 'sem dado na tela Resumo Lojas'
                : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
                  (quebraRow.REF || '?') +
                  ' · acumulado R$ ' +
                  (Number(quebraRow.QUEBRAACUM || 0) / 1000000).toFixed(1) +
                  'M · a fonte só publica o total da rede',
            quebra_geral_pct:
              quebraGeralPct === null
                ? 'sem nota de perda no mês'
                : 'TGFCAB · TOPs 1111 e 1014 · R$ ' +
                  (Number(qGeral.VLR_MES || 0) / 1000).toFixed(0) +
                  ' mil no mês · ' +
                  (qGeral.NOTAS_12M || 0) +
                  ' notas em 12 meses',
          },
          serie: serieConsolidada,
          lojas: lojasConsolidadas,
          cidades: (cidadesPorBandeira.EXTRABOM || [])
            .concat(cidadesPorBandeira.CARONE || [])
            .slice(0, 15),
          participacao: [
            { BANDEIRA: 'EXTRABOM', FAT: fatEb },
            { BANDEIRA: 'CARONE', FAT: fatCr },
          ],
          aquecido: true,
        },
        falhas,
      )
    } catch (err) {
      falhas.gravar_varejo = String(err).slice(0, 160)
    }
  }

  return { ok: true, abas_gravadas: gravados, falhas: falhas, diag: diag }
}

// ---------- CRON: 22:00 BRT ----------
cronAdd('varejo_aquecer_22h', '0 1 * * *', () => {
  try {
    const r = aquecerVarejo($app, $http, $secrets, DateTime, '')
    console.log(
      'varejo_aquecer_22h: ' +
        JSON.stringify({
          ok: r.ok,
          abas: r.abas_gravadas ? r.abas_gravadas.length : 0,
          falhas: r.falhas ? Object.keys(r.falhas) : [],
        }),
    )
  } catch (err) {
    console.log('varejo_aquecer_22h EXCEPTION: ' + String(err).slice(0, 300))
  }
})

// ---------- CRON de reforço: 02:00 BRT ----------
cronAdd('varejo_aquecer_2h', '0 5 * * *', () => {
  try {
    const r = aquecerVarejo($app, $http, $secrets, DateTime, '')
    console.log(
      'varejo_aquecer_2h: ' +
        JSON.stringify({
          ok: r.ok,
          abas: r.abas_gravadas ? r.abas_gravadas.length : 0,
          falhas: r.falhas ? Object.keys(r.falhas) : [],
        }),
    )
  } catch (err) {
    console.log('varejo_aquecer_2h EXCEPTION: ' + String(err).slice(0, 300))
  }
})

// ---------- ROTA DE TESTE MANUAL (admin) ----------
// GET /backend/v1/varejo/aquecer           -> todas as abas
// GET /backend/v1/varejo/aquecer?aba=carone -> só uma
routerAdd(
  'GET',
  '/backend/v1/varejo/aquecer',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {
      isAdmin = false
    }
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const aba = String((e.requestInfo().query || {}).aba || '').toLowerCase()
    const r = aquecerVarejo($app, $http, $secrets, DateTime, aba)
    return e.json(200, r)
  },
  $apis.requireAuth(),
)
