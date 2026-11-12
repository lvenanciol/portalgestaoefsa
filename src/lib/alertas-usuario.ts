// Filtro "ligado ao usuário logado" para o sino de notificações e para a
// tela default (Próximos Compromissos / Alertas Críticos): um item só aparece
// se o usuário for responsável, participante ou estiver mencionado nele.
// FAIL-CLOSED: sem vínculo nenhum, o item NÃO aparece (exceto Admin).

export interface UsuarioRef {
  id?: string
  name?: string
  email?: string
  grupoNome?: string
}

const norm = (s: unknown) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Chaves de identidade do usuário: nome completo, primeiro nome e e-mail. */
export function chavesUsuario(user: UsuarioRef | null | undefined): string[] {
  if (!user) return []
  const nome = norm(user.name)
  const primeiro = nome.split(' ').filter(Boolean)[0] || ''
  const email = norm(user.email)
  return [...new Set([nome, primeiro, email].filter((k) => k && k.length > 2))]
}

/** True se o texto menciona qualquer chave do usuário (nome, e-mail...). */
export function textoMencionaUsuario(texto: unknown, chaves: string[]): boolean {
  if (!chaves.length) return false
  const t = norm(texto)
  if (!t) return false
  return chaves.some((k) => t.includes(k))
}

/** Admin vê tudo (o que já vem filtrado pelas API rules do PocketBase). */
export function ehAdmin(user: UsuarioRef | null | undefined): boolean {
  return norm(user?.grupoNome) === 'admin'
}

/**
 * Alerta é do usuário se qualquer campo textual citar o usuário
 * (responsável, mencionado no título/descrição/empresa...).
 */
export function alertaDoUsuario(
  alert: Record<string, unknown> | null | undefined,
  user: UsuarioRef | null | undefined,
): boolean {
  if (!alert) return false
  if (ehAdmin(user)) return true
  const chaves = chavesUsuario(user)
  if (!chaves.length) return false
  const campos = [
    alert.title,
    alert.description,
    alert.detail,
    alert.empresa,
    alert.responsavel,
    alert.responsavel_nome,
    alert.participantes,
    alert.mencionados,
  ]
  return campos.some((c) => textoMencionaUsuario(c, chaves))
}

/**
 * Tarefa/registro é do usuário se campos de responsabilidade apontam para ele
 * (por id, e-mail, nome) ou se o texto o menciona.
 */
export function tarefaDoUsuario(
  item: Record<string, any>,
  user: UsuarioRef | null | undefined,
): boolean {
  if (!item || !user) return false
  if (ehAdmin(user)) return true
  const uid = String(user.id || '')
  const email = norm(user.email)
  const chaves = chavesUsuario(user)

  const camposResp = [item.responsavel_id, item.responsavel, item.usuario_id]
  if (uid && camposResp.some((c) => String(c || '') === uid)) return true

  const camposEmail = [
    item.responsavel_email,
    item.usuario_email,
    item.email_responsavel,
    item.criado_por,
  ]
  if (email && camposEmail.some((c) => norm(c) === email)) return true

  // relation multi (responsaveis_ids) e JSON/array: array de ids (ou objetos)
  const multis = [item.responsaveis, item.responsaveis_ids, item.participantes, item.mencionados]
  for (const m of multis) {
    if (Array.isArray(m)) {
      for (const v of m) {
        const id = typeof v === 'object' && v ? String((v as any).id || '') : String(v || '')
        if (uid && id === uid) return true
      }
    }
  }

  const texto = [
    item.titulo,
    item.nome,
    item.descricao,
    item.observacoes,
    item.responsavel_nome,
    item.responsavel,
    item.comentarios,
  ]
  return texto.some((c) => textoMencionaUsuario(c, chaves))
}

/** Versão exportada de norm — serviços precisam comparar e-mails/nomes. */
export const normalizarTexto = norm

/** Compat: wrapper com o nome usado em rodadas anteriores. */
export const alertaDoUsuarioLogado = alertaDoUsuario
export const tarefaDoUsuarioLogado = tarefaDoUsuario
