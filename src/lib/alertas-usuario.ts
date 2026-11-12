// Vínculo usuário ↔ tarefa (fonte única de verdade p/ sino, filtro "Minhas",
// /inicio e demais filtros por participação).
//
// CORREÇÃO (13/11/2026): usuários com parceiro_id (ex.: "[ SUP ] Luke") não
// eram reconhecidos como responsáveis das suas tarefas — o helper só casava o
// TEXTO 'responsavel' com o nome, e a tela /tarefas só olhava 'responsaveis_ids'
// (que nasce vazio para tarefas atribuídas pela interface). Agora o casamento
// é ESTRUTURAL primeiro (users.parceiro_id ∈ tarefas.parceiros, igual ao hook
// backend tarefas_email_atribuicao.js / migração 0075) e TEXTUAL depois.

import pbClient from '@/lib/pocketbase/client'
import type { AuthRecord } from 'pocketbase'

export interface UsuarioRef {
  id: string
  email: string
  name: string
  parceiro_id?: string
  grupo?: string
}

// ---------------------------------------------------------------- normalização

export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function limparTag(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim()
}

// Chaves de um usuário/nome: primeiro nome isolado + nome limpo de tag
export function chavesUsuario(nome: string | null | undefined): string[] {
  const nomeLimpo = normalizarTexto(limparTag(nome))
  if (!nomeLimpo) return []
  const primeiro = nomeLimpo.split(' ')[0]
  const chaves = new Set<string>()
  if (primeiro && primeiro.length >= 3) chaves.add(primeiro)
  if (nomeLimpo.length >= 3) chaves.add(nomeLimpo)
  return Array.from(chaves)
}

export function textoMencionaUsuario(
  texto: string | null | undefined,
  usuario: Pick<UsuarioRef, 'name' | 'email'> | null,
): boolean {
  if (!usuario) return false
  const t = normalizarTexto(texto)
  if (!t) return false
  return chavesUsuario(usuario.name).some(
    (c) => t === c || t.includes(c) || normalizarTexto(usuario.email) === t,
  )
}

// ------------------------------------------------------------------ admin

export function ehAdmin(
  usuario: Pick<UsuarioRef, 'id' | 'grupo'> | null,
  gruposAdmin: string[] = ['Admin', 'ADM'],
): boolean {
  if (!usuario) return false
  const g = normalizarTexto((usuario as { grupo?: string; grupo_nome?: string }).grupo)
  if (g) return gruposAdmin.some((ga) => g === normalizarTexto(ga))
  const gn = (usuario as { grupo_nome?: string }).grupo_nome
  return !!gn && gruposAdmin.some((ga) => normalizarTexto(ga) === normalizarTexto(gn))
}

// ------------------------------------------------------------- parsing de campos

function parseIdsCampo(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean)
  const s = String(raw).trim()
  if (!s) return []
  try {
    const p = JSON.parse(s)
    if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean)
  } catch {
    /* string única: tratar como lista separada por vírgula */
  }
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

// Nomes gravados em 'parceiros' podem ser referências (ids) OU texto
function nomesDeParceiros(raw: unknown): string[] {
  if (!raw) return []
  const partes =
    typeof raw === 'string' && !raw.trim().startsWith('[') ? raw.split(/[,;]/) : parseIdsCampo(raw)
  return partes.map((x) => String(x).trim()).filter((x) => x && !/^[a-z0-9]{15}$/i.test(x))
}

// ------------------------------------------------------------------ vínculo

export interface TarefaVinculavel {
  id: string
  responsavel?: string | null
  parceiros?: unknown
  responsaveis_ids?: unknown
  criado_por?: string | null
}

export interface UsuarioParaVinculo extends UsuarioRef {
  parceiro_id?: string | null
}

// Um usuário tem vínculo com a tarefa quando QUALQUER critério casa:
//  1. ESTRUTURAL: parceiro_id dele ∈ tarefas.parceiros (prioritário — ids)
//  2. ESTRUTURAL: id dele ∈ tarefas.responsaveis_ids
//  3. TEXTUAL: nome (sem tag "[ .. ]", tolerante a case/espaços/acentos)
//     casa com o texto de 'responsavel' ou com nomes em 'parceiros'
//  4. AUTOR: e-mail igual a tarefas.criado_por
export function usuarioTemVinculoTarefa(
  tarefa: TarefaVinculavel | null,
  usuario: UsuarioParaVinculo | null,
): boolean {
  if (!tarefa || !usuario) return false
  const uid = String(usuario.id || '')
  if (uid && parseIdsCampo(tarefa.responsaveis_ids).includes(uid)) return true

  const idsParceiros = parseIdsCampo(tarefa.parceiros)
  const pid = String(usuario.parceiro_id || '').trim()
  if (pid && idsParceiros.includes(pid)) return true

  const chaves = chavesUsuario(usuario.name)
  const emailNorm = normalizarTexto(usuario.email)
  const resp = normalizarTexto(limparTag(tarefa.responsavel))

  const casaTexto = (texto: string | null | undefined): boolean => {
    const t = normalizarTexto(limparTag(texto))
    if (!t) return false
    if (chaves.some((c) => t === c || t.includes(c))) return true
    return !!emailNorm && t === emailNorm
  }

  if (casaTexto(tarefa.responsavel)) return true
  if (nomesDeParceiros(tarefa.parceiros).some(casaTexto)) return true

  if (resp && chaves.some((c) => resp === c || resp.includes(c))) return true
  if (emailNorm && parseIdsCampo(tarefa.criado_por).some((x) => normalizarTexto(x) === emailNorm))
    return true

  return false
}

// ------------------------------------------------------------- fachada (compat)

export interface AuthLike {
  id?: string
  email?: string
  name?: string
  parceiro_id?: string | null
}

/** Ref do usuário logado (ou null) a partir do authStore do PocketBase. */
export function usuarioRef(pbAuth: { model: AuthRecord | null } | null): UsuarioParaVinculo | null {
  const m = pbAuth?.model
  if (!m || !m.id) return null
  return {
    id: String(m.id),
    email: String((m as { email?: string }).email || ''),
    name: String((m as { name?: string }).name || ''),
    parceiro_id: String((m as { parceiro_id?: string }).parceiro_id || '') || null,
  }
}

/** Convenience: ref do usuário logado a partir do client padrão. */
export function usuarioLogadoRef(): UsuarioParaVinculo | null {
  try {
    return usuarioRef({ model: pbClient.authStore.model as AuthRecord | null })
  } catch {
    return null
  }
}

export function alertaDoUsuario(
  alerta: TarefaVinculavel | null,
  usuario: UsuarioParaVinculo | null,
): boolean {
  return usuarioTemVinculoTarefa(alerta, usuario)
}

export function tarefaDoUsuario(
  tarefa: TarefaVinculavel | null,
  usuario: UsuarioParaVinculo | null,
): boolean {
  return usuarioTemVinculoTarefa(tarefa, usuario)
}

// Compat com usos anteriores (v0.0.351) que passavam só o auth record
export function alertaDoUsuarioLogado(alerta: TarefaVinculavel | null): boolean {
  return alertaDoUsuario(alerta, usuarioLogadoRef())
}

export function tarefaDoUsuarioLogado(tarefa: TarefaVinculavel | null): boolean {
  return tarefaDoUsuario(tarefa, usuarioLogadoRef())
}
