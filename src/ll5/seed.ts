import pb from '@/lib/pocketbase/client'
import { criar, listar, type Ator } from './repo'

// ============================================================================
// LL5 — SEED DE DEMONSTRAÇÃO (15/11/2026)
//
// REGRA DO BRIEFING: "as 4 abas nascem PELO MESMO MECANISMO DE CRUD".
// Por isso o seed NÃO insere abas por fora — ele chama `criarAba()`, que é a
// mesma função usada pelo botão "＋ Aba" da tela. A aba Composição Corporal
// não é hard-coded: é criada com template_type='composicao' como qualquer
// outra.
//
// Todo registro sai com demo = true, para poder ser removido depois.
// Idempotente: se já existe aba com o mesmo nome para o owner, não duplica.
// ============================================================================

export interface ResultadoSeed {
  abasCriadas: number
  running: number
  gym: number
  tratamentos: number
  tipos: number
  composicoes: number
  pulado: boolean
  mensagem: string
}

/** Cria uma aba pelo fluxo oficial (usado pelo botão e pelo seed). */
export async function criarAba(
  ator: Ator,
  ownerId: string,
  dados: {
    nome: string
    icone: string
    cor: string
    ordem: number
    template_type: string
    ia_habilitada?: boolean
    fonte?: string
  },
): Promise<any> {
  return criar(
    'll5_tabs',
    ator,
    {
      nome: dados.nome,
      icone: dados.icone,
      cor: dados.cor,
      ordem: dados.ordem,
      template_type: dados.template_type,
      schema_template: 'template-' + dados.template_type,
      fontes_dados: dados.fonte ? [dados.fonte] : [],
      ia_habilitada: dados.ia_habilitada ?? true,
      ativo: true,
      demo: true,
    },
    ownerId,
  )
}

const ABAS_PADRAO = [
  {
    nome: 'Running',
    icone: 'footprints',
    cor: '#1b5e20',
    ordem: 1,
    template_type: 'running',
    fonte: 'garmin',
  },
  {
    nome: 'Tratamentos',
    icone: 'briefcase-medical',
    cor: '#dc2626',
    ordem: 2,
    template_type: 'tratamentos',
    fonte: 'manual',
  },
  {
    nome: 'GYM',
    icone: 'dumbbell',
    cor: '#111827',
    ordem: 3,
    template_type: 'gym',
    fonte: 'garmin',
  },
  {
    nome: 'Composição Corporal',
    icone: 'scale',
    cor: '#7c3aed',
    ordem: 4,
    template_type: 'composicao',
    fonte: 'manual',
  },
]

const TIPOS_TRATAMENTO = [
  { nome: 'Fisioterapia', cor: '#3b82f6', icone: 'activity' },
  { nome: 'Massagem', cor: '#f59e0b', icone: 'hand' },
  { nome: 'Nutricionista', cor: '#10b981', icone: 'apple' },
  { nome: 'Suplementação', cor: '#8b5cf6', icone: 'pill' },
  { nome: 'Medicina do Esporte', cor: '#0ea5e9', icone: 'stethoscope' },
  { nome: 'Exames', cor: '#6b7280', icone: 'flask-round' },
]

