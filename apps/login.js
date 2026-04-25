import TaJiDuoRequest from '../model/tajiduoReq.js'
import Server from '../components/Server.js'
import {
  addOrUpdateAccount,
  CAPTCHA_KEY,
  getUserAccounts,
  removeAccount,
  saveUserAccounts,
  switchAccount
} from '../model/tajiduoUser.js'
import {
  getMessage,
  getPlatformId,
  getPlatformUserId,
  maskToken,
  PREFIX,
  summarizeApiError,
  trimMsg
} from '../utils/common.js'

function getPhone(text = '') {
  return String(text).match(/1\d{10}/)?.[0] || ''
}

function getCaptcha(text = '') {
  const withoutPhone = String(text).replace(/1\d{10}/g, '')
  return withoutPhone.match(/\b\d{4,8}\b/)?.[0] || ''
}

function displayName(account = {}) {
  return account.nickname || account.username || account.tjd_uid || account.tgd_uid || maskToken(account.framework_token)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class login extends plugin {
  constructor() {
    super({
      name: '[TaJiDuo-plugin]登录',
      dsc: '塔吉多账号登录管理',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${PREFIX.tajiduo}(验证码|发送验证码|手机登录|手机绑定)(?:\\s+.*)?$`,
          fnc: 'sendCaptcha'
        },
        {
          reg: `^${PREFIX.tajiduo}(登录|登陆|绑定)(?:\\s+.*)?$`,
          fnc: 'login'
        },
        {
          reg: `^${PREFIX.tajiduo}(账号|登录|登陆|绑定)列表$`,
          fnc: 'accountList'
        },
        {
          reg: `^${PREFIX.tajiduo}切换(账号|登录|登陆|绑定)\\s*(\\d+)$`,
          fnc: 'switchAccount'
        },
        {
          reg: `^${PREFIX.tajiduo}删除(账号|登录|登陆|绑定)\\s*(\\d+)$`,
          fnc: 'deleteAccount'
        },
        {
          reg: `^${PREFIX.tajiduo}刷新(?:账号|登录|登陆|绑定)?$`,
          fnc: 'refreshAccount'
        }
      ]
    })
  }

  async sendCaptcha() {
    const text = trimMsg(this.e)
    const phone = getPhone(text)
    if (!phone) {
      await this.reply(getMessage('login.captcha_usage'))
      return true
    }

    const req = new TaJiDuoRequest()
    const res = await req.getData('captcha_send', { phone })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const deviceId = res.data?.deviceId || ''
    await redis.set(CAPTCHA_KEY(this.e.user_id), JSON.stringify({ phone, deviceId, time: Date.now() }), { EX: 600 })
    await this.reply(getMessage('login.captcha_sent', { phone, deviceId }))
    return true
  }

  async login() {
    const text = trimMsg(this.e)
    const phoneFromMsg = getPhone(text)
    const captcha = getCaptcha(text)
    if (!captcha) {
      return this.webLogin()
    }

    let pending = {}
    try {
      const raw = await redis.get(CAPTCHA_KEY(this.e.user_id))
      pending = raw ? JSON.parse(raw) : {}
    } catch (error) {
      pending = {}
    }

    const phone = phoneFromMsg || pending.phone
    const deviceId = pending.deviceId || ''
    if (!phone) {
      await this.reply(getMessage('login.pending_missing'))
      return true
    }

    const req = new TaJiDuoRequest()
    const res = await req.getData('session', {
      phone,
      captcha,
      deviceId,
      e: this.e,
      platformId: getPlatformId(this.e),
      platformUserId: getPlatformUserId(this.e)
    })

    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data || {}
    const account = {
      framework_token: data.fwt,
      fwt: data.fwt,
      username: data.username,
      nickname: data.username,
      tjd_uid: data.tjdUid,
      tgd_uid: data.tgdUid,
      device_id: data.deviceId || deviceId,
      platform_id: data.platformId || getPlatformId(this.e),
      platform_user_id: data.platformUserId || getPlatformUserId(this.e),
      is_primary: true,
      bind_time: Date.now()
    }
    await addOrUpdateAccount(this.e.user_id, account)
    await redis.del(CAPTCHA_KEY(this.e.user_id))

    await this.reply(getMessage('login.login_success', {
      name: displayName(account),
      uid: account.tjd_uid || account.tgd_uid || '未知'
    }))
    return true
  }

  async webLogin() {
    const cfg = Server.getConfig()
    if (!cfg.enabled) {
      await this.reply(getMessage('login.web_disabled'))
      return true
    }

    const platformId = getPlatformId(this.e)
    const platformUserId = getPlatformUserId(this.e)
    const { id, url } = Server.createSession(this.e, platformId, platformUserId)

    await this.reply(getMessage('login.web_link', {
      url,
      userId: platformUserId
    }))

    const timeout = Date.now() + 10 * 60 * 1000
    while (Date.now() < timeout) {
      const session = Server.data[id]
      if (!session) return true
      if (session.account) {
        await addOrUpdateAccount(this.e.user_id, session.account)
        Server.consume(id)
        await this.reply(getMessage('login.login_success', {
          name: displayName(session.account),
          uid: session.account.tjd_uid || session.account.tgd_uid || '未知'
        }))
        return true
      }
      await sleep(1000)
    }

    Server.consume(id)
    await this.reply(getMessage('login.web_timeout'), true)
    return true
  }

  async accountList() {
    const accounts = await getUserAccounts(this.e.user_id)
    if (accounts.length === 0) {
      await this.reply(getMessage('login.account_empty'))
      return true
    }

    const lines = [getMessage('login.account_title')]
    accounts.forEach((account, index) => {
      lines.push(getMessage('login.account_line', {
        index: index + 1,
        mark: account.is_primary ? '当前 ' : '',
        name: displayName(account),
        uid: account.tjd_uid || account.tgd_uid || '未知',
        token: maskToken(account.framework_token)
      }))
    })
    await this.reply(lines.join('\n'))
    return true
  }

  async switchAccount() {
    const index = trimMsg(this.e).match(/(\d+)$/)?.[1]
    const account = await switchAccount(this.e.user_id, index)
    if (!account) {
      await this.reply(getMessage('login.account_missing', { index }))
      return true
    }

    const req = new TaJiDuoRequest(account.framework_token)
    await req.getData('account_primary')
    await this.reply(getMessage('login.account_switched', { index, name: displayName(account) }))
    return true
  }

  async deleteAccount() {
    const index = trimMsg(this.e).match(/(\d+)$/)?.[1]
    const accounts = await getUserAccounts(this.e.user_id)
    const account = accounts[Number(index) - 1]
    if (!account) {
      await this.reply(getMessage('login.account_missing', { index }))
      return true
    }

    const req = new TaJiDuoRequest(account.framework_token)
    const res = await req.getData('account_delete', { fwt: account.framework_token })
    const code = Number(res?.code)
    if (res && code !== 0 && code !== 401) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }
    const removed = await removeAccount(this.e.user_id, index)
    await this.reply(getMessage('login.account_removed', { index, name: displayName(removed) }))
    return true
  }

  async refreshAccount() {
    const accounts = await getUserAccounts(this.e.user_id)
    const account = accounts.find((item) => item.is_primary) || accounts[0]
    if (!account) {
      await this.reply(getMessage('login.account_empty'))
      return true
    }

    const req = new TaJiDuoRequest(account.framework_token)
    const res = await req.getData('refresh')
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data || {}
    const next = accounts.map((item) => item.framework_token === account.framework_token
      ? {
          ...item,
          framework_token: data.fwt || item.framework_token,
          fwt: data.fwt || item.framework_token,
          tgd_uid: data.tgdUid || item.tgd_uid,
          device_id: data.deviceId || item.device_id,
          platform_id: data.platformId || item.platform_id,
          platform_user_id: data.platformUserId || item.platform_user_id,
          last_refresh_at: data.lastRefreshAt || data.updatedAt || Date.now(),
          last_sync: Date.now()
        }
      : item)
    await saveUserAccounts(this.e.user_id, next)
    await this.reply(getMessage('login.refresh_ok', { name: displayName(account) }))
    return true
  }
}
