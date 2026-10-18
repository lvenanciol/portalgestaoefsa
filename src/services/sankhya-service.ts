import pb from '@/lib/pocketbase/client'

// Fase 5 — Serviço Sankhya do PGE: chama o proxy (hook → edge Foldbox → ERP).
// Admin-only no backend; o front só monta os envelopes.

export interface ProxyResult {
  ok: boolean
  via: string | null
  status: number
  data: any
}

async function proxy(op: string, payload: Record<string, unknown> = {}): Promise<ProxyResult> {
  return pb.send('/backend/v1/sankhya/proxy', {
    method: 'POST',
    body: JSON.stringify({ op, payload }),
  }) as Promise<ProxyResult>
}

// Teste de conexão (op=login no proxy → OAuth na edge)
export const testarConexao = () => proxy('login')

// CRUDServiceProvider.loadRecords — envelope: { serviceName, requestBody }
// O Sankhya espera o corpo com serviceName+requestBody no nível raiz.
export const loadRecords = (
  rootEntity: string,
  fieldset: string,
  expression: string,
  offsetPage = '0',
) =>
  proxy('loadRecords', {
    serviceName: 'CRUDServiceProvider.loadRecords',
    requestBody: {
      serviceName: 'CRUDServiceProvider.loadRecords',
      requestBody: {
        dataSet: {
          rootEntity,
          includePresentationFields: 'N',
          offsetPage,
          criteria: { expression: { $: expression } },
          entity: { fieldset: { list: fieldset } },
        },
      },
    },
  })

// DbExplorerSP.executeQuery — consulta SQL (owner SANKHYA)
export const dbExplorer = (sql: string) =>
  proxy('dbExplorer', {
    requestBody: {
      serviceName: 'DbExplorerSP.executeQuery',
      requestBody: { sql },
    },
  })

// Serviço genérico do gateway mge (ex.: MobileLoginSP, CACSP, etc.)
export const servico = (serviceName: string, requestBody: Record<string, unknown>) =>
  proxy('service', { serviceName, requestBody: { serviceName, requestBody } })

// Lê o record posicional (f0..fN) do Sankhya no padrão das edges Foldbox
export function readField(rec: Record<string, any>, name: string, pos: number): string {
  if (rec[name] && rec[name].$ !== undefined) return String(rec[name].$)
  const f = rec['f' + pos]
  return f && f.$ !== undefined ? String(f.$) : ''
}
