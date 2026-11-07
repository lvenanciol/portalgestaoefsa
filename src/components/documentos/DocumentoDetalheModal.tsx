import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ExternalLink } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { DocumentoParecerButton } from '@/components/documentos/DocumentoParecerButton'
import { ProcessoObservacoesTimeline } from '@/components/documentos/ProcessoObservacoesTimeline'
import { useSanitizarObservacoesImportacao } from '@/components/documentos/useSanitizarObservacoesImportacao'
import { PdfViewer } from '@/components/documentos/PdfViewer'
import { DocumentoDetalheCampos } from '@/components/documentos/DocumentoDetalheCampos'
import {
  DocumentoDetalheAnexos,
  E_ANEXO_IMAGEM,
  podeVisualizarAnexo,
} from '@/components/documentos/DocumentoDetalheAnexos'
import { extrairAnexos } from '@/components/documentos/documentos-anexos-utils'

export { E_ANEXO_IMAGEM, podeVisualizarAnexo }

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: string
  documento: any
  empresas?: Array<{ id: string; nome: string }>
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
  onOpenChange,
  tipoAba,
  documento,
  empresas = [],
  onAtualizado,
}: DocumentoDetalheModalProps) {
  const [docAtual, setDocAtual] = useState<any>(documento)
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false)
  const [urlVisualizacao, setUrlVisualizacao] = useState<string | null>(null)
  const [arquivoEmVisualizacao, setArquivoEmVisualizacao] = useState<string | null>(null)
  const [carregandoVisualizacao, setCarregandoVisualizacao] = useState(false)

  // Mapeia aba ativa para a coleção correspondente no PocketBase
  const colecaoNome =
    tipoAba === 'alvaras'
      ? 'alvaras'
      : tipoAba === 'atas'
        ? 'atas'
        : tipoAba === 'juridicos'
          ? 'processos_juridicos'
          : 'contratos'

  // Mantém estado interno em sincronia quando o documento da prop mudar ou abrir
  useEffect(() => {
    if (documento) {
      setDocAtual(documento)
    }
  }, [documento, aberto])

  // Hook que sanitiza e despolui anotações de importação legado
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    docAtual?.id,
    docAtual?.observacoes,
    docAtual?.id
      ? {
          colecao: colecaoNome,
          id: docAtual.id,
          campo: 'observacoes',
        }
      : undefined,
  )

  // Limpa Blob URL ao fechar
  useEffect(() => {
    return () => {
      if (urlVisualizacao && urlVisualizacao.startsWith('blob:')) {
        URL.revokeObjectURL(urlVisualizacao)
      }
    }
  }, [urlVisualizacao])

  if (!docAtual) return null

  // Lista normalizada de anexos do documento usando o extrator universal
  const listaAnexos = extrairAnexos(docAtual.anexo)

  // Título e identificadores para o cabeçalho
  const tituloCabecalho =
    docAtual.titulo ||
    docAtual.tipo ||
    docAtual.numero ||
    docAtual.numero_processo ||
    docAtual.assunto_tipo ||
    'Detalhe do Documento'

  const subtituloIdentificador =
    docAtual.numero_cnj ||
    docAtual.numero_processo ||
    docAtual.numero ||
    docAtual.parte ||
    docAtual.empresa ||
    ''

  const nomeEmpresa = docAtual.empresa || docAtual.cliente_principal || ''

  const abrirVisualizador = async (nomeArquivo: string) => {
    setArquivoEmVisualizacao(nomeArquivo)
    setModalVisualizarAberto(true)
    setCarregandoVisualizacao(true)
    try {
      const urlArquivo = pb.files.getUrl(
        { collectionName: colecaoNome, id: docAtual.id } as any,
        nomeArquivo,
      )
      setUrlVisualizacao(urlArquivo)
    } catch (e) {
      console.error('Erro ao obter URL do anexo:', e)
    } finally {
      setCarregandoVisualizacao(false)
    }
  }

  const recarregarRegistro = async () => {
    try {
      const rec = await pb.collection(colecaoNome).getOne(docAtual.id)
      setDocAtual(rec)
      onAtualizado?.()
    } catch (e) {
      console.warn('Erro ao recarregar documento:', e)
    }
  }

  const handleSalvarObservacoes = async (novoTexto: string) => {
    try {
      await pb.collection(colecaoNome).update(docAtual.id, { observacoes: novoTexto })
      await recarregarRegistro()
    } catch (e) {
      console.error('Erro ao salvar observações:', e)
      alert('Não foi possível salvar as observações.')
    }
  }

  const ehVisualizacaoImagem = arquivoEmVisualizacao
    ? E_ANEXO_IMAGEM.test(arquivoEmVisualizacao)
    : false

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl w-[96vw] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
          <DialogHeader className="border-b border-gray-100 pb-4 pr-12">
            {/* Grid em 3 colunas: título/esquerda | botão de parecer centralizado na linha do título (à direita do conteúdo, à esquerda do X) | X à extrema direita.
                O X do shadcn Dialog é absoluto no canto direito; reservar a coluna da direita para ele (pr-12) evita
                qualquer sobreposição/colagem, espelhando o padrão do header da tela "Atas & Reuniões". */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 pr-10 sm:pr-12">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-700 border-blue-200"
                  >
                    {tipoAba}
                  </Badge>
                  {nomeEmpresa && (
                    <EmpresaIcon
                      nome={nomeEmpresa}
                      mostrarNome
                      className="h-4 w-4 shrink-0 rounded-xs"
                      nomeClassName="text-xs font-semibold text-gray-700"
                    />
                  )}
                  {docAtual.status && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      {String(docAtual.status)}
                    </Badge>
                  )}
                </div>
                <DialogTitle
                  className="text-lg font-bold text-gray-900 truncate"
                  title={tituloCabecalho}
                >
                  {tituloCabecalho}
                </DialogTitle>
                {subtituloIdentificador && (
                  <p className="text-xs text-gray-500 font-mono">{subtituloIdentificador}</p>
                )}
              </div>

              {/* Botão de Parecer de IA do Documento: alinhado ao header, mesma linha do título,
                  à direita e com espaçamento seguro do X (coluna própria no grid abaixo). */}
              <div className="shrink-0 flex items-center gap-2 pt-0.5">
                <DocumentoParecerButton
                  documento={docAtual}
                  tipoAba={tipoAba as any}
                  promptPadrao=""
                />
              </div>
            </div>
            {/* Coluna reservada ao X do Dialog (mantém o parecer longe do canto) */}
            <div aria-hidden className="w-8" />
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Metadados e Campos Editáveis */}
            <DocumentoDetalheCampos
              documento={docAtual}
              tipoAba={tipoAba as any}
              colecaoNome={colecaoNome}
              empresas={empresas}
              onAtualizado={recarregarRegistro}
            />

            {/* Caixa: ARQUIVOS ANEXOS DO DOCUMENTO (gerencia, adiciona, baixa, visualiza e remove com clique na linha) */}
            <DocumentoDetalheAnexos
              colecaoNome={colecaoNome}
              recordId={docAtual.id}
              anexos={listaAnexos}
              onVisualizarArquivo={abrirVisualizador}
              onAnexosAlterados={(novaLista) => {
                setDocAtual((prev: any) => ({ ...prev, anexo: novaLista }))
                onAtualizado?.()
              }}
            />

            {/* Linha do Tempo / Andamento Processual para Processos Jurídicos */}
            {tipoAba === 'juridicos' && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Observações e Andamento Processual
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    {docAtual.versao_atual ? `Versão ${docAtual.versao_atual}` : ''}
                  </span>
                </div>
                <ProcessoObservacoesTimeline
                  processoId={docAtual.id}
                  numeroProcesso={docAtual.numero_cnj || docAtual.numero_processo || ''}
                  observacoesTexto={observacoesSanitizadas || docAtual.observacoes || ''}
                  dataUltimaAtualizacao={docAtual.updated}
                  versaoAtual={docAtual.versao_atual || 1}
                  onSalvarTexto={handleSalvarObservacoes}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Embutido de Visualização de Anexo (PDF / Imagem / Arquivo) */}
      <Dialog open={modalVisualizarAberto} onOpenChange={setModalVisualizarAberto}>
        <DialogContent className="max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl p-4 border border-gray-200 flex flex-col">
          <DialogHeader className="border-b border-gray-100 pb-2 pr-10">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-sm font-bold text-gray-900 truncate">
                Visualizando: {arquivoEmVisualizacao}
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

          <div className="flex-1 min-h-[500px] overflow-hidden pt-2 flex flex-col">
            {carregandoVisualizacao ? (
              <div className="h-full flex items-center justify-center py-20 text-gray-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-xs">Carregando visualizador de documento...</span>
              </div>
            ) : urlVisualizacao ? (
              ehVisualizacaoImagem ? (
                <div className="h-full min-h-[500px] flex items-center justify-center bg-gray-50 rounded-xl p-4 overflow-auto border border-gray-200">
                  <img
                    src={urlVisualizacao}
                    alt={arquivoEmVisualizacao || 'Imagem anexa'}
                    className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-sm"
                  />
                </div>
              ) : (
                <PdfViewer
                  url={urlVisualizacao}
                  fileName={arquivoEmVisualizacao || 'documento.pdf'}
                />
              )
            ) : (
              <div className="text-center py-20 text-xs text-gray-500">
                Não foi possível carregar a prévia deste arquivo.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default DocumentoDetalheModal
