import TaJiDuoUser, { addOrUpdateAccount } from '../model/tajiduoUser.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const yihuanImgDir = path.resolve(__dirname, '../resources/yihuan/img/character')
import {
  compactLine,
  formatTime,
  getMessage,
  getUnbindMessage,
  normalizeRole,
  pickRole,
  PREFIX,
  summarizeApiError,
  trimMsg
} from '../utils/common.js'

function getRoleId(text = '') {
  return String(text).match(/\d{5,}/)?.[0] || ''
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeText(text = '') {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

function cleanSpaces(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function getCommandArgs(text = '', gameCode = 'yihuan', commandPattern = '') {
  const prefix = gameCode === 'huanta' ? '(?:幻塔|[Hh][Tt])' : '(?:异环|[Yy][Hh])'
  return cleanSpaces(String(text || '').trim().replace(new RegExp(`^[/#]?${prefix}\\s*${commandPattern}`, 'i'), ''))
}

function getHuantaRecordType(text = '') {
  const value = String(text || '')
  if (/武器|type\s*1|类型\s*1|(?:^|\s)1(?:\s|$)/i.test(value)) return '1'
  if (/拟态|type\s*2|类型\s*2|(?:^|\s)2(?:\s|$)/i.test(value)) return '2'
  if (/时装|type\s*3|类型\s*3|(?:^|\s)3(?:\s|$)/i.test(value)) return '3'
  if (/载具|type\s*4|类型\s*4|(?:^|\s)4(?:\s|$)/i.test(value)) return '4'
  return '0'
}

function stripHuantaTypeWords(text = '') {
  return cleanSpaces(String(text || '')
    .replace(/武器|拟态|时装|载具/gi, ' ')
    .replace(/type\s*[1-4]|类型\s*[1-4]/gi, ' ')
    .replace(/(?:^|\s)[1-4](?=\s|$)/g, ' '))
}

function removeFirstText(text = '', value = '') {
  if (!value) return cleanSpaces(text)
  return cleanSpaces(String(text || '').replace(new RegExp(escapeRegExp(String(value)), 'i'), ' '))
}

function searchTerms(query = '') {
  return cleanSpaces(query).split(/[,\s，、]+/).filter(Boolean)
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.list)) return value.list
  if (Array.isArray(value?.detail)) return value.detail
  return []
}

function dataBody(res = {}) {
  return res.data?.data ?? res.data ?? {}
}

function isOwned(item = {}) {
  return [item.own, item.owned, item.unlock, item.has].some((value) => value === true || value === 1 || value === '1' || value === 'true')
}

function countOwned(items = []) {
  return items.filter((item) => isOwned(item)).length
}

function percentLabel(progress = 0, total = 0) {
  const current = Number(progress ?? 0)
  const target = Number(total ?? 0)
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return '0%'
  const value = (current / target) * 100
  return `${value.toFixed(2).replace(/\.?0+$/, '')}%`
}

function isTruthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function homeDisplayLabel(item = {}, showCount = false) {
  if (!item || Object.keys(item).length === 0) return '暂无'
  const visible = [
    item.own,
    item.owned,
    item.unlock,
    item.has,
    item.show,
    item.selected,
    item.display,
    item.displayed,
    item.isShow
  ].some(isTruthyFlag)
  if (!visible) return '暂无'

  const name = item.showName || item.name || item.title || itemName(item)
  if (!name || name === '未命名') return '暂无'
  if (!showCount) return name

  const ownCnt = item.ownCnt ?? item.ownedCnt ?? item.count
  const total = item.total
  if (ownCnt !== undefined && total !== undefined) return `${name} ${ownCnt}/${total}`
  if (total !== undefined) return `${name} ${total}`
  return name
}

function itemName(item = {}) {
  return item.name || item.showName || item.title || item.id || item.ID || '未命名'
}

function collectStrings(value, depth = 0) {
  if (depth > 3 || value === undefined || value === null) return []
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1))
  if (typeof value === 'object') return Object.values(value).flatMap((item) => collectStrings(item, depth + 1))
  return []
}

