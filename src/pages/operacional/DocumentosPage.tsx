import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — Documentos & Importações: CRUD de documentos do grupo
// (balancetes, DREs, contratos, atas, relatórios).

export const CONFIG_DOCUMENTOS: CrudConfig = {
  colecao: 'documentos',
  gate: 'documentos',
  titulo: 'Documentos & Importações',
  subtitulo: 'Repositório de demonstrativos, contratos e relatórios do grupo',
  buscaCampos: ['nome', 'descricao', 'categoria'],
  seedVazio: 'Nenhum documento. Use "Novo" para adicionar o primeiro.',
  campos: [
    { name: 'nome', label: 'Nome', tipo: 'text', required: true },
    {
      name: 'categoria',
      label: 'Categoria',
      tipo: 'select',
      options: ['balancete', 'dre', 'contrato', 'ata', 'relatorio', 'outro'],
    },
    { name: 'descricao', label: 'Descrição', tipo: 'textarea' },
  ],
  colunas: [
    { name: 'nome', label: 'Nome' },
    { name: 'categoria', label: 'Categoria', badge: true },
    { name: 'descricao', label: 'Descrição' },
    { name: 'criado_por', label: 'Enviado por' },
    { name: 'created', label: 'Data' },
  ],
}

export default function DocumentosPage() {
  return <CrudPage config={CONFIG_DOCUMENTOS} />
}
