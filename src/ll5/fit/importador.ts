import pb from '@/lib/pocketbase/client'
import { unzipSync } from 'fflate'
import { parseFit, nomeSport } from './parser'
import { normalizarAtividade, ehWellness, idDoNome, type ActivityRow } from './normalizar'

// ============================================================================
// LL5 — IMPORTADOR DE PACOTE GARMIN (15/11/2026)
//
// Arquitetura: o ZIP é descompactado no NAVEGADOR (fflate, sem servidor),
// o inventário é enviado ao PocketBase como um JOB, e o processamento roda
// em LOTES de 25 com progresso persistido — retomável.
//
// POR QUE EM LOTES: 2.500 arquivos num único request estoura timeout e perde
// tudo. Cada lote grava o progresso; se falhar no 1.200, retoma do 1.201.
//
// IDEMPOTÊNCIA: UPSERT por (fonte, device_activity_id). Reimportar não duplica.
// ============================================================================

export interface ItemFila {
  nome: string
  id: string | null
  /** bytes em base64 — o arquivo fica no job até ser processado */
  b64: string
  status: 'pendente' | 'ok' | 'duplicado' | 'enriquecido' | 'erro'
  motivo?: string
}

export interface Inventario {
  total: number
  fit: number
  wellness: number
  ignorados: number
  periodoInicio: string | null
  periodoFim: string | null
  porTipo: Record<string, number>
  avisoIncompleto: boolean
  itens: ItemFila[]
}

const LOTE = 25
const LIMITE_FALHAS_PCT = 5

/** Varre o ZIP recursivamente e monta o inventário (sem processar nada). */
export async function inventariarZip(
  arquivo: File,
  onProgresso?: (lidos: number, total: number) => void,
): Promise<Inventario> {
  const buf = new Uint8Array(await arquivo.arrayBuffer())
  const descompactado = unzipSync(buf)

  const inv: Inventario = {
    total: 0,
    fit: 0,
    wellness: 0,
    ignorados: 0,
    periodoInicio: null,
    periodoFim: null,
    porTipo: {},
    avisoIncompleto: false,
    itens: [],
  }

  const chaves = Object.keys(descompactado)

  for (let i = 0; i < chaves.length; i++) {
    const caminho = chaves[i]
    const dados = descompactado[caminho]

    // diretório
    if (!dados || dados.length === 0) continue
    inv.total++

    const baixo = caminho.toLowerCase()

    // REGRA 3 do briefing: ignorar wellness e user por completo
    if (
      baixo.includes('di-connect-wellness') ||
      baixo.includes('di-connect-user') ||
      baixo.includes('_wellness.fit')
    ) {
      inv.wellness++
      inv.ignorados++
      continue
    }

    // REGRA 2: apenas .fit
    if (!baixo.endsWith('.fit')) {
      inv.ignorados++
      continue
    }

    inv.fit++
    const id = idDoNome(caminho)

    // prévia: parse leve só para saber o tipo e o período (amostra)
    let tipoNome = 'Corrida'
    let dataIso: string | null = null
    try {
      const d = parseFit(dados)
      if (d.sessions.length) {
        const s = d.sessions[0]
        tipoNome = nomeSport(s.sport, s.sub_sport)
        if (s.start_time != null) {
          dataIso = new Date((s.start_time - 180 * 60) * 1000).toISOString().slice(0, 10)
          if (!inv.periodoInicio || dataIso < inv.periodoInicio) inv.periodoInicio = dataIso
          if (!inv.periodoFim || dataIso > inv.periodoFim) inv.periodoFim = dataIso
        }
      } else {
        tipoNome = 'Sem session (ignorado)'
      }
    } catch (_e) {
      tipoNome = 'Ilegível'
    }
    inv.porTipo[tipoNome] = (inv.porTipo[tipoNome] || 0) + 1

    // guarda o arquivo em base64 para o processamento em lotes
    inv.itens.push({ nome: caminho, id, b64: bytesParaBase64(dados), status: 'pendente' })

    if (onProgresso && i % 50 === 0) onProgresso(i, chaves.length)
  }

  // REGRA 4: aviso de pacote possivelmente incompleto
  inv.avisoIncompleto = inv.fit > 0 && inv.fit < 100

  return inv
}

