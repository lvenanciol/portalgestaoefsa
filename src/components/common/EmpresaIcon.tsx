import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

export interface LogomarcaRegistro {
  id: string
  empresa: string
  sigla?: string
  cor?: string
  logo?: string
  emblema?: string
  ativo?: boolean
}

interface EmpresaLogosContextType {
  logos: LogomarcaRegistro[]
  loading: boolean
  obterIconeEmpresa: (nomeEmpresa: string, className?: string) => React.ReactNode
  obterUrlImagem: (nomeEmpresa: string) => string | null
  obterSiglaCor: (nomeEmpresa: string) => { sigla: string; cor: string }
}

const EmpresaLogosContext = createContext<EmpresaLogosContextType | undefined>(undefined)

const norm = (s: any) =>
  String(s || '')
    .trim()
    .toLowerCase()

export function EmpresaLogosProvider({ children }: { children: React.ReactNode }) {
  const [logos, setLogos] = useState<LogomarcaRegistro[]>([])
  const [loading, setLoading] = useState(true)
  const { empresas } = useApp()

  const carregarLogos = async () => {
    try {
      const r = await pb.collection('logomarcas').getFullList({ sort: 'empresa' })
      setLogos(r as any[])
    } catch (_) {
      setLogos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarLogos()
  }, [])

  // Sincroniza em tempo real se alguma logomarca for criada/atualizada
  useRealtime('logomarcas', () => {
    carregarLogos()
  })

  const contextValue = useMemo<EmpresaLogosContextType>(() => {
    const obterUrlImagem = (nomeEmpresa: string): string | null => {
      if (!nomeEmpresa) return null
      const n = norm(nomeEmpresa)
      let logoRec = logos.find((l) => norm(l.empresa) === n)
      if (!logoRec) {
        logoRec = logos.find((l) => {
          const lNorm = norm(l.empresa)
          return lNorm && (n.includes(lNorm) || lNorm.includes(n))
        })
      }
      if (!logoRec) return null

      const getUrl = (campo: 'emblema' | 'logo') => {
        const val = logoRec[campo]
        if (!val) return ''
        const ext = String(val).split('?')[0].split('.').pop()?.toLowerCase() || ''
        const ehImagem = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)
        if (!ehImagem) return ''
        return pb.files.getURL(logoRec, val)
      }

      const urlEmb = getUrl('emblema')
      if (urlEmb) return urlEmb
      const urlLogo = getUrl('logo')
      if (urlLogo) return urlLogo
      return null
    }

    const obterSiglaCor = (nomeEmpresa: string) => {
      const n = norm(nomeEmpresa)
      let logoRec = logos.find((l) => norm(l.empresa) === n)
      if (!logoRec) {
        logoRec = logos.find((l) => {
          const lNorm = norm(l.empresa)
          return lNorm && (n.includes(lNorm) || lNorm.includes(n))
        })
      }

      let empRec = empresas.find((e) => norm(e.nome) === n)
      if (!empRec) {
        empRec = empresas.find((e) => {
          const eNorm = norm(e.nome)
          return eNorm && (n.includes(eNorm) || eNorm.includes(n))
        })
      }

      const cor = logoRec?.cor && logoRec.cor !== '#FFFFFF' ? logoRec.cor : empRec?.cor || '#1B5E20'
      const sigla =
        logoRec?.sigla ||
        (empRec
          ? empRec.nome.slice(0, 2).toUpperCase()
          : (nomeEmpresa || 'EM').slice(0, 2).toUpperCase())

      return { sigla, cor }
    }

    const obterIconeEmpresa = (nomeEmpresa: string, className = 'h-4 w-4') => {
      if (!nomeEmpresa) return null
      const imgUrl = obterUrlImagem(nomeEmpresa)
      if (imgUrl) {
        return (
          <img
            src={imgUrl}
            alt={nomeEmpresa}
            className={cn('object-contain rounded-xs shrink-0', className)}
          />
        )
      }

      const { sigla, cor } = obterSiglaCor(nomeEmpresa)
      return (
        <span
          className={cn(
            'rounded-xs text-[8px] font-bold text-white flex items-center justify-center shrink-0 uppercase select-none',
            className,
          )}
          style={{ backgroundColor: cor }}
          title={nomeEmpresa}
        >
          {sigla.slice(0, 3)}
        </span>
      )
    }

    return {
      logos,
      loading,
      obterIconeEmpresa,
      obterUrlImagem,
      obterSiglaCor,
    }
  }, [logos, loading, empresas])

  return (
    <EmpresaLogosContext.Provider value={contextValue}>{children}</EmpresaLogosContext.Provider>
  )
}

export function useEmpresaLogos() {
  const context = useContext(EmpresaLogosContext)
  if (!context) {
    // Fallback gracioso caso chamado fora do Provider
    return {
      logos: [],
      loading: false,
      obterIconeEmpresa: (nomeEmpresa: string, className = 'h-4 w-4') => {
        if (!nomeEmpresa) return null
        return (
          <span
            className={cn(
              'rounded-xs text-[8px] font-bold text-white bg-[#1B5E20] flex items-center justify-center shrink-0 uppercase select-none',
              className,
            )}
          >
            {nomeEmpresa.slice(0, 2).toUpperCase()}
          </span>
        )
      },
      obterUrlImagem: () => null,
      obterSiglaCor: (nomeEmpresa: string) => ({
        sigla: (nomeEmpresa || 'EM').slice(0, 2).toUpperCase(),
        cor: '#1B5E20',
      }),
    }
  }
  return context
}

export type EmpresaIconSize = 'xs' | 'sm' | 'md' | 'lg' | string

export interface EmpresaIconProps {
  nome?: string | null
  empresa?: string | null
  size?: EmpresaIconSize
  className?: string
  mostrarNome?: boolean
  nomeClassName?: string
}

const SIZE_MAP: Record<string, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export function EmpresaIcon({
  nome: nomeProp,
  empresa,
  size,
  className,
  mostrarNome = false,
  nomeClassName,
}: EmpresaIconProps) {
  const { obterIconeEmpresa } = useEmpresaLogos()
  const nomeFinal = nomeProp || empresa || ''
  if (!nomeFinal) return null

  const sizeClass = size && SIZE_MAP[size] ? SIZE_MAP[size] : size || ''
  const finalClass = cn(sizeClass || 'h-4 w-4', className)

  const icone = obterIconeEmpresa(nomeFinal, finalClass)

  if (!mostrarNome) {
    return <>{icone}</>
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {icone}
      <span className={cn('truncate', nomeClassName)}>{nomeFinal}</span>
    </span>
  )
}
