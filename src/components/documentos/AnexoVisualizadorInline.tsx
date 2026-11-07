/**
 * AnexoVisualizadorInline — exibe anexos do documento NA PRÓPRIA tela de detalhe.
 *
 * Substitui a navegação para a "tela detalhe antiga": PDF abre no viewer
 * integrado (PdfViewer) e imagem inline em um diálogo amplo. Também permite
 * anexar novos arquivos (upload direto) e baixar.
 *
 * Leitura SEMPRE pelo extrator extrairAnexos de documentos-anexos-utils.ts
 * (o campo 'anexo' no PocketBase tem formatos mistos: array, JSON
 * stringificado, string única).
 */

import React, { useMemo, useState } from 'react'
import { Download, FileText, FilePlus2, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PdfViewer } from '@/components/documentos/PdfViewer'
import {
  E_ANEXO_IMAGEM,
  ehImagemAnexo,
  extrairAnexos,
} from '@/components/documentos/documentos-anexos-utils'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'

interface AnexoVisualizadorInlineProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  /** Registro do documento (com .id, .anexo, .collectionId ou .collectionName) — opcional se passado colecao/registroId */
  documento?: any
  /** Nome do arquivo específico para abrir/visualizar diretamente */
  nomeArquivo?: string | null
  /** Nome da coleção PocketBase (quando não passado pelo documento) */
  colecao?: string
  /** ID do registro (quando não passado pelo documento) */
  registroId?: string
  /** Nome do campo de arquivo no PocketBase (default 'anexo') */
  campoAnexo?: string
  /** Chamado após novo upload bem-sucedido */
  onAtualizado?: (registro: any) => void
  /** Título do diálogo (nome do documento) */
  titulo?: string
  /** Alias aceito para titulo */
  tituloDoc?: string
}

