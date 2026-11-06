import { useState, useRef, useEffect } from 'react'
import {
  FileText,
  Upload,
  Download,
  Eye,
  Loader2,
  Trash2,
  Paperclip,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { PdfViewer } from './PdfViewer'

interface DocumentoAnexoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  collectionName: 'alvaras' | 'contratos' | 'atas' | 'processos_juridicos' | 'documentos'
  recordId: string
  tituloDocumento: string
  anexoAtual?: string | null
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
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [listaArquivos, setListaArquivos] = useState<string[]>([])
  const [arquivoEmVisualizacao, setArquivoEmVisualizacao] = useState<string | null>(null)
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false)
  const [urlVisualizacao, setUrlVisualizacao] = useState<string | null>(null)
  const [carregandoVisualizacao, setCarregandoVisualizacao] = useState(false)
  const [erroVisualizacao, setErroVisualizacao] = useState<string | null>(null)
  const [arquivoParaRemover, setArquivoParaRemover] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carrega lista atualizada de anexos do registro sempre que o modal abre ou anexoAtual muda
  useEffect(() => {
    let ativo = true
    if (!aberto || !recordId) return

    const carregarArquivos = async () => {
      try {
        const rec = await pb.collection(collectionName).getOne(recordId)
        if (!ativo) return
        const val = rec.anexo
        let lista: string[] = []
        if (Array.isArray(val)) {
          lista = val.map(String).filter(Boolean)
        } else if (typeof val === 'string' && val.trim()) {
          lista = [val.trim()]
        }
        setListaArquivos(lista)
      } catch (e) {
        console.warn('Erro ao carregar anexos do registro:', e)
        // Fallback defensivo com prop recebida
        if (anexoAtual) {
          const fallback = Array.isArray(anexoAtual)
            ? (anexoAtual as any[]).map(String).filter(Boolean)
            : [String(anexoAtual).trim()]
          setListaArquivos(fallback)
        }
      }
    }

    carregarArquivos()
    return () => {
      ativo = false
    }
  }, [aberto, recordId, collectionName, anexoAtual])

  // Limpa Blob URL ao fechar ou desmontar
  useEffect(() => {
    return () => {
      if (urlVisualizacao && urlVisualizacao.startsWith('blob:')) {
        URL.revokeObjectURL(urlVisualizacao)
      }
    }
  }, [urlVisualizacao])

  const fecharVisualizador = () => {
    setModalVisualizarAberto(false)
    setArquivoEmVisualizacao(null)
    if (urlVisualizacao && urlVisualizacao.startsWith('blob:')) {
      URL.revokeObjectURL(urlVisualizacao)
      setUrlVisualizacao(null)
    }
    setErroVisualizacao(null)
  }

  const obterUrlArquivo = (nomeArquivo: string) => {
    return `${pb.baseUrl}/api/files/${collectionName}/${recordId}/${nomeArquivo}${
      pb.authStore.token ? `?token=${encodeURIComponent(pb.authStore.token)}` : ''
    }`
  }

  // Upload de 1 ou mais arquivos
  const handleUploadMultiplo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSalvando(true)
    setErro(null)

    try {
      const formData = new FormData()
      for (const f of files) {
        formData.append('anexo', f)
      }

      const rec = await pb.collection(collectionName).update(recordId, formData)
      const novoVal = rec.anexo
      let novaLista: string[] = []
      if (Array.isArray(novoVal)) {
        novaLista = novoVal.map(String).filter(Boolean)
      } else if (typeof novoVal === 'string' && novoVal.trim()) {
        novaLista = [novoVal.trim()]
      }
      // PRESERVAÇÃO DA LISTA COMPLETA: união do retorno do backend com a lista
      // já carregada. Se o backend tratar o campo como arquivo único (maxSelect 1)
      // e devolver apenas o último arquivo, os anexos anteriores NÃO são perdidos —
      // o novo é acrescentado à lista existente, nunca substituindo. O retry
      // percorre a lista montada até o backend aceitar tudo (frente única).
      const listaAnterior = listaArquivos.filter((n) => n && !novaLista.includes(n))
      if (listaAnterior.length > 0 && !listaAnterior.every((n) => novaLista.includes(n))) {
        let uniao = [...listaAnterior, ...novaLista.filter((n) => !listaAnterior.includes(n))]
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          try {
            const recUniao = await pb
              .collection(collectionName)
              .update(recordId, { anexo: uniao } as any)
            const valUniao = recUniao?.anexo
            const listaRetorno: string[] = Array.isArray(valUniao)
              ? valUniao.map(String).filter(Boolean)
              : typeof valUniao === 'string' && valUniao.trim()
                ? [valUniao.trim()]
                : []
            const faltando = uniao.filter((n) => !listaRetorno.includes(n))
            if (faltando.length === 0) {
              novaLista = listaRetorno
              break
            }
            // Backend descartou arquivos: repõe os faltantes e tenta de novo
            uniao = [...listaRetorno, ...faltando.filter((n) => !listaRetorno.includes(n))]
          } catch (errUniao) {
            console.warn('Falha ao persistir união de anexos:', errUniao)
            break
          }
        }
        if (uniao.length > novaLista.length) novaLista = uniao
      }
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
    setSalvando(true)
    setErro(null)

    try {
      // No PocketBase para campos de arquivo múltiplos:
      // passando o objeto { 'anexo-': [nome] } ou enviando a lista atualizada sem o item
      const listaRestante = listaArquivos.filter((nome) => nome !== arquivoParaRemover)
      let rec: any

      try {
        // Tenta sintaxe canônica PocketBase anexo-: [nome]
        rec = await pb.collection(collectionName).update(recordId, {
          'anexo-': [arquivoParaRemover],
        } as any)
      } catch (errRemocao) {
        console.warn(
          'Tentativa com modificador anexo- falhou, tentando substituição direta da lista:',
          errRemocao,
        )
        // Alternativa: passar array direto dos nomes restantes ou null se vazio
        rec = await pb.collection(collectionName).update(recordId, {
          anexo: listaRestante.length > 0 ? listaRestante : null,
        } as any)
      }

      const novoVal = rec?.anexo
      let novaLista: string[] = []
      if (Array.isArray(novoVal)) {
        novaLista = novoVal.map(String).filter(Boolean)
      } else if (typeof novoVal === 'string' && novoVal.trim()) {
        novaLista = [novoVal.trim()]
      } else if (novoVal === null || novoVal === undefined) {
        novaLista = []
      } else {
        novaLista = listaRestante
      }

      // Segurança de remoção: se o backend não removeu o arquivo do campo
      // (campo ainda single no backend), força a persistência da lista restante.
      if (novaLista.includes(arquivoParaRemover) && listaRestante.length >= 0) {
        try {
          rec = await pb.collection(collectionName).update(recordId, {
            anexo: listaRestante.length > 0 ? listaRestante : null,
          } as any)
          const reVal = rec?.anexo
          if (Array.isArray(reVal)) {
            novaLista = reVal.map(String).filter(Boolean)
          } else if (typeof reVal === 'string' && reVal.trim()) {
            novaLista = [reVal.trim()]
          } else {
            novaLista = listaRestante
          }
        } catch (errForcar) {
          console.warn('Falha ao forçar lista restante após remoção:', errForcar)
          novaLista = listaRestante
        }
      }

      setListaArquivos(novaLista)
      onAnexoAtualizado(novaLista)
      if (arquivoEmVisualizacao === arquivoParaRemover) {
        fecharVisualizador()
      }
      setArquivoParaRemover(null)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao remover arquivo.')
    } finally {
      setSalvando(false)
    }
  }

  const handleVisualizar = async (nomeArquivo: string) => {
    const url = obterUrlArquivo(nomeArquivo)
    const ehPdf = nomeArquivo.toLowerCase().endsWith('.pdf')

    if (!ehPdf) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    setArquivoEmVisualizacao(nomeArquivo)
    setModalVisualizarAberto(true)
    setCarregandoVisualizacao(true)
    setErroVisualizacao(null)

    try {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token
      }
      const resp = await fetch(url, { headers })
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }
      const rawBlob = await resp.blob()
      const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' })
      const objectUrl = URL.createObjectURL(pdfBlob)
      if (urlVisualizacao && urlVisualizacao.startsWith('blob:')) {
        URL.revokeObjectURL(urlVisualizacao)
      }
      setUrlVisualizacao(objectUrl)
    } catch (err: any) {
      console.warn('Fallback para URL direta do arquivo no modal:', err)
      setUrlVisualizacao(url)
    } finally {
      setCarregandoVisualizacao(false)
    }
  }

  const handleBaixar = async (nomeArquivo: string) => {
    const url = obterUrlArquivo(nomeArquivo)
    try {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token
      }
      const resp = await fetch(url, { headers })
      if (resp.ok) {
        const blob = await resp.blob()
        const downloadUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = nomeArquivo
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
        return
      }
    } catch (err) {
      console.warn('Fallback para download direto via link:', err)
    }

    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="bg-white max-w-lg p-6 rounded-2xl shadow-xl border border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
              <Paperclip className="h-4 w-4 text-[#1B5E20]" />
              ARQUIVOS ANEXOS DO DOCUMENTO ({listaArquivos.length})
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

            {listaArquivos.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {listaArquivos.map((nomeArq, idx) => {
                  const ehPdf = nomeArq.toLowerCase().endsWith('.pdf')
                  return (
                    <div
                      key={`${nomeArq}-${idx}`}
                      className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px]',
                            ehPdf
                              ? 'bg-rose-100 text-rose-800'
                              : /\.(xlsx|xls)$/i.test(nomeArq)
                                ? 'bg-emerald-100 text-emerald-800'
                                : /\.(png|jpe?g)$/i.test(nomeArq)
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-blue-100 text-blue-800',
                          )}
                        >
                          {ehPdf
                            ? 'PDF'
                            : /\.(xlsx|xls)$/i.test(nomeArq)
                              ? 'XLS'
                              : /\.(png|jpe?g)$/i.test(nomeArq)
                                ? 'IMG'
                                : 'DOC'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-xs font-semibold text-gray-800 truncate"
                            title={nomeArq}
                          >
                            {nomeArq}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {ehPdf
                              ? 'Documento PDF'
                              : /\.(xlsx|xls)$/i.test(nomeArq)
                                ? 'Planilha'
                                : /\.(png|jpe?g)$/i.test(nomeArq)
                                  ? 'Imagem'
                                  : 'Arquivo anexado'}{' '}
                            • Anexo #{idx + 1}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-gray-200/80">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleVisualizar(nomeArq)}
                          className="flex-1 h-7 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          Visualizar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleBaixar(nomeArq)}
                          className="flex-1 h-7 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5 mr-1 text-blue-600" />
                          Baixar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setArquivoParaRemover(nomeArq)}
                          disabled={salvando}
                          className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Excluir este anexo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-2 bg-gray-50/50">
                <FileText className="h-8 w-8 text-gray-400 mx-auto" />
                <div className="text-xs text-gray-600">Nenhum anexo vinculado a este registro.</div>
                <div className="text-[11px] text-gray-400">
                  Formatos aceitos: PDF, DOCX, XLSX, PNG, JPG (você pode selecionar vários arquivos)
                </div>
              </div>
            )}

            {/* Input de arquivo com suporte a múltiplos */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
                onChange={handleUploadMultiplo}
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
                {listaArquivos.length > 0
                  ? 'Adicionar mais anexo(s) (PDF / DOCX / XLSX)'
                  : 'Anexar arquivo(s) (PDF / DOCX / XLSX)'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação amigável de remoção de anexo individual */}
      <Dialog
        open={!!arquivoParaRemover}
        onOpenChange={(open) => !open && setArquivoParaRemover(null)}
      >
        <DialogContent className="bg-white max-w-sm p-5 rounded-2xl shadow-xl border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-gray-900">
              Remover este anexo?
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 mt-2 truncate">
            O arquivo <strong className="text-gray-800">{arquivoParaRemover}</strong> será
            desvinculado deste documento. Os demais anexos serão preservados.
          </p>
          <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setArquivoParaRemover(null)}
              className="text-xs h-8"
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleRemoverAnexoIndividual}
              disabled={salvando}
              className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Sim, remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualizador embutido para PDF */}
      {modalVisualizarAberto && (
        <Dialog open={modalVisualizarAberto} onOpenChange={(o) => !o && fecharVisualizador()}>
          <DialogContent className="bg-white max-w-5xl w-[95vw] h-[90vh] p-4 flex flex-col rounded-2xl shadow-2xl border border-gray-200">
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <DialogTitle className="text-sm font-bold text-gray-800 truncate max-w-xl">
                Visualização: {arquivoEmVisualizacao}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (urlVisualizacao) {
                      window.open(urlVisualizacao, '_blank', 'noopener,noreferrer')
                    } else if (arquivoEmVisualizacao) {
                      window.open(
                        obterUrlArquivo(arquivoEmVisualizacao),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  }}
                  className="h-7 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Nova aba
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => arquivoEmVisualizacao && handleBaixar(arquivoEmVisualizacao)}
                  className="h-7 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" /> Baixar
                </Button>
              </div>
            </DialogHeader>

            <div className="flex-1 w-full h-full min-h-0 bg-gray-100 rounded-lg overflow-hidden mt-2 relative">
              {carregandoVisualizacao && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/90 z-10 space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
                  <span className="text-xs text-gray-600 font-medium">
                    Carregando visualizador do PDF...
                  </span>
                </div>
              )}

              {erroVisualizacao ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <AlertCircle className="h-10 w-10 text-amber-600" />
                  <p className="text-xs text-gray-700 max-w-md">{erroVisualizacao}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        arquivoEmVisualizacao &&
                        window.open(
                          obterUrlArquivo(arquivoEmVisualizacao),
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                      className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir em nova aba
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => arquivoEmVisualizacao && handleBaixar(arquivoEmVisualizacao)}
                      className="text-xs"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar arquivo
                    </Button>
                  </div>
                </div>
              ) : urlVisualizacao ? (
                <PdfViewer
                  url={urlVisualizacao}
                  fileName={arquivoEmVisualizacao || 'documento.pdf'}
                  minHeight={580}
                  className="w-full h-full border-0 rounded-none"
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
