import { clearUserSession, getUserSession } from '../model/store.js'
import { LOGIN_COMMAND_EXAMPLE } from './auth.js'

function getSessionIdentityFromEvent (e = {}) {
  return {
    selfId: e?.self_id || 'bot',
    userId: e?.user_id
  }
}

async function getStoredFwtFromEvent (e = {}) {
  const { selfId, userId } = getSessionIdentityFromEvent(e)
  const session = await getUserSession(selfId, userId)
  const fwt = String(session?.fwt || '').trim()

  if (!fwt) {
    throw new Error(`请先发送 ${LOGIN_COMMAND_EXAMPLE} 完成登录`)
  }

  return fwt
}

async function clearStoredSessionFromEvent (e = {}) {
  const { selfId, userId } = getSessionIdentityFromEvent(e)
  await clearUserSession(selfId, userId)
}

export {
  clearStoredSessionFromEvent,
  getSessionIdentityFromEvent,
  getStoredFwtFromEvent
}
