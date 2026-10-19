import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — Projetos: CRUD com status, progresso (%), empresa e prazo.

export const CONFIG_PROJETOS: CrudConfig = {
  colecao: 'projetos',
  gate: 'projetos',
  titulo: 'Projetos',
  subtitulo: 'Iniciativas em andamento no grupo com progresso e prazo',
  buscaCampos: ['nome', 'descricao', 'empresa', 'responsavel'],
  seedVazio: 'Nenhum projeto. Use "Novo" para registrar o primeiro.',
  campos: [
    { name: 'nome', label: 'Nome', tipo: 'text', required: true },
    { name: 'descricao', label: 'Descrição', tipo: 'textarea' },
    { name: 'empresa', label: 'Empresa', tipo: 'text' },
    {
      name: 'status',
      label: 'Status',
      tipo: 'select',
      options: ['planejamento', 'em_andamento', 'pausado', 'concluido'],
    },
    { name: 'progresso', label: 'Progresso (%)', tipo: 'number' },
    { name: 'responsavel', label: 'Responsável', tipo: 'text' },
    { name: 'prazo', label: 'Prazo', tipo: 'date' },
  ],
  colunas: [
    { name: 'nome', label: 'Projeto' },
    { name: 'empresa', label: 'Empresa' },
    { name: 'status', label: 'Status', badge: true },
    { name: 'progresso', label: 'Progresso' },
    { name: 'responsavel', label: 'Responsável' },
    { name: 'prazo', label: 'Prazo' },
  ],
}

export default function ProjetosPage() {
  return <CrudPage config={CONFIG_PROJETOS} />
}
