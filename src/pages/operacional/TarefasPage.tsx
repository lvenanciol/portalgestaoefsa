import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — Tarefas & Agenda: CRUD de tarefas com status, prioridade,
// responsável e prazo.

export const CONFIG_TAREFAS: CrudConfig = {
  colecao: 'tarefas',
  gate: 'tarefas',
  titulo: 'Tarefas & Agenda',
  subtitulo: 'Pendências e compromissos da equipe com prazo e prioridade',
  buscaCampos: ['titulo', 'descricao', 'responsavel'],
  seedVazio: 'Nenhuma tarefa. Use "Novo" para criar a primeira.',
  campos: [
    { name: 'titulo', label: 'Título', tipo: 'text', required: true },
    { name: 'descricao', label: 'Descrição', tipo: 'textarea' },
    {
      name: 'status',
      label: 'Status',
      tipo: 'select',
      options: ['pendente', 'em_andamento', 'concluida'],
    },
    {
      name: 'prioridade',
      label: 'Prioridade',
      tipo: 'select',
      options: ['baixa', 'media', 'alta'],
    },
    { name: 'responsavel', label: 'Responsável', tipo: 'text' },
    { name: 'prazo', label: 'Prazo', tipo: 'date' },
  ],
  colunas: [
    { name: 'titulo', label: 'Tarefa' },
    { name: 'status', label: 'Status', badge: true },
    { name: 'prioridade', label: 'Prioridade', badge: true },
    { name: 'responsavel', label: 'Responsável' },
    { name: 'prazo', label: 'Prazo' },
  ],
}

export default function TarefasPage() {
  return <CrudPage config={CONFIG_TAREFAS} />
}
