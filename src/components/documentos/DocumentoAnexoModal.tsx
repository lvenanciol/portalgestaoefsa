import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import {
  Paperclip,
  Upload,
  Download,
  Eye,
  Trash2,
  FileText,
  Loader2,
  ExternalLink,
  ImageIcon,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { PdfViewer } from './PdfViewer'

export const E_ANEXO_IMAGEM_MODAL = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
export const podeVisualizarAnexoModal = (nome: string): boolean =>
  /\.(pdf|png|jpe?g|webp|gif|bmp|svg)$/i.test(nome || '')

interface DocumentoAnexoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  collectionName: 'alvaras' | 'contratos' | 'atas' | 'processos_juridicos' | 'documentos'
  recordId: string
  tituloDocumento?: string
  anexoAtual?: string | string[] | null
  onAnexoAtualizado: (listaAnexos: string[] | null) => void
}

export function DocumentoAnexoModal({
  aberto,
  onOpenChange,
  collectionName,
  recordId,
  tituloDocumento,
  anexoAtual,
  onAnexoAtualizado,
}: DocumentoAnexoModalProps) {
  const [listaArquivos, setListaArquivos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [arquivoParaRemover, setArquivoParaRemover] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [visualizandoArquivo, setVisualizandoArquivo] = useState<string | null>(null)
  const [urlVisualizacao, setUrlVisualizacao] = useState<string | null>(null)
  const [carregandoVisualizacao, setCarregandoVisualizacao] = useState(false)

  const extrairNomes = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(String).filter(Boolean)
    if (typeof val === 'string' && val.trim()) return [val.trim()]
    return []
  }

  // Carrega lista atualizada de anexos do registro sempre que o modal abre ou anexoAtual muda
  useEffect(() => {
    if (!aberto || !recordId) return

    let cancelado = false
    const carregarRegistro = async () => {
      try {
        const rec = await pb.collection(collectionName).getOne(recordId)
        if (!cancelado) {
          setListaArquivos(extrairNomes(rec.anexo))
        }
      } catch (e) {
        console.warn('Erro ao carregar anexos do registro:', e)
        if (!cancelado && anexoAtual) {
          setListaArquivos(extrairNomes(anexoAtual))
        }
      }
    }

    carregarRegistro()
    return () => {
      cancelado = true
    }
  }, [aberto, recordId, collectionName, anexoAtual])

  // Limpa Blob URL ao fechar
  useEffect(() => {
    return () => {
      if (urlVisualizacao && urlVisualizacao.startsWith('blob:')) {
        URL.revokeObjectURL(urlVisualizacao)
      }
    }
  }, [urlVisualizacao])

  // Salvar novos anexos
  const handleUploadMultiplo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSalvando(true)
    setErro(null)

    try {
      const formData = new FormData()
      for (const f of files) {
        formData.append('anexo+', f)
      }

      let rec: any
      try {
        rec = await pb.collection(collectionName).update(recordId, formData)
      } catch (errAppend) {
        console.warn('Tentativa anexo+ falhou, tentando fallback com anexo simples:', errAppend)
        const fdFallback = new FormData()
        for (const f of files) {
          fdFallback.append('anexo', f)
        }
        rec = await pb.collection(collectionName).update(recordId, fdFallback)
      }

      const recFinal = await pb.collection(collectionName).getOne(recordId)
      const novaLista = extrairNomes(recFinal?.anexo ?? rec?.anexo)

      setListaArquivos(novaLista)
      onAnexoAtualizado(novaLista)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao anexar arquivo(s).')
    } finally {
      setSalvando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Remover anexo específico do array de arquivos
  const handleRemoverAnexoIndividual = async () => {
    if (!arquivoParaRemover) return
    const nome = arquivoParaRemover
    setRemovendo(nome)
    setErro(null)

    try {
      try {
        const formData = new FormData()
        formData.append('anexo-', nome)
        await pb.collection(collectionName).update(recordId, formData)
      } catch (errFormData) {
        console.warn('Remoção via FormData falhou, tentando anexo- objeto:', errFormData)
        await pb.collection(collectionName).update(recordId, {
          'anexo-': [nome],
        } as any)
      }

      const recFinal = await pb.collection(collectionName).getOne(recordId)
      const novaLista = extrairNomes(recFinal?.anexo)

      setListaArquivos(novaLista)
      onAnexoAtualizado(novaLista)
      setArquivoParaRemover(null)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao remover o anexo.')
    } finally {
      setRemovendo(null)
    }
  }

  // Visualizar arquivo
  const handleVisualizarArquivo = async (nomeArquivo: string) => {
    setVisualizandoArquivo(nomeArquivo)
    setCarregandoVisualizacao(true)
    try {
      const urlArquivo = pb.files.getUrl({ collectionName, id: recordId } as any, nomeArquivo)
      setUrlVisualizacao(urlArquivo)
    } catch (e: any) {
      setErro('Falha ao abrir visualizador: ' + (e?.message || ''))
    } finally {
      setCarregandoVisualizacao(false)
    }
  }

  // Download do arquivo
  const handleDownload = (nomeArquivo: string) => {
    try {
      const url = pb.files.getUrl({ collectionName, id: recordId } as any, nomeArquivo, {
        download: true,
      })
      window.open(url, '_blank')
    } catch (e) {
      console.error('Erro ao gerar download:', e)
    }
  }

  const ehImagemModal = visualizandoArquivo ? E_ANEXO_IMAGEM_MODAL.test(visualizandoArquivo) : false

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
          <DialogHeader className="border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                <Paperclip className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-gray-900">
                  Arquivos Anexos do Documento
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500">
                  {tituloDocumento || 'Documento selecionado'} • Coleção{' '}
                  <span className="font-mono">{collectionName}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {erro && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {erro}
            </div>
          )}

          {/* LISTA DE ANEXOS ATUAIS */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Anexos Vinculados ({listaArquivos.length})
              </span>
              <span className="text-[11px] text-gray-400">PDF, DOCX, XLSX, PNG, JPG</span>
            </div>

            {listaArquivos.length === 0 ? (
              <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-2 bg-gray-50/50">
                <Paperclip className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-500">Nenhum arquivo anexado a este documento.</p>
                <p className="text-[11px] text-gray-400">
                  Clique no botão abaixo para adicionar um ou mais anexos.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {listaArquivos.map((nome, idx) => {
                  const visualizavel = podeVisualizarAnexoModal(nome)
                  const ehImagem = E_ANEXO_IMAGEM_MODAL.test(nome)
                  return (
                    <div
                      key={`${nome}-${idx}`}
                      className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-white border border-gray-200 text-blue-600 shrink-0">
                          {ehImagem ? (
                            <ImageIcon className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate" title={nome}>
                            {nome}
                          </p>
                          <p className="text-[10px] text-gray-400">Anexo #{idx + 1}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {visualizavel && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVisualizarArquivo(nome)}
                            className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-100/60 gap-1"
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
                          className="h-7 px-2 text-xs text-gray-700 hover:bg-gray-200/60 gap-1"
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
                          className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-100/60 gap-1"
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

            {/* ÁREA DE UPLOAD */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt"
                className="hidden"
                onChange={handleUploadMultiplo}
                disabled={salvando}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={salvando}
                className="h-8 text-xs bg-white text-blue-700 border-blue-300 hover:bg-blue-50 gap-1.5"
              >
                {salvando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>Adicionar Anexo(s)</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 text-xs"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Embutido de Visualização */}
      <Dialog
        open={!!visualizandoArquivo}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setVisualizandoArquivo(null)
            setUrlVisualizacao(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl p-4 border border-gray-200 flex flex-col">
          <DialogHeader className="border-b border-gray-100 pb-2">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-sm font-bold text-gray-900 truncate">
                Visualizando: {visualizandoArquivo}
              </DialogTitle>
              {urlVisualizacao && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(urlVisualizacao, '_blank')}
                  className="h-7 text-xs text-blue-700 border-blue-200 gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Abrir em Nova Aba</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          <ModalPreviaConteudo
            carregando={carregandoVisualizacao}
            url={urlVisualizacao}
            nomeArquivo={visualizandoArquivo}
            ehImagem={ehImagemModal}
          />
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão individual */}
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
              deste documento. Os demais anexos serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!removendo} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRemoverAnexoIndividual()
              }}
              disabled={!!removendo}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {removendo ? 'Removendo...' : 'Sim, remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ModalPreviaConteudo({
  carregando,
  url,
  nomeArquivo,
  ehImagem,
}: {
  carregando: boolean
  url: string | null
  nomeArquivo: string | null
  ehImagem: boolean
}) {
  return (
    <div className="flex-1 min-h-[500px] overflow-hidden pt-2 flex flex-col">
      {carregando ? (
        <div className="h-full flex items-center justify-center py-20 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-xs">Carregando visualizador de documento...</span>
        </div>
      ) : url ? (
        ehImagem ? (
          <div className="h-full min-h-[500px] flex items-center justify-center bg-gray-50 rounded-xl p-4 overflow-auto border border-gray-200">
            <img
              src={url}
              alt={nomeArquivo || 'Imagem anexa'}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-sm"
            />
          </div>
        ) : (
          <PdfViewer url={url} fileName={nomeArquivo || 'documento.pdf'} />
        )
      ) : (
        <div className="text-center py-20 text-xs text-gray-500">
          Não foi possível carregar a prévia deste arquivo.
        </div>
      )}
    </div>
  )
}

export default DocumentoAnexoModal
