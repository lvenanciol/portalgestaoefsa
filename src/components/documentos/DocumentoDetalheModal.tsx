import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  FileText,
  Calendar,
  Building2,
  Paperclip,
  Eye,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Layers,
  Save,
  Loader2,
  FileEdit,
  Building,
  ChevronDown,
  Check,
  Upload,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { DocumentoParecerButton } from './DocumentoParecerButton'
import { PdfViewer } from './PdfViewer'
import { ProcessoObservacoesTimeline } from './ProcessoObservacoesTimeline'
import { useSanitizarObservacoesImportacao } from './useSanitizarObservacoesImportacao'
import { canonizarNatureza } from './JuridicosImportModal'
import { limparPartes } from './juridicos-texto-utils'
import pb from '@/lib/pocketbase/client'

// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
=======
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
import pb from '@/lib/pocketbase/client'

// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
import pb from '@/lib/pocketbase/client'

// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
import pb from '@/lib/pocketbase/client'

// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
  onOpenChange,
  tipoAba,
  documento,
  empresas = [],
  onAtualizado,
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      const dados = { ...documento }
      // Em processos jurídicos, canoniza natureza e limpa partes antigas poluídas
      // (ex.: "Trabalhista Cliente principal: EXTRAFRUTI" -> "Trabalhista" e
      // "JOSE CARLOS SILVA... Responsável principal: NEIMAR ZAVARIZE" -> "JOSE CARLOS SILVA")
      if (tipoAba === 'juridicos') {
        if (dados.natureza) {
          dados.natureza = canonizarNatureza(dados.natureza)
        }
        if (dados.contrario_principal) {
          dados.contrario_principal = limparPartes(dados.contrario_principal)
        }
        if (dados.autor) {
          dados.autor = limparPartes(dados.autor)
        }
        if (dados.responsavel_principal) {
          dados.responsavel_principal = limparPartes(dados.responsavel_principal)
        }
        if (dados.advogado) {
          dados.advogado = limparPartes(dados.advogado)
        }
        if (dados.cliente_principal) {
          dados.cliente_principal = limparPartes(dados.cliente_principal)
        }
      }
      setFormData(dados)
      setFeedbackSalvo(false)
      setErroSalvar(null)

      // Extrai lista unificada de anexos (compatível com array de arquivos ou string antiga)
      const valAnexo = dados.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      setListaAnexosDetalhe(lista)
    }
  }, [documento, tipoAba])
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      const dados = { ...documento }
      // Em processos jurídicos, canoniza natureza e limpa partes antigas poluídas
      // (ex.: "Trabalhista Cliente principal: EXTRAFRUTI" -> "Trabalhista" e
      // "JOSE CARLOS SILVA... Responsável principal: NEIMAR ZAVARIZE" -> "JOSE CARLOS SILVA")
      if (tipoAba === 'juridicos') {
        if (dados.natureza) {
          dados.natureza = canonizarNatureza(dados.natureza)
        }
        if (dados.contrario_principal) {
          dados.contrario_principal = limparPartes(dados.contrario_principal)
        }
        if (dados.autor) {
          dados.autor = limparPartes(dados.autor)
        }
        if (dados.responsavel_principal) {
          dados.responsavel_principal = limparPartes(dados.responsavel_principal)
        }
        if (dados.advogado) {
          dados.advogado = limparPartes(dados.advogado)
        }
        if (dados.cliente_principal) {
          dados.cliente_principal = limparPartes(dados.cliente_principal)
        }
      }
      setFormData(dados)
      setFeedbackSalvo(false)
      setErroSalvar(null)

      // Extrai lista unificada de anexos (compatível com array de arquivos ou string antiga)
      const valAnexo = dados.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      setListaAnexosDetalhe(lista)
    }
  }, [documento, tipoAba])
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      const dados = { ...documento }
      // Em processos jurídicos, canoniza natureza e limpa partes antigas poluídas
      // (ex.: "Trabalhista Cliente principal: EXTRAFRUTI" -> "Trabalhista" e
      // "JOSE CARLOS SILVA... Responsável principal: NEIMAR ZAVARIZE" -> "JOSE CARLOS SILVA")
      if (tipoAba === 'juridicos') {
        if (dados.natureza) {
          dados.natureza = canonizarNatureza(dados.natureza)
        }
        if (dados.contrario_principal) {
          dados.contrario_principal = limparPartes(dados.contrario_principal)
        }
        if (dados.autor) {
          dados.autor = limparPartes(dados.autor)
        }
        if (dados.responsavel_principal) {
          dados.responsavel_principal = limparPartes(dados.responsavel_principal)
        }
        if (dados.advogado) {
          dados.advogado = limparPartes(dados.advogado)
        }
        if (dados.cliente_principal) {
          dados.cliente_principal = limparPartes(dados.cliente_principal)
        }
      }
      setFormData(dados)
      setFeedbackSalvo(false)
      setErroSalvar(null)

      // Extrai lista unificada de anexos (compatível com array de arquivos ou string antiga)
      const valAnexo = dados.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      setListaAnexosDetalhe(lista)
    }
  }, [documento, tipoAba])