function itemMatches(item = {}, term = '') {
  const needle = normalizeText(term)
  if (!needle) return true
  const fields = new Set([
    itemName(item),
    item.id,
    item.ID,
    item.desc,
    item.description,
    item.quality,
    item.elementType,
    item.groupType,
    item.showName,
    item.showId,
    ...collectStrings(item)
  ])
  return [...fields].some((value) => normalizeText(value).includes(needle))
}

function propertyLabel(item = {}) {
  const label = item.name || item.id || item.key || item.type
  const value = item.value ?? item.val ?? item.num ?? item.total
  if (!label && value === undefined) return ''
  return value === undefined || value === '' ? String(label) : `${label} ${value}`
}

function vehicleStatLine(item = {}) {
  const name = item.name || item.id || item.key || item.type
  const value = item.value ?? item.val ?? item.num
  const max = item.max ?? item.total
  if (!name) return ''
  if (value === undefined || value === '') return `${name}：暂无`
  return max !== undefined && max !== '' ? `${name}：${value}/${max}` : `${name}：${value}`
}

function formatVehicleStats(items = []) {
  return toArray(items).map(vehicleStatLine).filter(Boolean)
}

function pickBestItem(items = [], query = '') {
  const terms = searchTerms(query).map(normalizeText).filter(Boolean)
  if (terms.length === 0) return items[0] || null
  return items.find((item) => terms.some((term) => normalizeText(itemName(item)) === term || normalizeText(item.id) === term || normalizeText(item.ID) === term))
    || items.find((item) => terms.some((term) => normalizeText(itemName(item)).includes(term)))
    || items[0]
    || null
}

function formatVehicleDetailLines(item = {}) {
  const base = formatVehicleStats(item.base)
  const advanced = formatVehicleStats(item.advanced)
  const lines = [
    compactLine('名称', itemName(item)),
    compactLine('状态', isOwned(item) ? '已拥有' : '未拥有')
  ]
  if (base.length) lines.push('基础属性：', ...base)
  if (advanced.length) lines.push('高级参数：', ...advanced)
  if (base.length === 0 && advanced.length === 0) lines.push('暂无详细参数')
  return lines
}

function areaTotalLine(item = {}) {
  const progress = item.progress ?? 0
  const total = item.total ?? 0
  return `${item.name || item.id || '未命名'} | ${progress} | ${total} | ${percentLabel(progress, total)}`
}

const imgExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

function pickCharacterBg(charName = '') {
  const candidates = [charName, 'default']
  for (const name of candidates) {
    if (!name) continue
    const dir = path.join(yihuanImgDir, name)
    try {
      const files = fs.readdirSync(dir)
      const images = files.filter(f => imgExts.has(path.extname(f).toLowerCase()))
      if (images.length > 0) {
        const picked = images[Math.floor(Math.random() * images.length)]
        return `yihuan/img/character/${name}/${picked}`
      }
    } catch { }
  }
  return ''
}

function characterSummary(item = {}) {
  return `${item.name || item.id || '角色'}${item.quality ? ` / ${enumLabel(item.quality)}` : ''}${item.alev !== undefined ? ` / Lv.${item.alev}` : ''}${item.slev !== undefined ? ` / 阶段${item.slev}` : ''}${item.awakenLev !== undefined ? ` / 觉醒${item.awakenLev}` : ''}`
}

function characterListLine(item = {}) {
  const empty = getMessage('common.empty')
  const name = item.name || item.id || '角色'
  const level = item.alev ?? empty
  const element = enumLabel(item.elementType) || empty
  const stage = item.slev ?? empty
  const awaken = item.awakenLev ?? 0
  return `${name} | 等级 ${level} | 属性 ${element} | 阶段 ${stage} | 觉醒 ${awaken}`
}

function fillTemplate(text = '', values = []) {
  let out = String(text || '')
  toArray(values).forEach((value, index) => {
    out = out.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value))
  })
  return cleanGameText(out)
}

