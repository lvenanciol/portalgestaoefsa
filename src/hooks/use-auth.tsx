import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { useNavigate } from 'react-router-dom'

// Fase 3 — Autenticação Skip Cloud: login/logout, timeout de inatividade
// configurável (padrão 30 min) e registro de auditoria via /backend/v1.

const INATIVIDADE_PADRAO_MIN = 30

interface AuthContextType {
  user: any
  isAuthenticated: boolean
  loading: boolean
  timeoutMin: number
  setTimeoutMin: (min: number) => void
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: (motivo?: 'manual' | 'inatividade') => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

const AUDIT_KEY = 'pge_audit_logado'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(pb.authStore.isValid ? pb.authStore.record : null)
  const [isAuthenticated, setIsAuthenticated] = useState(pb.authStore.isValid)
  const [loading, setLoading] = useState(true)
  const [timeoutMin, setTimeoutMinState] = useState<number>(() => {
    const v = localStorage.getItem('pge_timeout_min')
    return v ? parseInt(v, 10) || INATIVIDADE_PADRAO_MIN : INATIVIDADE_PADRAO_MIN
  })
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(pb.authStore.isValid ? record : null)
      setIsAuthenticated(pb.authStore.isValid)
    })
    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .catch(() => pb.authStore.clear())
        .finally(() => setLoading(false))
    } else {
      if (pb.authStore.record) pb.authStore.clear()
      setLoading(false)
    }
    return () => {
      unsubscribe()
    }
  }, [])

  const registrarAuditoria = useCallback((acao: string) => {
    try {
      pb.send('/backend/v1/auditoria', {
        method: 'POST',
        body: JSON.stringify({ acao }),
      })
    } catch (_) {}
  }, [])

  const signOut = useCallback(
    (motivo: 'manual' | 'inatividade' = 'manual') => {
      registrarAuditoria(motivo === 'inatividade' ? 'logout_inatividade' : 'logout')
      pb.authStore.clear()
      localStorage.removeItem(AUDIT_KEY)
      navigate('/login', { replace: true })
    },
    [registrarAuditoria, navigate],
  )
  useEffect(() => {
    if (!isAuthenticated) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => signOut('inatividade'), timeoutMin * 60 * 1000)
    }
    const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    eventos.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      eventos.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [isAuthenticated, timeoutMin, signOut])

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password)
      localStorage.setItem(AUDIT_KEY, '1')
      registrarAuditoria('login')
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const setTimeoutMin = (min: number) => {
    setTimeoutMinState(min)
    localStorage.setItem('pge_timeout_min', String(min))
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, loading, timeoutMin, setTimeoutMin, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
