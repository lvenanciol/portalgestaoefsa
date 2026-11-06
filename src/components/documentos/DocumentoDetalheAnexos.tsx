import React from 'react'
import {
  FileText,
  Paperclip,
  Eye,
  Download,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import pb from '@/lib/pocketbase/client'

export const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
export const podeVisualizarAnexo = (nome: string): boolean =>
  /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

interface DocumentoDetalheAnexosProps {
  colecaoNome: string
  recordId: string
  anexos: string[]
  onAbrirAnexosModal?: () => void
  onVisualizarArquivo: (nomeArquivo: string) => void
  onAnexosAlterados?: (novaLista: string[]) => void
}

export function DocumentoDetalheAnexos({
  colecaoNome,
  recordId,
  anexos,
  onAbrirAnexosModal,
  onVisualizarArquivo,
  onAnexosAlterados,
}: DocumentoDetalheAnexosProps) {
  const [removendo, setRemovendo] = React.useState<string | null>(null)
  const [arquivoParaRemover, setArquivoParaRemover] = React.useState<string | null>(null)
  const [fazendoUpload, setFazendoUpload] = React.useState(false)
  const [listaLocal, setListaLocal] = React.useState<string[]>(anexos)
  const inputUploadRef = React.useRef<HTMLInputElement>(null)

  // Mantém sincronizada com a prop externa quando esta mudar
  React.useEffect(() => {
    setListaLocal(anexos)
  }, [anexos])

  const extrairNomes = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(String).filter(Boolean)
    if (typeof val === 'string' && val.trim()) return [val.trim()]
    return []
  }

  const handleDownload = (nome: string) => {
    try {
      const url = pb.files.getUrl({ collectionName: colecaoNome, id: recordId } as any, nome, {
        download: true,
      })
      window.open(url, '_blank')
    } catch (e) {
      console.error('Erro ao gerar download:', e)
    }
  }

  const confirmarRemocao = async () => {
    if (!arquivoParaRemover) return
    const nome = arquivoParaRemover
    setRemovendo(nome)
    try {
      // 1. Obtém lista atualizada direto do banco
      const rec = await pb.collection(colecaoNome).getOne(recordId)
      const listaAtual = extrairNomes(rec.anexo)
      const base = listaAtual.length > 0 ? listaAtual : listaLocal
      const listaRestante = base.filter((f) => f !== nome)

      let recAtualizado: any
      try {
        // Tenta sintaxe nativa PocketBase para remover anexo específico
        recAtualizado = await pb.collection(colecaoNome).update(recordId, {
          'anexo-': [nome],
        } as any)
      } catch (errMod) {
        console.warn('Tentativa com modificador anexo- falhou, tentando lista direta:', errMod)
        recAtualizado = await pb.collection(colecaoNome).update(recordId, {
          anexo: listaRestante.length === 0 ? null : listaRestante,
        } as any)
      }

      let novaLista = extrairNomes(recAtualizado?.anexo)
      // Se ainda contiver o arquivo removido por limitação do schema, força lista restante
      if (novaLista.includes(nome)) {
        try {
          const recForcado = await pb.collection(colecaoNome).update(recordId, {
            anexo: listaRestante.length === 0 ? null : listaRestante,
          } as any)
          novaLista = extrairNomes(recForcado?.anexo)
        } catch (_) {
          novaLista = listaRestante
        }
      }

      setListaLocal(novaLista)
      onAnexosAlterados?.(novaLista)
      setArquivoParaRemover(null)
    } catch (e: any) {
      console.error('Erro ao remover anexo:', e)
      alert('Não foi possível remover o anexo. ' + (e?.message || ''))
    } finally {
      setRemovendo(null)
    }
  }

  const handleUploadMultiplo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setFazendoUpload(true)

    try {
      // 1. Lê a lista mais recente do registro no PocketBase para união segura
      let listaExistente: string[] = []
      try {
        const recAtual = await pb.collection(colecaoNome).getOne(recordId)
        listaExistente = extrairNomes(recAtual.anexo)
      } catch (errGet) {
        console.warn('Não foi possível reler anexos prévios, usando estado local:', errGet)
        listaExistente = [...listaLocal]
      }

      // 2. Constrói FormData com todos os novos arquivos
      const formData = new FormData()
      for (const f of files) {
        formData.append('anexo', f)
      }

      const recAtualizado = await pb.collection(colecaoNome).update(recordId, formData)
      let novaLista = extrairNomes(recAtualizado.anexo)

      // 3. DEFESA CONTRA SOBRESCRITA:
      // Se o backend tiver retornado apenas os novos e descartado os anteriores,
      // monta união dos arquivos prévios + novos e persiste
      const anterioresFaltando = listaExistente.filter((nome) => !novaLista.includes(nome))
      if (anterioresFaltando.length > 0) {
        const uniao = [...anterioresFaltando, ...novaLista]
        try {
          const recUniao = await pb.collection(colecaoNome).update(recordId, {
            anexo: uniao,
          } as any)
          const valUniao = extrairNomes(recUniao?.anexo)
          if (valUniao.length >= uniao.length) {
            novaLista = valUniao
          } else {
            novaLista = uniao
          }
        } catch (errUniao) {
          console.warn('Falha na persistência da união de anexos:', errUniao)
          novaLista = uniao
        }
      }

      setListaLocal(novaLista)
      onAnexosAlterados?.(novaLista)
    } catch (err: any) {
      console.error('Erro ao anexar arquivo(s):', err)
      alert('Falha ao anexar arquivo(s). ' + (err?.message || ''))
    } finally {
      setFazendoUpload(false)
      if (inputUploadRef.current) inputUploadRef.current.value = ''
    }
  }

  const arquivosExibicao = listaLocal

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-blue-700 shrink-0" />
          <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
            Arquivos Anexos do Documento
          </h4>
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            {arquivosExibicao.length} {arquivosExibicao.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputUploadRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt"
            className="hidden"
            onChange={handleUploadMultiplo}
            disabled={fazendoUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputUploadRef.current?.click()}
            disabled={fazendoUpload}
            className="h-7 text-xs bg-white text-blue-700 border-blue-300 hover:bg-blue-50 gap-1.5"
          >
            {fazendoUpload ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            <span>Adicionar Anexo</span>
          </Button>
          {onAbrirAnexosModal && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAbrirAnexosModal}
              className="h-7 text-xs bg-white text-blue-700 border-blue-300 hover:bg-blue-50 gap-1.5"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Gerenciar Anexos</span>
            </Button>
          )}
        </div>
      </div>

      {arquivosExibicao.length === 0 ? (
        <div className="text-xs text-gray-500 bg-white/80 rounded-lg p-3 border border-dashed border-gray-200 text-center flex flex-col items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>Nenhum anexo cadastrado para este documento.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {arquivosExibicao.map((nome, idx) => {
            const visualizavel = podeVisualizarAnexo(nome)
            return (
              <div
                key={`${nome}-${idx}`}
                className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-gray-200 text-xs shadow-2xs hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="font-medium text-gray-800 truncate" title={nome}>
                    {nome}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {visualizavel && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onVisualizarArquivo(nome)}
                      className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-50 gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Visualizar</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(nome)}
                    className="h-7 px-2 text-xs text-gray-700 hover:bg-gray-100 gap-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Baixar</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setArquivoParaRemover(nome)}
                    disabled={removendo === nome}
                    className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 gap-1"
                    title="Remover anexo"
                  >
                    {removendo === nome ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmação amigável de remoção de anexo individual */}
      <AlertDialog
        open={Boolean(arquivoParaRemover)}
        onOpenChange={(aberto) => !aberto && setArquivoParaRemover(null)}
      >
        <AlertDialogContent className="bg-white max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-gray-900">
              Remover este anexo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">
              O arquivo <strong className="text-gray-900">{arquivoParaRemover}</strong> será
              desvinculado deste documento. Os demais anexos serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-3 gap-2">
            <AlertDialogCancel
              disabled={Boolean(removendo)}
              className="text-xs h-8"
              onClick={() => setArquivoParaRemover(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(removendo)}
              onClick={(e) => {
                e.preventDefault()
                confirmarRemocao()
              }}
              className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white"
            >
              {removendo ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
