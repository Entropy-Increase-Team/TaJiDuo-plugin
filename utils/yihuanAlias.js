const ALIAS_KEY = 'TJD:YIHUAN:CHAR_ALIAS'

function cleanName(text = '') {
  return String(text || '').replace(/\s+/g, '').trim()
}

async function loadAliasData() {
  if (!global.redis) return {}
  try {
    const raw = await redis.get(ALIAS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (error) {
    logger.error(`[TaJiDuo-plugin][异环别名]读取失败：${error?.message || error}`)
    return {}
  }
}

async function saveAliasData(data = {}) {
  if (!global.redis) return false
  await redis.set(ALIAS_KEY, JSON.stringify(data))
  return true
}

export async function resolveYihuanAlias(name = '') {
  const query = cleanName(name)
  if (!query) return ''
  const data = await loadAliasData()
  for (const [charName, aliases] of Object.entries(data)) {
    if (query === charName || query.includes(charName)) return charName
    if ((aliases || []).some((alias) => query === alias || query.includes(alias))) return charName
  }
  return query
}

export async function listYihuanAliases(name = '') {
  const query = cleanName(name)
  const data = await loadAliasData()
  const charName = await resolveYihuanAlias(query)
  return {
    charName,
    aliases: data[charName] || []
  }
}

export async function addYihuanAlias(charName = '', alias = '') {
  const name = cleanName(charName)
  const nextAlias = cleanName(alias)
  if (!name || !nextAlias) return { ok: false, message: '角色名和别名不能为空' }

  const data = await loadAliasData()
  for (const [owner, aliases] of Object.entries(data)) {
    if (owner === nextAlias || (aliases || []).includes(nextAlias)) {
      return { ok: false, message: `别名「${nextAlias}」已被「${owner}」使用` }
    }
  }

  const list = new Set(data[name] || [])
  list.add(nextAlias)
  data[name] = [...list]
  await saveAliasData(data)
  return { ok: true, message: `已添加「${name}」别名：${nextAlias}` }
}

export async function removeYihuanAlias(charName = '', alias = '') {
  const name = await resolveYihuanAlias(charName)
  const target = cleanName(alias)
  if (!name || !target) return { ok: false, message: '角色名和别名不能为空' }

  const data = await loadAliasData()
  const list = data[name] || []
  if (!list.includes(target)) return { ok: false, message: `「${target}」不是「${name}」的自定义别名` }
  data[name] = list.filter((item) => item !== target)
  if (data[name].length === 0) delete data[name]
  await saveAliasData(data)
  return { ok: true, message: `已删除「${name}」别名：${target}` }
}
