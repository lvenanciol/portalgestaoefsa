/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// COMPOSIÇÃO POR CANAIS (19/11/2026)
//
// DIRETIVA DO DONO: ao clicar no card Faturamento (e no card CMV), abrir uma
// tela com a composição POR CANAL — Atacado, Distribuição e Varejo — com
// Canal | Meta [R$] | Realizado [R$] | % Meta | % A.A.
//
// REGRA DE CANAIS (definida pelo dono em 18/11/2026, vale para esta tela):
//   ATACADO      = TGFCAB com CODEMP = 1
//   DISTRIBUIÇÃO = TGFCAB com CODEMP IN (4,10) E AD_SELECIONADO NOT IN (1,2)
//                  ("tudo o que as empresas 4 e 10 vendem, exceto Carone e
//                   Coutinho" — o corte das redes é pelo AD_SELECIONADO do
//                   PARCEIRO, não por empresa)
//   VAREJO       = NUNCA por TGFCAB: AD_VENDASPLV com AD_SELECIONADO IN (1,2)
//                  (é a base do Power BI "Acompanhamento Varejo")
//
// MEDIDO out/2026 (para conferência):
//   Atacado       R$  18.326.857
//   Distribuição  R$ 142.722.945
//   Varejo        R$  59.587.828
//
// No CMV a mesma estrutura vale: o varejo usa a CMV do "Resumo Lojas"
// (AD_RESUMOLOJAS.CMVACUM), que é a fonte do BI; atacado e distribuição
// saem do custo dos itens na TGFITE.
// ============================================================================

