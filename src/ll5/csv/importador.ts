import pb from '@/lib/pocketbase/client'
import {
  mapearLinha,
  detectarDelimitador,
  removerBom,
  dividirLinha,
  semanaIso,
  type AtividadeCsv,
} from './regras'

// ============================================================================
// LL5 — IMPORTADOR DO CSV DO GARMIN (v2, 15/11/2026)
//
// Reaproveita o job engine do .FIT (ll5_fit_jobs) com formato='csv':
// lotes de 100, progresso persistido, retomável, UPSERT idempotente.
//
// CHAVE DE DEDUPE do CSV: (owner_id, data_hora_inicio, tipo, distancia_m) —
// o CSV não tem device_activity_id.
//
// VALIDADO contra o arquivo real: 1.189 linhas, 988 corridas, 172 força,
// 29 ignorados, 1.182 com carga_proxy calculável.
// ============================================================================

// 15/11/2026 — LOTE reduzido e inserção via createBatch().
//
// CAUSA DO "Too Many Requests": o SDK do PocketBase NÃO aceita
// `create(array)` — a chamada falhava, caía no meu fallback de inserir um a
// um, e 100 requisições em sequência estouravam o rate limit do PocketBase
// (20 req/s por IP). Resultado: 99 erros num lote de 100 e nada importado.
//
// CORREÇÃO: usar `pb.createBatch()`, que envia tudo em UMA requisição HTTP
// (limite de 100 operações por batch). Lote de 100 cabe exatamente.
const LOTE = 100
// 15/11/2026 — LIMITE REVISTO (causa do "só 99 atividades").
//
// A regra de abortar com >5% de erro matava o job na PRIMEIRA leva: com o bug
// de enum, 99 de 100 falhavam (99%) e o job parava em 100 de 1.189 linhas —
// exatamente o que o dono viu ("99 atividades").
//
// Agora:
//   · erros são ISOLADOS (bloco de 25 → um a um), não derrubam o lote;
//   · o job SÓ aborta em falha realmente sistêmica (>50%);
//   · entre 5% e 50%, conclui como 'parcial' e reporta os erros.
const LIMITE_FALHAS_PCT = 50
/** Espera entre lotes para não encostar no rate limit. */
const PAUSA_MS = 150

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** true quando o erro é rate limit do PocketBase. */
function ehRateLimit(e: any): boolean {
  const s = String(e?.status ?? '') + ' ' + String(e?.message ?? '') + ' ' + String(e ?? '')
  return s.includes('429') || /too many requests/i.test(s)
}

/**
 * Executa uma função com retry exponencial em caso de rate limit.
 * 3 tentativas: 400 ms, 1,2 s, 3 s.
 */
async function comRetry<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: any
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      if (!ehRateLimit(e) || i === tentativas - 1) throw e
      await esperar(400 * Math.pow(3, i))
    }
  }
  throw ultimo
}

export interface ItemCsv {
  linha: number
  dados: AtividadeCsv | null
  motivo?: string
}

export interface InventarioCsv {
  total: number
  validas: number
  ignoradas: number
  erros: number
  corridas: number
  forca: number
  porTipo: Record<string, number>
  periodoInicio: string | null
  periodoFim: string | null
  distanciaTotalM: number
  avisoIncompleto: boolean
  fcmaxObservada: number | null
  avisoFcmax: boolean
  itens: ItemCsv[]
}

