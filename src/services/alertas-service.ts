// Fonte de dados REAIS para o sino (aba Alertas) e para a tela /inicio.
// Substitui o mock global (MOCK_DATA.criticalAlerts) por alertas e compromissos
// derivados de coleções do PocketBase (tarefas, contratos, atas_reunioes) e
// aplica o filtro fail-closed por participação do usuário logado
// (responsável / mencionado / participante — helper alertas-usuario).
import pb from '@/lib/pocketbase/client'
import { CriticalAlert, Commitment } from '@/data/mockData'
import {
  alertaDoUsuario,
  chavesUsuario,
  ehAdmin,
  tarefaDoUsuario,
  textoMencionaUsuario,
  UsuarioRef,
} from '@/lib/alertas-usuario'

const MES_CURTO = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export interface DadosAlertasUsuario {
  alertas: CriticalAlert[]
  compromissos: Commitment[]
}

const dia = (v: unknown) => String(v || '').slice(0, 10)
const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * Carrega (do PocketBase) e devolve SOMENTE o que o usuário logado participa:
 *  - Compromissos: tarefas não concluídas com prazo hoje/à frente onde ele é
 *    responsável (relation responsaveis_ids, texto, criador) + reuniões futuras
 *    de atas_reunioes em que ele é participante/criador.
 *  - Alertas: tarefas atrasadas suas, reuniões futuras com vínculo e contratos
 *    vencendo em até 90 dias — cada um só entra com vínculo do usuário
 *    (Admin vê tudo; API rules do banco já restringem a leitura).
 */
export async function carregarDadosDoUsuario(
  user: UsuarioRef | null | undefined,
): Promise<DadosAlertasUsuario> {
  const alertas: CriticalAlert[] = []
  const compromissos: Commitment[] = []
  if (!user || !user.id) return { alertas, compromissos }

  const u: UsuarioRef = { ...user, grupoNome: (user as any).grupoNome }
  const admin = ehAdmin(u)
  const chaves = chavesUsuario(u)
  const hoje = hojeISO()

  // ---- Tarefas (base de compromissos e alertas de atraso) ----
  let tarefas: any[] = []
  try {
    // A API rule da coleção já limita a responsáveis/participantes/criador;
    // o filtro client-side abaixo é uma 2ª camada fail-closed.
    tarefas = (await pb.collection('tarefas').getFullList({
      filter: "status != 'concluida' && status_kanban != 'concluido'",
      sort: 'prazo',
    })) as any[]
  } catch (_) {
    tarefas = []
  }
  const minhasTarefas = admin ? tarefas : tarefas.filter((t) => tarefaDoUsuario(t, u))

  // ---- Compromissos: prazos de hoje em diante ----
  minhasTarefas
    .filter((t) => dia(t.prazo) && dia(t.prazo) >= hoje)
    .sort((a, b) => dia(a.prazo).localeCompare(dia(b.prazo)))
    .slice(0, 6)
    .forEach((t) => {
      const d = dia(t.prazo).split('-')
      compromissos.push({
        id: 'com-' + t.id,
        day: d[2] || '01',
        monthShort: MES_CURTO[parseInt(d[1] || '1', 10) - 1] || '',
        title: t.titulo || 'Compromisso',
        time: 'Prazo',
        location: t.responsavel || 'Operacional',
      })
    })

  // ---- Alertas: minhas tarefas atrasadas ----
  const atrasadas = minhasTarefas.filter((t) => dia(t.prazo) && dia(t.prazo) < hoje)
  if (atrasadas.length) {
    alertas.push({
      id: 'alt-tarefa-atrasada',
      title: `${atrasadas.length} tarefa(s) atrasada(s)`,
      description: 'Você é responsável ou participante — ver módulo Tarefas & Agenda',
      detail: 'Ação imediata',
      severity: 'critical',
      rota: '/tarefas',
    })
  }

  // ---- Reuniões futuras (atas_reunioes): compromisso + alerta ----
  try {
    const reus = (await pb.collection('atas_reunioes').getFullList({
      filter: 'data >= @todayStart',
      sort: 'data',
    })) as any[]
    for (const r of reus) {
      // vínculo: participantes (texto) OU criador OU menção no título/resumo
      const participou =
        admin ||
        textoMencionaUsuario([r.participantes, r.resumo, r.titulo].join(' · '), chaves) ||
        (chaves.length > 0 && chaves.includes(String(r.criado_por || '').toLowerCase()))
      if (!participou) continue
      const d = dia(r.data).split('-')
      if (d[0]) {
        compromissos.push({
          id: 'com-reu-' + r.id,
          day: d[2] || '01',
          monthShort: MES_CURTO[parseInt(d[1] || '1', 10) - 1] || '',
          title: r.titulo || 'Reunião',
          time: 'Reunião',
          location: r.modalidade || 'A definir',
        })
      }
      alertas.push({
        id: 'alt-reu-' + r.id,
        title: 'Reunião agendada' + (r.titulo ? ': ' + r.titulo : ''),
        description: r.modalidade ? 'Modalidade: ' + r.modalidade : 'Você é participante',
        detail: r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '',
        severity: 'warning',
        rota: '/atas',
      })
    }
  } catch (_) {
    /* coleção indisponível — segue só com tarefas/contratos */
  }

  // ---- Alertas: contratos vencendo em até 90 dias (só com vínculo) ----
  try {
    const [contratos, aditivos] = await Promise.all([
      pb.collection('contratos').getFullList(),
      pb.collection('contratos_aditivos').getFullList({ sort: '-data' }),
    ])
    const vigAdt: Record<string, string> = {}
    for (const a of aditivos as any[]) {
      const cid = (a as any).contrato_id
      if (cid && (a as any).nova_vigencia && !vigAdt[cid]) vigAdt[cid] = (a as any).nova_vigencia
    }
    const hojeTs = Date.now()
    const comFim = (contratos as any[])
      .filter((c) => c.status !== 'encerrado')
      .map((c) => ({ c, fim: new Date(vigAdt[c.id] || c.fim || 0) }))
      .filter((x) => !isNaN(x.fim.getTime()) && x.fim.getTime() > 0)
      .sort((a, b) => a.fim.getTime() - b.fim.getTime())

    for (const { c, fim } of comFim) {
      const dias = Math.ceil((fim.getTime() - hojeTs) / 86400000)
      if (dias > 90) break
      const vinculado =
        admin ||
        alertaDoUsuario(
          {
            title: c.titulo || '',
            description: c.parte || '',
            detail: c.responsavel || c.observacao || '',
            empresa: c.empresa || '',
          },
          u,
        )
      if (!vinculado) continue
      alertas.push({
        id: 'alt-contr-' + c.id,
        title:
          dias <= 0
            ? 'Contrato vencido'
            : dias <= 30
              ? 'Contrato vence em até 30 dias'
              : dias <= 60
                ? 'Contrato vence em 31-60 dias'
                : 'Contrato vence em 61-90 dias',
        description:
          (c.parte || '') + ' — ' + (c.titulo || '') + (vigAdt[c.id] ? ' (aditivo)' : ''),
        detail: fim.toLocaleDateString('pt-BR'),
        severity: dias <= 30 ? 'critical' : 'warning',
        rota: '/contratos',
      })
    }
  } catch (_) {
    /* contratos indisponíveis — segue só com alertas de tarefas/reuniões */
  }

  // Ordena compromissos por data (ISO embutido no id não — usa o mês/dia real):
  // reordenação final garantida pela fonte já ordenada; limite de exibição.
  return { alertas, compromissos: compromissos.slice(0, 8) }
}
