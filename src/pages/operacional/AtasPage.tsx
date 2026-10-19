import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — Atas & Reuniões: CRUD com data, participantes, resumo e decisões.

export const CONFIG_ATAS: CrudConfig = {
  colecao: 'atas',
  gate: 'atas',
  titulo: 'Atas & Reuniões',
  subtitulo: 'Registro de reuniões, participantes, resumo e decisões',
  buscaCampos: ['titulo', 'participantes', 'resumo', 'decisoes'],
  seedVazio: 'Nenhuma ata. Use "Novo" para registrar a primeira reunião.',
  campos: [
    { name: 'titulo', label: 'Título', tipo: 'text', required: true },
    { name: 'data', label: 'Data', tipo: 'date' },
    { name: 'participantes', label: 'Participantes', tipo: 'text' },
    { name: 'resumo', label: 'Resumo', tipo: 'textarea' },
    { name: 'decisoes', label: 'Decisões', tipo: 'textarea' },
  ],
  colunas: [
    { name: 'titulo', label: 'Reunião' },
    { name: 'data', label: 'Data' },
    { name: 'participantes', label: 'Participantes' },
    { name: 'resumo', label: 'Resumo' },
  ],
}

export default function AtasPage() {
  return <CrudPage config={CONFIG_ATAS} />
}