function formatPropertyLines(items = [], limit = 30) {
  const properties = toArray(items).slice(0, limit).map(propertyLabel).filter(Boolean)
  const lines = []
  for (let i = 0; i < properties.length; i += 2) {
    lines.push(properties.slice(i, i + 2).join(' | '))
  }
  return lines
}

function skillSummaryLabel(skill = {}) {
  const name = skill.name || skill.id || '未命名'
  return skill.level !== undefined ? `${name} Lv.${skill.level}` : String(name)
}

function formatSkillSummaryLines(items = [], title = '技能') {
  const skills = toArray(items).map(skillSummaryLabel).filter(Boolean)
  if (skills.length === 0) return []
  const lines = [`${title}：`]
  for (let i = 0; i < skills.length; i += 3) {
    lines.push(skills.slice(i, i + 3).join(' | '))
  }
  return lines
}

function formatEquipmentPiece(item = {}, index = 0) {
  const lines = [
    `${index ? `${index}. ` : ''}${item.name || item.id || '驱动'}${item.lev !== undefined ? ` Lv.${item.lev}` : ''}`
  ]
  const main = formatPropertyLines(item.mainProperties, 8)
  if (main.length) lines.push(`主属性：${main.join(' | ')}`)
  const sub = formatPropertyLines(item.properties, 8)
  if (sub.length) lines.push(`副属性：${sub.join(' | ')}`)
  return lines.join('\n')
}

function buildYihuanPanelMessages(character = {}, role = {}) {
  const messages = []
  const baseLines = [
    `异环${character.name || character.id || '角色'}面板`,
    compactLine('等级', character.alev),
    compactLine('属性', enumLabel(character.elementType)),
    compactLine('阶段', character.slev),
    compactLine('觉醒', character.awakenLev),
    compactLine('好感', character.likeabilitylev)
  ]
  if (toArray(character.awakenEffect).length) {
    baseLines.push(compactLine('觉醒效果', toArray(character.awakenEffect).join(' / ')))
  }
  messages.push(baseLines.join('\n'))

  const propertyLines = formatPropertyLines(character.properties)
  if (propertyLines.length) messages.push(safeSection('面板属性', propertyLines))

  const skillLines = [
    ...formatSkillSummaryLines(character.skills, '战斗技能'),
    ...formatSkillSummaryLines(character.citySkills, '城市技能')
  ]
  if (skillLines.length) messages.push(skillLines.join('\n'))

  const fork = character.fork || {}
  if (Object.keys(fork).length > 0) {
    const forkLines = [
      `弧盘 / 武器：${fork.name || fork.id || '未装备'}`,
      compactLine('品质', enumLabel(fork.quality)),
      compactLine('等级', fork.alev),
      compactLine('突破', fork.blev),
      compactLine('星级', fork.slev),
      compactLine('效果', fork.buffName),
      fillTemplate(fork.buffDes, fork.lbd)
    ]
    const forkProperties = formatPropertyLines(fork.properties)
    if (forkProperties.length) forkLines.push('属性：', ...forkProperties)
    messages.push(forkLines.filter((line) => line !== '').join('\n'))
  }

  const suit = character.suit || {}
  if (Object.keys(suit).length > 0) {
    const suitLines = [
      `驱动套装：${suit.name || suit.id || '未装备'}`,
      compactLine('激活件数', suit.suitActivateNum),
      cleanGameText(suit.des2),
      cleanGameText(suit.des4)
    ]
    messages.push(suitLines.filter((line) => line !== '').join('\n'))

    toArray(suit.core).forEach((item, index) => {
      messages.push(safeSection(`核心驱动 ${index + 1}`, [formatEquipmentPiece(item)]))
    })

    const pie = toArray(suit.pie)
    if (pie.length) {
      for (let i = 0; i < pie.length; i += 3) {
        messages.push(safeSection('驱动件', pie.slice(i, i + 3).map((item, offset) => formatEquipmentPiece(item, i + offset + 1))))
      }
    }
  }

  return messages.filter((message) => cleanSpaces(message))
}