/** Inventário de um .FIT avulso. */
export async function inventariarFit(arquivo: File): Promise<Inventario> {
  const dados = new Uint8Array(await arquivo.arrayBuffer())
  const nome = arquivo.name
  const baixo = nome.toLowerCase()

  const inv: Inventario = {
    total: 1,
    fit: 0,
    wellness: 0,
    ignorados: 0,
    periodoInicio: null,
    periodoFim: null,
    porTipo: {},
    avisoIncompleto: false,
    itens: [],
  }

  if (baixo.includes('_wellness')) {
    inv.wellness = 1
    inv.ignorados = 1
    return inv
  }
  if (!baixo.endsWith('.fit')) {
    inv.ignorados = 1
    return inv
  }

  inv.fit = 1
  let tipoNome = 'Corrida'
  try {
    const d = parseFit(dados)
    if (d.sessions.length) {
      const s = d.sessions[0]
      tipoNome = nomeSport(s.sport, s.sub_sport)
      if (s.start_time != null) {
        const iso = new Date((s.start_time - 180 * 60) * 1000).toISOString().slice(0, 10)
        inv.periodoInicio = iso
        inv.periodoFim = iso
      }
    } else {
      tipoNome = 'Sem session (ignorado)'
    }
  } catch (_e) {
    tipoNome = 'Ilegível'
  }
  inv.porTipo[tipoNome] = 1
  inv.itens.push({
    nome,
    id: idDoNome(nome),
    b64: bytesParaBase64(dados),
    status: 'pendente',
  })
  inv.avisoIncompleto = true // 1 arquivo < 100
  return inv
}

function bytesParaBase64(b: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < b.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + chunk)) as any)
  }
  return btoa(s)
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------- job store
export async function criarJob(
  ownerId: string,
  createdBy: string,
  inv: Inventario,
): Promise<string> {
  const rec = await pb.collection('ll5_fit_jobs').create({
    owner_id: ownerId,
    created_by: createdBy,
    status: 'pendente',
    total_arquivos: inv.itens.length,
    processados: 0,
    importados: 0,
    duplicados: 0,
    enriquecidos: 0,
    erros: 0,
    indice_retomada: 0,
    fila: inv.itens.map((i) => ({ nome: i.nome, id: i.id, b64: i.b64, status: 'pendente' })),
    log: [],
    resumo: {
      periodo_inicio: inv.periodoInicio,
      periodo_fim: inv.periodoFim,
      por_tipo: inv.porTipo,
      aviso_incompleto: inv.avisoIncompleto,
    },
    iniciado_em: new Date().toISOString(),
  })
  return rec.id
}

export async function lerJob(id: string): Promise<any> {
  return pb.collection('ll5_fit_jobs').getOne(id)
}

/**
 * Processa UM lote. Retoma do `indice_retomada` gravado no job.
 * Devolve o estado atualizado para a UI continuar.
 */
