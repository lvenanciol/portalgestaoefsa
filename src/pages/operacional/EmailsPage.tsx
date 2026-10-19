import CrudPage, { CrudConfig } from '@/components/operacional/CrudPage'

// Fase 10 — E-mails: histórico dos e-mails enviados pelo portal
// (gravação via hook backend; leitura aqui).

export const CONFIG_EMAILS: CrudConfig = {
  colecao: 'emails',
  gate: 'emails',
  titulo: 'E-mails',
  subtitulo: 'Histórico de e-mails enviados pelo portal',
  buscaCampos: ['para', 'assunto', 'criado_por'],
  seedVazio: 'Nenhum e-mail enviado ainda pelo portal.',
  campos: [
    { name: 'para', label: 'Para', tipo: 'text', required: true },
    { name: 'assunto', label: 'Assunto', tipo: 'text', required: true },
  ],
  colunas: [
    { name: 'assunto', label: 'Assunto' },
    { name: 'para', label: 'Para' },
    { name: 'status', label: 'Status', badge: true },
    { name: 'erro', label: 'Erro' },
    { name: 'criado_por', label: 'Enviado por' },
    { name: 'created', label: 'Data' },
  ],
}

export default function EmailsPage() {
  return <CrudPage config={CONFIG_EMAILS} />
}