=======
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
=======
export function DocumentoDetalheModal({
  aberto,
=======
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      const dados = { ...documento }
      // Em processos jurídicos, canoniza natureza e limpa partes antigas poluídas
      // (ex.: "Trabalhista Cliente principal: EXTRAFRUTI" -> "Trabalhista" e
      // "JOSE CARLOS SILVA... Responsável principal: NEIMAR ZAVARIZE" -> "JOSE CARLOS SILVA")
      if (tipoAba === 'juridicos') {
        if (dados.natureza) {
          dados.natureza = canonizarNatureza(dados.natureza)
        }
        if (dados.contrario_principal) {
          dados.contrario_principal = limparPartes(dados.contrario_principal)
        }
        if (dados.autor) {
          dados.autor = limparPartes(dados.autor)
        }
        if (dados.responsavel_principal) {
          dados.responsavel_principal = limparPartes(dados.responsavel_principal)
        }
        if (dados.advogado) {
          dados.advogado = limparPartes(dados.advogado)
        }
        if (dados.cliente_principal) {
          dados.cliente_principal = limparPartes(dados.cliente_principal)
        }
      }
      setFormData(dados)
      setFeedbackSalvo(false)
      setErroSalvar(null)

      // Extrai lista unificada de anexos (compatível com array de arquivos ou string antiga)
      const valAnexo = dados.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      setListaAnexosDetalhe(lista)
    }
  }, [documento, tipoAba])
=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
=======
}

