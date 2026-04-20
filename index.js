import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './model/path.js'

const appsDir = path.join(pluginRoot, 'apps')
const files = fs.existsSync(appsDir)
  ? fs.readdirSync(appsDir).filter((file) => file.endsWith('.js'))
  : []

let ret = []

logger.info('-------------------')
logger.info('TaJiDuo-plugin 载入中...')
logger.info('-------------------')

for (const file of files) {
  ret.push(import(`./apps/${file}`))
}

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

logger.info('-------------------')
logger.info('TaJiDuo-plugin 载入成功!')
logger.info('-------------------')

export { apps }
