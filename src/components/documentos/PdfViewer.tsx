import React, { useEffect, useRef, useState } from 'react'
import {
  FileText,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfViewerProps {
  url: string
  fileName?: string
  minHeight?: number
  className?: string
}

declare global {
  interface Window {
    pdfjsLib?: any
  }
}

// Carregamento dinâmico do script PDF.js (Mozilla) com fallback robusto
let pdfJsScriptLoadingPromise: Promise<any> | null = null

function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window não disponível'))
  }

  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib)
  }

  if (pdfJsScriptLoadingPromise) {
    return pdfJsScriptLoadingPromise
  }

  pdfJsScriptLoadingPromise = new Promise((resolve, reject) => {
    // Tenta primeiro CDN unpkg, depois cdnjs
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      try {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          resolve(window.pdfjsLib)
        } else {
          reject(new Error('pdfjsLib não encontrado após carregar script'))
        }
      } catch (e) {
        reject(e)
      }
    }
    script.onerror = () => {
      // Fallback para cdnjs alternativo
      const altScript = document.createElement('script')
      altScript.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
      altScript.async = true
      altScript.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
          resolve(window.pdfjsLib)
        } else {
          reject(new Error('pdfjsLib falhou em todas as CDNs'))
        }
      }
      altScript.onerror = () => reject(new Error('Falha ao carregar biblioteca PDF.js'))
      document.head.appendChild(altScript)
    }
    document.head.appendChild(script)
  })

  return pdfJsScriptLoadingPromise
}

export function PdfViewer({
  url,
  fileName = 'documento.pdf',
  minHeight = 520,
  className = '',
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [loading, setLoading] = useState(true)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [scale, setScale] = useState(1.1)
  const [renderingPage, setRenderingPage] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(false)

  // Ao alterar a URL, carrega o PDF via PDF.js ou obtém Data URI
  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setFallbackMode(false)
    setPdfDoc(null)
    setPageNum(1)

    async function carregarDocumento() {
      try {
        let pdfData: ArrayBuffer | Uint8Array | string = url

        try {
          const resp = await fetch(url)
          if (!resp.ok) {
            throw new Error(`Falha HTTP ${resp.status} ao obter arquivo PDF`)
          }
          const buffer = await resp.arrayBuffer()
          pdfData = new Uint8Array(buffer)
        } catch (fetchErr: any) {
          console.warn('Fetch direto falhou, tentando passar URL direto ao PDF.js:', fetchErr)
        }

        const pdfjs = await loadPdfJs()
        if (cancelado) return

        const loadingTask = pdfjs.getDocument({
          data: pdfData instanceof Uint8Array ? pdfData : undefined,
          url: typeof pdfData === 'string' ? pdfData : undefined,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        })

        const doc = await loadingTask.promise
        if (cancelado) return

        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
        setLoading(false)
      } catch (err: any) {
        console.warn('Erro no renderizador PDF.js, caindo para modo visualização segura:', err)
        if (cancelado) return
        setFallbackMode(true)
        setLoading(false)
      }
    }

    if (url) {
      carregarDocumento()
    }

    return () => {
      cancelado = true
    }
  }, [url])

  // Renderiza a página no canvas sempre que mudar pageNum, scale ou pdfDoc
  useEffect(() => {
    let cancelRender = false
    if (!pdfDoc || !canvasRef.current || fallbackMode) return

    async function renderPage() {
      try {
        setRenderingPage(true)
        const page = await pdfDoc.getPage(pageNum)
        if (cancelRender || !canvasRef.current) return

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        const viewport = page.getViewport({ scale })

        // Ajusta dimensões para alta densidade de pixels (Retina / HiDPI)
        const pixelRatio = window.devicePixelRatio || 1
        canvas.height = viewport.height * pixelRatio
        canvas.width = viewport.width * pixelRatio
        canvas.style.height = `${viewport.height}px`
        canvas.style.width = `${viewport.width}px`

        context.save()
        context.scale(pixelRatio, pixelRatio)

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        await page.render(renderContext).promise
        context.restore()
      } catch (e: any) {
        if (!cancelRender) {
          console.warn('Erro ao renderizar página do PDF:', e)
        }
      } finally {
        if (!cancelRender) setRenderingPage(false)
      }
    }

    renderPage()

    return () => {
      cancelRender = true
    }
  }, [pdfDoc, pageNum, scale, fallbackMode])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleAbrirNovaAba = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-900/90 text-white rounded-xl overflow-hidden border border-slate-700 shadow-md ${className}`}
      style={{ minHeight: `${minHeight}px` }}
    >
      {/* Barra de controle superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/95 border-b border-slate-800 text-xs">
        {/* Paginação */}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pageNum <= 1 || loading || fallbackMode}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
            title="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-slate-300 text-xs font-mono px-1">
            {fallbackMode ? 'Documento' : `${pageNum} / ${numPages || 1}`}
          </span>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pageNum >= numPages || loading || fallbackMode}
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
            title="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom e rotação */}
        {!fallbackMode && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={scale <= 0.6 || loading}
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))}
              className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
              title="Diminuir zoom"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-slate-400 font-mono w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={scale >= 2.5 || loading}
              onClick={() => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(1)))}
              className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
              title="Aumentar zoom"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Ações externas */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAbrirNovaAba}
            className="h-7 px-2.5 text-xs bg-slate-900 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800"
          >
            <ExternalLink className="h-3 w-3 mr-1 text-emerald-400" />
            Nova aba
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            className="h-7 px-2.5 text-xs bg-[#1B5E20] hover:bg-[#2e7d32] text-white font-medium"
          >
            <Download className="h-3 w-3 mr-1" />
            Baixar
          </Button>
        </div>
      </div>

      {/* Área central de visualização */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-900/60 relative">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-300 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <span className="text-xs font-medium">Carregando páginas do PDF...</span>
          </div>
        )}

        {!loading && renderingPage && (
          <div className="absolute top-4 right-4 bg-slate-950/80 px-2 py-1 rounded text-[11px] text-slate-400 flex items-center gap-1 z-10">
            <Loader2 className="h-3 w-3 animate-spin" /> Renderizando...
          </div>
        )}

        {/* Canvas do PDF.js (quando renderizado sem erro e sem bloqueio do navegador) */}
        {!loading && !fallbackMode && (
          <div className="flex justify-center w-full">
            <canvas
              ref={canvasRef}
              className="shadow-2xl rounded border border-slate-700 max-w-full bg-white transition-transform"
            />
          </div>
        )}

        {/* Fallback amigável caso o PDF.js encontre erro ou modo fallback seja acionado */}
        {!loading && fallbackMode && (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <FileText className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h4 className="text-sm font-semibold text-white">Visualização de PDF</h4>
              <p className="text-xs text-slate-400">
                O arquivo <strong className="text-slate-200">{fileName}</strong> está disponível.
                Você pode visualizá-lo em tela cheia na nova aba ou fazer o download seguro.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                onClick={handleAbrirNovaAba}
                className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600 text-white"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir PDF em nova aba
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Baixar arquivo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
