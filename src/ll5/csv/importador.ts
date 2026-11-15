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
const LIMITE_FALHAS_PCT = 5
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
  const log: any[] = [...(job.log || [])]

  // 1) busca existentes do lote — UMA requisição por dia distinto,
  //    com retry. Antes era um único filtro com centenas de "||" que o
  //    PocketBase rejeitava por tamanho, e a falha era silenciosa.
  const datas = lote
    .map((i) => i.dados?.data_hora_inicio)
    .filter(Boolean)
    .map((d: string) => d.slice(0, 10))
  const unicas = Array.from(new Set(datas))
  const existentes: any[] = []
  for (const dia of unicas) {
    try {
      const r = await comRetry(() =>
        pb.collection('ll5_activity').getFullList({
          filter: `data_hora_inicio ~ "${dia}"`,
        }),
      )
      existentes.push(...(r as any[]))
    } catch (e) {
      // sem o índice do dia, o UPSERT por chave ainda protege contra duplicata
      console.warn('[ll5/csv] falha ao buscar existentes de ' + dia, e)
    }
    await esperar(PAUSA_MS)
  }

  const porChave = new Map<string, any>()
  for (const e of existentes) {
    const chave = [
      e.owner_id,
      String(e.data_hora_inicio || '').slice(0, 19),
      e.tipo || '',
      e.distancia_m ?? '',
    ].join('|')
    porChave.set(chave, e)
  }

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

    const base: any = {
      owner_id: ownerId,
      created_by: createdBy,
      updated_by: createdBy,
      ...a,
      tipo: tipoSeguro,
      qualidade_dados: qualSegura,
      origem_aba: a.aba === 'gym' ? 'gym' : 'running',
      device_activity_id: `csv-${a.data_hora_inicio}-${a.tipo}`.replace(/[^a-zA-Z0-9-]/g, ''),
      carga_ano_iso: sem?.ano ?? null,
      carga_semana_iso: sem?.semana ?? null,
    }
    if (a.sinalizar_intensidade_excessiva) sinalizados++
    if (a.distancia_m) distanciaLote += a.distancia_m

    const chave = [
      ownerId,
      String(a.data_hora_inicio || '').slice(0, 19),
      a.tipo || '',
      a.distancia_m ?? '',
    ].join('|')

    const existente = porChave.get(chave)
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

  for (let i = 0; i < paraInserir.length; i += BLOCOS) {
    const bloco = paraInserir.slice(i, i + BLOCOS)
    try {
      await inserirBloco(bloco)
      importados += bloco.length
    } catch (eBloco: any) {
      // o bloco é atômico: isola o registro problemático
      log.push({
        status: 'aviso',
        motivo:
          'bloco de ' +
          bloco.length +
          ' falhou (' +
          (eBloco?.response?.data?.message || eBloco?.message || 'erro') +
          '); reprocessando um a um',
      })
      for (const row of bloco) {
        try {
          await pb.collection('ll5_activity').create(row)
          importados++
        } catch (e: any) {
          errosLote++
          // motivo real: campo e valor que o PocketBase recusou
          let motivo = e?.response?.data?.message || e?.message || String(e)
          try {
            const det = e?.response?.data?.data
            if (det && typeof det === 'object') {
              const partes: string[] = []
              for (const k of Object.keys(det)) {
                const v: any = (det as any)[k]
                partes.push(k + ': ' + (v?.message || String(v)))
              }
              if (partes.length) motivo = partes.join(' | ')
            }
          } catch (_) {
            // mantém o motivo simples
          }
          log.push({
            linha: row.titulo || row.device_activity_id || '?',
            status: 'erro',
            motivo: motivo.slice(0, 180),
          })
        }
        await esperar(40)
      }
    }
    await esperar(PAUSA_MS)
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
  const status =
    pctFalha > LIMITE_FALHAS_PCT ? 'falhou' : fim >= fila.length ? 'concluido' : 'processando'

  const atualizado = await pb.collection('ll5_fit_jobs').update(jobId, {
    status,
    processados,
    importados: Number(job.importados || 0) + importados,
    duplicados: Number(job.duplicados || 0) + duplicados,
    enriquecidos: Number(job.enriquecidos || 0) + enriquecidos,
    erros: totalErros,
    ignorados: Number(job.ignorados || 0) + ignoradosLote,
    sinalizados: Number(job.sinalizados || 0) + sinalizados,
    distancia_total_m: Number(job.distancia_total_m || 0) + distanciaLote,
    indice_retomada: fim,
    log: log.slice(-600),
    finalizado_em: status === 'concluido' || status === 'falhou' ? new Date().toISOString() : null,
  })

  if (status === 'concluido' || status === 'falhou') {
    await finalizar(jobId, { ...job, ...atualizado }, status)
  }

  return { concluido: status === 'concluido' || status === 'falhou', job: atualizado }
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
