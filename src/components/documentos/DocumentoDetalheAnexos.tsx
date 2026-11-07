import React from 'react'
import {
  FileText,
  Paperclip,
  Eye,
  Download,
  AlertTriangle,
  Loader2,
  Trash2,
  Upload,
  ImageIcon,
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
import {
  E_ANEXO_IMAGEM,
  podeVisualizarAnexo,
  extrairAnexos,
} from '@/components/documentos/documentos-anexos-utils'

// Re-exporta para compatibilidade com outros arquivos que possam importar daqui
export { E_ANEXO_IMAGEM, podeVisualizarAnexo }

interface DocumentoDetalheAnexosProps {
  colecaoNome: string
  recordId: string
  anexos: string[] | any
  onVisualizarArquivo: (nomeArquivo: string) => void
  onAnexosAlterados?: (novaLista: string[]) => void
}

export function DocumentoDetalheAnexos({
  colecaoNome,
  recordId,
  anexos,
  onVisualizarArquivo,
  onAnexosAlterados,
}: DocumentoDetalheAnexosProps) {
  const [removendo, setRemovendo] = React.useState<string | null>(null)
  const [arquivoParaRemover, setArquivoParaRemover] = React.useState<string | null>(null)
  const [fazendoUpload, setFazendoUpload] = React.useState(false)
  const [listaLocal, setListaLocal] = React.useState<string[]>(() => extrairAnexos(anexos))
  const inputUploadRef = React.useRef<HTMLInputElement>(null)

  // Mantém sincronizada com a prop externa quando esta mudar
  React.useEffect(() => {
    setListaLocal(extrairAnexos(anexos))
  }, [anexos])

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
      // No PocketBase para remover arquivo específico de FileField:
      // Pode ser enviado via FormData com o modificador 'anexo-'
      let recAtualizado: any
      try {
        const formData = new FormData()
        formData.append('anexo-', nome)
        recAtualizado = await pb.collection(colecaoNome).update(recordId, formData)
      } catch (errFormData) {
        console.warn('Remoção via FormData falhou, tentando payload objeto:', errFormData)
        recAtualizado = await pb.collection(colecaoNome).update(recordId, {
          'anexo-': [nome],
        } as any)
      }

      // Re-lê o registro para ter a lista exata gravada no banco
      const recFinal = await pb.collection(colecaoNome).getOne(recordId)
      const novaLista = extrairAnexos(recFinal?.anexo ?? recAtualizado?.anexo)

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
      // PocketBase FileField com maxSelect > 1:
      // Para acrescentar arquivos aos já existentes sem sobrescrever,
      // utiliza-se a chave 'anexo+' no FormData.
      const formData = new FormData()
      for (const f of files) {
        formData.append('anexo+', f)
      }

      let recAtualizado: any
      try {
        recAtualizado = await pb.collection(colecaoNome).update(recordId, formData)
      } catch (errAppend) {
        console.warn('Tentativa com anexo+ falhou, tentando fallback com anexo simples:', errAppend)
        const fdFallback = new FormData()
        for (const f of files) {
          fdFallback.append('anexo', f)
        }
        recAtualizado = await pb.collection(colecaoNome).update(recordId, fdFallback)
      }

      // Re-busca o registro atualizado no PocketBase para assegurar persistência no servidor
      const recFinal = await pb.collection(colecaoNome).getOne(recordId)
      const novaLista = extrairAnexos(recFinal?.anexo ?? recAtualizado?.anexo)

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
            accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt"
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
            const ehImagem = E_ANEXO_IMAGEM.test(nome)
            return (
              <div
                key={`${nome}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (visualizavel) {
                    onVisualizarArquivo(nome)
                  } else {
                    handleDownload(nome)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (visualizavel) {
                      onVisualizarArquivo(nome)
                    } else {
                      handleDownload(nome)
                    }
                  }
                }}
                className="group flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-gray-200 text-xs shadow-2xs hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                title={
                  visualizavel ? `Clique para visualizar: ${nome}` : `Clique para baixar: ${nome}`
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  {ehImagem ? (
                    <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0 group-hover:scale-110 transition-transform" />
                  ) : (
                    <FileText className="h-4 w-4 text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
                  )}
                  <span className="font-medium text-gray-800 truncate group-hover:text-blue-900 transition-colors">
                    {nome}
                  </span>
                  {visualizavel && (
                    <span className="text-[10px] text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                      (clique para ver)
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {visualizavel && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onVisualizarArquivo(nome)
                      }}
                      className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-100/70 gap-1"
                      title="Visualizar anexo"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Visualizar</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownload(nome)
                    }}
                    className="h-7 px-2 text-xs text-gray-700 hover:bg-gray-100 gap-1"
                    title="Baixar arquivo"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Baixar</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setArquivoParaRemover(nome)
                    }}
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

      {/* Modal de confirmação de exclusão de anexo */}
      <AlertDialog
        open={!!arquivoParaRemover}
        onOpenChange={(aberto) => {
          if (!aberto && !removendo) setArquivoParaRemover(null)
        }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-gray-900">
              Remover este anexo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">
              O arquivo <strong>{arquivoParaRemover}</strong> será permanentemente desvinculado
              deste documento. Os demais anexos continuarão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!removendo} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmarRemocao()
              }}
              disabled={!!removendo}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {removendo ? 'Removendo...' : 'Sim, remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default DocumentoDetalheAnexos
