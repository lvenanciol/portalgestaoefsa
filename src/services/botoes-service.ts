import { useEffect, useState, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { carregarPermissoes, permissoesCache, Permissoes } from '@/services/permissoes-service'

// Fase 9 — Controle de acesso por BOTÃO (fail-open).
// Registry central: a matriz BOTÕES (Controle de Acessos) e os gates das
// telas leem da MESMA fonte — nunca drift. Botão sem restrição = SEMPRE
// visível. Admin bypass total. Estado vive em grupos_permissao.permissoes
// (JSONB) na chave "botoes": { screen_key: [button_keys ocultos] }.

export interface BotaoDef {
  key: string
  label: string
}

export interface TelaBotoes {
  key: string
  label: string
  buttons: BotaoDef[]
}

// Registry — atualizar aqui ao adicionar gates em novas telas.
export const BUTTON_GATES: TelaBotoes[] = [
  {
    key: 'dashboard',
    label: 'Dashboard Executivo',
    buttons: [{ key: 'exportar', label: 'Exportar' }],
  },
  {
    key: 'financeiro',
    label: 'Financeiro & Contábil',
    buttons: [
      { key: 'exportar_csv', label: 'Exportar CSV (DRE/Fluxo/A-P-R/Balancete)' },
      { key: 'importar', label: 'Importar demonstrativo (Balancete/DRE)' },
    ],
  },
  {
    key: 'acessos',
    label: 'Controle de Acessos',
    buttons: [
      { key: 'novo_usuario', label: 'Novo Usuário' },
      { key: 'editar_usuario', label: 'Editar usuário (linha)' },
      { key: 'alternar_ativo', label: 'Ativar/Inativar usuário (switch)' },
      { key: 'auditoria', label: 'Trilha de Auditoria' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos & Importações',
    buttons: [
      { key: 'novo', label: 'Novo documento' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'tarefas',
    label: 'Tarefas & Agenda',
    buttons: [
      { key: 'novo', label: 'Nova tarefa' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'projetos',
    label: 'Projetos',
    buttons: [
      { key: 'novo', label: 'Novo projeto' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'atas',
    label: 'Atas & Reuniões',
    buttons: [
      { key: 'novo', label: 'Nova ata' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'emails',
    label: 'E-mails',
    buttons: [{ key: 'exportar_csv', label: 'Exportar CSV' }],
  },
  {
    key: 'contratos',
    label: 'Contratos',
    buttons: [
      { key: 'novo', label: 'Novo contrato' },
      { key: 'editar', label: 'Editar (linha)' },
      { key: 'excluir', label: 'Excluir (linha)' },
      { key: 'exportar_csv', label: 'Exportar CSV' },
    ],
  },
  {
    key: 'indicadores',
    label: 'Indicadores',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados' }],
  },
  {
    key: 'ia',
    label: 'IA Gemini Flash',
    buttons: [{ key: 'gerar', label: 'Gerar análise' }],
  },
  {
    key: 'power-bi',
    label: 'Power BI',
    buttons: [{ key: 'configurar', label: 'Configurar relatório' }],
  },
  {
    key: 'menus',
    label: 'Árvore de Menus',
    buttons: [{ key: 'toggle_ativo', label: 'Ativar/desativar item (switch)' }],
  },
  {
    key: 'desempenho',
    label: 'Desempenho por Unidade',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados' }],
  },
  {
    key: 'financeiro_real',
    label: 'Financeiro — aba Real (Sankhya)',
    buttons: [{ key: 'atualizar', label: 'Atualizar dados (aba Real)' }],
  },
]

// botoesOcultos(p) → Record<screen, string[]>
export function botoesOcultos(p: Permissoes | null): Record<string, string[]> {
  if (!p || !p.permissoes) return {}
  const b = (p.permissoes as Record<string, unknown>)['botoes']
  if (!b || typeof b !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(b as Record<string, unknown>)) {
    const v = (b as Record<string, unknown>)[k]
    if (Array.isArray(v)) out[k] = v.map(String)
  }
  return out
}

// podeVerBotao(screenKey, buttonKey) — fail-open por construção.
export function podeVerBotao(p: Permissoes | null, screenKey: string, buttonKey: string): boolean {
  if (!p) return true // sem permissões carregadas → fail-open
  if (p.grupoNome === 'Admin') return true
  const oc = botoesOcultos(p)
  return !(oc[screenKey] || []).includes(buttonKey)
}

// Hook: carrega permissões (cache 5min) e expõe pode(screen, btn).
export function useBotoes() {
  const [p, setP] = useState<Permissoes | null>(permissoesCache())
  const [, setTick] = useState(0)

  useEffect(() => {
    carregarPermissoes().then((r) => {
      setP(r)
      setTick((t) => t + 1)
    })
  }, [])

  const pode = useCallback(
    (screenKey: string, buttonKey: string) => podeVerBotao(p, screenKey, buttonKey),
    [p],
  )
  return { pode, permissoes: p }
}

// Salva os botões ocultos de um grupo (via hook backend admin-only).
export async function salvarBotoesGrupo(grupoId: string, botoes: Record<string, string[]>) {
  await pb.send('/backend/v1/botoes/salvar', {
    method: 'POST',
    body: JSON.stringify({ grupo_id: grupoId, botoes }),
  })
}

// Lê os botões ocultos já configurados de um grupo (direto da coleção).
export async function lerBotoesGrupo(grupoId: string): Promise<Record<string, string[]>> {
  const g = await pb.collection('grupos_permissao').getOne(grupoId)
  let perm: Record<string, unknown> | null = null
  try {
    perm = typeof g.permissoes === 'string' ? JSON.parse(g.permissoes) : g.permissoes
  } catch (_) {
    perm = null
  }
  const b = perm && (perm as Record<string, unknown>)['botoes']
  if (!b || typeof b !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(b as Record<string, unknown>)) {
    const v = (b as Record<string, unknown>)[k]
    if (Array.isArray(v)) out[k] = v.map(String)
  }
  return out
}