routerAdd(
  'GET',
  '/backend/v1/varejo/canais',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const h = new Date()
    const ano = Number(q.ano || h.getUTCFullYear())
    const mes = Number(q.mes || h.getUTCMonth() + 1)
    const metrica = String(q.metrica || 'faturamento') // faturamento | cmv

    // ==================================================================
    // 20/11/2026 — ITEM 1b DO DONO: "verificar se os filtros aplicados nas
    // telas e cards estão sendo considerados corretamente".
    //
    // ACHADO: NÃO estavam. Este endpoint só lia `ano` e `mes`. Se a tela
    // estava filtrada por Carone, o modal abria o consolidado de TODAS as
    // redes — número diferente do card que a pessoa acabou de clicar.
    //
    // Agora recebe e aplica: rede, bandeira (tipogrupo), loja e tipo de loja.
    // Os filtros entram no SQL do varejo, na hierarquia E na chave do cache
    // (senão um recorte serviria o cache de outro).
    // ==================================================================
    const fRede = String(q.rede || '')
    const fGrupo = String(q.tipogrupo || q.bandeira || '')
    const fLoja = String(q.loja || '')
    const fTipoLoja = String(q.tipoloja || '')

    // Bandeira = sufixo do NOMEPARC, o mesmo critério do dashboard do BI.
    const filtroBandeira =
      fGrupo === 'carone'
        ? " AND P.NOMEPARC LIKE '%-CR -%' "
        : fGrupo === 'sempre_tem'
          ? " AND P.NOMEPARC LIKE '%-ST -%' "
          : fGrupo === 'extrabom'
            ? " AND P.NOMEPARC LIKE '%-EB -%' "
            : fGrupo === 'atacado'
              ? " AND P.NOMEPARC LIKE '%-ATV -%' "
              : ''
    // Rede: Carone = CODCENCUS 10106+, Coutinho = 10105..10106
    // 20/11/2026 — em TGFPAR o campo é AD_CODCENCUS (confirmado em
    // ALL_TAB_COLUMNS). `CODCENCUS` só existe em AD_VENDASPLV. Usar o nome
    // errado aqui derrubaria a consulta com ORA-00904.
    const filtroRede =
      fRede === 'carone'
        ? ' AND PAR.AD_CODCENCUS >= 10106000 '
        : fRede === 'extrabom'
          ? ' AND PAR.AD_CODCENCUS >= 10105000 AND PAR.AD_CODCENCUS < 10106000 '
          : ''
    const filtroLoja = fLoja ? ' AND PAR.CODPARC = ' + Number(fLoja) + ' ' : ''
    // 20/11/2026 — o campo é AD_LOJANOVA (confirmado em ALL_TAB_COLUMNS).
    // Eu tinha escrito LOAJANOVA, que não existe: o Oracle devolveria ORA-00904
    // e a consulta cairia no catch, zerando o canal sem explicação.
    const filtroTipoLoja =
      fTipoLoja === 'nova'
        ? " AND NVL(PAR.AD_LOJANOVA,'N') = 'S' "
        : fTipoLoja === 'existente'
          ? " AND NVL(PAR.AD_LOJANOVA,'N') <> 'S' "
          : ''
    const filtroVarejo = filtroRede + filtroBandeira + filtroLoja + filtroTipoLoja
    // 20/11/2026 — DUAS VARIANTES, POR CAUSA DO ALIAS.
    // A query do canal usa `INNER JOIN TGFPAR PAR`; a da hierarquia usa
    // `JOIN TGFPAR P`. Um filtro só, com `PAR.`, quebra a hierarquia com
    // ORA-00904 e as bandeiras voltavam VAZIAS com o filtro de rede ligado
    // (o erro caía num catch e virava lista vazia, silenciosamente).
    const filtroVarejoP = filtroVarejo.replace(/PAR\./g, 'P.')
    const temFiltro = !!(fRede || fGrupo || fLoja || fTipoLoja)

    const mm = String(mes).padStart(2, '0')
    const iniMes = "TO_DATE('01/" + mm + '/' + ano + "','DD/MM/YYYY')"
    const fimMesNum = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    // 19/11/2026 — LIMITE SUPERIOR EXCLUSIVO.
    // Eu usava `BETWEEN iniMes AND fimMes` com fimMes = dia 31. Em TGFCAB a
    // DTNEG tem hora: uma nota emitida em 31/10 às 14h é MAIOR que
    // TO_DATE('31/10/2026') (que é 00:00) e ficava fora — e as consultas de
    // atacado/distribuição voltavam ZERO. Uso `< primeiro dia do mês seguinte`.
    const proxMesNum = mes === 12 ? 1 : mes + 1
    const proxAnoNum = mes === 12 ? ano + 1 : ano
    const proxMM = String(proxMesNum).padStart(2, '0')
    const fimMes = "TO_DATE('01/" + proxMM + '/' + proxAnoNum + "','DD/MM/YYYY')"
    // mesmo período do ano anterior, para o % A.A.
    const iniAA = "TO_DATE('01/" + mm + '/' + (ano - 1) + "','DD/MM/YYYY')"
    const fimAA = "TO_DATE('01/" + proxMM + '/' + (ano - 1) + "','DD/MM/YYYY')"

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, { ok: false, erro: 'Proxy Sankhya não configurado.' })
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
          timeout: 120,
        })
        if (res.statusCode !== 200) return { erro: 'edge HTTP ' + res.statusCode }
        const d = res.json || {}
        const rb = (d.data && d.data.responseBody) || {}
        return { rows: rb.rows || [] }
      } catch (err) {
        return { erro: 'excecao: ' + String(err).slice(0, 150) }
      }
    }

    const n = function (v) {
      if (v === null || v === undefined || v === '') return null
      const x = Number(v)
      return isNaN(x) ? null : x
    }
    const v = function (row, i) {
      return row && row[i] !== undefined ? row[i] : undefined
    }

    // ---- expressões de valor conforme a métrica pedida ----
    //
    // ARMADILHA MEDIDA 19/11: `SUM(C.VLRNOTA)` com JOIN em TGFITE multiplica
    // o valor pelo número de itens da nota. O atacado de out/2026 dava
    // R$ 118 milhões em vez de R$ 18,3 milhões — 6,5x, exatamente a média de
    // itens por nota. VLRNOTA é do CABEÇALHO: somar a nota exige ou uma
    // subquery por NUNOTA, ou somar direto na TGFCAB sem o join.
    // CUSTO existe por ITEM (TGFITE.VLRCUSTO), então no CMV o join é correto.
    // ==================================================================
    // 19/11/2026 — CMV DE ATACADO/DISTRIBUIÇÃO NÃO EXISTE NESTA BASE.
    //
    // Medi as quatro candidatas em TGFITE para out/2026 na empresa 1:
    //   VLRCUS             R$   124.093   (0,7% da venda de R$ 18,3M)
    //   CUSTO              R$    75.183   (0,4%)
    //   AD_CUSTOMEDIOGER   R$    39.188   (0,2%)
    //   VLRTOT (venda)     R$ 18.355.740
    // Nenhuma serve: CMV de 0,4% da receita é impossível. Essas colunas são
    // custo UNITÁRIO/auxiliar, não o custo total da operação.
    //
    // A fonte de CMV que existe e fecha é AD_CMVPROD (CMV + QTDCMV por loja e
    // produto), mas ela cobre as 77 LOJAS (varejo), não as empresas 1/4/10.
    //
    // DECISÃO: em vez de devolver um número inventado para atacado e
    // distribuição, o endpoint marca `sem_fonte=true` e a tela mostra "—".
    // Isso segue a regra do dono: dado indisponível não vira zero nem chute.
    // ==================================================================
    const campoValor = metrica === 'cmv' ? 'NVL(I.VLRCUS,0)' : 'NVL(C.VLRNOTA,0)'
    const cmvIndisponivel = metrica === 'cmv'
    // no faturamento a consulta NÃO faz join com TGFITE (ver sqlEmpresas)
    const precisaJoinItem = metrica === 'cmv'

    // ATACADO + DISTRIBUIÇÃO (TGFCAB), com o corte de redes na distribuição
    const sqlEmpresas = function (filtroEmp, filtroRedes) {
      return (
        'SELECT NVL(SUM(' +
        campoValor +
        '),0) VLR, COUNT(DISTINCT C.NUMNOTA) NOTAS ' +
        'FROM SANKHYA.TGFCAB C ' +
        (precisaJoinItem ? 'JOIN SANKHYA.TGFITE I ON I.NUNOTA=C.NUNOTA ' : '') +
        'LEFT JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        iniMes +
        ' AND C.DTNEG < ' +
        fimMes +
        "  AND C.STATUSNOTA='L' " +
        '  AND C.CODEMP IN (' +
        filtroEmp +
        ') ' +
        filtroRedes
      )
    }
    const sqlEmpresasAA = function (filtroEmp, filtroRedes) {
      return (
        'SELECT NVL(SUM(' +
        campoValor +
        '),0) VLR ' +
        'FROM SANKHYA.TGFCAB C ' +
        (precisaJoinItem ? 'JOIN SANKHYA.TGFITE I ON I.NUNOTA=C.NUNOTA ' : '') +
        'LEFT JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
        'WHERE C.DTNEG >= ' +
        iniAA +
        ' AND C.DTNEG < ' +
        fimAA +
        "  AND C.STATUSNOTA='L' " +
        '  AND C.CODEMP IN (' +
        filtroEmp +
        ') ' +
        filtroRedes
      )
    }

    const REDES_FORA = ' AND NVL(P.AD_SELECIONADO,0) NOT IN (1,2) '

    // VAREJO — base do BI (AD_VENDASPLV); CMV vem do Resumo Lojas
    const sqlVarejo = function (ini, fim) {
      return (
        'SELECT NVL(SUM(PLV.' +
        (metrica === 'cmv' ? 'VLRTOT_ECO' : 'VLRTOT') +
        '),0) VLR ' +
        'FROM SANKHYA.AD_VENDASPLV PLV ' +
        'INNER JOIN SANKHYA.TGFPAR PAR ON PAR.CODPARC=PLV.CODPARC ' +
        'WHERE PLV.DTNEG >= ' +
        ini +
        ' AND PLV.DTNEG < ' +
        fim +
        '  AND PAR.AD_SELECIONADO IN (1,2) AND PLV.CODPARC NOT IN (36,37,6959) ' +
        '  AND PLV.VLRTOT > 0' +
        // item 1b: o recorte da tela vale também aqui
        filtroVarejo
      )
    }
    // CMV do varejo: AD_CMVPROD é a tabela que tem CMV por loja e produto
    // (medido: 77 lojas, R$ 32,6M em out/2026). O Resumo Lojas fica como
    // conferência.
    const sqlCmvResumo = function (anoRef, mesRef) {
      const ini =
        "TO_DATE('01/" + String(mesRef).padStart(2, '0') + '/' + anoRef + "','DD/MM/YYYY')"
      const proxM = mesRef === 12 ? 1 : mesRef + 1
      const proxA = mesRef === 12 ? anoRef + 1 : anoRef
      const fim = "TO_DATE('01/" + String(proxM).padStart(2, '0') + '/' + proxA + "','DD/MM/YYYY')"
      return (
        'SELECT NVL(SUM(CMV),0) VLR FROM SANKHYA.AD_CMVPROD ' +
        'WHERE DTCMV >= ' +
        ini +
        ' AND DTCMV < ' +
        fim
      )
    }

    // ==================================================================
    // CACHE (19/11/2026) — item 4 do dono: "o sistema está lento".
    //
    // MEDIDO: a composição por canal leva ~20 s SEM cache (são 6 consultas
    // sequenciais ao DbExplorer: atacado, distribuição, varejo, ano anterior
    // e metas). Com cache o mesmo painel responde em milissegundos.
    // A chave inclui a metrica e o período; o payload guarda schema_v para
    // invalidar quando o cálculo muda (mesma regra do varejo_desempenho).
    // ==================================================================
    // v2 (20/11/2026): a hierarquia mudou — agora todo nível traz meta,
    // realizado, % meta e % A.A. Sem trocar a chave, o cache de 6 h serviria
    // a estrutura antiga (com os níveis zerados) depois do deploy.
    // item 1b: a chave do cache precisa carregar o RECORTE — sem isso um
    // filtro por Carone receberia o cache consolidado de todas as redes.
    const chaveCache =
      'canais_v2_' +
      metrica +
      '_' +
      ano +
      '_' +
      mm +
      (temFiltro
        ? '_' +
          (fRede || '-') +
          '_' +
          (fGrupo || '-') +
          '_' +
          (fLoja || '-') +
          '_' +
          (fTipoLoja || '-')
        : '')
    if (String(q.forcar || '') !== '1') {
      try {
        const rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chaveCache })
        const ge = rec.getString('gerado_em') || ''
        const idade = ge ? new Date().getTime() - new Date(ge).getTime() : 1e12
        let p = {}
        try {
          p = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {
          p = {}
        }
        // 6 h de validade: o mês fechado não muda; o mês corrente atualiza
        // 20/11/2026 — TTL ESTENDIDO PARA 24 h COM ENTREGA IMEDIATA.
        //
        // Item 1a do dono: "carregamento da tela está lento". O cálculo leva
        // ~21 s; o cache responde em 0,1 s. Um mês FECHADO não muda, então 6 h
        // de validade obrigavam a recalcular várias vezes ao dia sem motivo.
        //
        // 24 h: durante o dia o usuário sempre encontra o cache pronto (o cron
        // das 22 h renova). O mês CORRENTE continua com 6 h, porque esse muda
        // a cada venda.
        const ehMesCorrente =
          ano === new Date().getUTCFullYear() && mes === new Date().getUTCMonth() + 1
        const ttlCanais = ehMesCorrente ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
        if (p && p.schema_canais === 2 && idade >= 0 && idade < ttlCanais) {
          return e.json(
            200,
            Object.assign({}, p, {
              do_cache: true,
              cache_idade_min: Math.round(idade / 60000),
            }),
          )
        }
      } catch (_) {
        /* sem cache */
      }
    }

    const out = { ok: true, periodo: 'Mês ' + mm + '/' + ano, metrica: metrica, canais: [] }

    // ==================================================================
    // META POR CANAL (19/11/2026)
    //
    // O que EXISTE de meta no Sankhya (medido):
    //   · EF_VIEW_METAS_LOJAS — meta por LOJA (METAVENDA, METACMV,
    //     PERCLIMITEPERDA). É a fonte do varejo (redes Carone/Coutinho).
    //   · AD_ITEMETASATACADO  — meta por VENDEDOR do atacado, mês a mês
    //     (METAVENDJAN...DEZ). 2026: R$ 3.108.483,15 em outubro.
    //   · AD_REVISAOMETAS     — revisão de meta por loja (R$ 28,95M, sem data,
    //     por isso NÃO é usada aqui).
    // Não existe meta para DISTRIBUIÇÃO (empresas 4/10) em nenhuma tabela.
    // ==================================================================
    const MESES_COL = [
      'JAN',
      'FEV',
      'MAR',
      'ABR',
      'MAI',
      'JUN',
      'JUL',
      'AGO',
      'SET',
      'OUT',
      'NOV',
      'DEZ',
    ]
    const colMes = MESES_COL[mes - 1]
    // NOTA 19/11/2026: as consultas de meta são disparadas AQUI, mas a
    // extração da linha acontece depois de `primeiraLinha` ser declarada —
    // usar a função antes da declaração (hoisting de const) derrubava a rota
    // com HTTP 400.
    const metaAtacadoR = rodar(
      'SELECT NVL(SUM(METAVEND' +
        colMes +
        '),0) VLR FROM SANKHYA.AD_ITEMETASATACADO WHERE ANO = ' +
        ano,
    )
    const metaVarejoR = rodar(
      'SELECT NVL(SUM(METAVENDA),0) VLR FROM SANKHYA.EF_VIEW_METAS_LOJAS ' +
        'WHERE CODCENCUS >= 10105000 AND CODCENCUS < 10107000',
    )

    // --- ATACADO ---
    const at = rodar(sqlEmpresas('1', ''))
    const atAA = rodar(sqlEmpresasAA('1', ''))
    // --- DISTRIBUIÇÃO (exceto Carone e Coutinho) ---
    const di = rodar(sqlEmpresas('4,10', REDES_FORA))
    const diAA = rodar(sqlEmpresasAA('4,10', REDES_FORA))
    // --- VAREJO ---
    const va = rodar(sqlVarejo(iniMes, fimMes))
    const vaAA = rodar(sqlVarejo(iniAA, fimAA))
    // CMV do varejo (Resumo Lojas)
    let vaCmv = null
    let vaCmvAA = null
    if (metrica === 'cmv') {
      const r1 = rodar(sqlCmvResumo(ano, mes))
      const r2 = rodar(sqlCmvResumo(ano - 1, mes))
      vaCmv = n(v((r1.rows || [])[0] || null, 0)) || 0
      vaCmvAA = n(v((r2.rows || [])[0] || null, 0)) || 0
    }

    // 19/11/2026 — BUG: eu passava o RESULTADO ({rows:[...]}) para `mk`, que
    // espera a LINHA. `v({rows:...}, 0)` devolvia undefined e todos os canais
    // saíam zerados. Aqui extraio a primeira linha, quando houver.
    const primeiraLinha = function (res) {
      const rows = (res && res.rows) || []
      return rows.length ? rows[0] : null
    }
    const metaAtacado = n(v(primeiraLinha(metaAtacadoR), 0)) || 0
    const metaVarejo = n(v(primeiraLinha(metaVarejoR), 0)) || 0
    const mk = function (nome, cur, aa, cmvCur, cmvAA, meta) {
      const realizado =
        cmvCur !== undefined && cmvCur !== null ? cmvCur : n(v(primeiraLinha(cur), 0)) || 0
      const anterior =
        cmvAA !== undefined && cmvAA !== null ? cmvAA : n(v(primeiraLinha(aa), 0)) || 0
      const temMeta = meta !== null && meta !== undefined && meta > 0
      return {
        canal: nome,
        meta: temMeta ? Number(meta.toFixed(2)) : null,
        realizado: Number(realizado.toFixed(2)),
        anterior: Number(anterior.toFixed(2)),
        variacao_aa:
          anterior > 0 ? Number((((realizado - anterior) / anterior) * 100).toFixed(2)) : null,
        // % meta = realizado ÷ meta (só quando há meta real)
        perc_meta: temMeta ? Number(((realizado / meta) * 100).toFixed(2)) : null,
        meta_fonte: temMeta
          ? nome === 'Atacado'
            ? 'AD_ITEMETASATACADO (meta por vendedor do atacado)'
            : 'EF_VIEW_METAS_LOJAS (meta por loja)'
          : null,
      }
    }

    if (cmvIndisponivel) {
      // CMV só tem fonte para o VAREJO (AD_CMVPROD). Atacado e distribuição:
      // sem fonte no Sankhya — exibir "—" e não zero.
      out.canais = [
        {
          canal: 'Atacado',
          meta: null,
          realizado: null,
          anterior: null,
          variacao_aa: null,
          perc_meta: null,
          sem_fonte: true,
          obs: 'Sem tabela de CMV para as empresas 1/4/10 no Sankhya.',
        },
        {
          canal: 'Distribuição',
          meta: null,
          realizado: null,
          anterior: null,
          variacao_aa: null,
          perc_meta: null,
          sem_fonte: true,
          obs: 'Sem tabela de CMV para as empresas 1/4/10 no Sankhya.',
        },
        mk('Varejo', va, vaAA, vaCmv, vaCmvAA),
      ]
    } else {
      out.canais = [
        mk('Atacado', at, atAA, undefined, undefined, metaAtacado),
        // Distribuição: não existe meta em nenhuma tabela do Sankhya
        mk('Distribuição', di, diAA),
        mk('Varejo', va, vaAA, undefined, undefined, metaVarejo),
      ]
    }
    // total só sobre os canais COM fonte (null não entra como zero)
    const comFonte = out.canais.filter(function (c) {
      return c.realizado !== null && c.realizado !== undefined
    })
    out.total = {
      realizado: Number(
        comFonte
          .reduce(function (a, c) {
            return a + (c.realizado || 0)
          }, 0)
          .toFixed(2),
      ),
      anterior: Number(
        comFonte
          .reduce(function (a, c) {
            return a + (c.anterior || 0)
          }, 0)
          .toFixed(2),
      ),
      canais_com_fonte: comFonte.length,
      canais_totais: out.canais.length,
    }
    if (comFonte.length < out.canais.length) {
      out.obs_total =
        'Total considera apenas os ' +
        comFonte.length +
        ' de ' +
        out.canais.length +
        ' canais com fonte de CMV disponível.'
    }
    // transparência: de onde vem cada meta e o que NÃO existe
    out.obs_meta =
      'Meta: Atacado de AD_ITEMETASATACADO (por vendedor) e Varejo de ' +
      'EF_VIEW_METAS_LOJAS (por loja). Distribuição não tem meta em nenhuma ' +
      'tabela do Sankhya — fica vazia em vez de estimada.'

    // ==================================================================
    // HIERARQUIA POR CANAL (19/11/2026) — item 1 do dono
    //
    // "quando distribuição e varejo, deve expandir níveis de agrupamento
    //  quando existente sendo: Rede, Bandeira, lojas"
    //
    // VAREJO tem os três níveis de verdade: Rede (Carone/Coutinho pelo
    // centro de custo), Bandeira (sufixo do NOMEPARC: -CR-, -ST-, -EB-) e
    // Loja (CODPARC). DISTRIBUIÇÃO não tem "rede/bandeira": o agrupamento
    // natural é a EMPRESA (4 ou 10) e depois a loja/cliente.
    // ==================================================================
    const falhas = []
    if (!cmvIndisponivel) {
      // SQL em aspas duplas: os literais 'Carone'/'Coutinho' usam aspas
      // simples (SQL) e estourariam a string se ela fosse simples também.
      const hv = rodar(
        "SELECT CASE WHEN PLV.CODCENCUS >= 10106000 THEN 'Carone' ELSE 'Coutinho' END REDE, " +
          " CASE WHEN P.NOMEPARC LIKE '%-ST -%' THEN 'Sempre Tem' " +
          "      WHEN P.NOMEPARC LIKE '%-EB -%' THEN 'Extrabom' " +
          "      ELSE 'Carone' END BANDEIRA, " +
          ' PLV.CODPARC, P.NOMEPARC, ROUND(SUM(PLV.VLRTOT),2) VLR ' +
          'FROM SANKHYA.AD_VENDASPLV PLV ' +
          'JOIN SANKHYA.TGFPAR P ON P.CODPARC=PLV.CODPARC ' +
          'WHERE PLV.DTNEG >= ' +
          iniMes +
          ' AND PLV.DTNEG < ' +
          fimMes +
          '  AND P.AD_SELECIONADO IN (1,2) AND PLV.CODPARC NOT IN (36,37,6959) ' +
          '  AND PLV.VLRTOT > 0 ' +
          // item 1b: os níveis têm de respeitar o MESMO recorte do card.
          // Aqui o alias é P (não PAR) — usar filtroVarejo daria ORA-00904.
          filtroVarejoP +
          "GROUP BY CASE WHEN PLV.CODCENCUS >= 10106000 THEN 'Carone' ELSE 'Coutinho' END, " +
          " CASE WHEN P.NOMEPARC LIKE '%-ST -%' THEN 'Sempre Tem' " +
          "      WHEN P.NOMEPARC LIKE '%-EB -%' THEN 'Extrabom' " +
          "      ELSE 'Carone' END, PLV.CODPARC, P.NOMEPARC",
      )
      // meta por loja (para cada linha e para agregar por bandeira)
      const hm = rodar(
        'SELECT CODPARC, NVL(SUM(METAVENDA),0) META FROM SANKHYA.EF_VIEW_METAS_LOJAS ' +
          'WHERE CODCENCUS >= 10105000 AND CODCENCUS < 10107000' +
          (fLoja ? ' AND CODPARC = ' + Number(fLoja) : '') +
          ' GROUP BY CODPARC',
      )
      const metaPorLoja = {}
      for (const r of hm.rows || []) {
        metaPorLoja[String(n(v(r, 0)))] = n(v(r, 1)) || 0
      }
      const varejo = []
      for (const r of hv.rows || []) {
        varejo.push({
          rede: v(r, 0) || 'Outros',
          bandeira: v(r, 1) || 'Outros',
          codparc: n(v(r, 2)),
          loja: v(r, 3) || String(v(r, 2)),
          valor: n(v(r, 4)) || 0,
        })
      }
      // DISTRIBUIÇÃO: empresa (4/10) → cliente
      const hd = rodar(
        'SELECT C.CODEMP, P.CODPARC, P.NOMEPARC, ROUND(SUM(C.VLRNOTA),2) VLR ' +
          'FROM SANKHYA.TGFCAB C JOIN SANKHYA.TGFPAR P ON P.CODPARC=C.CODPARC ' +
          'WHERE C.DTNEG >= ' +
          iniMes +
          ' AND C.DTNEG < ' +
          fimMes +
          "  AND C.STATUSNOTA='L' AND C.CODEMP IN (4,10) " +
          '  AND NVL(P.AD_SELECIONADO,0) NOT IN (1,2) ' +
          'GROUP BY C.CODEMP, P.CODPARC, P.NOMEPARC',
      )
      const distrib = []
      for (const r of hd.rows || []) {
        distrib.push({
          rede: 'Empresa ' + String(v(r, 0)),
          bandeira: 'Empresa ' + String(v(r, 0)),
          codparc: n(v(r, 1)),
          loja: v(r, 2) || String(v(r, 1)),
          valor: n(v(r, 3)) || 0,
        })
      }
      // ================================================================
      // AGREGAÇÃO DOS NÍVEIS SUPERIORES (20/11/2026)
      //
      // Diretiva do dono: "sempre exibindo os valores do agrupamento nas
      // respectivas colunas em todos os níveis". A linha da BANDEIRA (varejo)
      // e da EMPRESA (distribuição) precisa trazer meta, realizado, % meta e
      // % A.A. somados — antes saía com traços ("—"), que é o "zerado" que
      // ele relatou.
      // ================================================================
      const agrega = function (itens, campo, nivel) {
        const mapa = {}
        for (let i = 0; i < itens.length; i++) {
          const it = itens[i]
          const k = String(it[campo])
          if (!mapa[k]) {
            mapa[k] = { nivel: nivel, nome: k, realizado: 0, meta: 0, temMeta: false, qtd: 0 }
          }
          mapa[k].realizado += Number(it.realizado || it.valor || 0)
          const mv = it.meta !== null && it.meta !== undefined ? Number(it.meta) : null
          if (mv !== null) {
            mapa[k].meta += mv
            mapa[k].temMeta = true
          }
          mapa[k].qtd += 1
        }
        const arr = []
        for (const k in mapa) {
          const g = mapa[k]
          arr.push({
            nivel: g.nivel,
            nome: g.nome,
            realizado: Number(g.realizado.toFixed(2)),
            meta: g.temMeta ? Number(g.meta.toFixed(2)) : null,
            perc_meta:
              g.temMeta && g.meta > 0 ? Number(((g.realizado / g.meta) * 100).toFixed(2)) : null,
            itens: g.qtd,
          })
        }
        arr.sort(function (a, b) {
          return b.realizado - a.realizado
        })
        return arr
      }

      // varejo: loja não tem `meta` no objeto ainda — preenche pelo mapa
      for (let i = 0; i < varejo.length; i++) {
        const m = metaPorLoja[String(varejo[i].codparc)]
        varejo[i].realizado = Number(varejo[i].valor || 0)
        varejo[i].meta = m !== undefined ? m : null
      }
      // distribuição: o valor já vem em `valor`
      for (let i = 0; i < distrib.length; i++) {
        distrib[i].realizado = Number(distrib[i].valor || 0)
        distrib[i].meta = null // não existe meta para distribuição no Sankhya
      }

      out.hierarquia = {
        varejo: varejo,
        distribuicao: distrib,
        varejo_bandeiras: agrega(varejo, 'bandeira', 'bandeira'),
        distrib_empresas: agrega(distrib, 'rede', 'empresa'),
      }
      if (hv.erro) falhas.push('hierarquia_varejo: ' + hv.erro)
      if (hd.erro) falhas.push('hierarquia_distribuicao: ' + hd.erro)
    }

    if (at.erro) falhas.push('atacado: ' + at.erro)
    if (di.erro) falhas.push('distribuicao: ' + di.erro)
    if (va.erro) falhas.push('varejo: ' + va.erro)
    if (falhas.length) out.falhas = falhas

    // grava o payload para a próxima chamada (o painel reabre instantâneo)
    try {
      // 20/11/2026 — ESTA LINHA ERA O BUG DA LENTIDADE.
      // A leitura passou a exigir schema_canais === 2 (quando a hierarquia
      // mudou), mas a gravação ficou em 1. Resultado: o cache era gravado a
      // cada chamada e NUNCA servido — a rota recalculava os ~21 s toda vez,
      // e o dono só via "carregando a composição por canal…".
      out.schema_canais = 2
      const col = $app.findCollectionByNameOrId('sankhya_cache')
      let rec = null
      try {
        rec = $app.findFirstRecordByFilter('sankhya_cache', 'chave = {:c}', { c: chaveCache })
      } catch (_) {
        rec = null
      }
      if (!rec) {
        rec = new Record(col)
        rec.set('chave', chaveCache)
      }
      rec.set('payload', JSON.stringify(out))
      rec.set('gerado_em', new Date().toISOString())
      $app.save(rec)
    } catch (errC) {
      // o erro do cache NUNCA pode ser silencioso: foi assim que o cache
      // ficou 3 rodadas "gravando" sem gravar (limite de 500 KB no campo)
      try {
        console.log('[varejo/canais] FALHA AO GRAVAR CACHE: ' + String(errC).slice(0, 200))
      } catch (_) {}
    }

    try {
      console.log(
        '[varejo/canais] ' + metrica + ' ' + mm + '/' + ano + ' canais=' + out.canais.length,
      )
    } catch (_) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