export function DocumentoDetalheModal({=======
// Anexos exibíveis no visualizador embutido do detalhe: PDF (via PdfViewer)
// e imagens (abertas em nova aba). Qualquer extensão válida de arquivo exibido
// na caixa ARQUIVOS ANEXOS DO DOCUMENTO recebe o botão Visualizar.
const E_ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i
const podeVisualizarAnexo = (nome: string): boolean => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(nome || '')

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
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
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [arquivoPdfAtivo, setArquivoPdfAtivo] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [listaAnexosDetalhe, setListaAnexosDetalhe] = useState<string[]>([])
  const [salvandoAnexoDetalhe, setSalvandoAnexoDetalhe] = useState(false)
  const [anexoParaRemoverDetalhe, setAnexoParaRemoverDetalhe] = useState<string | null>(null)
  const inputAnexoDetalheRef = useRef<HTMLInputElement>(null)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  const destinoSanitizacao =
    tipoAba === 'juridicos' && documento
      ? { colecao: 'processos_juridicos', id: documento.id, campo: 'observacoes' }
      : undefined
  // Sanitização one-shot: remove anotações de importação ("[Importado em ... por ...]")
  // gravadas dentro do texto de observações por importações anteriores, para que
  // a cronologia não exiba evento fantasma (data/hora da importação como andamento)
  const observacoesSanitizadas = useSanitizarObservacoesImportacao(
    tipoAba === 'juridicos' ? documento?.id : undefined,
    tipoAba === 'juridicos' ? documento?.observacoes : undefined,
    destinoSanitizacao,
  )

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      const dados = { ...documento }
      // Em processos jurídicos, canoniza natureza e limpa partes antigas poluídas
      // (ex.: "Trabalhista Cliente principal: EXTRAFRUTI" -> "Trabalhista" e
      // "JOSE CARLOS SILVA... Responsável principal: NEIMAR ZAVARIZE" -> "JOSE CARLOS SILVA")
      if (tipoAba === 'juridicos') {
        if (dados.natureza) {
          dados.natureza = canonizarNatureza(dados.natureza)
        }
        if (dados.contrario_principal) {
          dados.contrario_principal = limparPartes(dados.contrario_principal)
        }
        if (dados.autor) {
          dados.autor = limparPartes(dados.autor)
        }
        if (dados.responsavel_principal) {
          dados.responsavel_principal = limparPartes(dados.responsavel_principal)
        }
        if (dados.advogado) {
          dados.advogado = limparPartes(dados.advogado)
        }
        if (dados.cliente_principal) {
          dados.cliente_principal = limparPartes(dados.cliente_principal)
        }
      }
      setFormData(dados)
      setFeedbackSalvo(false)
      setErroSalvar(null)

      // Extrai lista unificada de anexos (compatível com array de arquivos ou string antiga)
      const valAnexo = dados.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      setListaAnexosDetalhe(lista)
    }
  }, [documento, tipoAba])

  // Limpa Blob URL ao fechar modal
  useEffect(() => {
    if (!aberto) {
      setVisualizandoAnexo(false)
      if (blobUrlPdf && blobUrlPdf.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlPdf)
        setBlobUrlPdf(null)
      }
    }
  }, [aberto, blobUrlPdf])

  if (!documento) return null

  const colecaoPocketBase =
    tipoAba === 'alvaras'
      ? 'alvaras'
      : tipoAba === 'contratos' || tipoAba === 'locacoes'
        ? 'contratos'
        : tipoAba === 'atas'
          ? 'atas'
          : tipoAba === 'juridicos'
            ? 'processos_juridicos'
            : 'documentos'

  const obterUrlArquivoDetalhe = (nomeArquivo: string) => {
    if (!nomeArquivo || !documento) return ''
    return pb.files.getURL(documento, nomeArquivo)
  }

  const setCampo = (campo: string, valor: any) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }))
  }

  // Alterna visualização do anexo no detalhe com PdfViewer (PDF) ou nova aba (imagem)
  const toggleVisualizarAnexo = async (nomeArquivo: string) => {
    if (visualizandoAnexo && arquivoPdfAtivo === nomeArquivo) {
      setVisualizandoAnexo(false)
      setArquivoPdfAtivo(null)
      if (blobUrlPdf && blobUrlPdf.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlPdf)
        setBlobUrlPdf(null)
      }
      return
    }

    const url = obterUrlArquivoDetalhe(nomeArquivo)
    if (!url || !podeVisualizarAnexo(nomeArquivo)) return

    // Imagem (PNG/JPG/JPEG/WEBP/GIF): abre em nova aba — não usa o PdfViewer
    if (E_ANEXO_IMAGEM.test(nomeArquivo.toLowerCase())) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    setArquivoPdfAtivo(nomeArquivo)
    setVisualizandoAnexo(true)
    setCarregandoPdf(true)
    try {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token
      }
      const resp = await fetch(url, { headers })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const rawBlob = await resp.blob()
      const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' })
      const objectUrl = URL.createObjectURL(pdfBlob)
      setBlobUrlPdf(objectUrl)
    } catch (e) {
      console.warn('Erro ao carregar PDF como blob no detalhe, usando url direta:', e)
      setBlobUrlPdf(url)
    } finally {
      setCarregandoPdf(false)
    }
  }

  // Download individual defensivo
  const handleBaixarArquivoDetalhe = async (nomeArquivo: string) => {
    const url = obterUrlArquivoDetalhe(nomeArquivo)
    if (!url) return
    try {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) headers['Authorization'] = pb.authStore.token
      const resp = await fetch(url, { headers })
      if (resp.ok) {
        const blob = await resp.blob()
        const dUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = dUrl
        a.download = nomeArquivo
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(dUrl), 1000)
        return
      }
    } catch {
      /* fallback */
    }
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Upload de novos anexos pelo próprio detalhe
  const handleAnexarArquivosDetalhe = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !documento?.id) return

    setSalvandoAnexoDetalhe(true)
    try {
      const formDataUpload = new FormData()
      for (const f of files) {
        formDataUpload.append('anexo', f)
      }
      const rec = await pb.collection(colecaoPocketBase).update(documento.id, formDataUpload)
      const valAnexo = rec.anexo
      let lista: string[] = []
      if (Array.isArray(valAnexo)) {
        lista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        lista = [valAnexo.trim()]
      }
      // PRESERVAÇÃO DA LISTA COMPLETA: união do retorno do backend com a lista
      // já exibida. Se o backend tratar o campo como arquivo único (maxSelect 1)
      // e devolver só o último arquivo, os anexos anteriores NÃO são perdidos —
      // o novo é acrescentado à lista existente, nunca substituindo. O retry
      // percorre a lista montada até o backend aceitar tudo (frente única).
      const listaAnterior = listaAnexosDetalhe.filter((n) => n && !lista.includes(n))
      if (listaAnterior.length > 0 && !listaAnterior.every((n) => lista.includes(n))) {
        let uniao = [...listaAnterior, ...lista.filter((n) => !listaAnterior.includes(n))]
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          try {
            const recUniao = await pb
              .collection(colecaoPocketBase)
              .update(documento.id, { anexo: uniao } as any)
            const valUniao = recUniao?.anexo
            const listaRetorno: string[] = Array.isArray(valUniao)
              ? valUniao.map(String).filter(Boolean)
              : typeof valUniao === 'string' && valUniao.trim()
                ? [valUniao.trim()]
                : []
            const faltando = uniao.filter((n) => !listaRetorno.includes(n))
            if (faltando.length === 0) {
              lista = listaRetorno
              break
            }
            // Backend descartou arquivos: repõe os faltantes e tenta de novo
            uniao = [...listaRetorno, ...faltando.filter((n) => !listaRetorno.includes(n))]
          } catch (errUniao) {
            console.warn('Falha ao persistir união de anexos:', errUniao)
            break
          }
        }
        if (uniao.length > lista.length) lista = uniao
      }
      setListaAnexosDetalhe(lista)
      if (onAtualizado) onAtualizado()
    } catch (err: any) {
      console.error('Erro ao anexar arquivo no detalhe:', err)
      alert(err?.message || 'Falha ao anexar arquivo.')
    } finally {
      setSalvandoAnexoDetalhe(false)
      if (inputAnexoDetalheRef.current) inputAnexoDetalheRef.current.value = ''
    }
  }

  // Remover anexo individual pelo próprio detalhe
  const handleRemoverAnexoDetalhe = async (nomeArquivo: string) => {
    if (!documento?.id || !nomeArquivo) return
    setSalvandoAnexoDetalhe(true)
    try {
      const listaRestante = listaAnexosDetalhe.filter((n) => n !== nomeArquivo)
      let rec: any
      try {
        rec = await pb.collection(colecaoPocketBase).update(documento.id, {
          'anexo-': [nomeArquivo],
        } as any)
      } catch (errRemocao) {
        console.warn('Modificador anexo- falhou, tentando salvar lista restante:', errRemocao)
        rec = await pb.collection(colecaoPocketBase).update(documento.id, {
          anexo: listaRestante.length > 0 ? listaRestante : null,
        } as any)
      }

      const valAnexo = rec?.anexo
      let novaLista: string[] = []
      if (Array.isArray(valAnexo)) {
        novaLista = valAnexo.map(String).filter(Boolean)
      } else if (typeof valAnexo === 'string' && valAnexo.trim()) {
        novaLista = [valAnexo.trim()]
      } else if (valAnexo === null || valAnexo === undefined) {
        novaLista = []
      } else {
        novaLista = listaRestante
      }

      setListaAnexosDetalhe(novaLista)
      if (arquivoPdfAtivo === nomeArquivo) {
        setVisualizandoAnexo(false)
        setArquivoPdfAtivo(null)
      }
      setAnexoParaRemoverDetalhe(null)
      if (onAtualizado) onAtualizado()
    } catch (err: any) {
      console.error('Erro ao remover anexo no detalhe:', err)
      alert(err?.message || 'Falha ao remover arquivo.')
    } finally {
      setSalvandoAnexoDetalhe(false)
    }
  }

  // Salvar alterações diretamente no PocketBase
  const handleSalvarEdicao = async () => {
    setSalvando(true)
    setErroSalvar(null)
    setFeedbackSalvo(false)

    try {
      let colecao = ''
      const payload: Record<string, any> = {}

      if (tipoAba === 'alvaras') {
        colecao = 'alvaras'
        payload.empresa = formData.empresa
        payload.numero = formData.numero
        payload.tipo = formData.tipo
        payload.orgao_emissor = formData.orgao_emissor
        payload.municipio = formData.municipio
        payload.status = formData.status
        payload.observacoes = formData.observacoes || ''
        if (formData.validade) {
          payload.validade = formData.validade.includes('T')
            ? formData.validade
            : `${formData.validade} 00:00:00.000Z`
        }
      } else if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
        colecao = 'contratos'
        payload.empresa = formData.empresa
        payload.titulo = formData.titulo
        payload.parte = formData.parte
        payload.status = formData.status
        payload.objeto = formData.objeto || ''
        payload.indexador = formData.indexador || ''
        payload.forma_pagamento = formData.forma_pagamento || ''
        payload.garantia = formData.garantia || ''
        payload.vistoria = formData.vistoria || ''
        payload.observacao = formData.observacao || ''

        // Campos específicos de locação
        payload.quantidade_caucoes = formData.quantidade_caucoes
          ? Number(formData.quantidade_caucoes)
          : 0
        payload.prazo_meses = formData.prazo_meses ? Number(formData.prazo_meses) : 0
        payload.periodicidade_reajuste = formData.periodicidade_reajuste || ''
        payload.multa_rescisao = formData.multa_rescisao || ''
        payload.multa_infracao = formData.multa_infracao || ''
        payload.foro_eleicao = formData.foro_eleicao || ''
        payload.tipo_imovel = formData.tipo_imovel || ''
        payload.endereco_imovel = formData.endereco_imovel || ''
        payload.representante_locador = formData.representante_locador || ''
        payload.representante_locatario = formData.representante_locatario || ''
        payload.locatario_nome = formData.locatario_nome || ''
        payload.clausulas_especiais = formData.clausulas_especiais || ''

        const valNum =
          typeof formData.valor_mensal === 'number'
            ? formData.valor_mensal
            : parseFloat(
                String(formData.valor_mensal || '')
                  .replace(/[R$\s.]/g, '')
                  .replace(',', '.'),
              )
        if (!isNaN(valNum)) payload.valor_mensal = valNum

        const valAssinaturaNum =
          typeof formData.valor_assinatura === 'number'
            ? formData.valor_assinatura
            : parseFloat(
                String(formData.valor_assinatura || '')
                  .replace(/[R$\s.]/g, '')
                  .replace(',', '.'),
              )
        if (!isNaN(valAssinaturaNum)) payload.valor_assinatura = valAssinaturaNum

        if (formData.inicio) {
          payload.inicio = formData.inicio.includes('T')
            ? formData.inicio
            : `${formData.inicio} 00:00:00.000Z`
        }
        if (formData.fim) {
          payload.fim = formData.fim.includes('T') ? formData.fim : `${formData.fim} 00:00:00.000Z`
        }
      } else if (tipoAba === 'atas') {
        colecao = 'atas'
        payload.empresa = formData.empresa
        payload.titulo = formData.titulo
        payload.tipo_ata = formData.tipo_ata
        payload.mesa_diretora = formData.mesa_diretora || ''
        payload.participantes = formData.participantes || ''
        payload.pauta = formData.pauta || ''
        payload.deliberacoes = formData.deliberacoes || ''
        payload.assinatura_eletronica = formData.assinatura_eletronica || ''
        payload.resumo = formData.resumo || ''
        if (formData.data) {
          payload.data = formData.data.includes('T')
            ? formData.data
            : `${formData.data} 10:00:00.000Z`
        }
      } else if (tipoAba === 'juridicos') {
        colecao = 'processos_juridicos'
        payload.empresa = formData.empresa
        payload.numero_processo = formData.numero_processo
        payload.vara_comarca = formData.vara_comarca || ''
        payload.autor = formData.autor || ''
        payload.reu = formData.reu || ''
        payload.fase_instancia = formData.fase_instancia || ''
        payload.assunto_tipo = formData.assunto_tipo || ''
        payload.advogado = formData.advogado || ''
        payload.status = formData.status || 'ativo'
        payload.risco = formData.risco || 'possivel'
        if (formData.natureza) {
          payload.natureza = canonizarNatureza(formData.natureza)
        }
        payload.observacoes = formData.observacoes || ''

        const valCausa =
          typeof formData.valor_causa === 'number'
            ? formData.valor_causa
            : parseFloat(
                String(formData.valor_causa || '')
                  .replace(/[R$\s.]/g, '')
                  .replace(',', '.'),
              )
        if (!isNaN(valCausa)) payload.valor_causa = valCausa

        if (formData.data_distribuicao) {
          payload.data_distribuicao = formData.data_distribuicao.includes('T')
            ? formData.data_distribuicao
            : `${formData.data_distribuicao} 00:00:00.000Z`
        }
        if (formData.proxima_audiencia) {
          payload.proxima_audiencia = formData.proxima_audiencia.includes('T')
            ? formData.proxima_audiencia
            : `${formData.proxima_audiencia} 00:00:00.000Z`
        }
      }

      await pb.collection(colecao).update(documento.id, payload)
      setFeedbackSalvo(true)
      if (onAtualizado) {
        onAtualizado()
      }
      setTimeout(() => setFeedbackSalvo(false), 3000)
    } catch (err: any) {
      console.error('Erro ao salvar documento:', err)
      setErroSalvar(err?.message || 'Falha ao salvar alterações do documento.')
    } finally {
      setSalvando(false)
    }
  }

  const formatarDataInput = (d?: string) => {
    if (!d) return ''
    return d.split('T')[0].split(' ')[0]
  }

  const titulosAba: Record<string, string> = {
    alvaras: 'Alvará / Licença',
    contratos: 'Contrato Comercial',
    locacoes: 'Contrato de Locação',
    atas: 'Ata de Reunião / Assembleia',
    juridicos: 'Processo Jurídico',
  }

  const tituloPrincipal =
    formData.titulo || formData.numero || formData.numero_processo || 'Documento'

  const renderBadgeStatus = (status: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'regular' || s === 'ativo' || s === 'vigente') {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-emerald-600" />
          {status || 'Ativo'}
        </Badge>
      )
    }
    if (s === 'vencendo' || s === 'em_renovacao' || s === 'alerta') {
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-600" />
          {status || 'Vencendo'}
        </Badge>
      )
    }
    return (
      <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
        <XCircle className="h-3 w-3 text-rose-600" />
        {status || 'Vencido'}
      </Badge>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 rounded-2xl bg-gray-50/95 border-gray-200">
        {/* Cabeçalho superior */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center">
              <FileEdit className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900 leading-tight">
                {titulosAba[tipoAba] || 'Detalhes do Documento'}
              </DialogTitle>
              <div className="flex items-center gap-2 text-xs text-emerald-800 font-medium">
                <span>Modo de visualização e edição direta</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DocumentoParecerButton tipoAba={tipoAba} documento={formData} promptPadrao="" />

            <Button
              type="button"
              size="sm"
              disabled={salvando}
              onClick={handleSalvarEdicao}
              className={`h-8 px-3 text-xs font-semibold shadow-sm transition-all ${
                feedbackSalvo
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#1B5E20] hover:bg-[#0F3D13] text-white'
              }`}
            >
              {salvando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando...
                </>
              ) : feedbackSalvo ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Salvo com sucesso!
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar alterações
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {erroSalvar && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
              {erroSalvar}
            </div>
          )}

          {/* Cartão principal do documento */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  {tipoAba === 'alvaras'
                    ? 'Identificação / Alvará'
                    : tipoAba === 'juridicos'
                      ? 'Processo'
                      : 'Título do Documento'}
                </label>
                <Input
                  value={
                    tipoAba === 'alvaras'
                      ? formData.numero || ''
                      : tipoAba === 'juridicos'
                        ? formData.numero_processo || ''
                        : formData.titulo || ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    if (tipoAba === 'alvaras') setCampo('numero', val)
                    else if (tipoAba === 'juridicos') setCampo('numero_processo', val)
                    else setCampo('titulo', val)
                  }}
                  className="font-bold text-gray-900 text-sm h-9 bg-gray-50/50"
                  placeholder="Título ou identificador do documento"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Empresa Vinculada
                </label>
                {empresas.length > 0 ? (
                  <Popover open={popoverEmpresaAberto} onOpenChange={setPopoverEmpresaAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-9 px-3 justify-between text-xs font-semibold bg-white border-gray-300 hover:bg-gray-50 shadow-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <EmpresaIcon
                            nome={formData.empresa}
                            className="h-4 w-4 shrink-0 rounded"
                          />
                          <span className="truncate text-gray-900">
                            {formData.empresa || 'Selecione a empresa'}
                          </span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[240px] p-1.5 bg-white shadow-xl rounded-xl border border-gray-200 z-[9999]"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 py-1">
                        Selecione a Empresa
                      </div>
                      <div className="space-y-0.5 mt-1 max-h-56 overflow-y-auto">
                        {empresas.map((emp) => {
                          const selecionada =
                            (formData.empresa || '').toLowerCase() ===
                            (emp.nome || '').toLowerCase()
                          return (
                            <button
                              key={emp.id || emp.nome}
                              type="button"
                              onClick={() => {
                                setCampo('empresa', emp.nome)
                                setPopoverEmpresaAberto(false)
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                selecionada
                                  ? 'bg-emerald-50 text-[#1B5E20] font-semibold'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <EmpresaIcon nome={emp.nome} className="h-4 w-4 shrink-0 rounded" />
                                <span className="truncate">{emp.nome}</span>
                              </div>
                              {selecionada && (
                                <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="relative flex items-center">
                    <EmpresaIcon
                      nome={formData.empresa}
                      className="h-4 w-4 absolute left-3 pointer-events-none rounded"
                    />
                    <Input
                      value={formData.empresa || ''}
                      onChange={(e) => setCampo('empresa', e.target.value)}
                      className="text-xs font-semibold text-gray-800 h-9 pl-9"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Seção de Arquivo Anexo (suporte a múltiplos anexos) */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-emerald-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  ARQUIVOS ANEXOS DO DOCUMENTO ({listaAnexosDetalhe.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={inputAnexoDetalheRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleAnexarArquivosDetalhe}
                  disabled={salvandoAnexoDetalhe}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputAnexoDetalheRef.current?.click()}
                  disabled={salvandoAnexoDetalhe}
                  className="h-7 text-xs font-medium text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                >
                  {salvandoAnexoDetalhe ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  Anexar mais arquivos
                </Button>
                {onAbrirAnexos && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAbrirAnexos(documento)}
                    className="h-7 text-xs font-medium text-gray-700 border-gray-200 hover:bg-gray-50"
                  >
                    Gerenciador completo
                  </Button>
                )}
              </div>
            </div>

            {listaAnexosDetalhe.length > 0 ? (
              <div className="space-y-2">
                {listaAnexosDetalhe.map((nomeArq, idx) => {
                  const arqPdf = nomeArq.toLowerCase().endsWith('.pdf')
                  const arqAtivoVis = visualizandoAnexo && arquivoPdfAtivo === nomeArq
                  return (
                    <div
                      key={nomeArq + '-' + idx}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-3 hover:bg-gray-100/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={cn(
                            'h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0',
                            arqPdf
                              ? 'bg-rose-100 text-rose-800'
                              : nomeArq.toLowerCase().match(/\.(xlsx|xls)$/)
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800',
                          )}
                        >
                          {arqPdf
                            ? 'PDF'
                            : nomeArq.toLowerCase().match(/\.(xlsx|xls)$/)
                              ? 'XLS'
                              : 'DOC'}
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-xs font-semibold text-gray-900 truncate max-w-md"
                            title={nomeArq}
                          >
                            {nomeArq}
                          </div>
                          <div className="text-[11px] text-gray-500">Anexo #{idx + 1}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {podeVisualizarAnexo(nomeArq) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleVisualizarAnexo(nomeArq)}
                            className="h-7 px-2 text-xs font-medium border-gray-200 text-gray-700 hover:bg-white"
                          >
                            <Eye className="h-3 w-3 mr-1 text-gray-600" />
                            {arqAtivoVis ? 'Ocultar' : 'Visualizar'}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleBaixarArquivoDetalhe(nomeArq)}
                          className="h-7 px-2.5 text-xs font-semibold text-emerald-800 border-emerald-200 hover:bg-emerald-50 rounded-md"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Baixar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAnexoParaRemoverDetalhe(nomeArq)}
                          disabled={salvandoAnexoDetalhe}
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Remover anexo"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 text-center border border-dashed border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50/50">
                Nenhum arquivo anexado a este documento ainda.
                <button
                  type="button"
                  onClick={() => inputAnexoDetalheRef.current?.click()}
                  className="text-xs text-emerald-700 font-semibold underline ml-1.5 hover:text-emerald-800 inline-block"
                >
                  Anexar agora (PDF, DOCX, XLSX)
                </button>
              </div>
            )}

            {/* Modal de confirmação de exclusão individual */}
            <Dialog
              open={Boolean(anexoParaRemoverDetalhe)}
              onOpenChange={(aberto) => !aberto && setAnexoParaRemoverDetalhe(null)}
            >
              <DialogContent className="bg-white max-w-sm p-5 rounded-2xl shadow-xl border border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-sm font-bold text-gray-900">
                    Remover anexo?
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-gray-600 mt-2">
                  Deseja remover{' '}
                  <strong className="text-gray-900 break-all">{anexoParaRemoverDetalhe}</strong>? Os
                  demais anexos permanecerão intactos.
                </p>
                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAnexoParaRemoverDetalhe(null)}
                    className="text-xs h-8"
                    disabled={salvandoAnexoDetalhe}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      anexoParaRemoverDetalhe && handleRemoverAnexoDetalhe(anexoParaRemoverDetalhe)
                    }
                    disabled={salvandoAnexoDetalhe}
                    className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white font-medium"
                  >
                    {salvandoAnexoDetalhe ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : null}
                    Sim, remover
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Visualizador de PDF embutido seguro via PdfViewer */}
            {visualizandoAnexo && (
              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-gray-900 shadow-inner relative">
                {carregandoPdf ? (
                  <div className="h-[480px] flex items-center justify-center bg-gray-900/90 text-xs text-gray-300">
                    Preparando arquivo PDF...
                  </div>
                ) : blobUrlPdf ? (
                  <PdfViewer
                    url={blobUrlPdf}
                    fileName={arquivoPdfAtivo || 'documento.pdf'}
                    minHeight={520}
                    className="w-full"
                  />
                ) : null}
              </div>
            )}
          </div>

          {/* GRID DE CAMPOS EDITÁVEIS POR ABA */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-700" />
                Campos Editáveis do Documento
              </h3>
              <span className="text-[11px] text-gray-400">
                Edite os valores abaixo e clique em &quot;Salvar alterações&quot;
              </span>
            </div>

            {/* 1. ABA ALVARÁS */}
            {tipoAba === 'alvaras' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Número do Alvará
                  </label>
                  <Input
                    value={formData.numero || ''}
                    onChange={(e) => setCampo('numero', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Tipo de Alvará
                  </label>
                  <Input
                    value={formData.tipo || ''}
                    onChange={(e) => setCampo('tipo', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Órgão Emissor
                  </label>
                  <Input
                    value={formData.orgao_emissor || ''}
                    onChange={(e) => setCampo('orgao_emissor', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Município / UF
                  </label>
                  <Input
                    value={formData.municipio || ''}
                    onChange={(e) => setCampo('municipio', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Data de Validade
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.validade)}
                    onChange={(e) => setCampo('validade', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Situação Cadastral
                  </label>
                  <select
                    value={formData.status || 'regular'}
                    onChange={(e) => setCampo('status', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="regular">Regular</option>
                    <option value="vencendo">Vencendo</option>
                    <option value="vencido">Vencido</option>
                    <option value="em_renovacao">Em Renovação</option>
                  </select>
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Observações e Condicionantes
                  </label>
                  <Textarea
                    rows={3}
                    value={formData.observacoes || ''}
                    onChange={(e) => setCampo('observacoes', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 2 & 3. CONTRATOS & LOCAÇÕES */}
            {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    {tipoAba === 'locacoes' ? 'Locador (Proprietário)' : 'Contraparte / Fornecedor'}
                  </label>
                  <Input
                    value={formData.parte || ''}
                    onChange={(e) => setCampo('parte', e.target.value)}
                    className="h-9 text-xs font-medium"
                    placeholder="Razão Social / Nome"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor Mensal (R$)
                  </label>
                  <Input
                    value={formData.valor_mensal ?? ''}
                    onChange={(e) => setCampo('valor_mensal', e.target.value)}
                    className="h-9 text-xs font-semibold text-emerald-800"
                    placeholder="16.000,00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Índice de Reajuste
                  </label>
                  <Input
                    value={formData.indexador || ''}
                    onChange={(e) => setCampo('indexador', e.target.value)}
                    className="h-9 text-xs"
                    placeholder="IGP-M"
                  />
                </div>

                {tipoAba === 'locacoes' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Valor Pago na Assinatura (R$)
                      </label>
                      <Input
                        value={formData.valor_assinatura ?? ''}
                        onChange={(e) => setCampo('valor_assinatura', e.target.value)}
                        className="h-9 text-xs font-semibold text-gray-900"
                        placeholder="48.000,00 (1º aluguel + cauções)"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Qtd. de Cauções
                      </label>
                      <Input
                        type="number"
                        value={formData.quantidade_caucoes ?? ''}
                        onChange={(e) => setCampo('quantidade_caucoes', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="2"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Prazo da Locação (meses)
                      </label>
                      <Input
                        type="number"
                        value={formData.prazo_meses ?? ''}
                        onChange={(e) => setCampo('prazo_meses', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="36"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Periodicidade do Reajuste
                      </label>
                      <Input
                        value={formData.periodicidade_reajuste || 'Anual'}
                        onChange={(e) => setCampo('periodicidade_reajuste', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Anual"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Tipo do Imóvel
                      </label>
                      <Input
                        value={formData.tipo_imovel || ''}
                        onChange={(e) => setCampo('tipo_imovel', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Galpão"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Foro de Eleição
                      </label>
                      <Input
                        value={formData.foro_eleicao || ''}
                        onChange={(e) => setCampo('foro_eleicao', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Comarca de Petrolina/PE"
                      />
                    </div>
                    <div className="col-span-full space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Endereço Completo do Imóvel
                      </label>
                      <Input
                        value={formData.endereco_imovel || ''}
                        onChange={(e) => setCampo('endereco_imovel', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Rua Antônio Macedo Filho, 320, Distrito Industrial, Petrolina/PE"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Representante Legal do Locador
                      </label>
                      <Input
                        value={formData.representante_locador || ''}
                        onChange={(e) => setCampo('representante_locador', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Geraldo Magela da Silva Neto"
                      />
                    </div>
                    <div className="col-span-full md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Representante(s) Legal(is) do Locatário
                      </label>
                      <Input
                        value={formData.representante_locatario || ''}
                        onChange={(e) => setCampo('representante_locatario', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="Leonardo Venancio Lourenço / Flavia Rapozo"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Multa por Rescisão Antecipada
                      </label>
                      <Input
                        value={formData.multa_rescisao || ''}
                        onChange={(e) => setCampo('multa_rescisao', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="02 (dois) meses do aluguel em vigor"
                      />
                    </div>
                    <div className="col-span-full md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500">
                        Multa por Infração Contratual
                      </label>
                      <Input
                        value={formData.multa_infracao || ''}
                        onChange={(e) => setCampo('multa_infracao', e.target.value)}
                        className="h-9 text-xs"
                        placeholder="01 (um) mês do aluguel em vigor"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Início da Vigência
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.inicio)}
                    onChange={(e) => setCampo('inicio', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Término da Vigência
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.fim)}
                    onChange={(e) => setCampo('fim', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Situação Contratual
                  </label>
                  <select
                    value={formData.status || 'ativo'}
                    onChange={(e) => setCampo('status', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="em_renovacao">Em Renovação</option>
                    <option value="encerrado">Encerrado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Garantia Locatícia / Contratual
                  </label>
                  <Input
                    value={formData.garantia || ''}
                    onChange={(e) => setCampo('garantia', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Laudo de Vistoria
                  </label>
                  <Input
                    value={formData.vistoria || ''}
                    onChange={(e) => setCampo('vistoria', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Forma de Pagamento
                  </label>
                  <Input
                    value={formData.forma_pagamento || ''}
                    onChange={(e) => setCampo('forma_pagamento', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Objeto do Contrato
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.objeto || ''}
                    onChange={(e) => setCampo('objeto', e.target.value)}
                    className="text-xs"
                  />
                </div>
                {tipoAba === 'locacoes' && (
                  <div className="col-span-full space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-500">
                      Cláusulas Especiais Relevantes (ex.: Sistema de Energia Solar)
                    </label>
                    <Textarea
                      rows={2}
                      value={formData.clausulas_especiais || ''}
                      onChange={(e) => setCampo('clausulas_especiais', e.target.value)}
                      className="text-xs"
                      placeholder="Ex: Cláusula Terceira de Energia Solar com faturamento e medição separados..."
                    />
                  </div>
                )}
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Observações Adicionais
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.observacao || ''}
                    onChange={(e) => setCampo('observacao', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 4. ABA ATAS */}
            {tipoAba === 'atas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Tipo de Assembleia / Reunião
                  </label>
                  <select
                    value={formData.tipo_ata || 'AGE'}
                    onChange={(e) => setCampo('tipo_ata', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="AGO">AGO (Ordinária)</option>
                    <option value="AGE">AGE (Extraordinária)</option>
                    <option value="Reunião de Diretoria">Reunião de Diretoria</option>
                    <option value="Conselho">Conselho de Administração</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Data da Realização
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.data)}
                    onChange={(e) => setCampo('data', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Assinatura Eletrônica
                  </label>
                  <Input
                    value={formData.assinatura_eletronica || ''}
                    onChange={(e) => setCampo('assinatura_eletronica', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Mesa Diretora (Presidente e Secretário)
                  </label>
                  <Input
                    value={formData.mesa_diretora || ''}
                    onChange={(e) => setCampo('mesa_diretora', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Participantes / Acionistas Presentes
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.participantes || ''}
                    onChange={(e) => setCampo('participantes', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Ordem do Dia / Pauta
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.pauta || ''}
                    onChange={(e) => setCampo('pauta', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Deliberações e Resoluções Aprovadas
                  </label>
                  <Textarea
                    rows={3}
                    value={formData.deliberacoes || ''}
                    onChange={(e) => setCampo('deliberacoes', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Resumo Executivo
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.resumo || ''}
                    onChange={(e) => setCampo('resumo', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 5. PROCESSOS JURÍDICOS */}
            {tipoAba === 'juridicos' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Título do Processo / Ação
                  </label>
                  <Input
                    value={formData.titulo || ''}
                    onChange={(e) => setCampo('titulo', e.target.value)}
                    className="h-9 text-xs font-semibold text-gray-900"
                    placeholder="Ex: Rescisão Indireta / Horas Extras"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Número do Processo (CNJ)
                  </label>
                  <Input
                    value={formData.numero_cnj || formData.numero_processo || ''}
                    onChange={(e) => {
                      setCampo('numero_cnj', e.target.value)
                      setCampo('numero_processo', e.target.value)
                    }}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Código Interno / Pasta
                  </label>
                  <Input
                    value={formData.processo_codigo || ''}
                    onChange={(e) => setCampo('processo_codigo', e.target.value)}
                    className="h-9 text-xs font-mono"
                    placeholder="Ex: 1.0010944"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Órgão / Vara
                  </label>
                  <Input
                    value={formData.orgao || formData.vara_comarca || ''}
                    onChange={(e) => {
                      setCampo('orgao', e.target.value)
                      setCampo('vara_comarca', e.target.value)
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">Status</label>
                  <Input
                    value={formData.status || 'Ativo'}
                    onChange={(e) => setCampo('status', e.target.value)}
                    className="h-9 text-xs font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">Natureza</label>
                  <Input
                    value={canonizarNatureza(formData.natureza || 'Trabalhista')}
                    onChange={(e) => setCampo('natureza', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Parte Contrária
                  </label>
                  <Input
                    value={formData.contrario_principal || formData.autor || ''}
                    onChange={(e) => {
                      setCampo('contrario_principal', e.target.value)
                      setCampo('autor', e.target.value)
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Responsável / Advogado
                  </label>
                  <Input
                    value={formData.responsavel_principal || formData.advogado || ''}
                    onChange={(e) => {
                      setCampo('responsavel_principal', e.target.value)
                      setCampo('advogado', e.target.value)
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Probabilidade / Risco
                  </label>
                  <Input
                    value={formData.probabilidade || formData.risco || 'Perda Possível'}
                    onChange={(e) => setCampo('probabilidade', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Bloco de Valores */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor Base (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.valor_base ?? formData.valor_causa ?? ''}
                    onChange={(e) => {
                      setCampo('valor_base', parseFloat(e.target.value) || 0)
                      setCampo('valor_causa', parseFloat(e.target.value) || 0)
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor Corrigido (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.valor_corrigido ?? ''}
                    onChange={(e) => setCampo('valor_corrigido', parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Juros (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.juros ?? ''}
                    onChange={(e) => setCampo('juros', parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Multa (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.multa ?? ''}
                    onChange={(e) => setCampo('multa', parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor Atualizado (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.valor_atualizado ?? ''}
                    onChange={(e) => setCampo('valor_atualizado', parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-bold text-emerald-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Versão do Registro
                  </label>
                  <Input
                    readOnly
                    disabled
                    value={`v${formData.versao_atual || 1}`}
                    className="h-9 text-xs bg-gray-50 font-bold"
                  />
                </div>

                <div className="col-span-full space-y-2 pt-2">
                  <ProcessoObservacoesTimeline
                    processoId={documento?.id}
                    numeroProcesso={formData.numero_processo || formData.numero_cnj}
                    observacoesTexto={observacoesSanitizadas || formData.observacoes || ''}
                    dataUltimaAtualizacao={documento?.updated || documento?.data_importacao}
                    versaoAtual={formData.versao_atual}
                    onSalvarTexto={(novoTexto) => setCampo('observacoes', novoTexto)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