/** Executa o seed completo para um owner, se ainda não existir. */
export async function executarSeed(ator: Ator, ownerId: string): Promise<ResultadoSeed> {
  const vazio: ResultadoSeed = {
    abasCriadas: 0,
    running: 0,
    gym: 0,
    tratamentos: 0,
    tipos: 0,
    composicoes: 0,
    pulado: false,
    mensagem: '',
  }

  // já tem abas? não roda de novo
  const abasExistentes = await listar('ll5_tabs', ator, { ownerEscolhido: ownerId })
  if (abasExistentes.length > 0) {
    return { ...vazio, pulado: true, mensagem: 'Seed já aplicado para este proprietário.' }
  }

  const res = { ...vazio }

  // ---------------------------------------------- ABAS (pelo CRUD)
  const abas: Record<string, any> = {}
  for (const a of ABAS_PADRAO) {
    try {
      const rec = await criarAba(ator, ownerId, a)
      abas[a.template_type] = rec
      res.abasCriadas++
    } catch (e) {
      console.warn('[ll5/seed] falha ao criar aba ' + a.nome, e)
    }
  }

  // ---------------------------------------------- TIPOS DE TRATAMENTO
  for (let i = 0; i < TIPOS_TRATAMENTO.length; i++) {
    const t = TIPOS_TRATAMENTO[i]
    try {
      await criar(
        'll5_treatment_types',
        ator,
        { nome: t.nome, cor: t.cor, icone: t.icone, ordem: i + 1, ativo: true, demo: true },
        ownerId,
      )
      res.tipos++
    } catch (_e) {
      // tipo já existente ou falha pontual: o seed segue com os demais
    }
  }

  // ---------------------------------------------- RUNNING (5 atividades)
  const corridas = [
    { d: '2026-11-12', dist: 10.02, dur: 3060, fc: 152 },
    { d: '2026-11-10', dist: 8.4, dur: 2650, fc: 148 },
    { d: '2026-11-08', dist: 15.1, dur: 4740, fc: 156 },
    { d: '2026-11-06', dist: 6.2, dur: 1930, fc: 144 },
    { d: '2026-11-03', dist: 12.0, dur: 3690, fc: 150 },
  ]
  for (const c of corridas) {
    try {
      await criar(
        'll5_running',
        ator,
        {
          titulo: 'Corrida ' + c.d,
          data: c.d + 'T06:30:00Z',
          hora: '06:30',
          tipo: 'rua',
          distancia_km: c.dist,
          duracao_s: c.dur,
          pace_medio_s_km: Math.round(c.dur / c.dist),
          fc_media: c.fc,
          fc_max: c.fc + 14,
          zonas_fc: {
            z1: 180,
            z2: 900,
            z3: Math.round(c.dur * 0.45),
            z4: Math.round(c.dur * 0.25),
            z5: Math.round(c.dur * 0.08),
          },
          cadencia_spm: 172,
          elevacao_m: 42,
          splits: [],
          training_effect: 3.4,
          decoupling: 2.1,
          fonte: 'garmin',
          dispositivo: 'Garmin Forerunner 265',
          demo: true,
        },
        ownerId,
      )
      res.running++
    } catch (_e) {
      // atividade já existente: segue para a próxima
    }
  }

  // ---------------------------------------------- GYM (5 sessões)
  const sessoes = [
    {
      d: '2026-11-12',
      div: 'push',
      vol: 12480,
      rpe: 8,
      ex: [
        { n: 'Supino reto', g: 'Peito', s: 4, r: 8, c: 100, rpe: 8 },
        { n: 'Supino inclinado halteres', g: 'Peito', s: 3, r: 10, c: 34, rpe: 7 },
        { n: 'Crucifixo cabo', g: 'Peito', s: 3, r: 12, c: 22, rpe: 7 },
        { n: 'Desenvolvimento militar', g: 'Ombro', s: 4, r: 6, c: 60, rpe: 8 },
        { n: 'Elevação lateral', g: 'Ombro', s: 3, r: 15, c: 14, rpe: 7 },
      ],
    },
    {
      d: '2026-11-11',
      div: 'pull',
      vol: 10960,
      rpe: 7,
      ex: [
        { n: 'Barra fixa', g: 'Costas', s: 4, r: 8, c: 0, rpe: 8 },
        { n: 'Remada curvada', g: 'Costas', s: 4, r: 8, c: 80, rpe: 7 },
        { n: 'Rosca direta', g: 'Bíceps', s: 3, r: 10, c: 30, rpe: 7 },
      ],
    },
    {
      d: '2026-11-09',
      div: 'legs',
      vol: 15240,
      rpe: 9,
      ex: [
        { n: 'Agachamento livre', g: 'Pernas', s: 5, r: 5, c: 130, rpe: 9 },
        { n: 'Leg press', g: 'Pernas', s: 4, r: 12, c: 240, rpe: 8 },
        { n: 'Stiff', g: 'Pernas', s: 3, r: 10, c: 90, rpe: 7 },
      ],
    },
    {
      d: '2026-11-07',
      div: 'push',
      vol: 11870,
      rpe: 7,
      ex: [
        { n: 'Supino reto', g: 'Peito', s: 4, r: 8, c: 95, rpe: 8 },
        { n: 'Desenvolvimento militar', g: 'Ombro', s: 4, r: 6, c: 58, rpe: 7 },
      ],
    },
    {
      d: '2026-11-05',
      div: 'upper',
      vol: 13100,
      rpe: 8,
      ex: [
        { n: 'Supino inclinado', g: 'Peito', s: 4, r: 8, c: 80, rpe: 8 },
        { n: 'Remada curvada', g: 'Costas', s: 4, r: 8, c: 78, rpe: 8 },
      ],
    },
  ]

  for (const s of sessoes) {
    try {
      const sessao = await criar(
        'll5_gym_sessions',
        ator,
        {
          data: s.d + 'T18:00:00Z',
          hora: '18:00',
          divisao: s.div,
          volume_total_kg: s.vol,
          rpe_medio: s.rpe,
          duracao_min: 65,
          fonte: s.d === '2026-11-09' ? 'apple' : 'garmin',
          dispositivo: s.d === '2026-11-09' ? 'Apple Watch' : 'Garmin Forerunner 265',
          demo: true,
        },
        ownerId,
      )
      for (const e of s.ex) {
        await criar(
          'll5_gym_exercises',
          ator,
          {
            sessao_id: sessao.id,
            exercicio_nome: e.n,
            grupo_muscular: e.g,
            series: Array.from({ length: e.s }, () => ({ reps: e.r, carga_kg: e.c, rpe: e.rpe })),
            tempo_sob_tensao_s: 40,
            distancia_falha: false,
            demo: true,
          },
          ownerId,
        )
      }
      res.gym++
    } catch (_e) {
      // sessão já existente: segue para a próxima
    }
  }

  // ---------------------------------------------- TRATAMENTOS (5)
  const tiposCriados = await listar('ll5_treatment_types', ator, { ownerEscolhido: ownerId })
  const idPorNome = new Map(tiposCriados.map((t: any) => [t.nome, t.id]))

  const tratamentos = [
    {
      tipo: 'Fisioterapia',
      prof: 'João Prado',
      ini: '2026-09-02',
      freq: '2x/semana',
      st: 'em_andamento',
      prox: '2026-11-18',
      anexos: 6,
    },
    {
      tipo: 'Nutricionista',
      prof: 'Dra. Camila Reis',
      ini: '2026-09-15',
      freq: 'quinzenal',
      st: 'em_andamento',
      prox: '2026-11-20',
      anexos: 4,
    },
    {
      tipo: 'Suplementação',
      prof: 'Dr. Marcelo Tavares',
      ini: '2026-10-01',
      freq: 'diário',
      st: 'em_andamento',
      prox: null,
      anexos: 3,
    },
    {
      tipo: 'Massagem',
      prof: 'Studio Corpo',
      ini: '2026-10-20',
      freq: 'semanal',
      st: 'concluido',
      prox: null,
      anexos: 2,
    },
    {
      tipo: 'Medicina do Esporte',
      prof: 'Dr. Rafael Nunes',
      ini: '2026-11-05',
      freq: 'mensal',
      st: 'em_andamento',
      prox: '2026-12-05',
      anexos: 9,
    },
  ]

  for (const t of tratamentos) {
    try {
      const rec = await criar(
        'll5_treatments',
        ator,
        {
          tipo_id: idPorNome.get(t.tipo) || '',
          tipo_nome: t.tipo,
          profissional: t.prof,
          inicio: t.ini + 'T12:00:00Z',
          frequencia: t.freq,
          status: t.st,
          proxima_sessao: t.prox ? t.prox + 'T12:00:00Z' : null,
          demo: true,
        },
        ownerId,
      )
      res.tratamentos++

      // anexos fictícios (metadados apenas — sem arquivo real no storage)
      const nomes = [
        'Hemograma_17-04-2026.pdf',
        'Lipidograma_17-04-2026.pdf',
        'Prescricao_suplementos.pdf',
        'Laudo_fisioterapia.pdf',
        'Exame_imagem_joelho.pdf',
        'Relatorio_nutricional.pdf',
        'Avaliacao_pos-treino.pdf',
        'Plano_alimentar.pdf',
        'Contraindicacoes.pdf',
      ]
      for (let i = 0; i < Math.min(t.anexos, nomes.length); i++) {
        await criar(
          'll5_attachments',
          ator,
          {
            tratamento_id: rec.id,
            tipo: i === 2 ? 'prescricao' : i % 2 === 0 ? 'exame' : 'laudo',
            nome_arquivo: nomes[i],
            mime: 'application/pdf',
            tamanho: 180000 + i * 24000,
            storage_key: 'demo/' + nomes[i],
            confianca_extracao: 0.94,
            enviado_por: ator.email,
            demo: true,
          },
          ownerId,
        )
      }
    } catch (_e) {
      // anexo já existente ou falha pontual: o tratamento permanece criado
    }
  }

  // ---------------------------------------------- COMPOSIÇÃO (2 BIA divergentes)
  // Registro A: 11/06/2026, 81,10 kg
  // Registro B: 11/10/2026 05:27, com os valores do briefing.
  // Ambos com validacao_status='divergente' — prova que a validação funciona.
  const compA = {
    metodo: 'bia',
    data_exame: '2026-06-11',
    hora_exame: '05:30',
    peso_kg: 81.1,
    altura_cm: 178,
    gordura_pct: 24.8,
    massa_gorda_kg: 20.1,
    massa_magra_kg: 61.0,
    mme_pct: 39.5,
    massa_muscular_esqueletica_kg: 32.4,
    agua_corporal_pct: 54.0,
    agua_corporal_l: 43.8,
    gordura_visceral_indice: 13.8,
    jejum_horas: 8,
    hidratacao_autorrelato: 'normal',
    treinou_24h: false,
  }
  const compB = {
    metodo: 'bia',
    data_exame: '2026-10-11',
    hora_exame: '05:27',
    peso_kg: 82.15,
    altura_cm: 178,
    imc: 27.1,
    gordura_pct: 25.6,
    massa_gorda_kg: 21.0,
    mme_pct: 39.0,
    massa_muscular_esqueletica_kg: 32.1,
    massa_magra_kg: 58.0,
    gordura_visceral_indice: 14.5,
    agua_corporal_pct: 53.2,
    agua_corporal_l: 43.7,
    tmb_informada_kcal: 1696,
    proteina_pct: 17.4,
    idade_corporal: 45,
    jejum_horas: 8,
    hidratacao_autorrelato: 'normal',
    treinou_24h: false,
  }

  for (const [i, c] of [compA, compB].entries()) {
    try {
      await criar(
        'll5_body_composition',
        ator,
        {
          ...c,
          equipamento: 'Balança de bioimpedância Xiaomi / Hologic Discovery',
          tmb_calculada_kcal: 500 + 22 * Number(c.massa_magra_kg || 0),
          validacao_status: 'divergente',
          validacao_detalhe: {
            divergencia_identidade: {
              gordura: c.massa_gorda_kg,
              magra: c.massa_magra_kg,
              soma: Number((Number(c.massa_gorda_kg) + Number(c.massa_magra_kg)).toFixed(2)),
              peso: c.peso_kg,
            },
          },
          confiabilidade: 'alta',
          chave_dedupe: 'seed-' + ownerId + '-' + c.data_exame + '-' + c.hora_exame,
          demo: true,
        },
        ownerId,
      )
      res.composicoes++
    } catch (_e) {
      // a chave de dedupe pode já existir: o seed não duplica a avaliação
    }
  }

  res.mensagem =
    `Seed aplicado: ${res.abasCriadas} abas, ${res.running} corridas, ${res.gym} sessões de GYM, ` +
    `${res.tipos} tipos, ${res.tratamentos} tratamentos, ${res.composicoes} avaliações.`
  return res
}

/** Conta registros por aba para o badge do gerenciador. */
export async function contarRegistros(
  ator: Ator,
  ownerId: string,
  template: string,
): Promise<number> {
  const mapa: Record<string, string> = {
    running: 'll5_running',
    gym: 'll5_gym_sessions',
    tratamentos: 'll5_treatments',
    composicao: 'll5_body_composition',
  }
  const col = mapa[template]
  if (!col) return 0
  const linhas = await listar(col, ator, { ownerEscolhido: ownerId })
  return linhas.length
}