function filterByQuery(items = [], query = '') {
  const terms = searchTerms(query)
  if (terms.length === 0) return items
  return items.filter((item) => terms.some((term) => itemMatches(item, term)))
}

function pickBestCharacter(items = [], query = '') {
  const terms = searchTerms(query).map(normalizeText).filter(Boolean)
  if (terms.length === 0) return items[0] || null
  return items.find((item) => terms.some((term) => normalizeText(item.name) === term || normalizeText(item.id) === term))
    || items.find((item) => terms.some((term) => normalizeText(item.name).includes(term)))
    || items[0]
    || null
}

function queryLabel(query = '') {
  const text = cleanSpaces(query)
  return text ? ` / ${text}` : ''
}

function getYihuanPanelQuery(text = '') {
  return cleanSpaces(String(text || '').trim()
    .replace(new RegExp(`^${PREFIX.yihuan}\\s*`, 'i'), '')
    .replace(/\s*面板$/, ''))
}

function enumLabel(value = '') {
  const map = {
    ITEM_QUALITY_ORANGE: '橙',
    ITEM_QUALITY_PURPLE: '紫',
    CHARACTER_ELEMENT_TYPE_COSMOS: '光',
    CHARACTER_ELEMENT_TYPE_NATURE: '灵',
    CHARACTER_ELEMENT_TYPE_INCANTATION: '咒',
    CHARACTER_ELEMENT_TYPE_PSYCHE: '魂',
    CHARACTER_ELEMENT_TYPE_LAKSHANA: '相',
    CHARACTER_GROUP_TYPE_ONE: '分组1',
    CHARACTER_GROUP_TYPE_TWO: '分组2',
    CHARACTER_GROUP_TYPE_THREE: '分组3',
    CHARACTER_GROUP_TYPE_FOUR: '分组4',
    CHARACTER_GROUP_TYPE_FIVE: '分组5'
  }
  return map[value] || value || ''
}

function cleanGameText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/rn(?=[\u4e00-\u9fa5A-Za-z0-9「])/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function safeSection(title, lines = []) {
  return [title, ...lines.filter((line) => line !== undefined && line !== null && String(line).trim() !== '')].join('\n')
}

function getHuantaList(record = {}, type = '0') {
  const map = {
    1: record.weaponinfo || record.weaponInfo || [],
    2: record.imitationlist || record.imitationList || [],
    3: record.dressfashionlist || record.dressFashionList || [],
    4: record.mountlist || record.mountList || []
  }
  if (type !== '0') return toArray(map[type])
  return [
    ...toArray(map[1]),
    ...toArray(map[2]),
    ...toArray(map[3]),
    ...toArray(map[4])
  ]
}

function huantaTypeLabel(type = '0') {
  return {
    0: '总览',
    1: '武器',
    2: '拟态',
    3: '时装',
    4: '载具'
  }[type] || '总览'
}