/** Lê e inventaria o CSV. Não grava nada. */
export async function inventariarCsv(
  arquivo: File,
  onProgresso?: (lidos: number, total: number) => void,
): Promise<InventarioCsv> {
  const texto = removerBom(await arquivo.text())
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)

  const inv: InventarioCsv = {
    total: 0,
    validas: 0,
    ignoradas: 0,
    erros: 0,
    corridas: 0,
    forca: 0,
    porTipo: {},
    periodoInicio: null,
    periodoFim: null,
    distanciaTotalM: 0,
    avisoIncompleto: false,
    fcmaxObservada: null,
    avisoFcmax: false,
    itens: [],
  }

  if (linhas.length < 2) return inv

  const delim = detectarDelimitador(linhas[0])
  const hdrLinha = dividirLinha(linhas[0], delim)
  const hdr: Record<string, number> = {}
  // primeira ocorrência vence (Avg Run Cadence aparece 2×)
  for (let i = 0; i < hdrLinha.length; i++) {
    const nome = hdrLinha[i].trim().replace(/^\ufeff/, '')
    if (!(nome in hdr)) hdr[nome] = i
  }

  // validação bloqueante 1
  if (!('Date' in hdr) || !('Activity Type' in hdr)) {
    throw new Error(
      'CSV inválido: faltam as colunas obrigatórias "Date" e/ou "Activity Type". Importação abortada.',
    )
  }

  const corpo = linhas.slice(1)
  inv.total = corpo.length

  for (let i = 0; i < corpo.length; i++) {
    const row = dividirLinha(corpo[i], delim)
    const atividade = mapearLinha(row, hdr)

    if (!atividade) {
      inv.erros++
      inv.itens.push({ linha: i + 2, dados: null, motivo: 'linha ilegível (tipo/data ausente)' })
      continue
    }

    if (atividade.aba === 'ignorar') {
      inv.ignoradas++
      inv.porTipo[atividade.tipo || '?'] = (inv.porTipo[atividade.tipo || '?'] || 0) + 1
      inv.itens.push({ linha: i + 2, dados: atividade })
      continue
    }

    inv.validas++
    if (atividade.aba === 'running') inv.corridas++
    if (atividade.aba === 'gym') inv.forca++
    inv.porTipo[atividade.tipo || '?'] = (inv.porTipo[atividade.tipo || '?'] || 0) + 1

    if (atividade.distancia_m) inv.distanciaTotalM += atividade.distancia_m
    const dia = (atividade.data_hora_inicio || '').slice(0, 10)
    if (dia) {
      if (!inv.periodoInicio || dia < inv.periodoInicio) inv.periodoInicio = dia
      if (!inv.periodoFim || dia > inv.periodoFim) inv.periodoFim = dia
    }
    if (
      atividade.fc_max != null &&
      (inv.fcmaxObservada == null || atividade.fc_max > inv.fcmaxObservada)
    ) {
      inv.fcmaxObservada = atividade.fc_max
    }

    inv.itens.push({ linha: i + 2, dados: atividade })
    if (onProgresso && i % 100 === 0) onProgresso(i, corpo.length)
  }

  // advertência: <100 linhas
  inv.avisoIncompleto = inv.validas > 0 && inv.validas < 100
  // advertência: FCmax observada alta
  inv.avisoFcmax = inv.fcmaxObservada != null && inv.fcmaxObservada > 200

  return inv
}

/**
 * Cria o job no mesmo engine do .FIT, com formato='csv'.
 *
 * 15/11/2026 — BUG CORRIGIDO: a versão anterior gravava a FILA COMPLETA
 * (1.189 atividades com ~50 campos cada) num único campo JSON. O payload
 * passava de vários MB, o PocketBase rejeitava a criação do registro e o
 * botão "Iniciar importação" parecia não fazer nada (o erro estourava antes
 * de qualquer feedback). Agora o job guarda só CONTADORES e RESUMO — a fila
 * vive em memória durante a importação.
 */
export async function criarJobCsv(
  ownerId: string,
  createdBy: string,
  inv: InventarioCsv,
): Promise<string> {
  const rec = await pb.collection('ll5_fit_jobs').create({
    // NUNCA enviamos a fila inteira: só o resumo (leve)
    owner_id: ownerId,
    created_by: createdBy,
    formato: 'csv',
    status: 'pendente',
    total_arquivos: inv.total,
    processados: 0,
    importados: 0,
    duplicados: 0,
    enriquecidos: 0,
    erros: inv.erros,
    ignorados: inv.ignoradas,
    indice_retomada: 0,
    fila: null, // a fila vive em memória — ver nota acima
    log: [],
    resumo: {
      periodo_inicio: inv.periodoInicio,
      periodo_fim: inv.periodoFim,
      por_tipo: inv.porTipo,
      corridas: inv.corridas,
      forca: inv.forca,
      distancia_total_m: inv.distanciaTotalM,
      fcmax_observada: inv.fcmaxObservada,
      aviso_incompleto: inv.avisoIncompleto,
      aviso_fcmax: inv.avisoFcmax,
    },
    iniciado_em: new Date().toISOString(),
  })
  return rec.id
}