export function AnexoVisualizadorInline({
  aberto,
  onOpenChange,
  documento,
  nomeArquivo,
  colecao,
  registroId,
  campoAnexo = 'anexo',
  onAtualizado,
  titulo,
  tituloDoc,
}: AnexoVisualizadorInlineProps) {
  const docEfetivo = useMemo(() => {
    if (documento) return documento
    if (registroId) {
      return {
        id: registroId,
        collectionName: colecao,
        collectionId: colecao,
        anexo: nomeArquivo ? [nomeArquivo] : [],
      }
    }
    return null
  }, [documento, registroId, colecao, nomeArquivo])

  const [enviando, setEnviando] = useState(false)
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const [selecionando, setSelecionando] = useState(false)

  const anexos = useMemo(() => {
    if (nomeArquivo) {
      const extraidos = docEfetivo ? extrairAnexos(docEfetivo[campoAnexo]) : []
      if (!extraidos.includes(nomeArquivo)) {
        return [nomeArquivo, ...extraidos]
      }
      return extraidos
    }
    if (!docEfetivo) return []
    return extrairAnexos(docEfetivo[campoAnexo])
  }, [docEfetivo, campoAnexo, nomeArquivo])

  // Ajusta o índice ativo quando o nomeArquivo mudar
  React.useEffect(() => {
    if (nomeArquivo && anexos.length > 0) {
      const idx = anexos.indexOf(nomeArquivo)
      if (idx >= 0) setIndiceAtivo(idx)
    }
  }, [nomeArquivo, anexos])

  const baseFileUrl = useMemo(() => {
    const col = colecao || docEfetivo?.collectionId || docEfetivo?.collectionName || ''
    const rid = registroId || docEfetivo?.id || ''
    if (!col || !rid) return ''
    return `${pb.baseUrl}/api/files/${col}/${rid}`
  }, [colecao, registroId, docEfetivo])

  const anexoAtivo = anexos[indiceAtivo] || null
  const urlAtiva = anexoAtivo ? `${baseFileUrl}/${anexoAtivo}` : ''
  const ehImagem = anexoAtivo ? ehImagemAnexo(anexoAtivo) : false

  const baixar = (nomeArquivo: string) => {
    if (!baseFileUrl) return
    const link = document.createElement('a')
    link.href = `${baseFileUrl}/${nomeArquivo}`
    link.download = nomeArquivo
    link.target = '_blank'
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const anexarArquivos = async (arquivos: FileList | null) => {
    const alvo = docEfetivo
    if (!arquivos || arquivos.length === 0 || !alvo?.id) return
    setEnviando(true)
    try {
      const col = colecao || alvo.collectionName || alvo.collectionId || 'documentos'
      const atuais = extrairAnexos(alvo[campoAnexo])
      const form = new FormData()
      Array.from(arquivos).forEach((f) => form.append(campoAnexo, f, f.name))
      const atualizado = await pb.collection(col).update(alvo.id, form)
      // PocketBase substitui o campo quando não reenviamos os antigos — garantimos
      // manter os existentes reenviando os nomes junto dos novos arquivos.
      if (atuais.length > 0) {
        const formComplet = new FormData()
        atuais.forEach((nome) => {
          formComplet.append(campoAnexo, new Blob(), nome)
        })
        Array.from(arquivos).forEach((f) => formComplet.append(campoAnexo, f, f.name))
        try {
          const final = await pb.collection(col).update(alvo.id, formComplet)
          onAtualizado?.(final)
        } catch {
          onAtualizado?.(atualizado)
        }
      } else {
        onAtualizado?.(atualizado)
      }
      toastOk('Arquivo anexado')
      setSelecionando(false)
    } catch (err: any) {
      toastErro(err?.message || 'Não foi possível anexar o arquivo.')
    } finally {
      setEnviando(false)
      if (typeof document !== 'undefined') {
        const inp = document.getElementById('input-anexo-inline') as HTMLInputElement | null
        if (inp) inp.value = ''
      }
    }
  }

  if (!docEfetivo) return null

  const tituloExibido = titulo || tituloDoc || 'Anexos do documento'

  return (
    <Dialog open={aberto} onOpenChange={(v) => onOpenChange(v)}>
      <DialogContent className="bg-white max-w-5xl w-full rounded-2xl border border-gray-200 shadow-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold text-gray-900 truncate">
                {tituloExibido}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-gray-500">
                {anexos.length > 0
                  ? `${anexos.length} arquivo(s) anexado(s) — visualização direta na tela`
                  : 'Nenhum arquivo anexado ainda'}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex flex-col md:flex-row max-h-[75vh]">
          {/* Lista lateral de anexos */}
          <div className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 p-3 space-y-1.5 overflow-y-auto">
            {anexos.map((nome, i) => (
              <button
                key={`${nome}-${i}`}
                type="button"
                onClick={() => setIndiceAtivo(i)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-left text-xs transition-colors ${
                  i === indiceAtivo
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="truncate flex-1">{nome}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    baixar(nome)
                  }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                  title="Baixar"
                >
                  <Download className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}

            {/* Anexar novo arquivo */}
            <label
              htmlFor="input-anexo-inline"
              className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer border border-dashed border-emerald-300 mt-2"
            >
              {enviando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FilePlus2 className="h-3.5 w-3.5" />
              )}
              {enviando ? 'Enviando…' : 'Anexar arquivo'}
              <input
                id="input-anexo-inline"
                type="file"
                multiple
                className="hidden"
                disabled={enviando}
                onChange={(e) => anexarArquivos(e.target.files)}
              />
            </label>
          </div>

          {/* Área de visualização */}
          <div className="flex-1 min-w-0 bg-gray-50 flex items-center justify-center p-2">
            {anexos.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-16">
                <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                Nenhum anexo para visualizar.
                <div className="mt-1 text-[11px]">
                  Use "Anexar arquivo" para enviar o documento.
                </div>
              </div>
            ) : ehImagem ? (
              <img
                src={urlAtiva}
                alt={anexoAtivo || 'Anexo'}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            ) : (
              <div className="w-full h-[70vh]">
                <PdfViewer url={urlAtiva} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function toastOk(descricao: string) {
  toast({ title: 'Sucesso', description: descricao })
}

function toastErro(descricao: string) {
  toast({ title: 'Erro', description: descricao, variant: 'destructive' })
}

export { E_ANEXO_IMAGEM }
