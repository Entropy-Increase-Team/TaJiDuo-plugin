import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from '../model/path.js'

const userConfigDir = path.join(pluginRoot, 'config', 'config')
const userConfigPath = path.join(userConfigDir, 'tajiduo.yaml')
const defaultConfigPath = path.join(pluginRoot, 'config', 'tajiduo_default.yaml')

if (!fs.existsSync(userConfigDir)) {
  fs.mkdirSync(userConfigDir, { recursive: true })
}

if (!fs.existsSync(userConfigPath)) {
  try {
    if (fs.existsSync(defaultConfigPath)) {
      fs.copyFileSync(defaultConfigPath, userConfigPath)
    }

    if (fs.existsSync(userConfigPath)) {
      logger.info('[TaJiDuo-plugin] 已自动创建 tajiduo.yaml')
    }
  } catch (error) {
    logger.error('[TaJiDuo-plugin] 自动创建 tajiduo.yaml 失败', error)
  }
}

class Config {
  constructor () {
    this.cache = {
      config: null,
      defaultConfig: null
    }

    this.fileMaps = {
      config: userConfigPath,
      defaultConfig: defaultConfigPath
    }

    this.watchFiles()
  }

  loadYaml (filePath) {
    try {
      if (!fs.existsSync(filePath)) return {}
      return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}
    } catch (error) {
      logger.error(`[TaJiDuo-plugin] 读取配置失败：${path.basename(filePath)}`, error)
      return {}
    }
  }

  watchFiles () {
    for (const [key, filePath] of Object.entries(this.fileMaps)) {
      if (!fs.existsSync(filePath)) continue
      fs.watchFile(filePath, { interval: 1000 }, () => {
        this.cache[key] = null
      })
    }
  }

  getConfig () {
    if (this.cache.config === null) {
      this.cache.config = this.loadYaml(this.fileMaps.config)
    }
    return this.cache.config
  }

  getDefaultConfig () {
    if (this.cache.defaultConfig === null) {
      this.cache.defaultConfig = this.loadYaml(this.fileMaps.defaultConfig)
    }
    return this.cache.defaultConfig
  }

  get (group, key) {
    const config = this.getConfig()
    if (config?.[group]?.[key] !== undefined) {
      return config[group][key]
    }

    const defaultConfig = this.getDefaultConfig()
    return defaultConfig?.[group]?.[key]
  }

  setConfig (data) {
    try {
      fs.writeFileSync(this.fileMaps.config, YAML.stringify(data), 'utf8')
      this.cache.config = data
      return true
    } catch (error) {
      logger.error('[TaJiDuo-plugin] 写入配置失败', error)
      return false
    }
  }
}

export default new Config()
