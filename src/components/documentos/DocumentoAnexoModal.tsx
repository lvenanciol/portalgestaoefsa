import { useState, useRef } from 'react'
import { FileText, Upload, Download, Eye, Loader2, Trash2, Paperclip } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'

interface DocumentoAnexoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  collectionName: 'alvaras' | 'contratos' | 'atas' | 'processos_juridicos' | 'documentos'
  recordId: string
  tituloDocumento: string
  anexoAtual?: string | null
  onAnexoAtualizado: (novoNomeAnexo: string | null) => void
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
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [visualizadorUrl, setVisualizadorUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const temAnexo = !!anexoAtual && String(anexoAtual).trim() !== ''

  const urlArquivo = temAnexo
    ? `${pb.baseUrl}/api/files/${collectionName}/${recordId}/${anexoAtual}`
    : ''

  const isPdf = temAnexo && anexoAtual.toLowerCase().endsWith('.pdf')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSalvando(true)
    setErro(null)

    try {
      const formData = new FormData()
      formData.append('anexo', file)

      const rec = await pb.collection(collectionName).update(recordId, formData)
      onAnexoAtualizado(rec.anexo || null)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao anexar arquivo.')
    } finally {
      setSalvando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoverAnexo = async () => {
    if (!confirm('Deseja realmente remover o anexo deste documento?')) return
    setSalvando(true)
    setErro(null)

    try {
      await pb.collection(collectionName).update(recordId, { anexo: null })
      onAnexoAtualizado(null)
      setVisualizadorUrl(null)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao remover arquivo.')
    } finally {
      setSalvando(false)
    }
  }

  const handleVisualizar = () => {
    if (!urlArquivo) return
    if (isPdf) {
      setVisualizadorUrl(urlArquivo)
    } else {
      // Abre em nova aba do navegador para docx, xlsx, imagens ou downloads diretos
      window.open(urlArquivo, '_blank', 'noopener,noreferrer')
    }
  }

  const handleBaixar = () => {
    if (!urlArquivo) return
    const a = document.createElement('a')
    a.href = urlArquivo
    a.download = anexoAtual || 'anexo'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="bg-white max-w-md p-6 rounded-2xl shadow-xl border border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
              <Paperclip className="h-4 w-4 text-[#1B5E20]" />
              Anexo do Documento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="text-xs text-gray-500">
              Documento:{' '}
              <strong className="text-gray-800 block text-[13px] mt-0.5 truncate">
                {tituloDocumento}
              </strong>
            </div>

            {erro && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {erro}
              </div>
            )}

            {temAnexo ? (
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-xs font-semibold text-gray-800 truncate"
                      title={anexoAtual}
                    >
                      {anexoAtual}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {isPdf ? 'Documento PDF' : 'Arquivo anexado'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-gray-200/80">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleVisualizar}
                    className="flex-1 h-8 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    Visualizar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleBaixar}
                    className="flex-1 h-8 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                    Baixar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRemoverAnexo}
                    disabled={salvando}
                    className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Excluir anexo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-2 bg-gray-50/50">
                <FileText className="h-8 w-8 text-gray-400 mx-auto" />
                <div className="text-xs text-gray-600">Nenhum anexo vinculado a este registro.</div>
                <div className="text-[11px] text-gray-400">
                  Formatos aceitos: PDF, DOCX, XLSX, PNG, JPG (até 50MB)
                </div>
              </div>
            )}

            {/* Input de arquivo */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
                onChange={handleUpload}
                className="hidden"
                id="doc-anexo-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={salvando}
                className="w-full h-9 text-xs border-dashed border-emerald-600 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/30"
              >
                {salvando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-2" />
                )}
                {temAnexo ? 'Substituir anexo (PDF / DOCX)' : 'Anexar novo arquivo (PDF / DOCX)'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualizador embutido para PDF */}
      {visualizadorUrl && (
        <Dialog open={!!visualizadorUrl} onOpenChange={(o) => !o && setVisualizadorUrl(null)}>
          <DialogContent className="bg-white max-w-4xl w-[95vw] h-[88vh] p-4 flex flex-col rounded-2xl shadow-2xl border border-gray-200">
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-gray-100">
              <DialogTitle className="text-sm font-bold text-gray-800 truncate">
                Visualização: {anexoAtual}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleBaixar} className="h-7 text-xs">
                  <Download className="h-3 w-3 mr-1" /> Baixar
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 w-full h-full min-h-0 bg-gray-100 rounded-lg overflow-hidden mt-2">
              <iframe
                src={visualizadorUrl}
                title={anexoAtual || 'Visualizador'}
                className="w-full h-full border-0"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