export async function processarLote(
  jobId: string,
  ownerId: string,
  createdBy: string,
): Promise<{ concluido: boolean; job: any }> {
  const job = await lerJob(jobId)
  const fila: ItemFila[] = job.fila || []
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
  let erros = 0
  const log: any[] = [...(job.log || [])]

  // busca o que já existe neste lote (uma consulta por lote, não por arquivo)
  const ids = lote.map((i) => i.id).filter(Boolean) as string[]
  const existentes = new Map<string, any>()
  if (ids.length) {
    try {
      const filtro = ids.map((i) => `device_activity_id = "${i}"`).join(' || ')
      const ja = await pb.collection('ll5_activity').getFullList({ filter: filtro })
      for (const r of ja as any[]) existentes.set(r.device_activity_id, r)
    } catch (_e) {
      // segue: o upsert individual cobre
    }
  }

  const paraInserir: any[] = []
  const paraAtualizar: Array<{ id: string; dados: any }> = []

  for (let k = 0; k < lote.length; k++) {
    const item = lote[k]
    try {
      const bytes = base64ParaBytes(item.b64)
      const d = parseFit(bytes)

      // GUARDA: wellness nunca entra, mesmo dentro do ZIP
      if (ehWellness(item.nome, d)) {
        duplicados++ // conta como ignorado, não como erro
        log.push({ arquivo: item.nome, status: 'ignorado', motivo: 'wellness' })
        fila[inicio + k] = { ...item, status: 'duplicado', motivo: 'wellness' }
        continue
      }

      const r = normalizarAtividade(d, {
        deviceActivityId: item.id || item.nome,
        arquivoOrigem: item.nome,
      })

      if (!r.ok || !r.activity) {
        erros++
        log.push({ arquivo: item.nome, status: 'erro', motivo: r.motivo })
        fila[inicio + k] = { ...item, status: 'erro', motivo: r.motivo }
        continue
      }

      const row: ActivityRow = r.activity
      const jaExiste = existentes.get(row.device_activity_id)

      if (jaExiste) {
        // ENRIQUECIMENTO: só completa streams quando faltavam. Nunca sobrescreve
        // owner_id / created_by / created_em (regra 2).
        if (!jaExiste.tem_streams && row.tem_streams) {
          paraAtualizar.push({
            id: jaExiste.id,
            dados: {
              fc_amostras: row.fc_amostras,
              cadencia_amostras: row.cadencia_amostras,
              altitude_amostras: row.altitude_amostras,
              gps_amostras: row.gps_amostras,
              laps: row.laps,
              eventos: row.eventos,
              ground_contact_time_ms: row.ground_contact_time_ms,
              vertical_oscillation_cm: row.vertical_oscillation_cm,
              vertical_ratio_pct: row.vertical_ratio_pct,
              tem_streams: true,
              qualidade_dados: row.qualidade_dados,
              trimp: row.trimp,
              decoupling_pct: row.decoupling_pct,
              zonas_fc_seg: row.zonas_fc_seg,
              updated_by: createdBy,
            },
          })
          enriquecidos++
          log.push({ arquivo: item.nome, status: 'enriquecido', motivo: 'streams adicionados' })
          fila[inicio + k] = { ...item, status: 'enriquecido' }
        } else {
          duplicados++
          log.push({ arquivo: item.nome, status: 'duplicado' })
          fila[inicio + k] = { ...item, status: 'duplicado' }
        }
        continue
      }

      paraInserir.push({ ...row, owner_id: ownerId, created_by: createdBy, updated_by: createdBy })
      importados++
      log.push({ arquivo: item.nome, status: 'importado' })
      fila[inicio + k] = { ...item, status: 'ok' }
    } catch (e: any) {
      erros++
      log.push({ arquivo: item.nome, status: 'erro', motivo: e?.message || String(e) })
      fila[inicio + k] = { ...item, status: 'erro', motivo: e?.message || String(e) }
    }
  }

  // bulk insert
  if (paraInserir.length) {
    try {
      await pb.collection('ll5_activity').create(paraInserir)
    } catch (eBatch: any) {
      // fallback: um a um, para não perder o lote inteiro
      for (const row of paraInserir) {
        try {
          await pb.collection('ll5_activity').create(row)
        } catch (e: any) {
          erros++
          importados--
          log.push({ arquivo: row.arquivo_origem || '?', status: 'erro', motivo: e?.message })
        }
      }
    }
  }
  for (const u of paraAtualizar) {
    try {
      await pb.collection('ll5_activity').update(u.id, u.dados)
    } catch (e: any) {
      log.push({ arquivo: u.id, status: 'erro', motivo: e?.message })
    }
  }

  const processados = fim
  const totalErros = Number(job.erros || 0) + erros
  const pctFalha = processados > 0 ? (totalErros / processados) * 100 : 0

  // validação bloqueante 3: >5% de falha aborta
  const status =
    pctFalha > LIMITE_FALHAS_PCT ? 'falhou' : fim >= fila.length ? 'concluido' : 'processando'

  const atualizado = await pb.collection('ll5_fit_jobs').update(jobId, {
    status,
    processados,
    importados: Number(job.importados || 0) + importados,
    duplicados: Number(job.duplicados || 0) + duplicados,
    enriquecidos: Number(job.enriquecidos || 0) + enriquecidos,
    erros: totalErros,
    indice_retomada: fim,
    fila: fila.map((i) => ({ ...i, b64: i.b64 })), // mantém para retomada
    log: log.slice(-500),
    finalizado_em: status === 'concluido' || status === 'falhou' ? new Date().toISOString() : null,
  })

  if (status === 'concluido' || status === 'falhou') {
    await finalizar(jobId, { ...job, ...atualizado }, status)
  }

  return { concluido: status === 'concluido' || status === 'falhou', job: atualizado }
}

/** Grava o log de auditoria e limpa a fila (libera espaço). */
async function finalizar(jobId: string, job: any, status: string) {
  try {
    const resumo = job.resumo || {}
    await pb.collection('ll5_access_log').create({
      ator_id: job.owner_id || '',
      ator_role: 'admin',
      acao: 'exportacao',
      entidade: 'll5_fit_jobs',
      entidade_id: jobId,
      owner_id_alvo: job.owner_id || '',
      detalhe:
        `importacao_fit: ${job.processados || 0} arquivos, ` +
        `período ${resumo.periodo_inicio || '?'}→${resumo.periodo_fim || '?'}, ` +
        `status ${status}`,
    })
  } catch (_e) {
    // auditoria best-effort
  }
  // limpa a fila para não estourar o limite do registro
  try {
    await pb.collection('ll5_fit_jobs').update(jobId, { fila: null })
  } catch (_e) {
    // segue
  }
}
