import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2, RefreshCw, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar } from '@/ll5/repo'

// ============================================================================
// LL5 — LOG DE AUDITORIA (tela secundária, SÓ ADMIN)
//
// Registra e exibe os eventos exigidos pelo briefing:
//   · leitura de parecer alheio por admin
//   · escrita de admin em registro de familiar (created_by ≠ owner_id)
//   · geração de parecer
//   · exportação de laudo
// ============================================================================

const ACAO_COR: Record<string, string> = {
  leitura: 'border-sky-300 text-sky-700 bg-sky-50',
  escrita: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  exclusao: 'border-red-300 text-red-700 bg-red-50',
  geracao_parecer: 'border-violet-300 text-violet-700 bg-violet-50',
  exportacao: 'border-amber-300 text-amber-700 bg-amber-50',
}

export default function Ll5AuditoriaPage() {
  const { ator, isAdmin } = useLl5()
  const [linhas, setLinhas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    setCarregando(true)
    try {
      const r = await listar('ll5_access_log', ator, { sort: '-created' })
      setLinhas(r)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (isAdmin) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <Card className="p-8 text-center rounded-xl border-gray-200">
        <ShieldCheck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-[13px] font-bold text-gray-800">Acesso restrito</p>
        <p className="text-[11.5px] text-gray-500 mt-1">
          A trilha de auditoria é visível apenas para o administrador da conta.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#1b5e20]" /> Auditoria LL5
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Trilha de acessos e alterações nos dados pessoais
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} className="h-9">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 flex items-start gap-2">
        <Info className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
        <p className="text-[11px] text-sky-900 leading-snug">
          Registros obrigatórios: leitura de parecer alheio, escrita em registro de familiar
          (created_by ≠ owner_id), geração de parecer e exportação de laudo.
        </p>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
        </div>
      ) : linhas.length === 0 ? (
        <Card className="p-10 text-center rounded-xl border-dashed border-gray-300">
          <p className="text-[12.5px] font-semibold text-gray-700">Nenhum evento registrado</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Os eventos aparecem aqui conforme o uso: gerar parecer, exportar laudo, admin ler dados
            de familiar.
          </p>
        </Card>
      ) : (
        <Card className="rounded-xl border-gray-200 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-gray-50/70">
              <tr className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">
                <th className="text-left px-3 py-2">Quando</th>
                <th className="text-left px-3 py-2">Ator</th>
                <th className="text-left px-3 py-2">Ação</th>
                <th className="text-left px-3 py-2">Entidade</th>
                <th className="text-left px-3 py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">
                    {String(l.created || '')
                      .slice(0, 16)
                      .replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-800">{l.ator_role}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-bold uppercase ${ACAO_COR[l.acao] || 'border-gray-300 text-gray-600'}`}
                    >
                      {l.acao}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.entidade}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[280px]">{l.detalhe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
