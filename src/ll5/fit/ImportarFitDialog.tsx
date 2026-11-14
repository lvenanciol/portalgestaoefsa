import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  FileArchive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  FileCheck,
  Clock,
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
  inventariarZip,
  inventariarFit,
  criarJob,
  processarLote,
  lerJob,
  type Inventario,
} from '@/ll5/fit/importador'

// ============================================================================
// IMPORTAR ARQUIVOS .FIT (15/11/2026)
//
// Fluxo: upload → PRÉVIA obrigatória → job assíncrono em lotes → relatório.
// O processamento roda em lotes de 25 com progresso persistido; fechar o
// modal não perde o job (fica gravado em ll5_fit_jobs e é retomável).
// ============================================================================

const MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

export default function ImportarFitDialog({
  open,
  onOpenChange,
  onImportou,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImportou?: () => void
}) {
  const { ator, ownerAtual } = useLl5()
  const [inventario, setInventario] = useState<Inventario | null>(null)
  const [lendo, setLendo] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<any>(null)
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortar = useRef(false)

  const reset = () => {
    setInventario(null)
    setJobId(null)
    setJob(null)
    setRodando(false)
    setErro('')
    abortar.current = false
  }

  useEffect(() => {
    if (!open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const receberArquivo = async (f: File) => {
    if (f.size > MAX_BYTES) {
      setErro('Arquivo acima de 2 GB.')
      return
    }
    setLendo(true)
    setErro('')
    try {
      const ehZip = /\.zip$/i.test(f.name)
      const inv = ehZip ? await inventariarZip(f) : await inventariarFit(f)
      if (inv.fit === 0) {
        setErro(
          inv.wellness > 0
            ? 'O pacote contém apenas arquivos de wellness, que são ignorados por regra. Nenhuma atividade para importar.'
            : 'Nenhum arquivo .FIT encontrado no pacote.',
        )
      }
      setInventario(inv)
    } catch (e: any) {
      setErro('Falha ao ler o pacote: ' + (e?.message || String(e)))
    } finally {
      setLendo(false)
    }
  }

  const iniciar = async () => {
    if (!inventario) return
    setRodando(true)
    setErro('')
    try {
      const id = await criarJob(ownerAtual, ator.email, inventario)
      setJobId(id)

      // processa lotes até concluir
      let concluido = false
      let atual: any = null
      while (!concluido && !abortar.current) {
        const r = await processarLote(id, ownerAtual, ator.email)
        concluido = r.concluido
        atual = r.job
        setJob({ ...atual })
      }
      if (concluido) {
        toast({
          title: 'Importação concluída',
          description: `${atual?.importados || 0} importadas · ${atual?.duplicados || 0} já existentes · ${atual?.enriquecidos || 0} enriquecidas`,
        })
        onImportou?.()
      }
    } catch (e: any) {
      setErro('Falha na importação: ' + (e?.message || String(e)))
    } finally {
      setRodando(false)
    }
  }

  const percentual = job && job.total_arquivos ? (job.processados / job.total_arquivos) * 100 : 0
  const concluido = job?.status === 'concluido' || job?.status === 'falhou'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-[#1b5e20]" /> Importar arquivos .FIT
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            Aceita o pacote de export do Garmin Connect (.ZIP) ou um .FIT avulso. Máximo 2 GB.
            Apenas atividades são importadas — wellness, sono e peso são ignorados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {erro && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-700 flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {erro}
            </div>
          )}

          {/* ---------- 1) upload ---------- */}
          {!inventario && !lendo && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full py-10 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1b5e20] hover:bg-emerald-50/30 transition-colors flex flex-col items-center gap-2"
            >
              <Upload className="h-7 w-7 text-gray-400" />
              <span className="text-[13px] font-bold text-gray-800">
                Arraste o .ZIP aqui ou clique para selecionar
              </span>
              <span className="text-[11px] text-gray-500">
                DI_CONNECT/… ou arquivo .FIT avulso · até 2 GB
              </span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.fit"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) receberArquivo(f)
            }}
          />

          {lendo && (
            <div className="py-10 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#1b5e20]" />
              <p className="text-[12px] text-gray-600">Lendo o pacote e inventariando…</p>
            </div>
          )}

          {/* ---------- 2) prévia obrigatória ---------- */}
          {inventario && !job && (
            <div className="space-y-3">
              {inventario.avisoIncompleto && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Pacote possivelmente incompleto. Verifique se o export inclui todos os dados e
                    todos os períodos.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 rounded-lg border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">Arquivos .FIT</p>
                  <p className="text-[20px] font-extrabold text-gray-900 tabular-nums">
                    {inventario.fit}
                  </p>
                </Card>
                <Card className="p-3 rounded-lg border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">
                    Wellness ignorados
                  </p>
                  <p className="text-[20px] font-extrabold text-gray-400 tabular-nums">
                    {inventario.wellness}
                  </p>
                </Card>
                <Card className="p-3 rounded-lg border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">
                    Outros ignorados
                  </p>
                  <p className="text-[20px] font-extrabold text-gray-400 tabular-nums">
                    {inventario.ignorados - inventario.wellness}
                  </p>
                </Card>
              </div>

              <Card className="p-3 rounded-lg border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">
                  Período coberto
                </p>
                <p className="text-[13px] font-bold text-gray-900 tabular-nums">
                  {inventario.periodoInicio
                    ? `${inventario.periodoInicio.split('-').reverse().join('/')} → ${inventario.periodoFim?.split('-').reverse().join('/')}`
                    : '—'}
                </p>
              </Card>

              <Card className="p-3 rounded-lg border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">
                  Resumo por tipo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(inventario.porTipo).map(([t, n]) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10.5px] font-semibold text-gray-700"
                    >
                      {t}: <strong className="tabular-nums">{n}</strong>
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ---------- 3) progresso ---------- */}
          {job && (
            <div className="space-y-3">
              <Card className="p-3 rounded-lg border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11.5px] font-bold text-gray-800">
                    {job.processados} de {job.total_arquivos} arquivos
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
                    {job.status}
                  </Badge>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: percentual + '%',
                      backgroundColor: job.status === 'falhou' ? '#dc2626' : '#1b5e20',
                    }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2.5">
                  {[
                    { l: 'Importadas', v: job.importados || 0, c: 'text-emerald-700' },
                    { l: 'Já existentes', v: job.duplicados || 0, c: 'text-gray-600' },
                    { l: 'Enriquecidas', v: job.enriquecidos || 0, c: 'text-sky-700' },
                    { l: 'Erros', v: job.erros || 0, c: 'text-red-600' },
                  ].map((x) => (
                    <div key={x.l}>
                      <p className="text-[9.5px] font-semibold text-gray-500 uppercase">{x.l}</p>
                      <p className={cn('text-[15px] font-extrabold tabular-nums', x.c)}>{x.v}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* relatório final */}
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
                      Total encontrado: <strong>{job.total_arquivos}</strong> · processados:{' '}
                      <strong>{job.processados}</strong> · com erro: <strong>{job.erros}</strong>
                    </p>
                    <p>
                      Período:{' '}
                      <strong>
                        {job.resumo?.periodo_inicio?.split('-').reverse().join('/')} →{' '}
                        {job.resumo?.periodo_fim?.split('-').reverse().join('/')}
                      </strong>
                    </p>
                  </div>

                  {(job.log || []).filter((l: any) => l.status === 'erro').length > 0 && (
                    <div className="max-h-[110px] overflow-y-auto rounded border border-red-100 bg-red-50/50 p-1.5">
                      {(job.log || [])
                        .filter((l: any) => l.status === 'erro')
                        .slice(0, 20)
                        .map((l: any, i: number) => (
                          <p key={i} className="text-[10px] text-red-800 font-mono truncate">
                            {l.arquivo} — {l.motivo}
                          </p>
                        ))}
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Registro gravado em access_log.
                  </p>
                </Card>
              )}

              {/* log incremental */}
              {!concluido && (job.log || []).length > 0 && (
                <div className="max-h-[120px] overflow-y-auto rounded border border-gray-100 bg-gray-50/60 p-1.5">
                  {(job.log || [])
                    .slice(-15)
                    .reverse()
                    .map((l: any, i: number) => (
                      <p key={i} className="text-[10px] font-mono text-gray-600 truncate">
                        {l.status === 'erro' ? '✗' : l.status === 'duplicado' ? '=' : '✓'}{' '}
                        {l.arquivo} {l.motivo ? '— ' + l.motivo : ''}
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-gray-100">
          {inventario && !job && (
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
                <FileCheck className="h-3.5 w-3.5 mr-1.5" /> Importar outro
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
          {!inventario && !lendo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-[12px]"
            >
              Cancelar
            </Button>
          )}
          {job && !concluido && rodando && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                abortar.current = true
              }}
              className="h-9 text-[12px]"
            >
              Parar e continuar depois
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
