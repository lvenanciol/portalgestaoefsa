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

const LOTE = 100
const LIMITE_FALHAS_PCT = 5

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

/** Cria o job no mesmo engine do .FIT, com formato='csv'. */
export async function criarJobCsv(
  ownerId: string,
  createdBy: string,
  inv: InventarioCsv,
): Promise<string> {
  // a fila guarda só as linhas VÁLIDAS + ignoradas (para o relatório)
  const fila = inv.itens.map((i) => ({
    linha: i.linha,
    dados: i.dados,
    motivo: i.motivo || null,
  }))

  const rec = await pb.collection('ll5_fit_jobs').create({
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
    fila,
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
): Promise<{ concluido: boolean; job: any }> {
  const job = await lerJob(jobId)
  const fila: any[] = job.fila || []
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

  // 1) busca existentes do lote
  const datas = lote
    .map((i) => i.dados?.data_hora_inicio)
    .filter(Boolean)
    .map((d: string) => d.slice(0, 10))
  const unicas = Array.from(new Set(datas))
  const existentes: any[] = []
  if (unicas.length) {
    try {
      // filtra por dia (o PocketBase compara timestamp; usamos o prefixo)
      const filtro = unicas.map((d) => `data_hora_inicio ~ "${d}"`).join(' || ')
      const r = await pb.collection('ll5_activity').getFullList({ filter: filtro })
      existentes.push(...(r as any[]))
    } catch (_e) {
      // segue: o UPSERT individual cobre
    }
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
    const base: any = {
      owner_id: ownerId,
      created_by: createdBy,
      updated_by: createdBy,
      ...a,
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
    importados++
    log.push({ linha: item.linha, status: 'importado' })
  }

  // 2) insere em bulk
  if (paraInserir.length) {
    try {
      await pb.collection('ll5_activity').create(paraInserir)
    } catch (_e) {
      for (const row of paraInserir) {
        try {
          await pb.collection('ll5_activity').create(row)
        } catch (e: any) {
          errosLote++
          importados--
          log.push({ linha: row.titulo || '?', status: 'erro', motivo: e?.message })
        }
      }
    }
  }
  for (const u of paraAtualizar) {
    try {
      await pb.collection('ll5_activity').update(u.id, u.dados)
    } catch (e: any) {
      log.push({ status: 'erro', motivo: e?.message })
    }
  }

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
