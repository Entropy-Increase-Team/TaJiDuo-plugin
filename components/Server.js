import express from 'express'
import fs from 'node:fs/promises'
import setting from '../utils/setting.js'
import TaJiDuoRequest from '../model/tajiduoReq.js'

const PLUGIN_ROOT = `${process.cwd().replace(/\\/g, '/')}/plugins/TaJiDuo-plugin`

function ok(data = {}, msg = 'ok') {
  return { code: 200, msg, data }
}

function fail(msg = '请求失败', code = 400) {
  return { code, msg }
}

function createAccount(data = {}, fallback = {}) {
  return {
    framework_token: data.fwt,
    fwt: data.fwt,
    username: data.username,
    nickname: data.username,
    tjd_uid: data.tjdUid,
    tgd_uid: data.tgdUid,
    device_id: data.deviceId || fallback.deviceId || '',
    platform_id: data.platformId || fallback.platformId || '',
    platform_user_id: data.platformUserId || fallback.platformUserId || '',
    is_primary: true,
    bind_time: Date.now()
  }
}

class TaJiDuoLoginServer {
  constructor() {
    this.app = express()
    this.data = {}
    this.server = null
    this.port = null
    this.init()
  }

  async init() {
    this.app.use(express.json())

    this.app.get('/login/:id', async (req, res) => {
      const { id } = req.params
      const session = this.data[id]
      const filePath = session ? 'login.html' : 'error.html'

      try {
        let html = await fs.readFile(`${PLUGIN_ROOT}/resources/server/${filePath}`, 'utf8')
        if (session) {
          html = html
            .replaceAll('__USER_ID__', String(session.platformUserId || session.userId || ''))
            .replaceAll('__BOT_ID__', String(session.platformId || ''))
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.send(html)
      } catch (error) {
        logger.error(`[TaJiDuo-plugin][网页登录]发送登录页失败：${error?.message || error}`)
        res.status(500).send('Internal Server Error')
      }
    })

    this.app.post('/captcha/:id', async (req, res) => {
      const { id } = req.params
      const session = this.data[id]
      if (!session) return res.status(200).json(fail('登录链接不存在或已过期'))

      const phone = String(req.body?.phone || '').trim()
      if (!/^1\d{10}$/.test(phone)) return res.status(200).json(fail('请输入正确的手机号'))

      const api = new TaJiDuoRequest('', { log: false })
      const result = await api.getData('captcha_send', { phone })
      if (!result || Number(result.code) !== 0) {
        return res.status(200).json(fail(result?.message || '验证码发送失败'))
      }

      session.phone = phone
      session.deviceId = result.data?.deviceId || ''
      session.updatedAt = Date.now()
      return res.status(200).json(ok({ deviceId: session.deviceId }, '验证码已发送'))
    })

    this.app.post('/session/:id', async (req, res) => {
      const { id } = req.params
      const session = this.data[id]
      if (!session) return res.status(200).json(fail('登录链接不存在或已过期'))

      const phone = String(req.body?.phone || session.phone || '').trim()
      const captcha = String(req.body?.captcha || '').trim()
      if (!/^1\d{10}$/.test(phone)) return res.status(200).json(fail('请输入正确的手机号'))
      if (!/^\d{4,8}$/.test(captcha)) return res.status(200).json(fail('请输入正确的验证码'))

      const api = new TaJiDuoRequest('', { log: false })
      const result = await api.getData('session', {
        phone,
        captcha,
        deviceId: session.deviceId || '',
        platformId: session.platformId,
        platformUserId: session.platformUserId
      })

      if (!result || Number(result.code) !== 0) {
        return res.status(200).json(fail(result?.message || '登录失败'))
      }

      session.account = createAccount(result.data || {}, {
        deviceId: session.deviceId,
        platformId: session.platformId,
        platformUserId: session.platformUserId
      })
      session.updatedAt = Date.now()
      return res.status(200).json(ok({
        username: session.account.username,
        tjdUid: session.account.tjd_uid
      }, '登录成功'))
    })

    this.app.use((req, res) => {
      res.redirect('https://tajiduo.shallow.ink')
    })

    await this.checkServer()
    setInterval(() => {
      this.checkServer()
    }, 5000)
  }

  getConfig() {
    const common = setting.getConfig('common') || {}
    const cfg = common.login_server || {}
    return {
      enabled: cfg.enabled !== false,
      port: Number(cfg.port || 25188),
      publicLink: String(cfg.public_link || `http://127.0.0.1:${Number(cfg.port || 25188)}`).replace(/\/+$/, '')
    }
  }

  async checkServer() {
    const cfg = this.getConfig()
    if (cfg.enabled && (!this.server || this.port !== cfg.port)) {
      if (this.server) await this.closeServer()
      this.port = cfg.port
      this.server = this.app.listen(cfg.port, () => {
        logger.mark(`[TaJiDuo-plugin][网页登录]已开启 HTTP 登录服务器，本地端口 ${cfg.port}`)
      })
      this.server.on('error', (error) => {
        logger.error(`[TaJiDuo-plugin][网页登录]HTTP 服务启动失败：${error?.message || error}`)
        this.server = null
        this.port = null
      })
    }

    if (!cfg.enabled && this.server) {
      await this.closeServer()
      logger.mark('[TaJiDuo-plugin][网页登录]已关闭 HTTP 登录服务器')
    }
  }

  closeServer() {
    return new Promise((resolve) => {
      this.server.close((error) => {
        if (error) logger.error(`[TaJiDuo-plugin][网页登录]关闭服务器失败：${error?.message || error}`)
        this.server = null
        this.port = null
        resolve()
      })
    })
  }

  createSession(e, platformId, platformUserId) {
    const id = Math.random().toString(36).slice(2, 12)
    const cfg = this.getConfig()
    this.data[id] = {
      id,
      userId: String(e?.user_id || ''),
      platformId: String(platformId || ''),
      platformUserId: String(platformUserId || ''),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    return {
      id,
      url: `${cfg.publicLink}/login/${id}`
    }
  }

  consume(id) {
    const data = this.data[id]
    delete this.data[id]
    return data
  }
}

export default new TaJiDuoLoginServer()
