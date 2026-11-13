// VAREJO — aquecimento de cache da tela "Desempenho Unidades" (13/11/2026)
//
// ============ CORREÇÃO CRÍTICA 13/11 10:50 ============
// O DbExplorerSP devolve linhas como ARRAYS POSICIONAIS, não objetos com nome
// de coluna: SELECT FAT, CUPONS -> [["1234.56","10"], ...].
// O código anterior lia row.FATURAMENTO (undefined) e por isso tudo aparecia
// zerado SEM erro de consulta. Prova: sankhya_sync_cron.js funciona há meses
// lendo r[0], r[1], r[2]. Aqui todas as leituras são por ÍNDICE.
//
// HORÁRIO: 22:00 BRT = '0 1 * * *' UTC (o cron do PocketBase roda em UTC).
// O cron é só o aquecedor: se falhar, a rota /desempenho calcula e regrava.
//
// UMA CONSULTA MESTRA: GROUP BY por bandeira devolve as 4 bandeiras de uma vez;
// as auxiliares rodam uma vez e são reaproveitadas em todas as abas.
//
// TUDO INLINE: a VM do PocketBase não enxerga declaração de topo.

cronAdd('varejo_aquecer_22h', '0 1 * * *', () => {
  const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
  const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
  if (!edgeUrl || !edgeSecret) {
    console.log('varejo_aquecer: proxy Sankhya não configurado — abortado')
    return
  }

  const rodar = function (sql) {
    try {
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
  const num = function (v) {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }
  // leitura por índice, com fallback por nome
  const val = function (row, idx, nome) {
    if (!row) return undefined
    if (row[idx] !== undefined) return row[idx]
    if (nome && row[nome] !== undefined) return row[nome]
    return undefined
  }

  const MED = "C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"

  const CASE_BAND =
    "CASE WHEN P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' " +
    " WHEN P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 THEN 'CARONE' " +
    ' WHEN C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) THEN ' +
    "'ATACADO' ELSE 'DISTRIBUICAO' END"

  // -------- 1) MESTRA: [0]=BAND [1]=CUPONS [2]=NOTAS [3]=FAT [4]=TICKET --------
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
  for (const row of rBand.rows || []) {
    porBandeira[String(val(row, 0, 'BAND'))] = {
      CUPONS: val(row, 1, 'CUPONS'),
      NOTAS: val(row, 2, 'NOTAS'),
      FAT: val(row, 3, 'FAT'),
      TICKET: val(row, 4, 'TICKET'),
    }
  }

  // -------- 2) VOLUME: [0]=BAND [1]=QTD --------
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
  for (const row of rQtd.rows || []) {
    qtdPorBandeira[String(val(row, 0, 'BAND'))] = num(val(row, 1, 'QTD'))
  }

  // -------- 3) SÉRIE 12m: [0]=MES [1]=EXTRABOM [2]=CARONE [3]=ATACADO [4]=DISTRIBUICAO --------
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
  for (const row of rSerie.rows || []) {
    const mes = String(val(row, 0, 'MES') || '')
    const vals = {
      EXTRABOM: num(val(row, 1, 'EXTRABOM')),
      CARONE: num(val(row, 2, 'CARONE')),
      ATACADO: num(val(row, 3, 'ATACADO')),
      DISTRIBUICAO: num(val(row, 4, 'DISTRIBUICAO')),
    }
    for (const b of ['EXTRABOM', 'CARONE', 'ATACADO', 'DISTRIBUICAO']) {
      if (vals[b] !== null && vals[b] !== 0) seriePorBandeira[b].push({ MES: mes, FAT: vals[b] })
    }
  }

  // -------- 4) LOJAS: [0]=LOJA [1]=CUPONS [2]=FAT --------
  const COND_BAND = {
    EXTRABOM: ' AND P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 ',
    CARONE: ' AND P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 ',
    ATACADO:
      ' AND NOT (P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000)' +
      ' AND C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) ',
    DISTRIBUICAO:
      ' AND NOT (P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10107000)' +
      ' AND C.CODEMP NOT IN (1,2,3,4,5,6,10,11,12,13,14) ',
  }
  const lojasPorBandeira = { EXTRABOM: [], CARONE: [], ATACADO: [], DISTRIBUICAO: [] }
  for (const band of ['EXTRABOM', 'CARONE', 'ATACADO', 'DISTRIBUICAO']) {
    const r = rodar(
      'SELECT * FROM (SELECT P.NOMEPARC LOJA, COUNT(DISTINCT C.NUMNOTA) CUPONS, ' +
        'ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' WHERE ' +
        MED +
        ' AND C.CODEMP < 100 ' +
        COND_BAND[band] +
        ' GROUP BY P.NOMEPARC ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 30',
    )
    if (r.erro) {
      falhas['lojas_' + band] = r.erro
    } else {
      lojasPorBandeira[band] = r.rows.map(function (row) {
        return { LOJA: val(row, 0, 'LOJA'), CUPONS: val(row, 1, 'CUPONS'), FAT: val(row, 2, 'FAT') }
      })
    }
  }

  // -------- 5) CIDADES: [0]=CIDADE [1]=FAT --------
  const cidadesPorBandeira = { EXTRABOM: [], CARONE: [] }
  for (const band of ['EXTRABOM', 'CARONE']) {
    const r = rodar(
      'SELECT * FROM (SELECT CI.NOMECID CIDADE, ROUND(SUM(C.VLRNOTA),2) FAT ' +
        ' FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        ' LEFT JOIN SANKHYA.TSICID CI ON CI.CODCID=P.CODCID ' +
        ' WHERE ' +
        MED +
        COND_BAND[band] +
        ' GROUP BY CI.NOMECID ORDER BY SUM(C.VLRNOTA) DESC) WHERE ROWNUM <= 15',
    )
    if (!r.erro) {
      cidadesPorBandeira[band] = r.rows.map(function (row) {
        return { CIDADE: val(row, 0, 'CIDADE'), FAT: val(row, 1, 'FAT') }
      })
    }
  }

  // -------- 6) CMV: [0]=MES [1]=ANO [2]=CMV_PCT --------
  const CC_CMV = {
    EXTRABOM: ' AND CODCENCUS >= 10105000 AND CODCENCUS < 10106000 ',
    CARONE: ' AND CODCENCUS >= 10106000 AND CODCENCUS < 10107000 ',
    VAREJO:
      ' AND ((CODCENCUS >= 10105000 AND CODCENCUS < 10106000) OR ' +
      '(CODCENCUS >= 10106000 AND CODCENCUS < 10107000)) ',
  }
  const cmvPorBandeira = {}
  for (const band of ['EXTRABOM', 'CARONE', 'VAREJO']) {
    const r = rodar(
      'SELECT * FROM (SELECT MES, ANO, ' +
        'ROUND(100*SUM(CMVACUM)/NULLIF(SUM(VLRVENDABRUTA),0),2) CMV_PCT ' +
        ' FROM SANKHYA.AD_RESUMOLOJAS WHERE ANO >= 2026 ' +
        CC_CMV[band] +
        'GROUP BY MES, ANO ORDER BY ANO DESC, MES DESC) WHERE ROWNUM <= 1',
    )
    cmvPorBandeira[band] = r.erro
      ? {}
      : {
          MES: val(r.rows[0], 0, 'MES'),
          ANO: val(r.rows[0], 1, 'ANO'),
          CMV_PCT: val(r.rows[0], 2, 'CMV_PCT'),
        }
  }

  // -------- 7) QUEBRA --------
  // varejo: [0]=REF [1]=QUEBRA [2]=QUEBRAACUM
  const rQuebraVar = rodar(
    "SELECT * FROM (SELECT TO_CHAR(Q.REFERENCIA,'YYYY-MM') REF, " +
      'ROUND(Q.QUEBRA,2) QUEBRA, A.QUEBRAACUM ' +
      ' FROM SANKHYA.AD_BIDRCQUEBRA Q ' +
      ' LEFT JOIN SANKHYA.AD_BIDRCQUEBRACUM A ON A.REFERENCIA=Q.REFERENCIA ' +
      'ORDER BY Q.REFERENCIA DESC) WHERE ROWNUM <= 1',
  )
  const qvRow = rQuebraVar.erro ? null : rQuebraVar.rows[0]

  // geral: [0]=VLR_MES [1]=VLR_12M [2]=NOTAS_12M
  const rQgeral = rodar(
    'SELECT ' +
      " ROUND(SUM(CASE WHEN C.DTNEG >= TRUNC(SYSDATE,'MM') THEN C.VLRNOTA ELSE 0 END),2) VLR_MES," +
      ' ROUND(SUM(C.VLRNOTA),2) VLR_12M, COUNT(*) NOTAS_12M ' +
      ' FROM SANKHYA.TGFCAB C WHERE C.CODTIPOPER IN (1111,1014) ' +
      " AND C.DTNEG >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-12) AND C.STATUSNOTA='L'",
  )
  const qgRow = rQgeral.erro ? null : rQgeral.rows[0]

  const rVendaTotal = rodar(
    'SELECT ROUND(SUM(VLRNOTA),2) VENDA_MES FROM SANKHYA.TGFCAB ' +
      "WHERE DTNEG >= TRUNC(SYSDATE,'MM') AND STATUSNOTA='L' AND NVL(PENDENTE,'N')='N'",
  )
  const vendaTotalMes = rVendaTotal.erro ? 0 : Number(val(rVendaTotal.rows[0], 0, 'VENDA_MES') || 0)

  const quebraVarPct = num(val(qvRow, 1, 'QUEBRA'))
  const quebraVarRef = val(qvRow, 0, 'REF')
  const quebraVarAcum = num(val(qvRow, 2, 'QUEBRAACUM'))
  const quebraGeralValorMes = num(val(qgRow, 0, 'VLR_MES'))
  const quebraGeralValor12m = num(val(qgRow, 1, 'VLR_12M'))
  const quebraGeralNotas = num(val(qgRow, 2, 'NOTAS_12M'))
  const quebraGeralPct =
    quebraGeralValorMes !== null && vendaTotalMes > 0
      ? Number(((quebraGeralValorMes / vendaTotalMes) * 100).toFixed(2))
      : null

  // -------- 8) GRAVAÇÃO --------
  const agora = new DateTime().string()
  let col = null
  try {
    col = $app.findCollectionByNameOrId('sankhya_cache')
  } catch (errCol) {
    console.log(
      'varejo_aquecer: coleção sankhya_cache indisponível — ' + String(errCol).slice(0, 150),
    )
    return
  }

  const gravados = []
  const gravar = function (chave, payload) {
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chave })
    } catch (_) {
      rec = new Record(col)
      rec.set('chave', chave)
    }
    rec.set('payload', JSON.stringify(payload))
    rec.set('gerado_em', agora)
    rec.set('status', Object.keys(falhas).length ? 'parcial' : 'ok')
    rec.set('falhas', Object.keys(falhas))
    $app.save(rec)
    gravados.push(chave)
  }

  const origemComum = {
    quebra_pct:
      quebraVarPct === null
        ? 'sem dado na tela Resumo Lojas'
        : 'Tela Resumo Lojas (AD_BIDRCQUEBRA) · referência ' +
          (quebraVarRef || '?') +
          ' · acumulado R$ ' +
          ((quebraVarAcum || 0) / 1000000).toFixed(1) +
          'M · a fonte só publica o total da rede',
    quebra_geral_pct:
      quebraGeralPct === null
        ? 'sem nota de perda no mês'
        : 'TGFCAB · TOPs 1111 e 1014 · quebra lançada em nota · R$ ' +
          ((quebraGeralValorMes || 0) / 1000).toFixed(0) +
          ' mil no mês · ' +
          (quebraGeralNotas || 0) +
          ' notas em 12 meses',
  }

  const montarAba = function (band, cmv) {
    const b = porBandeira[band] || {}
    const fat = num(b.FAT)
    const qtd = qtdPorBandeira[band]
    const cmvPct = cmv ? num(cmv.CMV_PCT) : null
    return {
      schema_v: 2,
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
        quebra_pct: quebraVarPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: quebraGeralValorMes,
        quebra_geral_valor_12m: quebraGeralValor12m,
        quebra_geral_notas_12m: quebraGeralNotas,
      },
      origem: {
        cmv_pct:
          cmvPct === null
            ? 'sem fechamento na AD_RESUMOLOJAS para esta bandeira'
            : 'Tela Resumo Lojas (AD_RESUMOLOJAS) · referência ' +
              (cmv.MES || '?') +
              '/' +
              (cmv.ANO || '?'),
        quebra_pct: origemComum.quebra_pct,
        quebra_geral_pct: origemComum.quebra_geral_pct,
      },
      serie: seriePorBandeira[band] || [],
      lojas: lojasPorBandeira[band] || [],
      cidades: cidadesPorBandeira[band] || [],
      participacao: [
        { BANDEIRA: 'EXTRABOM', FAT: num((porBandeira.EXTRABOM || {}).FAT) || 0 },
        { BANDEIRA: 'CARONE', FAT: num((porBandeira.CARONE || {}).FAT) || 0 },
      ],
      aquecido: true,
    }
  }

  const ABAS = {
    extrabom: ['EXTRABOM', 'EXTRABOM'],
    carone: ['CARONE', 'CARONE'],
    atacado: ['ATACADO', null],
    distribuicao: ['DISTRIBUICAO', null],
  }
  for (const aba of Object.keys(ABAS)) {
    try {
      const band = ABAS[aba][0]
      const cmvBand = ABAS[aba][1]
      gravar('varejo_desempenho_' + aba, montarAba(band, cmvBand ? cmvPorBandeira[cmvBand] : null))
    } catch (err) {
      falhas['gravar_' + aba] = String(err).slice(0, 150)
    }
  }

  // Consolidada Varejo = Extrabom + Carone
  try {
    const eb = porBandeira.EXTRABOM || {}
    const cr = porBandeira.CARONE || {}
    const fatEb = num(eb.FAT) || 0
    const fatCr = num(cr.FAT) || 0
    const fat = fatEb + fatCr
    const cupons = (num(eb.CUPONS) || 0) + (num(cr.CUPONS) || 0)
    const notas = (num(eb.NOTAS) || 0) + (num(cr.NOTAS) || 0)
    const qtd = (qtdPorBandeira.EXTRABOM || 0) + (qtdPorBandeira.CARONE || 0)

    const mapaMes = {}
    for (const s of seriePorBandeira.EXTRABOM || []) mapaMes[s.MES] = (mapaMes[s.MES] || 0) + s.FAT
    for (const s of seriePorBandeira.CARONE || []) mapaMes[s.MES] = (mapaMes[s.MES] || 0) + s.FAT
    const serieConsolidada = Object.keys(mapaMes)
      .sort()
      .map(function (m) {
        return { MES: m, FAT: mapaMes[m] }
      })

    const lojasConsolidadas = (lojasPorBandeira.EXTRABOM || [])
      .concat(lojasPorBandeira.CARONE || [])
      .sort(function (a, b) {
        return Number(b.FAT) - Number(a.FAT)
      })
      .slice(0, 30)

    const cmvV = cmvPorBandeira.VAREJO || {}
    const cmvPct = num(cmvV.CMV_PCT)

    gravar('varejo_desempenho_varejo', {
      schema_v: 2,
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
        quebra_pct: quebraVarPct,
        quebra_geral_pct: quebraGeralPct,
        quebra_geral_valor_mes: quebraGeralValorMes,
        quebra_geral_valor_12m: quebraGeralValor12m,
        quebra_geral_notas_12m: quebraGeralNotas,
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
        quebra_pct: origemComum.quebra_pct,
        quebra_geral_pct: origemComum.quebra_geral_pct,
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
    })
  } catch (err) {
    falhas.gravar_varejo = String(err).slice(0, 150)
  }

  console.log(
    'varejo_aquecer_22h: ' +
      JSON.stringify({
        abas: gravados.length,
        chaves: gravados,
        falhas: Object.keys(falhas),
        diag: diag,
      }),
  )
})
