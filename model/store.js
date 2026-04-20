const USER_SESSION_KEY_PREFIX = 'TAJIDUO:SESSION:'
const USER_SESSION_INDEX_REDIS_KEY = `${USER_SESSION_KEY_PREFIX}INDEX`
const USER_SESSION_REDIS_KEY = (selfId, userId) => `${USER_SESSION_KEY_PREFIX}${String(selfId || 'bot').trim()}:${String(userId || '').trim()}`

function normalizeSessionIdentity (payload = {}) {
  if (!payload || typeof payload !== 'object') return null

  const selfId = String(payload.selfId || '').trim()
  const userId = String(payload.userId || '').trim()

  if (!selfId || !userId) return null

  return {
    selfId,
    userId
  }
}

function encodeSessionIdentity (payload = {}) {
  const normalized = normalizeSessionIdentity(payload)
  return normalized ? JSON.stringify(normalized) : ''
}

function decodeSessionIdentity (value = '') {
  const text = String(value || '').trim()
  if (!text) return null

  try {
    return normalizeSessionIdentity(JSON.parse(text))
  } catch (error) {
    const separatorIndex = text.indexOf(':')
    if (separatorIndex <= 0 || separatorIndex >= text.length - 1) {
      return null
    }

    return normalizeSessionIdentity({
      selfId: text.slice(0, separatorIndex),
      userId: text.slice(separatorIndex + 1)
    })
  }
}

function parseSessionKey (key = '') {
  const text = String(key || '').trim()
  if (!text.startsWith(USER_SESSION_KEY_PREFIX)) return null

  const suffix = text.slice(USER_SESSION_KEY_PREFIX.length)
  if (!suffix || suffix === 'INDEX') return null

  const separatorIndex = suffix.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= suffix.length - 1) {
    return null
  }

  return normalizeSessionIdentity({
    selfId: suffix.slice(0, separatorIndex),
    userId: suffix.slice(separatorIndex + 1)
  })
}

function uniqueSessionIdentities (items = []) {
  const map = new Map()

  for (const item of items) {
    const normalized = normalizeSessionIdentity(item)
    if (!normalized) continue
    map.set(`${normalized.selfId}:${normalized.userId}`, normalized)
  }

  return [...map.values()]
}

function getSessionRedisKey (selfId, userId) {
  const key = USER_SESSION_REDIS_KEY(selfId, userId)
  if (key.endsWith(':')) {
    throw new Error('缺少用户 ID，无法读取 TaJiDuo 会话')
  }
  return key
}

function normalizeSession (payload = {}) {
  if (!payload || typeof payload !== 'object') return null

  const username = String(payload.username || '').trim()
  const tgdUid = String(payload.tjdUid || payload.tgdUid || '').trim()
  const fwt = String(payload.fwt || '').trim()

  if (!fwt) return null

  return {
    username,
    tgdUid,
    fwt
  }
}

async function getUserSession (selfId, userId) {
  const key = getSessionRedisKey(selfId, userId)
  const text = await redis.get(key)

  if (!text) return null

  try {
    return normalizeSession(JSON.parse(text))
  } catch (error) {
    logger.error('[TaJiDuo-plugin] 解析会话缓存失败', error)
    return null
  }
}

async function saveUserSession (selfId, userId, payload = {}) {
  const key = getSessionRedisKey(selfId, userId)
  const current = await getUserSession(selfId, userId)
  const next = normalizeSession({
    ...(current || {}),
    ...(payload || {})
  })

  if (!next) {
    throw new Error('会话数据不完整，无法保存')
  }

  await redis.set(key, JSON.stringify(next))
  if (typeof redis.sadd === 'function') {
    await redis.sadd(USER_SESSION_INDEX_REDIS_KEY, encodeSessionIdentity({ selfId, userId }))
  }
  return next
}

async function clearUserSession (selfId, userId) {
  const key = getSessionRedisKey(selfId, userId)
  const deleted = await redis.del(key)

  if (typeof redis.srem === 'function') {
    await redis.srem(USER_SESSION_INDEX_REDIS_KEY, encodeSessionIdentity({ selfId, userId }))
  }

  return deleted
}

async function listSessionIdentities () {
  const indexed = typeof redis.smembers === 'function'
    ? uniqueSessionIdentities((await redis.smembers(USER_SESSION_INDEX_REDIS_KEY)).map((item) => decodeSessionIdentity(item)))
    : []

  if (indexed.length > 0) {
    return indexed
  }

  if (typeof redis.keys !== 'function') {
    return []
  }

  const scanned = uniqueSessionIdentities((await redis.keys(`${USER_SESSION_KEY_PREFIX}*`)).map((key) => parseSessionKey(key)))

  if (scanned.length > 0 && typeof redis.sadd === 'function') {
    for (const identity of scanned) {
      await redis.sadd(USER_SESSION_INDEX_REDIS_KEY, encodeSessionIdentity(identity))
    }
  }

  return scanned
}

async function listUserSessions () {
  const identities = await listSessionIdentities()
  const items = []

  for (const identity of identities) {
    const session = await getUserSession(identity.selfId, identity.userId)
    if (session?.fwt) {
      items.push({
        ...identity,
        session
      })
      continue
    }

    if (typeof redis.srem === 'function') {
      await redis.srem(USER_SESSION_INDEX_REDIS_KEY, encodeSessionIdentity(identity))
    }
  }

  return items
}

export {
  clearUserSession,
  getSessionRedisKey,
  getUserSession,
  listSessionIdentities,
  listUserSessions,
  normalizeSession,
  normalizeSessionIdentity,
  saveUserSession
}
