import setting from './setting.js'

const HEADER_SAFE_RE = /^[\x21-\x7E]+$/
const HEADER_UNSAFE_RE = /[^\x21-\x7E]/g
const COLON_LIKE_RE = /[\uF03A\uFF1A]/g

export const PREFIX = {
  tajiduo: '(?:[/#]?(?:塔吉多|[Tt][Jj][Dd])\\s*)',
  huanta: '(?:[/#]?(?:幻塔|[Hh][Tt])\\s*)',
  yihuan: '(?:[/#]?(?:异环|[Yy][Hh])\\s*)'
}

export const GAME = {
  huanta: {
    code: 'huanta',
    name: '幻塔',
    gameId: '1256',
    communityId: '1',
    prefix: PREFIX.huanta
  },
  yihuan: {
    code: 'yihuan',
    name: '异环',
    gameId: '1289',
    communityId: '2',
    prefix: PREFIX.yihuan
  }
}

function replacePlaceholders(message, params = {}) {
  return String(message || '').replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value !== undefined && value !== null ? String(value) : `{${key}}`
  })
}

function lookupMessage(config, path) {
  const value = path.split('.').reduce((obj, key) => obj?.[key], config)
  return typeof value === 'string' ? value : undefined
}

// Message helpers
export function getMessage(path, params = {}) {
  const message = lookupMessage(setting.getConfig('message'), path)
    || lookupMessage(setting.getdefSet?.('message'), path)
  return message ? replacePlaceholders(message, params) : `[消息未配置: ${path}]`
}

export function getUnbindMessage() {
  const common = setting.getConfig('common') || {}
  const webLoginEnabled = common.login_server?.enabled !== false
  return webLoginEnabled
    ? getMessage('unbind_web_message')
    : getMessage('unbind_phone_message')
}

// Platform IDs go into HTTP headers, so keep normal user IDs unchanged while
// fixing colon-like characters seen in official-bot IDs.
export function normalizeHeaderId(value, fallback = '') {
  const text = String(value || fallback || '').trim()
  if (!text) return ''
  const normalized = text.replace(COLON_LIKE_RE, ':')
  if (HEADER_SAFE_RE.test(normalized)) return normalized
  return normalized.replace(HEADER_UNSAFE_RE, '') || String(fallback || '')
}

export function getPlatformId(e) {
  return normalizeHeaderId(e?.self_id || Bot?.uin, 'yunzai')
}

export function getPlatformUserId(e) {
  return normalizeHeaderId(e?.user_id)
}

// Formatting helpers
export function trimMsg(e) {
  return String(e?.msg || '').trim()
}

export function maskToken(token = '') {
  const text = String(token || '')
  if (text.length <= 12) return text ? '******' : ''
  return `${text.slice(0, 6)}...${text.slice(-6)}`
}

export function compactLine(label, value) {
  const v = value === undefined || value === null || value === '' ? getMessage('common.empty') : value
  return getMessage('common.label_line', { label, text: v })
}

export function formatTime(value) {
  if (!value) return getMessage('common.empty')
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

// Game helpers
export function parseGameFromText(text = '', fallback = '') {
  const raw = String(text || '').toLowerCase()
  if (/幻塔|(^|[^a-z])ht([^a-z]|$)/i.test(text) || raw.includes('huanta')) return 'huanta'
  if (/异环|(^|[^a-z])yh([^a-z]|$)/i.test(text) || raw.includes('yihuan')) return 'yihuan'
  return fallback
}

export function getGameLabel(gameCode) {
  return GAME[gameCode]?.name || gameCode || getMessage('common.unknown')
}

// Role helpers
export function normalizeRole(role = {}) {
  return {
    roleId: String(role.roleId ?? role.role_id ?? role.id ?? ''),
    roleName: String(role.roleName ?? role.role_name ?? role.name ?? ''),
    gameId: String(role.gameId ?? role.game_id ?? ''),
    serverId: String(role.serverId ?? role.server_id ?? ''),
    serverName: String(role.serverName ?? role.server_name ?? ''),
    level: role.lev ?? role.level ?? ''
  }
}

export function pickRole(roles = [], roleId = '') {
  const target = String(roleId || '').trim()
  if (!target) return roles[0] || null
  return roles.find((role) => String(role.roleId || '') === target) || null
}

// API helpers
export function summarizeApiError(res, fallback = '请求失败') {
  if (!res) return fallback
  if (res.message) return res.message
  if (res.error) return String(res.error)
  return fallback
}
