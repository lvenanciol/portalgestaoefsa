import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — Contratos: CRUD com parte contrária, tipo, valor mensal,
// vigência e status (ativo/vencendo/encerrado).

export const CONFIG_CONTRATOS: CrudConfig = {
  colecao: 'contratos',
  gate: 'contratos',
  titulo: 'Contratos',
  subtitulo: 'Contratos do grupo — locação, serviços e fornecimento',
  buscaCampos: ['titulo', 'parte', 'empresa', 'observacao'],
  seedVazio: 'Nenhum contrato. Use "Novo" para registrar o primeiro.',
  campos: [
    { name: 'titulo', label: 'Título', tipo: 'text', required: true },
    { name: 'parte', label: 'Parte contrária', tipo: 'text', required: true },
    {
      name: 'tipo',
      label: 'Tipo',
      tipo: 'select',
      options: ['locacao', 'servico', 'fornecimento', 'outro'],
    },
    { name: 'empresa', label: 'Empresa', tipo: 'text' },
    { name: 'valor_mensal', label: 'Valor mensal (R$)', tipo: 'number' },
    { name: 'inicio', label: 'Início', tipo: 'date' },
    { name: 'fim', label: 'Fim', tipo: 'date' },
    {
      name: 'status',
      label: 'Status',
      tipo: 'select',
      options: ['ativo', 'vencendo', 'encerrado'],
    },
    { name: 'observacao', label: 'Observação', tipo: 'textarea' },
  ],
  colunas: [
    { name: 'titulo', label: 'Contrato' },
    { name: 'parte', label: 'Parte' },
    { name: 'tipo', label: 'Tipo', badge: true },
    { name: 'empresa', label: 'Empresa' },
    { name: 'valor_mensal', label: 'Valor mensal' },
    { name: 'fim', label: 'Fim' },
    { name: 'status', label: 'Status', badge: true },
  ],
}

export default function ContratosPage() {
  return <CrudPage config={CONFIG_CONTRATOS} />
}
