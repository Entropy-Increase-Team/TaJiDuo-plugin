import TaJiDuoApi from './tajiduoApi.js'
import setting from '../utils/setting.js'
import { getPlatformId } from '../utils/common.js'

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

  async getData(type, data = {}) {
    const urlData = this.getUrl(type, data)
    if (!urlData) {
      logger.error(`[TaJiDuo-plugin][API] 未知接口：${type}`)
      return false
    }

    const { url, body, method, auth, platform } = urlData
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
      headers['X-Platform-Id'] = data.platformId || getPlatformId(data.e)
      headers['X-Platform-User-Id'] = String(data.platformUserId || '')
    }

    if (data.headers) {
      headers = { ...headers, ...data.headers }
    }

    const param = {
      headers,
      timeout: Number(this.commonConfig.timeout || 25000)
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
      logger.error(`[TaJiDuo-plugin][API][${type}] fetch error：${error?.message || error}`)
      return {
        code: -1,
        message: `网络请求失败：${error?.message || error}`,
        data: null,
        api: type
      }
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
