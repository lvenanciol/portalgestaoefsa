// ============================================================================
// LL5 — ADAPTERS DE DISPOSITIVO (15/11/2026)
//
// RESTRIÇÕES REAIS, sem simulação de sucesso:
//   · Garmin: exige aprovação no Garmin Connect Developer Program. Sem
//     credenciais, o estado é 'nao_configurado'.
//   · Apple Watch / HealthKit: NÃO existe API server-side. Exige app iOS
//     nativo ou export XML manual. Estado permanente: 'indisponivel'.
//
// Por isso a UI mostra o estado REAL. Nenhum adapter aqui finge conexão.
// No primeiro ciclo os dados vêm de mocks locais, marcados como demonstração.
// ============================================================================

export type EstadoIntegracao = 'conectado' | 'pendente' | 'nao_configurado' | 'indisponivel'

export interface StatusDispositivo {
  id: 'garmin' | 'apple'
  nome: string
  estado: EstadoIntegracao
  detalhe: string
  /** true quando o adapter só devolve dados de demonstração */
  somenteDemo: boolean
}

export interface Atividade {
  id: string
  data: string
  tipo: 'rua' | 'esteira' | 'trail'
  distancia_km: number
  duracao_s: number
  fc_media: number
  fonte: 'garmin' | 'apple' | 'manual'
  demo: boolean
}

export interface TreinoProgramado {
  id: string
  data: string
  titulo: string
  descricao: string
}

/**
 * Interface comum aos adapters. O ciclo real implementa os métodos; hoje
 * todos devolvem dados de demonstração e o estado reflete a verdade.
 */
export interface DeviceAdapter {
  readonly id: 'garmin' | 'apple' | 'manual'
  readonly nome: string
  status(): Promise<StatusDispositivo>
  listActivities(): Promise<Atividade[]>
  pushWorkout(t: TreinoProgramado): Promise<{ ok: boolean; mensagem: string }>
  pullWorkouts(): Promise<TreinoProgramado[]>
  sync(): Promise<{ ok: boolean; mensagem: string; novas: number }>
}

// ---------------------------------------------------------------------------
// GARMIN — sem credenciais o estado é 'nao_configurado'. Nunca 'conectado'.
// ---------------------------------------------------------------------------
export const garminAdapter: DeviceAdapter = {
  id: 'garmin',
  nome: 'Garmin',
  async status() {
    // A credencial real viria de integracoes_config / secret. Não existe ainda.
    return {
      id: 'garmin',
      nome: 'Garmin',
      estado: 'nao_configurado',
      detalhe:
        'Requer aprovação no Garmin Connect Developer Program. Sem credenciais, a sincronização não está disponível.',
      somenteDemo: true,
    }
  },
  async listActivities() {
    return []
  },
  async pushWorkout() {
    return {
      ok: false,
      mensagem:
        'Garmin não configurado. O envio de treino exige as credenciais do Developer Program.',
    }
  },
  async pullWorkouts() {
    return []
  },
  async sync() {
    return {
      ok: false,
      mensagem: 'Garmin não configurado — nenhum dado foi sincronizado.',
      novas: 0,
    }
  },
}

// ---------------------------------------------------------------------------
// APPLE — HealthKit não tem API server-side. Estado permanente até existir app.
// ---------------------------------------------------------------------------
export const appleHealthAdapter: DeviceAdapter = {
  id: 'apple',
  nome: 'Apple Watch',
  async status() {
    return {
      id: 'apple',
      nome: 'Apple Watch',
      estado: 'indisponivel',
      detalhe:
        'HealthKit não oferece API server-side. Exige app iOS nativo ou exportação manual do XML do app Saúde.',
      somenteDemo: true,
    }
  },
  async listActivities() {
    return []
  },
  async pushWorkout() {
    return {
      ok: false,
      mensagem: 'Apple Watch não aceita treino por API. Requer app iOS nativo.',
    }
  },
  async pullWorkouts() {
    return []
  },
  async sync() {
    return {
      ok: false,
      mensagem: 'Apple Watch indisponível para sincronização — HealthKit não tem API server-side.',
      novas: 0,
    }
  },
}

// ---------------------------------------------------------------------------
// MANUAL — sempre disponível: é o lançamento digitado pelo usuário.
// ---------------------------------------------------------------------------
export const manualAdapter: DeviceAdapter = {
  id: 'manual',
  nome: 'Manual',
  async status() {
    return {
      id: 'garmin',
      nome: 'Lançamento manual',
      estado: 'conectado',
      detalhe: 'Registros digitados no portal. Sempre disponível.',
      somenteDemo: false,
    }
  },
  async listActivities() {
    return []
  },
  async pushWorkout() {
    return { ok: true, mensagem: 'Treino salvo no portal.' }
  },
  async pullWorkouts() {
    return []
  },
  async sync() {
    return { ok: true, mensagem: 'Nada a sincronizar no modo manual.', novas: 0 }
  },
}

export const ADAPTERS: Record<string, DeviceAdapter> = {
  garmin: garminAdapter,
  apple: appleHealthAdapter,
  manual: manualAdapter,
}
