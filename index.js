import fs from 'node:fs'
import setting from './utils/setting.js'

if (!global.segment) {
  global.segment = (await import('oicq')).segment
}

if (!global.core) {
  try {
    global.core = (await import('oicq')).core
  } catch (err) {}
}

const files = fs
  .readdirSync('./plugins/TaJiDuo-plugin/apps')
  .filter((file) => file.endsWith('.js'))

let ret = []

logger.info('-------------------')
logger.info('TaJiDuo-plugin载入成功!')
const commonConfig = setting.getConfig('common') || {}
if (!commonConfig.api_key || String(commonConfig.api_key).trim() === '') {
  logger.warn('[TaJiDuo-plugin] 未配置 api_key，接口功能将不可用')
  logger.warn('[TaJiDuo-plugin] 请在 plugins/TaJiDuo-plugin/config/common.yaml 中填写 api_key')
}
logger.info('命令前缀：塔吉多/tjd、幻塔/ht、异环/yh')
logger.info('-------------------')

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  const name = files[i].replace('.js', '')

  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }
