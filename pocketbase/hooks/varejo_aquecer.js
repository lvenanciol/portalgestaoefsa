// VAREJO — aquecimento de cache da tela "Desempenho Unidades" (13/11/2026)
//
// OBJETIVO: o usuário NUNCA espera pelo Sankhya. Este job recalcula as 5 abas
// e grava tudo no `sankhya_cache`; ao abrir a tela, a leitura sai do cache.
//
// HORÁRIO: 22:00 BRT = '0 1 * * *' UTC (o cron do PocketBase roda em UTC).
// O cron é só o AQUECEDOR: se ele falhar, a rota /backend/v1/varejo/desempenho
// calcula sob demanda e regrava o cache (fallback automático, já implementado).
// Por isso não há cron de reforço — seria código duplicado para o mesmo risco.
//
// POR QUE UMA CONSULTA SÓ: cada aba fazia 7 consultas em série (~11-15 s por
// aba, medido em log). Aqui é UMA consulta com GROUP BY por bandeira que
// devolve as 4 bandeiras de uma vez; as auxiliares (série, lojas, cidades, CMV,
// quebra) rodam uma vez e são reaproveitadas em todas as abas.
//
// TUDO INLINE: a VM do PocketBase executa cada callback num pool separado e não
// enxerga funções nem constantes de topo ("Hook scoping error" reprovado pelo
// pipeline). Por isso não existe helper fora do callback.

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

  const MED = "C.DTNEG >= TRUNC(SYSDATE,'MM') AND NVL(C.PENDENTE,'N')='N' AND C.STATUSNOTA='L'"

  const CASE_BAND =
    "CASE WHEN P.AD_CODCENCUS >= 10105000 AND P.AD_CODCENCUS < 10106000 THEN 'EXTRABOM' " +
    " WHEN P.AD_CODCENCUS >= 10106000 AND P.AD_CODCENCUS < 10107000 THEN 'CARONE' " +
    ' WHEN C.CODEMP IN (1,2,3,4,5,6,10,11,12,13,14) THEN ' +
    "'ATACADO' ELSE 'DISTRIBUICAO' END"

  // -------- 1) CONSULTA MESTRA: as 4 bandeiras numa passada --------
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
    porBandeira[String(row.BAND)] = row
  }

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
  for (const row of rQtd.rows || []) {
    qtdPorBandeira[String(row.BAND)] = num(row.QTD)
  }

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
  for (const row of rSerie.rows || []) {
    const mes = String(row.MES || '')
    for (const b of ['EXTRABOM', 'CARONE', 'ATACADO', 'DISTRIBUICAO']) {
      const v = num(row[b])
      if (v !== null && v !== 0) seriePorBandeira[b].push({ MES: mes, FAT: v })
    }
  }

  // -------- 4) Lojas por bandeira (top 30) --------
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
      lojasPorBandeira[band] = r.rows
    }
  }

  // -------- 5) Cidades por bandeira --------
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
    if (!r.erro) cidadesPorBandeira[band] = r.rows
  }

  // -------- 6) CMV por bandeira (AD_RESUMOLOJAS) --------
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
    cmvPorBandeira[band] = r.erro ? {} : r.rows[0] || {}
  }

  // -------- 7) Quebra --------
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

  // -------- 8) Grava o cache de cada aba --------
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
      num(quebraRow.QUEBRA) === null
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
  }

  const montarAba = function (band) {
    const b = porBandeira[band] || {}
    const fat = num(b.FAT)
    const qtd = qtdPorBandeira[band]
    const cmv =
      band === 'EXTRABOM' ? cmvPorBandeira.EXTRABOM : band === 'CARONE' ? cmvPorBandeira.CARONE : {}
    const cmvPct = cmv ? num(cmv.CMV_PCT) : null
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
        quebra_pct: num(quebraRow.QUEBRA),
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
    extrabom: 'EXTRABOM',
    carone: 'CARONE',
    atacado: 'ATACADO',
    distribuicao: 'DISTRIBUICAO',
  }
  for (const aba of Object.keys(ABAS)) {
    try {
      gravar('varejo_desempenho_' + aba, montarAba(ABAS[aba]))
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
        quebra_pct: num(quebraRow.QUEBRA),
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
