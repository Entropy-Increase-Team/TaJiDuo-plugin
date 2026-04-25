import TaJiDuoRequest from './tajiduoReq.js'

const ALLOWED_ACCOUNT_KEYS = [
  'framework_token', 'fwt', 'tjd_uid', 'tgd_uid', 'username', 'nickname', 'avatar',
  'introduce', 'device_id', 'platform_id', 'platform_user_id', 'is_primary',
  'is_active', 'bind_time', 'created_at', 'updated_at', 'last_sync', 'last_refresh_at'
]

export const REDIS_KEY = (userId) => `TJD:USER:${userId}`
export const CAPTCHA_KEY = (userId) => `TJD:CAPTCHA:${userId}`

function normalizeAccount(account = {}) {
  if (!account || typeof account !== 'object') return null
  const fwt = account.framework_token || account.fwt
  if (!fwt) return null

  const out = {
    framework_token: String(fwt),
    fwt: String(fwt),
    is_active: account.is_active !== false,
    is_primary: account.is_primary === true
  }

  const map = {
    tjdUid: 'tjd_uid',
    tgdUid: 'tgd_uid',
    deviceId: 'device_id',
    platformId: 'platform_id',
    platformUserId: 'platform_user_id',
    isPrimary: 'is_primary',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    lastRefreshAt: 'last_refresh_at'
  }

  for (const [from, to] of Object.entries(map)) {
    if (account[from] !== undefined && out[to] === undefined) out[to] = account[from]
  }

  for (const key of ALLOWED_ACCOUNT_KEYS) {
    const value = account[key]
    if (value !== undefined && value !== null) out[key] = value
  }

  out.framework_token = String(out.framework_token || out.fwt)
  out.fwt = out.framework_token
  if (!out.bind_time) out.bind_time = Date.now()
  out.last_sync = Date.now()
  return out
}

function getAccountKey(account = {}) {
  const platformId = String(account.platform_id || '')
  const platformUserId = String(account.platform_user_id || '')
  const tgdUid = String(account.tgd_uid || '')
  if (platformId && platformUserId && tgdUid) return `${platformId}:${platformUserId}:${tgdUid}`
  if (tgdUid) return `tgd:${tgdUid}`
  return `fwt:${account.framework_token}`
}

function normalizeAccounts(accounts = []) {
  const input = Array.isArray(accounts) ? accounts : [accounts]
  const byAccount = new Map()
  for (const item of input) {
    const acc = normalizeAccount(item)
    if (!acc || acc.is_active === false) continue
    const key = getAccountKey(acc)
    const old = byAccount.get(key)
    byAccount.set(key, { ...(old || {}), ...acc })
  }
  const list = Array.from(byAccount.values())
  const primaryIndex = list.findIndex((acc) => acc.is_primary)
  const activePrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0
  return list.map((acc, index) => ({ ...acc, is_primary: index === activePrimaryIndex }))
}

export async function getUserAccounts(userId) {
  const text = await redis.get(REDIS_KEY(userId))
  if (!text) return []
  try {
    return normalizeAccounts(JSON.parse(text))
  } catch (error) {
    logger.error(`[TaJiDuo-plugin] 解析用户账号失败：${error}`)
    return []
  }
}

export async function saveUserAccounts(userId, accounts) {
  const list = normalizeAccounts(accounts)
  if (list.length === 0) {
    await redis.del(REDIS_KEY(userId))
    return []
  }
  await redis.set(REDIS_KEY(userId), JSON.stringify(list))
  return list
}

export async function addOrUpdateAccount(userId, account) {
  const current = await getUserAccounts(userId)
  const next = current.map((item) => ({ ...item, is_primary: false }))
  const normalized = normalizeAccount({ ...account, is_primary: true })
  const index = next.findIndex((item) => item.framework_token === normalized.framework_token)
  if (index >= 0) next[index] = { ...next[index], ...normalized }
  else next.push(normalized)
  return saveUserAccounts(userId, next)
}

export async function switchAccount(userId, index) {
  const accounts = await getUserAccounts(userId)
  const targetIndex = Number(index) - 1
  if (!accounts[targetIndex]) return null
  const next = accounts.map((item, i) => ({ ...item, is_primary: i === targetIndex }))
  await saveUserAccounts(userId, next)
  return next[targetIndex]
}

export async function removeAccount(userId, index) {
  const accounts = await getUserAccounts(userId)
  const targetIndex = Number(index) - 1
  if (!accounts[targetIndex]) return null
  const removed = accounts[targetIndex]
  const next = accounts.filter((_, i) => i !== targetIndex)
  await saveUserAccounts(userId, next)
  return removed
}

export default class TaJiDuoUser {
  constructor(userId, option = {}) {
    this.userId = userId
    this.frameworkToken = ''
    this.account = null
    this.tjdUid = ''
    this.tgdUid = ''
    this.nickname = ''
    this.tjdReq = null
    this.option = {
      log: true,
      ...option
    }
  }

  async getUser() {
    const accounts = await getUserAccounts(this.userId)
    if (accounts.length === 0) return false
    const account = accounts.find((item) => item.is_primary) || accounts[0]
    this.account = account
    this.frameworkToken = account.framework_token
    this.tjdUid = String(account.tjd_uid || account.tgd_uid || '')
    this.tgdUid = String(account.tgd_uid || '')
    this.nickname = account.nickname || account.username || ''
    this.tjdReq = new TaJiDuoRequest(this.frameworkToken, this.option)
    return true
  }

  static async getAllUsers(userId, option = {}) {
    const accounts = await getUserAccounts(userId)
    return accounts.map((account) => {
      const user = new TaJiDuoUser(userId, option)
      user.account = account
      user.frameworkToken = account.framework_token
      user.tjdUid = String(account.tjd_uid || account.tgd_uid || '')
      user.tgdUid = String(account.tgd_uid || '')
      user.nickname = account.nickname || account.username || ''
      user.tjdReq = new TaJiDuoRequest(user.frameworkToken, option)
      return user
    })
  }
}
