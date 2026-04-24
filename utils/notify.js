function normalizeIdList (items = []) {
  return [...new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )]
}

function normalizeNotifyList (notifyList = {}, fallbackNotifyList = null) {
  const nextList = {
    friend: normalizeIdList(notifyList?.friend),
    group: normalizeIdList(notifyList?.group)
  }

  if (!fallbackNotifyList) {
    return nextList
  }

  const fallbackList = {
    friend: normalizeIdList(fallbackNotifyList?.friend),
    group: normalizeIdList(fallbackNotifyList?.group)
  }

  return {
    friend: nextList.friend.length > 0 ? nextList.friend : fallbackList.friend,
    group: nextList.group.length > 0 ? nextList.group : fallbackList.group
  }
}

function describeStoredSessionTarget (item = {}) {
  const parts = []

  if (item?.session?.username) {
    parts.push(`昵称=${item.session.username}`)
  }

  if (item?.session?.tgdUid) {
    parts.push(`塔吉多UID=${item.session.tgdUid}`)
  }

  if (item?.userId !== undefined) {
    parts.push(`用户=${item.userId}`)
  }

  return parts.join(' | ') || '未命名账号'
}

function buildNotifyForwardNodes (messages = [], title = '') {
  const items = (Array.isArray(messages) ? messages : [messages])
    .map((message) => typeof message === 'string' ? message.trim() : message)
    .filter(Boolean)
  const nodes = []

  if (title) {
    nodes.push({ message: title })
  }

  return [
    ...nodes,
    ...items.map((message) => ({ message }))
  ]
}

async function sendNotifyTarget (target, messages = [], options = {}) {
  const {
    useForward = false,
    forwardTitle = ''
  } = options
  const items = (Array.isArray(messages) ? messages : [messages])
    .map((message) => typeof message === 'string' ? message.trim() : message)
    .filter(Boolean)

  if (items.length === 0) {
    return
  }

  if (useForward) {
    const nodes = buildNotifyForwardNodes(items, forwardTitle)
    if (target?.sendForwardMsg) {
      await target.sendForwardMsg(nodes)
      return
    }

    if (target?.sendMsg) {
      await target.sendMsg(await Bot.makeForwardMsg(nodes))
      return
    }
  }

  if (target?.sendMsg) {
    await target.sendMsg(items.join('\n\n'))
  }
}

async function sendNotifyList (notifyList = {}, messages = [], options = {}) {
  const items = Array.isArray(messages) ? messages : [messages]
  if (items.every((item) => !String(item || '').trim())) {
    return
  }

  const friendIds = normalizeIdList(notifyList?.friend)
  const groupIds = normalizeIdList(notifyList?.group)
  const logLabel = String(options?.logLabel || '通知').trim() || '通知'

  for (const id of friendIds) {
    try {
      if (Bot?.pickUser) {
        await sendNotifyTarget(Bot.pickUser(id), items, options)
      } else if (Bot?.sendPrivateMsg) {
        await Bot.sendPrivateMsg(id, items.join('\n\n'))
      }
    } catch (error) {
      logger.error(`[TaJiDuo-plugin] ${logLabel}好友 ${id} 失败：${error?.message || error}`)
    }
  }

  for (const id of groupIds) {
    try {
      if (Bot?.pickGroup) {
        await sendNotifyTarget(Bot.pickGroup(id), items, options)
      }
    } catch (error) {
      logger.error(`[TaJiDuo-plugin] ${logLabel}群 ${id} 失败：${error?.message || error}`)
    }
  }
}

export {
  buildNotifyForwardNodes,
  describeStoredSessionTarget,
  normalizeIdList,
  normalizeNotifyList,
  sendNotifyList,
  sendNotifyTarget
}