export async function lerJob(id: string): Promise<any> {
  return pb.collection('ll5_fit_jobs').getOne(id)
}

/**
 * Processa um lote de 100 linhas.
 * UPSERT por (owner, data_hora_inicio, tipo, distancia_m) em duas etapas:
 *   1. busca os existentes do lote numa consulta só;
 *   2. separa em inserir / atualizar / enriquecer.
 */
/**
 * Cache de existentes por job — carregado UMA vez e reaproveitado em todos os
 * lotes. Sem isso, cada lote refazia dezenas de consultas.
 */
const existentesPorJob: Record<string, Map<string, any>> = {}

export async function processarLoteCsv(
  jobId: string,
  ownerId: string,
  createdBy: string,
  /** Fila em memória (o job no banco guarda só contadores). */
  filaMemoria?: any[],
): Promise<{ concluido: boolean; job: any }> {
  const job = await lerJob(jobId)
  const fila: any[] = filaMemoria || job.fila || []
  const inicio = Number(job.indice_retomada || 0)
  let existentesCache = existentesPorJob[jobId] || null

  if (inicio >= fila.length) {
    await finalizar(jobId, job, 'concluido')
    return { concluido: true, job: await lerJob(jobId) }
  }

  const fim = Math.min(inicio + LOTE, fila.length)
  const lote = fila.slice(inicio, fim)

  let importados = 0
  let duplicados = 0
  let enriquecidos = 0
  let errosLote = 0
  let ignoradosLote = 0
  let sinalizados = 0
  let distanciaLote = 0
  // 15/11/2026 — distância acumulada SÓ do que entrou de fato.
  // O relatório mostrava "0 km" com 800 importadas porque a soma acontecia
  // antes da inserção e era perdida quando o insert falhava.
  let distanciaEntrou = 0
  const log: any[] = [...(job.log || [])]

  // 1) busca existentes do lote.
  //
  // 15/11/2026 — CAUSA DO "para em 99": a versão anterior fazia UMA consulta
  // por DIA distinto do lote. Um lote de 100 linhas de 10 anos de histórico
  // tem ~100 dias diferentes → 100 requisições por lote, com `esperar(150)`
  // entre elas. Isso levava ~15 s por lote só na busca, e qualquer erro numa
  // única consulta derrubava o lote inteiro.
  //
  // AGORA: uma ÚNICA consulta por owner, com paginação, UMA vez por job.
  // O conjunto de existentes é reaproveitado por todos os lotes.
  if (!existentesCache) {
    existentesCache = new Map<string, any>()
    try {
      let pagina = 1
      for (;;) {
        const r = await comRetry(() =>
          pb.collection('ll5_activity').getList(pagina, 500, {
            filter: `owner_id = "${ownerId}"`,
            fields: 'id,owner_id,data_hora_inicio,tipo,distancia_m,tem_streams,device_activity_id',
          }),
        )
        const itens = (r as any).items || []
        for (const e of itens) {
          // ------------------------------------------------------------------
          // 15/11/2026 — CAUSA DO "Failed to create record" na REIMPORTAÇÃO.
          //
          // O PocketBase devolve `data_hora_inicio` normalizado em UTC
          // ("2026-11-13 09:11:57.000Z"), enquanto o registro novo usa a string
          // local do CSV ("2026-11-13T06:11:57-03:00"). Comparando as strings,
          // as chaves NUNCA casavam — então o importador tentava inserir de
          // novo e batia no índice único (fonte, device_activity_id).
          //
          // Agora indexo por `device_activity_id`, que é determinístico e não
          // depende de fuso. Chave secundária por data normalizada em epoch
          // continua como rede de segurança.
          // ------------------------------------------------------------------
          if (e.device_activity_id) {
            existentesCache.set('dev:' + e.device_activity_id, e)
          }
          const ts = e.data_hora_inicio ? new Date(e.data_hora_inicio).getTime() : null
          if (ts) {
            existentesCache.set(
              'key:' + [ts, e.tipo || '', Math.round(Number(e.distancia_m || 0) * 100)].join('|'),
              e,
            )
          }
        }
        if (itens.length < 500 || pagina >= 40) break
        pagina++
        await esperar(80)
      }
      console.log('[ll5/csv] existentes carregados: ' + existentesCache.size)
    } catch (e) {
      console.warn('[ll5/csv] falha ao carregar existentes', e)
    }
  }
  existentesPorJob[jobId] = existentesCache
  const porChave = existentesCache

  const paraInserir: any[] = []
  const paraAtualizar: Array<{ id: string; dados: any }> = []

  for (let k = 0; k < lote.length; k++) {
    const item = lote[k]
    const a: AtividadeCsv | null = item?.dados

    if (!a) {
      errosLote++
      log.push({ linha: item?.linha, status: 'erro', motivo: item?.motivo || 'linha inválida' })
      continue
    }
    if (a.aba === 'ignorar') {
      ignoradosLote++
      log.push({ linha: item.linha, status: 'ignorado', motivo: a.tipo })
      continue
    }

    const sem = a.data_hora_inicio ? semanaIso(a.data_hora_inicio) : null

    // ----------------------------------------------------------------
    // BLINDAGEM CONTRA ENUM (15/11/2026)
    // O PocketBase rejeita o registro INTEIRO quando um campo select recebe
    // valor fora da lista — e o batch é atômico, então 100 linhas caíam.
    // Aqui garantimos que só vão valores ACEITOS pelo schema atual, com o
    // valor original preservado em `origem_aba`/título para não perder dado.
    // ----------------------------------------------------------------
    const TIPOS_OK = ['rua', 'esteira', 'trail', 'outro']
    const QUAL_OK = ['completo', 'resumo', 'parcial']
    // SCHEMA REAL (confirmado em produção): tipo aceita apenas
    // ['rua','esteira','trail','outro'] e qualidade_dados apenas
    // ['completo','resumo','parcial']. As migrações 024/025 tentaram ampliar
    // e o PocketBase NÃO persistiu a mudança do enum.
    // Solução: gravar valor ACEITO e preservar a classificação real em
    // `origem_aba` (aceita running|gym) + `tem_detalhe_exercicio` (booleano).
    const mapaTipo: Record<string, string> = {
      forca: 'outro',
      indoor: 'esteira',
      caminhada: 'outro',
      natacao: 'outro',
      ciclismo: 'outro',
    }
    const tipoBruto = String(a.tipo || '')
    const tipoSeguro = TIPOS_OK.includes(tipoBruto) ? tipoBruto : mapaTipo[tipoBruto] || 'outro'
    const qualSegura = QUAL_OK.includes(String(a.qualidade_dados || ''))
      ? a.qualidade_dados
      : 'parcial'

    // ----------------------------------------------------------------
    // 15/11/2026 — CAUSA DO "Failed to create record" (definitiva):
    // o spread `...a` levava o campo `aba` (que existe SÓ no objeto JS
    // AtividadeCsv, NÃO no schema de ll5_activity). O PocketBase rejeita a
    // gravação de campo inexistente, e como o batch é atômico, o lote todo
    // caía — 99 erros em 100 linhas.
    //
    // Aqui montamos o payload CAMPO A CAMPO, com uma allowlist explícita.
    // Nenhum campo desconhecido chega ao PocketBase.
    // ----------------------------------------------------------------
    const base: any = {
      owner_id: ownerId,
      created_by: createdBy,
      updated_by: createdBy,

      // identificação
      device_activity_id: `csv-${a.data_hora_inicio}-${a.tipo}`.replace(/[^a-zA-Z0-9-]/g, ''),
      fonte: 'garmin_csv',
      tipo: tipoSeguro,
      origem_aba: a.aba === 'gym' ? 'gym' : 'running',
      data_hora_inicio: a.data_hora_inicio,
      titulo: a.titulo,

      // tempos e distância
      distancia_m: a.distancia_m,
      duracao_s: a.duracao_s,
      tempo_movimento_s: a.tempo_movimento_s,
      tempo_decorrido_s: a.tempo_decorrido_s,
      pace_medio_s_km: a.pace_medio_s_km,
      melhor_pace_s_km: a.melhor_pace_s_km,
      gap_s_km: a.gap_s_km,

      // coração
      fc_media: a.fc_media,
      fc_max: a.fc_max,
      zonas_fc_seg: a.zonas_fc_seg,
      zonas_estimadas: a.zonas_estimadas,

      // corpo
      calorias: a.calorias,
      passos: a.passos,
      body_battery_drain: a.body_battery_drain,
      num_voltas: a.num_voltas,
      melhor_volta_s: a.melhor_volta_s,

      // corrida
      cadencia_spm: a.cadencia_spm,
      cadencia_max_spm: a.cadencia_max_spm,
      cadencia_invalida: a.cadencia_invalida,
      ganho_elevacao_m: a.ganho_elevacao_m,
      perda_elevacao_m: a.perda_elevacao_m,
      elevacao_min_m: a.elevacao_min_m,
      elevacao_max_m: a.elevacao_max_m,
      comprimento_passada_m: a.comprimento_passada_m,
      vertical_ratio_pct: a.vertical_ratio_pct,
      vertical_oscillation_cm: a.vertical_oscillation_cm,
      ground_contact_time_ms: a.ground_contact_time_ms,
      tem_running_dynamics: a.tem_running_dynamics,

      // força
      total_reps: a.total_reps,
      total_sets: a.total_sets,
      volume_kg: a.volume_kg,
      tem_detalhe_exercicio: a.tem_detalhe_exercicio,

      // FCmax validada
      fcmax_referencia: a.fcmax_referencia,
      fcmax_validada: a.fcmax_validada,
      fcmax_metodo_validacao: a.fcmax_metodo_validacao,

      // carga
      carga_proxy: a.carga_proxy,
      carga_metodo: a.carga_metodo,
      carga_ano_iso: sem?.ano ?? null,
      carga_semana_iso: sem?.semana ?? null,

      // sinalização e qualidade
      sinalizar_intensidade_excessiva: a.sinalizar_intensidade_excessiva,
      qualidade_dados: qualSegura,
      demo: false,
    }

    // remove chaves com undefined (o PocketBase trata como "não enviar")
    for (const k of Object.keys(base)) {
      if (base[k] === undefined) delete base[k]
    }
    if (a.sinalizar_intensidade_excessiva) sinalizados++
    if (a.distancia_m) distanciaLote += a.distancia_m

    // procura por device_activity_id (determinístico) e, se não achar,
    // pela chave normalizada em epoch
    const did = `csv-${a.data_hora_inicio}-${a.tipo}`.replace(/[^a-zA-Z0-9-]/g, '')
    let existente = porChave.get('dev:' + did)
    if (!existente) {
      const ts = a.data_hora_inicio ? new Date(a.data_hora_inicio).getTime() : null
      if (ts) {
        const chave =
          'key:' + [ts, a.tipo || '', Math.round(Number(a.distancia_m || 0) * 100)].join('|')
        existente = porChave.get(chave)
      }
    }
    if (existente) {
      // já existe: atualiza (idempotente) — preserva owner/created_by
      delete base.owner_id
      delete base.created_by
      paraAtualizar.push({ id: existente.id, dados: base })
      duplicados++
      log.push({ linha: item.linha, status: 'duplicado' })
      continue
    }

    paraInserir.push(base)
    // `importados` só é somado DEPOIS que a inserção confirma — antes ele
    // contava antes de gravar e o relatório mostrava sucesso com erro.
    log.push({ linha: item.linha, status: 'importado' })
  }

  // 2) insere em BATCH REAL (uma requisição HTTP para o lote inteiro).
  //
  // 15/11/2026 — O lote inteiro falhava quando UM registro tinha valor
  // inválido num select (`tipo='forca'` fora da lista, `qualidade_dados='limitado'`).
  // O batch é atômico: um erro derruba os 100. Agora:
  //   · o batch é dividido em blocos de 25;
  //   · um bloco que falha é reprocessado UM A UM, isolando o registro ruim;
  //   · o motivo REAL do PocketBase sobe para o relatório.
  const BLOCOS = 25
  const inserirBloco = async (rows: any[]) => {
    const b = pb.createBatch()
    for (const row of rows) b.collection('ll5_activity').create(row)
    await comRetry(() => b.send())
  }

  // ------------------------------------------------------------------------
  // 15/11/2026 — INSERÇÃO RESILIENTE (corrige "Failed to create record").
  //
  // Estratégia em 3 níveis, do mais eficiente ao mais tolerante:
  //   1. batch do bloco (rápido) — se passar, ótimo;
  //   2. um a um com payload COMPLETO, capturando o motivo detalhado;
  //   3. um a um com payload MÍNIMO (só obrigatórios + resumo) — garante que
  //      a atividade entre mesmo se um campo opcional tiver formato recusado.
  //
  // Assim um campo problemático nunca derruba o lote nem perde a atividade.
  // ------------------------------------------------------------------------
  const camposMinimos = (row: any) => {
    const min: any = {
      device_activity_id: row.device_activity_id,
      fonte: row.fonte,
      owner_id: row.owner_id,
      created_by: row.created_by,
      updated_by: row.updated_by,
      data_hora_inicio: row.data_hora_inicio,
      tipo: row.tipo,
      origem_aba: row.origem_aba,
      distancia_m: row.distancia_m,
      duracao_s: row.duracao_s,
      fc_media: row.fc_media,
      fc_max: row.fc_max,
      calorias: row.calorias,
      titulo: row.titulo,
      qualidade_dados: row.qualidade_dados,
      demo: false,
    }
    for (const k of Object.keys(min)) if (min[k] === undefined) delete min[k]
    return min
  }

  const detalheErro = (e: any): string => {
    let motivo = e?.response?.data?.message || e?.message || String(e)
    try {
      const det = e?.response?.data?.data
      if (det && typeof det === 'object' && Object.keys(det).length) {
        const partes: string[] = []
        for (const k of Object.keys(det)) {
          const v: any = (det as any)[k]
          partes.push(k + ': ' + (v?.message || String(v)))
        }
        motivo = partes.join(' | ')
      }
    } catch (_e) {
      // mantém o motivo simples
    }
    return motivo.slice(0, 200)
  }

  for (let i = 0; i < paraInserir.length; i += BLOCOS) {
    const bloco = paraInserir.slice(i, i + BLOCOS)
    try {
      await inserirBloco(bloco)
      importados += bloco.length
      for (const r of bloco) distanciaEntrou += Number(r.distancia_m || 0)
    } catch (eBloco: any) {
      log.push({
        status: 'aviso',
        motivo: 'bloco de ' + bloco.length + ' falhou (' + detalheErro(eBloco) + '); um a um',
      })
      // ------------------------------------------------------------------
      // 15/11/2026 — RATE LIMIT no fallback (causa dos 261 "Too Many Requests").
      //
      // O PocketBase aceita ~20 req/s por IP. O fallback um-a-um esperava
      // apenas 40ms (25 req/s) → estourava e devolvia 429 em ~1/3 das linhas.
      //
      // Agora: 120ms entre inserts (≈8 req/s, metade do limite) + retry
      // exponencial em 429. Custa alguns segundos a mais e importa tudo.
      // ------------------------------------------------------------------
      for (const row of bloco) {
        let entrou = false
        // tentativa 1: payload completo, com retry em 429
        try {
          await comRetry(() => pb.collection('ll5_activity').create(row), 4)
          importados++
          distanciaEntrou += Number(row.distancia_m || 0)
          entrou = true
        } catch (e1: any) {
          const motivo1 = detalheErro(e1)
          await esperar(300)
          // tentativa 2: payload mínimo
          try {
            await comRetry(() => pb.collection('ll5_activity').create(camposMinimos(row)), 4)
            importados++
            distanciaEntrou += Number(row.distancia_m || 0)
            entrou = true
            log.push({
              linha: row.titulo || '?',
              status: 'aviso',
              motivo: 'importada com campos mínimos (' + motivo1 + ')',
            })
          } catch (e2: any) {
            errosLote++
            log.push({
              linha: row.titulo || row.device_activity_id || '?',
              status: 'erro',
              motivo: detalheErro(e2),
            })
          }
        }
        if (!entrou && row.distancia_m) {
          // não conta distância de linha que não entrou
        }
        await esperar(120)
      }
    }
    await esperar(400)
  }

  // atualizações: batch também, quando houver mais de uma
  if (paraAtualizar.length === 1) {
    try {
      await comRetry(() =>
        pb.collection('ll5_activity').update(paraAtualizar[0].id, paraAtualizar[0].dados),
      )
    } catch (e: any) {
      log.push({ status: 'erro', motivo: e?.message })
    }
  } else if (paraAtualizar.length > 1) {
    try {
      const b = pb.createBatch()
      for (const u of paraAtualizar) b.collection('ll5_activity').update(u.id, u.dados)
      await comRetry(() => b.send())
    } catch (eBatch: any) {
      for (const u of paraAtualizar) {
        try {
          await comRetry(() => pb.collection('ll5_activity').update(u.id, u.dados))
        } catch (e: any) {
          log.push({ status: 'erro', motivo: e?.message })
        }
        await esperar(60)
      }
    }
  }

  // pausa entre lotes: mantém a taxa abaixo do limite do PocketBase
  await esperar(PAUSA_MS)

  const processados = fim
  const totalErros = Number(job.erros || 0) + errosLote
  const pctFalha = processados > 0 ? (totalErros / processados) * 100 : 0

  // validação bloqueante 2: >5% de erro aborta
  // falha sistêmica (>50%) aborta; do contrário segue e conclui
  const status =
    pctFalha > LIMITE_FALHAS_PCT
      ? 'falhou'
      : fim >= fila.length
        ? totalErros > 0
          ? 'parcial'
          : 'concluido'
        : 'processando'

  const atualizado = await pb.collection('ll5_fit_jobs').update(jobId, {
    status,
    processados,
    importados: Number(job.importados || 0) + importados,
    duplicados: Number(job.duplicados || 0) + duplicados,
    enriquecidos: Number(job.enriquecidos || 0) + enriquecidos,
    erros: totalErros,
    ignorados: Number(job.ignorados || 0) + ignoradosLote,
    sinalizados: Number(job.sinalizados || 0) + sinalizados,
    distancia_total_m: Number(job.distancia_total_m || 0) + distanciaEntrou,
    indice_retomada: fim,
    // log enxuto: centenas de linhas faziam o update do job estourar o limite
    log: log.filter((l) => l && l.status === 'erro').slice(-40),
    finalizado_em:
      status === 'concluido' || status === 'parcial' || status === 'falhou'
        ? new Date().toISOString()
        : null,
  })

  if (status === 'concluido' || status === 'parcial' || status === 'falhou') {
    await finalizar(jobId, { ...job, ...atualizado }, status)
  }

  return {
    concluido: status === 'concluido' || status === 'parcial' || status === 'falhou',
    job: atualizado,
  }
}

/** Auditoria + limpeza da fila ao terminar. */
async function finalizar(jobId: string, job: any, status: string) {
  try {
    const r = job.resumo || {}
    await pb.collection('ll5_access_log').create({
      ator_id: job.owner_id || '',
      ator_role: 'admin',
      acao: 'exportacao',
      entidade: 'll5_fit_jobs',
      entidade_id: jobId,
      owner_id_alvo: job.owner_id || '',
      detalhe:
        `importacao_csv: ${job.importados || 0} importadas, ` +
        `${job.duplicados || 0} duplicadas, ${job.ignorados || 0} ignoradas, ` +
        `${job.erros || 0} erros · período ${r.periodo_inicio || '?'}→${r.periodo_fim || '?'} · ` +
        `status ${status}`,
    })
  } catch (_e) {
    // auditoria best-effort
  }
  try {
    await pb.collection('ll5_fit_jobs').update(jobId, { fila: null })
  } catch (_e) {
    // segue
  }
}