export class profile extends plugin {
  constructor() {
    super({
      name: '[TaJiDuo-plugin]资料',
      dsc: '塔吉多与游戏资料查询',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${PREFIX.tajiduo}(资料|信息|个人资料|账号资料)$`,
          fnc: 'profile'
        },
        {
          reg: `^${PREFIX.huanta}(档案|角色数据|战绩详情)(?:\\s*.*)?$`,
          fnc: 'huantaRoleRecord'
        },
        {
          reg: `^${PREFIX.yihuan}(角色主页|主页)(?:\\s*.*)?$`,
          fnc: 'yihuanHome'
        },
        {
          reg: `^${PREFIX.yihuan}角色$`,
          fnc: 'yihuanCharacters'
        },
        {
          reg: `^${PREFIX.yihuan}\\s*.+?\\s*面板$`,
          fnc: 'yihuanCharacterPanel'
        },
        {
          reg: `^${PREFIX.yihuan}(成就进度|成就)(?:\\s*.*)?$`,
          fnc: 'yihuanAchieve'
        },
        {
          reg: `^${PREFIX.yihuan}(区域探索|探索|区域)(?:\\s*.*)?$`,
          fnc: 'yihuanArea'
        },
        {
          reg: `^${PREFIX.yihuan}(房产数据|房产)(?:\\s*.*)?$`,
          fnc: 'yihuanRealEstate'
        },
        {
          reg: `^${PREFIX.yihuan}(载具数据|载具)(?:\\s*.*)?$`,
          fnc: 'yihuanVehicles'
        }
      ]
    })
  }

  async getCurrentUser() {
    const userId = this.e.at || this.e.user_id
    const tjdUser = new TaJiDuoUser(userId)
    if (!await tjdUser.getUser()) {
      await this.reply(getUnbindMessage())
      return null
    }
    tjdUser.ownerId = userId
    return tjdUser
  }

  async renderYihuanImage(template, data, title = '异环查询') {
    if (!this.e?.runtime?.render) {
      logger.warn(`[TaJiDuo-plugin][图片渲染] e.runtime.render 不可用，回退到文本模式`)
      return false
    }

    const renderData = {
      ...data,
      enumLabel,
      percentLabel,
      isOwned,
      pageTitle: title,
      saveId: `yihuan_${template}`
    }

    try {
      const base64 = await this.e.runtime.render('TaJiDuo-plugin', `yihuan/${template}`, renderData, {
        retType: 'base64'
      })
      if (base64) {
        await this.e.reply(base64)
        return true
      }
      logger.warn(`[TaJiDuo-plugin][图片渲染] ${template} 渲染返回空结果，回退到文本模式`)
      return false
    } catch (error) {
      logger.error(`[TaJiDuo-plugin][图片渲染] ${template} 渲染失败:`, error)
      return false
    }
  }

  async profile() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const res = await tjdUser.tjdReq.getData('profile')
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data || {}
    await addOrUpdateAccount(tjdUser.ownerId || this.e.user_id, {
      ...tjdUser.account,
      nickname: data.nickname,
      tjd_uid: data.uid || tjdUser.account?.tjd_uid,
      avatar: data.avatar,
      introduce: data.introduce
    })

    const lines = [
      getMessage('profile.title'),
      compactLine('昵称', data.nickname),
      compactLine('UID', data.uid),
      compactLine('简介', data.introduce),
      compactLine('绑定时间', formatTime(tjdUser.account?.bind_time))
    ]
    await this.reply(lines.join('\n'))
    return true
  }

  async resolveGameRole(tjdUser, gameCode, args = '') {
    const rolesRes = await tjdUser.tjdReq.getData('game_roles', { gameCode })
    const roles = (rolesRes?.data?.roles || []).map(normalizeRole).filter((role) => role.roleId)
    let query = cleanSpaces(args)
    const roleId = getRoleId(query)
    let role = null

    if (roleId) {
      role = pickRole(roles, roleId)
      query = removeFirstText(query, roleId)
    }

    if (!role && query) {
      const queryText = normalizeText(query)
      const matched = [...roles]
        .filter((item) => item.roleName)
        .sort((a, b) => normalizeText(b.roleName).length - normalizeText(a.roleName).length)
        .find((item) => queryText.includes(normalizeText(item.roleName)))
      if (matched) {
        role = matched
        query = removeFirstText(query, matched.roleName)
      }
    }

    return {
      role: role || roles[0] || null,
      roles,
      query
    }
  }

  async huantaRoleRecord() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const text = trimMsg(this.e)
    const args = getCommandArgs(text, 'huanta', '(?:档案|角色数据|战绩详情)')
    const type = getHuantaRecordType(args)
    const resolved = await this.resolveGameRole(tjdUser, 'huanta', stripHuantaTypeWords(args))
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '幻塔' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('huanta_role_record', { roleId: role.roleId, type })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data || {}
    const record = data.record || data.data || {}
    const selected = data.selected || record.selected || ''
    const items = filterByQuery(getHuantaList(record, type), resolved.query)
    const lines = [
      `幻塔档案${huantaTypeLabel(type)}：${record.rolename || record.roleName || role.roleName || role.roleId}${queryLabel(resolved.query)}`,
      compactLine('等级', record.lev ?? role.level),
      compactLine('服务器', record.groupname || record.serverName || role.serverName),
      compactLine('战力', record.maxgs),
      compactLine('当前展示', selected || getMessage('common.empty'))
    ]
    if (type === '0') {
      lines.push(compactLine('武器', toArray(record.weaponinfo || record.weaponInfo).length))
      lines.push(compactLine('拟态', toArray(record.imitationlist || record.imitationList).length))
      lines.push(compactLine('时装', toArray(record.dressfashionlist || record.dressFashionList).length))
      lines.push(compactLine('载具', toArray(record.mountlist || record.mountList).length))
      if (resolved.query) {
        for (const item of items.slice(0, 10)) {
          lines.push(`- ${itemName(item)}${item.ID || item.id ? ` / ${item.ID || item.id}` : ''}`)
        }
        if (items.length === 0) lines.push(`未找到匹配：${resolved.query}`)
      }
    } else {
      for (const item of items.slice(0, 10)) {
        lines.push(`- ${itemName(item)}${item.ID || item.id ? ` / ${item.ID || item.id}` : ''}`)
      }
      if (items.length === 0) lines.push(resolved.query ? `未找到匹配：${resolved.query}` : getMessage('common.no_data'))
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanHome() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', getCommandArgs(trimMsg(this.e), 'yihuan', '(?:角色主页|主页)'))
    const role = resolved.role

    const res = await tjdUser.tjdReq.getData('yihuan_role_home', role?.roleId ? { roleId: role.roleId } : {})
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = dataBody(res)
    const achieve = data.achieveProgress || {}
    const estate = data.realestate || {}
    const vehicle = data.vehicle || {}
    const characters = filterByQuery(toArray(data.characters), resolved.query)
    const uid = data.roleid || data.roleId || data.uid || role?.roleId

    const renderSuccess = await this.renderYihuanImage('role-home', {
      data,
      role,
      achieve,
      estate,
      vehicle,
      characters,
      uid,
      query: resolved.query
    }, `异环角色主页：${data.rolename || role?.roleName || uid || '异环'}`)

    if (renderSuccess) {
      return true
    }

    const lines = [
      `异环角色主页：${data.rolename || role?.roleName || uid || '异环'}${queryLabel(resolved.query)}`,
      compactLine('UID', uid),
      compactLine('等级', data.lev),
      compactLine('世界等级', data.worldlevel),
      compactLine('登录天数', data.roleloginDays),
      compactLine('角色数量', data.charidCnt),
      compactLine('成就', `${achieve.achievementCnt ?? 0}/${achieve.total ?? 0}`),
      compactLine('房产', homeDisplayLabel(estate)),
      compactLine('载具', homeDisplayLabel(vehicle, true))
    ]
    if (resolved.query) {
      for (const item of characters.slice(0, 6)) {
        lines.push(`- ${characterSummary(item)}`)
      }
      if (characters.length === 0) lines.push(`未找到匹配：${resolved.query}`)
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanCharacters() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan')
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_characters', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const items = toArray(dataBody(res))
    const hasOwnedFlag = items.some((item) => ['own', 'owned', 'unlock', 'has'].some((key) => item[key] !== undefined))
    const owned = hasOwnedFlag ? countOwned(items) : items.length
    const lines = [
      `异环角色列表：${role.roleName || role.roleId}`,
      compactLine('拥有', `${owned}/${items.length}`)
    ]
    for (const item of items) {
      lines.push(characterListLine(item))
    }
    if (items.length === 0) lines.push(getMessage('common.no_data'))
    await this.reply(lines.join('\n'))
    return true
  }

  async replyForward(messages = [], title = 'TaJiDuo 面板') {
    const textMessages = messages.map((message) => String(message || '').trim()).filter(Boolean)
    if (textMessages.length === 0) return this.reply(getMessage('common.no_data'))

    const bot = global.Bot
    const userId = String(this.e?.user_id || bot?.uin || '80000000')
    const nickname = this.e?.sender?.card || this.e?.sender?.nickname || 'TaJiDuo'
    const nodes = textMessages.map((message, index) => ({
      user_id: userId,
      nickname: index === 0 ? title : nickname,
      message
    }))

    try {
      let forward = null
      if (bot?.makeForwardMsg) {
        forward = await bot.makeForwardMsg(nodes)
      } else if (this.e?.group?.makeForwardMsg) {
        forward = await this.e.group.makeForwardMsg(nodes)
      } else if (this.e?.friend?.makeForwardMsg) {
        forward = await this.e.friend.makeForwardMsg(nodes)
      }
      if (forward) {
        await this.reply(forward)
        return true
      }
    } catch (error) {
      logger.error(`[TaJiDuo-plugin][合并转发]发送失败：${error?.message || error}`)
    }

    await this.reply(textMessages.join('\n\n-----\n\n'))
    return true
  }

  async yihuanCharacterPanel() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const panelQuery = getYihuanPanelQuery(trimMsg(this.e))
    if (!panelQuery) {
      await this.reply('请写角色名，例如：yh早雾面板')
      return true
    }

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', panelQuery)
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_characters', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const characterQuery = resolved.query || panelQuery
    const items = filterByQuery(toArray(dataBody(res)), characterQuery)
    const character = pickBestCharacter(items, characterQuery)
    if (!character) {
      await this.reply(`没有找到角色面板：${characterQuery}`)
      return true
    }

    const properties = toArray(character.properties).map(prop => ({
      name: prop.name || prop.id || '未命名',
      value: prop.value ?? prop.val ?? prop.num ?? ''
    })).slice(0, 30)

    const renderSuccess = await this.renderYihuanImage('character-panel', {
      character,
      role,
      properties,
      itemsCount: items.length,
      bgImage: pickCharacterBg(character.name || character.id)
    }, `异环${character.name || character.id}面板`)

    if (renderSuccess) {
      return true
    }

    const messages = buildYihuanPanelMessages(character, role)
    if (items.length > 1) {
      messages[0] += `\n匹配到 ${items.length} 个结果，已展示：${character.name || character.id}`
    }
    await this.replyForward(messages, `异环${character.name || character.id}面板`)
    return true
  }

  async yihuanAchieve() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', getCommandArgs(trimMsg(this.e), 'yihuan', '(?:成就进度|成就)'))
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_achieve_progress', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = dataBody(res)
    const detail = filterByQuery(toArray(data.detail), resolved.query)

    const detailForRender = detail.map(item => {
      const p = Number(item.progress) || 0
      const t = Number(item.total) || 0
      return { ...item, pctWidth: t > 0 ? Math.min(100, (p / t) * 100) : 0 }
    })

    const renderSuccess = await this.renderYihuanImage('achieve', {
      data,
      role,
      detail: detailForRender,
      query: resolved.query
    }, `异环成就：${role.roleName || role.roleId}`)

    if (renderSuccess) {
      return true
    }

    const lines = [
      `异环成就：${role.roleName || role.roleId}${queryLabel(resolved.query)}`,
      compactLine('总进度', `${data.achievementCnt ?? 0}/${data.total ?? 0}`),
      compactLine('铜', data.bronzeUmdCnt ?? 0),
      compactLine('银', data.silverUmdCnt ?? 0),
      compactLine('金', data.goldUmdCnt ?? 0)
    ]
    if (detail.length > 0) {
      lines.push('-----')
      lines.push('名称 | 进度 | 总数 | 完成率')
      for (const item of detail) {
        const progress = item.progress ?? 0
        const total = item.total ?? 0
        lines.push(`${item.name || item.id || '未命名'} | ${progress} | ${total} | ${percentLabel(progress, total)}`)
      }
    } else if (resolved.query) {
      lines.push(`未找到匹配：${resolved.query}`)
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanArea() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', getCommandArgs(trimMsg(this.e), 'yihuan', '(?:区域探索|探索|区域)'))
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_area_progress', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const items = filterByQuery(toArray(dataBody(res)), resolved.query)

    const itemsForRender = items.map(item => {
      const p = Number(item.progress) || 0
      const t = Number(item.total) || 0
      return { ...item, pctWidth: t > 0 ? Math.min(100, (p / t) * 100) : 0 }
    })

    const renderSuccess = await this.renderYihuanImage('area-progress', {
      role,
      items: itemsForRender,
      query: resolved.query
    }, `异环区域探索：${role.roleName || role.roleId}`)

    if (renderSuccess) {
      return true
    }

    const lines = [`异环区域探索：${role.roleName || role.roleId}${queryLabel(resolved.query)}`]
    if (items.length > 0) lines.push('区域 | 进度 | 总数 | 完成率')
    for (const item of items) {
      lines.push(areaTotalLine(item))
    }
    if (items.length === 0) lines.push(resolved.query ? `未找到匹配：${resolved.query}` : getMessage('common.no_data'))
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanRealEstate() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', getCommandArgs(trimMsg(this.e), 'yihuan', '(?:房产数据|房产)'))
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_real_estate', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = dataBody(res)
    const allDetail = toArray(data.detail)
    const detail = filterByQuery(allDetail, resolved.query)
    const owned = countOwned(detail)

    const renderSuccess = await this.renderYihuanImage('real-estate', {
      role,
      data,
      detail,
      owned,
      total: resolved.query ? detail.length : allDetail.length
    }, `异环房产：${role.roleName || role.roleId}`)

    if (renderSuccess) {
      return true
    }

    const lines = [
      `异环房产：${role.roleName || role.roleId}${queryLabel(resolved.query)}`,
      compactLine('拥有', `${owned}/${resolved.query ? detail.length : allDetail.length}`)
    ]
    for (const item of detail.filter((entry) => isOwned(entry)).slice(0, 8)) {
      lines.push(`- ${itemName(item)}`)
    }
    if (detail.length === 0) lines.push(resolved.query ? `未找到匹配：${resolved.query}` : getMessage('common.no_data'))
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanVehicles() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const resolved = await this.resolveGameRole(tjdUser, 'yihuan', getCommandArgs(trimMsg(this.e), 'yihuan', '(?:载具数据|载具)'))
    const role = resolved.role
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_vehicles', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = dataBody(res)
    const allDetail = toArray(data.detail)
    const detail = filterByQuery(allDetail, resolved.query)

    const renderSuccess = await this.renderYihuanImage('vehicles', {
      role,
      data,
      detail,
      owned: data.ownCnt ?? countOwned(allDetail),
      total: data.total ?? allDetail.length
    }, `异环载具：${role.roleName || role.roleId}`)

    if (renderSuccess) {
      return true
    }

    const lines = [`异环载具：${role.roleName || role.roleId}${queryLabel(resolved.query)}`]
    if (resolved.query) {
      const vehicle = pickBestItem(detail, resolved.query)
      if (vehicle) {
        lines.push(...formatVehicleDetailLines(vehicle))
        if (detail.length > 1) lines.push(`匹配到 ${detail.length} 个结果，已展示：${itemName(vehicle)}`)
      } else {
        lines.push(`未找到匹配：${resolved.query}`)
      }
    } else {
      lines.push(compactLine('拥有', `${data.ownCnt ?? countOwned(allDetail)}/${data.total ?? allDetail.length}`))
      for (const item of allDetail.filter((entry) => isOwned(entry)).slice(0, 8)) {
        lines.push(`- ${itemName(item)}`)
      }
      if (allDetail.length === 0) lines.push(getMessage('common.no_data'))
    }
    await this.reply(lines.join('\n'))
    return true
  }

}
