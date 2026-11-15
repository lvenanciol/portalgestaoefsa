import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Clock,
  Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import {
  inventariarCsv,
  criarJobCsv,
  processarLoteCsv,
  type InventarioCsv,
} from '@/ll5/csv/importador'
import { FCMAX_REFERENCIA } from '@/ll5/csv/regras'

// ============================================================================
// IMPORTAR CSV DO GARMIN (v2, 15/11/2026)
//
// Upload → PRÉVIA obrigatória → job em lotes de 100 → relatório.
// Reaproveita o engine de ll5_fit_jobs com formato='csv'.
//
// AVISOS HONESTOS na prévia:
//   · < 100 linhas → pacote possivelmente incompleto
//   · FCmax observada > 200 → validar com ergoespirometria
// ============================================================================

const MAX_BYTES = 50 * 1024 * 1024

export default function ImportarCsvDialog({
  open,
  onOpenChange,
  onImportou,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImportou?: () => void
}) {
  const { ator, ownerAtual } = useLl5()
  const [inv, setInv] = useState<InventarioCsv | null>(null)
  const [lendo, setLendo] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortar = useRef(false)

  const reset = () => {
    setInv(null)
    setJob(null)
    setRodando(false)
    setErro('')
    abortar.current = false
  }

  useEffect(() => {
    if (!open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const receber = async (f: File) => {
    if (f.size > MAX_BYTES) {
      setErro('Arquivo acima de 50 MB.')
      return
    }
    setLendo(true)
    setErro('')
    try {
      const r = await inventariarCsv(f)
      if (r.validas === 0) {
        setErro(
          r.ignoradas > 0
            ? `O CSV só tem atividades de tipos ignorados (${Object.keys(r.porTipo).join(', ')}). Nada a importar.`
            : 'Nenhuma linha válida encontrada no CSV.',
        )
      }
      setInv(r)
    } catch (e: any) {
      setErro(e?.message || String(e))
    } finally {
      setLendo(false)
    }
  }

  const iniciar = async () => {
    if (!inv || rodando) return
    setRodando(true)
    setErro('')
    // feedback IMEDIATO: o job aparece na tela antes de qualquer await,
    // para o clique nunca parecer que "não fez nada".
    setJob({
      status: 'iniciando',
      processados: 0,
      total_arquivos: inv.total,
      importados: 0,
      duplicados: 0,
      ignorados: 0,
      erros: 0,
      log: [],
    })

    try {
      const id = await criarJobCsv(ownerAtual, ator.email, inv)

      let concluido = false
      let atual: any = null
      while (!concluido && !abortar.current) {
        // a fila vem da MEMÓRIA (o registro no banco só guarda contadores)
        const r = await processarLoteCsv(id, ownerAtual, ator.email, inv.itens)
        concluido = r.concluido
        atual = r.job
        setJob({ ...atual })
      }
      if (concluido) {
        toast({
          title: 'Importação concluída',
          description: `${atual?.importados || 0} importadas · ${atual?.duplicados || 0} já existentes · ${atual?.ignorados || 0} ignoradas`,
        })
        onImportou?.()
      }
    } catch (e: any) {
      setErro('Falha na importação: ' + (e?.message || String(e)))
      setJob(null)
    } finally {
      setRodando(false)
    }
  }

  const pct = job?.total_arquivos ? (job.processados / job.total_arquivos) * 100 : 0
  const concluido =
    job?.status === 'concluido' || job?.status === 'parcial' || job?.status === 'falhou'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#1b5e20]" /> Importar CSV do Garmin
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            Export de atividades do Garmin Connect. Até 50 MB. Walking, natação e ciclismo são
            ignorados; corridas e musculação entram.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {erro && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-700 flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {erro}
            </div>
          )}

          {!inv && !lendo && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full py-10 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1b5e20] hover:bg-emerald-50/30 transition-colors flex flex-col items-center gap-2"
            >
              <Upload className="h-7 w-7 text-gray-400" />
              <span className="text-[13px] font-bold text-gray-800">
                Arraste o CSV aqui ou clique para selecionar
              </span>
              <span className="text-[11px] text-gray-500">.CSV do Garmin Connect · até 50 MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) receber(f)
            }}
          />

          {lendo && (
            <div className="py-10 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#1b5e20]" />
              <p className="text-[12px] text-gray-600">Lendo e classificando as linhas…</p>
            </div>
          )}

          {/* ---------- PRÉVIA ---------- */}
          {inv && !job && (
            <div className="space-y-3">
              {inv.avisoIncompleto && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Pacote possivelmente incompleto (menos de 100 atividades).
                </div>
              )}
              {inv.avisoFcmax && (
                <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-[11.5px] text-sky-900 flex items-start gap-1.5">
                  <Gauge className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  FCmax observada {inv.fcmaxObservada} bpm — elevada. As zonas usarão{' '}
                  <strong>{FCMAX_REFERENCIA}</strong> (validada estatisticamente), mas convém
                  confirmar por ergoespirometria.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { l: 'Linhas lidas', v: inv.total, c: 'text-gray-900' },
                  { l: 'Corridas', v: inv.corridas, c: 'text-[#1b5e20]' },
                  { l: 'Musculação', v: inv.forca, c: 'text-gray-900' },
                  { l: 'Ignoradas', v: inv.ignoradas, c: 'text-gray-400' },
                ].map((x) => (
                  <Card key={x.l} className="p-2.5 rounded-lg border-gray-200">
                    <p className="text-[9.5px] font-semibold text-gray-500 uppercase">{x.l}</p>
                    <p className={cn('text-[18px] font-extrabold tabular-nums', x.c)}>{x.v}</p>
                  </Card>
                ))}
              </div>

              <Card className="p-3 rounded-lg border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
                  Período coberto
                </p>
                <p className="text-[13px] font-bold text-gray-900 tabular-nums">
                  {inv.periodoInicio
                    ? `${inv.periodoInicio.split('-').reverse().join('/')} → ${inv.periodoFim?.split('-').reverse().join('/')}`
                    : '—'}
                </p>
                <p className="text-[10.5px] text-gray-500 mt-1">
                  Distância total: {(inv.distanciaTotalM / 1000).toLocaleString('pt-BR')} km
                </p>
              </Card>

              <Card className="p-3 rounded-lg border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">
                  Distribuição por tipo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(inv.porTipo).map(([t, n]) => (
                    <span
                      key={t}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',
                        t === 'caminhada' || t === 'natacao' || t === 'ciclismo'
                          ? 'bg-gray-100 text-gray-400 line-through'
                          : 'bg-emerald-50 text-emerald-800',
                      )}
                    >
                      {t}: <strong className="tabular-nums">{n}</strong>
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ---------- PROGRESSO ---------- */}
          {job && (
            <div className="space-y-3">
              <Card className="p-3 rounded-lg border-gray-200">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[11.5px] font-bold text-gray-800">
                    {job.status === 'iniciando'
                      ? 'Preparando o job…'
                      : `${job.processados} de ${job.total_arquivos} linhas`}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[13px] font-extrabold text-[#1b5e20] tabular-nums">
                      {Math.round(pct)}%
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] font-bold uppercase',
                        job.status === 'concluido'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : job.status === 'falhou'
                            ? 'border-red-300 text-red-700 bg-red-50'
                            : 'border-sky-300 text-sky-700 bg-sky-50',
                      )}
                    >
                      {job.status === 'iniciando' ? 'iniciando' : job.status}
                    </Badge>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-gray-100 overflow-hidden relative">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      job.status === 'iniciando' && 'animate-pulse',
                    )}
                    style={{
                      width: Math.max(pct, job.status === 'iniciando' ? 4 : 0) + '%',
                      backgroundColor: job.status === 'falhou' ? '#dc2626' : '#1b5e20',
                    }}
                  />
                </div>
                {/* estimativa e velocidade */}
                {job.status !== 'iniciando' && !concluido && (
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Importando em lotes de 100
                    </span>
                    <span className="tabular-nums">
                      {job.total_arquivos - job.processados} linha(s) restante(s)
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2 mt-2.5">
                  {[
                    { l: 'Importadas', v: job.importados || 0, c: 'text-emerald-700' },
                    { l: 'Já existentes', v: job.duplicados || 0, c: 'text-gray-600' },
                    { l: 'Ignoradas', v: job.ignorados || 0, c: 'text-gray-500' },
                    { l: 'Erros', v: job.erros || 0, c: 'text-red-600' },
                  ].map((x) => (
                    <div key={x.l}>
                      <p className="text-[9.5px] font-semibold text-gray-500 uppercase">{x.l}</p>
                      <p className={cn('text-[15px] font-extrabold tabular-nums', x.c)}>{x.v}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {concluido && (
                <Card className="p-3 rounded-lg border-gray-200 space-y-2">
                  <p className="text-[11.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    {job.status === 'concluido' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                    )}
                    Relatório da importação
                  </p>

                  <div className="text-[11px] text-gray-600 space-y-0.5">
                    <p>
                      Lido: <strong>{job.total_arquivos}</strong> · importado:{' '}
                      <strong>{job.importados}</strong> · já existente:{' '}
                      <strong>{job.duplicados}</strong> · ignorado: <strong>{job.ignorados}</strong>{' '}
                      · erro: <strong>{job.erros}</strong>
                    </p>
                    <p>
                      Período:{' '}
                      <strong>
                        {job.resumo?.periodo_inicio?.split('-').reverse().join('/')} →{' '}
                        {job.resumo?.periodo_fim?.split('-').reverse().join('/')}
                      </strong>
                    </p>
                    <p>
                      Distância importada:{' '}
                      <strong>
                        {((job.distancia_total_m || 0) / 1000).toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}{' '}
                        km
                      </strong>
                    </p>
                    <p>
                      Longos em Z4 sinalizados: <strong>{job.sinalizados || 0}</strong>
                    </p>
                  </div>

                  {(job.log || []).filter((l: any) => l.status === 'erro').length > 0 && (
                    <div className="max-h-[100px] overflow-y-auto rounded border border-red-100 bg-red-50/50 p-1.5">
                      {(job.log || [])
                        .filter((l: any) => l.status === 'erro')
                        .slice(0, 15)
                        .map((l: any, i: number) => (
                          <p key={i} className="text-[10px] text-red-800 font-mono truncate">
                            linha {l.linha}: {l.motivo}
                          </p>
                        ))}
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Registro gravado em access_log.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-gray-100">
          {inv && !job && (
            <>
              <Button variant="outline" size="sm" onClick={reset} className="h-9 text-[12px]">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Trocar arquivo
              </Button>
              <Button
                size="sm"
                onClick={iniciar}
                className="h-9 text-[12px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" /> Iniciar importação
              </Button>
            </>
          )}
          {job && concluido && (
            <>
              <Button variant="outline" size="sm" onClick={reset} className="h-9 text-[12px]">
                Importar outro
              </Button>
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 text-[12px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
              >
                Concluir
              </Button>
            </>
          )}
          {!inv && !lendo && !job && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-[12px]"
            >
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
