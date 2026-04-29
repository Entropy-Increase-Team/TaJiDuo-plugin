import TaJiDuoApi from './tajiduoApi.js'
import setting from '../utils/setting.js'
import { getPlatformId, getPlatformUserId, normalizeHeaderId } from '../utils/common.js'

export default class TaJiDuoRequest {
  constructor(frameworkToken = '', option = {}) {
    this.frameworkToken = frameworkToken
    this.tajiduoApi = new TaJiDuoApi()
    this.commonConfig = setting.getConfig('common') || {}
    this.option = {
      log: true,
      ...option
    }
  }

  setFrameworkToken(frameworkToken) {
    this.frameworkToken = frameworkToken
  }

  getUrl(type, data = {}) {
    const urlMap = this.tajiduoApi.getUrlMap({ ...data })
    if (!urlMap[type]) return false

    let { url, query = '', body = undefined, method = '', auth = true, platform = false } = urlMap[type]
    if (query) url += `?${query}`
    if (body !== undefined) body = JSON.stringify(body)
    return { url, body, method, auth, platform }
  }

  getHeaders(type, data = {}, { auth = true, platform = false } = {}) {
    let headers = {
      'Content-Type': 'application/json'
    }

    if (auth !== false) {
      if (this.commonConfig.api_key) headers['X-API-Key'] = this.commonConfig.api_key
      else logger.warn(`[TaJiDuo-plugin][API][${type}] 未配置 api_key`)
    }

    if (this.frameworkToken) {
      headers['X-Framework-Token'] = this.frameworkToken
    }

    if (platform) {
      headers['X-Platform-Id'] = normalizeHeaderId(data.platformId || getPlatformId(data.e), 'yunzai')
      headers['X-Platform-User-Id'] = normalizeHeaderId(data.platformUserId || getPlatformUserId(data.e))
    }

    if (data.headers) {
      headers = { ...headers, ...data.headers }
    }

    return headers
  }

  async getData(type, data = {}) {
    const urlData = this.getUrl(type, data)
    if (!urlData) {
      logger.error(`[TaJiDuo-plugin][API] 未知接口：${type}`)
      return false
    }

    const { url, body, method, auth, platform } = urlData
    const controller = new AbortController()
    const timeout = Number(this.commonConfig.timeout || 25000)
    const timer = setTimeout(() => controller.abort(), timeout)
    const param = {
      headers: this.getHeaders(type, data, { auth, platform }),
      signal: controller.signal
    }
    if (method) {
      param.method = method
      if (body !== undefined) param.body = body
    } else if (body !== undefined) {
      param.method = 'post'
      param.body = body
    } else {
      param.method = 'get'
    }

    let response
    const start = Date.now()
    try {
      response = await fetch(url, param)
    } catch (error) {
      const message = error?.name === 'AbortError' ? `请求超时（${timeout}ms）` : (error?.message || error)
      logger.error(`[TaJiDuo-plugin][API][${type}] fetch error：${message}`)
      return {
        code: -1,
        message: `网络请求失败：${message}`,
        data: null,
        api: type
      }
    } finally {
      clearTimeout(timer)
    }

    let res = null
    try {
      res = await response.json()
    } catch (error) {
      const text = await response.text().catch(() => '')
      res = {
        code: response.ok ? 0 : response.status,
        message: text || response.statusText,
        data: null
      }
    }

    if (!response.ok) {
      logger.error(`[TaJiDuo-plugin][API][${type}] ${response.status} ${response.statusText} ${JSON.stringify(res)}`)
    } else if (this.option.log) {
      logger.mark(`[TaJiDuo-plugin][API][${type}] ${Date.now() - start}ms`)
    }

    if (!res || typeof res !== 'object') {
      return {
        code: response.ok ? 0 : response.status,
        message: response.statusText || '请求失败',
        data: res,
        api: type
      }
    }

    res.api = type
    res.httpStatus = response.status
    return res
  }
}
