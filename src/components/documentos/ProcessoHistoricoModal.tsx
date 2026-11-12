import { useState, useEffect } from 'react'
import { History, Calendar, User, ArrowRight, Clock, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import pb from '@/lib/pocketbase/client'
import { formatarBRL } from './documentos-moeda-utils'

interface ProcessoHistoricoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  processoId: string | null
  numeroProcesso: string
  tituloProcesso?: string
}

export function ProcessoHistoricoModal({
  aberto,
  onOpenChange,
  processoId,
  numeroProcesso,
  tituloProcesso,
}: ProcessoHistoricoModalProps) {
  const [historico, setHistorico] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!aberto || (!processoId && !numeroProcesso)) return

    let ativo = true
    setCarregando(true)

    const buscar = async () => {
      try {
        let filtro = ''
        if (processoId) {
          filtro = `processo_id = "${processoId}"`
        }
        if (numeroProcesso) {
          filtro = filtro
            ? `(${filtro} || numero_processo = "${numeroProcesso}")`
            : `numero_processo = "${numeroProcesso}"`
        }

        const res = await pb.collection('juridicos_historico').getList(1, 50, {
          filter: filtro,
          sort: '-versao',
        })
        if (ativo) {
          setHistorico(res.items || [])
        }
      } catch (err) {
        console.error('Erro ao buscar histórico do processo:', err)
        if (ativo) setHistorico([])
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    buscar()

    return () => {
      ativo = false
    }
  }, [aberto, processoId, numeroProcesso])

  const fmtMoeda = (val: any) => formatarBRL(val) || '—'

  const fmtData = (val: any) => {
    if (!val) return '—'
    try {
      const d = new Date(val)
      return (
        d.toLocaleDateString('pt-BR') +
        ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      )
    } catch {
      return String(val)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl max-h-[80vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            <History className="h-5 w-5 text-[#1B5E20]" />
            Histórico de Versões do Processo
          </DialogTitle>
          <div className="text-xs text-gray-600 mt-1">
            <span className="font-semibold text-gray-900 font-mono">{numeroProcesso}</span>
            {tituloProcesso ? ` — ${tituloProcesso}` : ''}
          </div>
        </DialogHeader>

        <div className="py-2">
          {carregando ? (
            <div className="py-8 text-center text-xs text-gray-500">
              Carregando histórico de versões...
            </div>
          ) : historico.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Clock className="h-8 w-8 text-gray-300 mx-auto" />
              <div className="text-xs font-semibold text-gray-700">
                Nenhuma versão anterior gravada
              </div>
              <div className="text-[11px] text-gray-500 max-w-sm mx-auto">
                Este processo está em sua versão inicial (versão 1) ou ainda não sofreu reimportação
                com alteração de dados.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-gray-500">
                Exibindo <strong>{historico.length}</strong> versão(ões) arquivada(s) antes das
                importações subsequentes:
              </div>

              <div className="space-y-3">
                {historico.map((item, idx) => {
                  const valores = item.valores_anteriores || {}
                  const alteracoes = item.alteracoes || {}
                  const chavesAlt = Object.keys(alteracoes)

                  return (
                    <div
                      key={item.id || idx}
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-100 text-emerald-800 font-bold border-0 text-[11px]">
                            Versão {item.versao || idx + 1}
                          </Badge>
                          <span className="text-gray-500 flex items-center gap-1 text-[11px]">
                            <Calendar className="h-3 w-3" />
                            {fmtData(item.data_importacao || item.created)}
                          </span>
                        </div>
                        {item.importado_por && (
                          <span className="text-gray-400 text-[11px] flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {item.importado_por}
                          </span>
                        )}
                      </div>

                      {chavesAlt.length > 0 && (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 space-y-1">
                          <div className="font-semibold flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Alterações registradas nesta versão:
                          </div>
                          {chavesAlt.map((c) => (
                            <div key={c} className="flex items-center gap-1.5 pl-4">
                              <span className="font-medium text-gray-700 capitalize">{c}:</span>
                              <span className="line-through text-gray-500">
                                {c.includes('valor')
                                  ? fmtMoeda(alteracoes[c]?.anterior)
                                  : String(alteracoes[c]?.anterior ?? '—')}
                              </span>
                              <ArrowRight className="h-3 w-3 text-emerald-700" />
                              <span className="font-bold text-emerald-800">
                                {c.includes('valor')
                                  ? fmtMoeda(alteracoes[c]?.novo)
                                  : String(alteracoes[c]?.novo ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Status:</span>
                          <span className="font-medium text-gray-800">
                            {valores.status || 'Ativo'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Probabilidade:</span>
                          <span className="font-medium text-amber-700">
                            {valores.probabilidade || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Valor Base:</span>
                          <span className="font-medium text-gray-800">
                            {fmtMoeda(valores.valor_base)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Valor Atualizado:</span>
                          <span className="font-bold text-emerald-800">
                            {fmtMoeda(valores.valor_atualizado)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
