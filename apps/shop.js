import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
import TaJiDuoApi from '../model/api.js'
import { clearUserSession, getUserSession } from '../model/store.js'
import {
  AUTH_EXPIRED_MESSAGE,
  LOGIN_COMMAND_EXAMPLE,
  buildReloginReply,
  getErrorMessage,
  isAuthExpiredError
} from '../utils/auth.js'
import { joinLines, normalizePositiveInt, pickFirstNonEmpty } from '../utils/common.js'
import { buildCommandReg, extractCommandArgs, formatCommand } from '../utils/command.js'

const SHOP_LIST_DEFAULT_COUNT = 20
const SHOP_LIST_DEFAULT_VERSION = 0
const SHOP_CATALOG_FETCH_COUNT = 100
const SHOP_CATALOG_MAX_PAGES = 10
const SHOP_SELECTION_TIMEOUT_MS = 300000
const ACCOUNT_SELECTION_MESSAGE_REG = '^\\d+$'
const PENDING_SHOP_ACTION_MAP = new Map()

const SHOP_GAME_CONFIGS = Object.freeze([
  {
    id: '1256',
    key: 'huanta',
    name: '幻塔',
    tab: 'ht',
    aliases: ['1256', 'huanta', '幻塔', 'ht', 'tof']
  },
  {
    id: '1289',
    key: 'yihuan',
    name: '异环',
    tab: 'yh',
    aliases: ['1289', 'yihuan', '异环', 'yh', 'nte']
  }
])

const SHOP_COMMAND_EXAMPLES = Object.freeze({
  goods: 'tjd商城',
  detail: 'tjd商品 8',
  coin: 'tjd塔币查询',
  roles: 'tjd商城角色列表',
  exchange: 'tjd兑换商品 10 1'
})

const SHOP_COMMAND_HINTS = Object.freeze({
  detail: `${SHOP_COMMAND_EXAMPLES.detail} 或 tjd商品 墨晶*60`,
  exchange: `${SHOP_COMMAND_EXAMPLES.exchange} 或 tjd兑换商品 墨晶*60 1`
})

const NO_SESSION_REPLY = `请先发送 ${LOGIN_COMMAND_EXAMPLE} 完成登录`

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeShopTab (value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  const lower = text.toLowerCase()
  if (['all', '全部', '所有'].includes(lower) || ['全部', '所有'].includes(text)) {
    return 'all'
  }

  if (['幻塔', 'tof', 'ht'].includes(text) || ['tof', 'ht', 'huanta'].includes(lower)) {
    return 'ht'
  }

  if (['异环', 'nte', 'yh'].includes(text) || ['nte', 'yh', 'yihuan'].includes(lower)) {
    return 'yh'
  }

  return lower
}

function resolveShopGame (value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return null
  }

  const lower = text.toLowerCase()
  return SHOP_GAME_CONFIGS.find((item) => item.aliases.includes(lower) || item.aliases.includes(text)) || null
}

function resolveShopGameByTab (tab = '', tabs = []) {
  const tabKey = String(tab || '').trim().toLowerCase()
  if (!tabKey) {
    return null
  }

  const tabInfo = Array.isArray(tabs)
    ? tabs.find((item) => String(item?.key || '').trim().toLowerCase() === tabKey)
    : null

  if (tabInfo?.gameId) {
    const matchedGame = SHOP_GAME_CONFIGS.find((item) => item.id === String(tabInfo.gameId))
    if (matchedGame) {
      return matchedGame
    }

    return {
      id: String(tabInfo.gameId),
      key: tabKey,
      name: String(tabInfo.name || tabKey).trim() || tabKey,
      tab: tabKey,
      aliases: [tabKey]
    }
  }

  return SHOP_GAME_CONFIGS.find((item) => item.tab === tabKey || item.aliases.includes(tabKey)) || null
}

function stripHtml (value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatDateTime (value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatGoodsState (item = {}) {
  const state = Number(item?.state)

  if (state === 1) {
    return '可兑换'
  }

  if (state === 0) {
    return '不可兑换'
  }

  return item?.state !== undefined ? `状态 ${item.state}` : '未知'
}

function formatGoodsCycleLabel (item = {}) {
  const cycleType = Number(item?.cycleType)

  if (cycleType === 1) {
    return '每月限购'
  }

  if (cycleType === 2) {
    return '每周限购'
  }

  if (cycleType === 3) {
    return '每日限购'
  }

  return '限购'
}

function getPositiveStock (item = {}) {
  const stock = Number(item?.stock)
  return Number.isFinite(stock) && stock > 0 ? stock : null
}

function formatGoodsLimit (item = {}) {
  const exchangeNum = Number(item?.exchangeNum)
  const cycleLimit = Number(item?.cycleLimit)

  if (Number.isFinite(cycleLimit) && cycleLimit > 0) {
    const current = Number.isFinite(exchangeNum) && exchangeNum >= 0 ? exchangeNum : 0
    return `${formatGoodsCycleLabel(item)}：${current}/${cycleLimit}`
  }

  if (item?.limit !== undefined) {
    return `限购：${item.limit}`
  }

  return ''
}

function buildShopGoodsMetaLine (item = {}) {
  const parts = [`价格：${pickFirstNonEmpty(item?.price, '未知')}`]
  const stock = getPositiveStock(item)
  const limit = formatGoodsLimit(item)

  if (stock !== null) {
    parts.push(`库存：${stock}`)
  }

  if (limit) {
    parts.push(limit)
  }

  return parts.join(' | ')
}

function getSessionIdentity (e) {
  return {
    selfId: e?.self_id || 'bot',
    userId: e?.user_id
  }
}

async function getStoredSession (e) {
  const { selfId, userId } = getSessionIdentity(e)
  return getUserSession(selfId, userId)
}

async function clearCurrentUserSession (e) {
  const { selfId, userId } = getSessionIdentity(e)
  await clearUserSession(selfId, userId)
}

function parseShopGoodsArgs (message = '') {
  const args = extractCommandArgs(message, '商城')
  const parts = args.split(/\s+/).filter(Boolean)

  if (parts.length > 3) {
    return { valid: false }
  }

  let tab = ''
  let count = SHOP_LIST_DEFAULT_COUNT
  let version = SHOP_LIST_DEFAULT_VERSION

  if (parts.length > 0) {
    const [first = '', second = '', third = ''] = parts

    if (/^\d+$/.test(first)) {
      count = normalizePositiveInt(first) || SHOP_LIST_DEFAULT_COUNT

      if (second) {
        if (!/^\d+$/.test(second)) {
          return { valid: false }
        }
        version = Number(second)
      }
    } else {
      tab = normalizeShopTab(first)

      if (second) {
        if (!/^\d+$/.test(second)) {
          return { valid: false }
        }
        count = normalizePositiveInt(second) || SHOP_LIST_DEFAULT_COUNT
      }

      if (third) {
        if (!/^\d+$/.test(third)) {
          return { valid: false }
        }
        version = Number(third)
      }
    }
  }

  return {
    valid: true,
    tab,
    count,
    version
  }
}

function parseShopGoodsDetailArgs (message = '') {
  const keyword = extractCommandArgs(message, '商品')

  return {
    valid: Boolean(keyword),
    keyword: String(keyword || '').trim()
  }
}

function parseShopRolesArgs (message = '') {
  const args = extractCommandArgs(message, '(?:商城角色列表|商城角色)')
  if (!args) {
    return {
      valid: true,
      games: [...SHOP_GAME_CONFIGS]
    }
  }

  const game = resolveShopGame(args)
  if (!game) {
    return {
      valid: false,
      games: []
    }
  }

  return {
    valid: true,
    games: [game]
  }
}

function parseShopExchangeArgs (message = '') {
  const args = extractCommandArgs(message, '(?:兑换商品|商城兑换)')
  const parts = args.split(/\s+/).filter(Boolean)

  if (parts.length < 2) {
    return { valid: false }
  }

  const countText = parts.pop()
  const count = normalizePositiveInt(countText)
  const keyword = parts.join(' ').trim()

  if (!keyword || !count) {
    return { valid: false }
  }

  return {
    valid: true,
    keyword,
    count
  }
}

function getTabMap (data = {}) {
  const tabs = Array.isArray(data?.tabs) ? data.tabs : []
  return new Map(
    tabs
      .filter((item) => isPlainObject(item) && item.key)
      .map((item) => [String(item.key), item])
  )
}

function getShopGoodsItems (data = {}) {
  const goods = Array.isArray(data?.goods) ? data.goods : []
  return goods.filter((item) => isPlainObject(item))
}

function groupGoodsByTab (items = [], tabMap = new Map()) {
  const groups = new Map()

  for (const item of items) {
    const key = String(item?.tab || 'unknown')
    const tabInfo = tabMap.get(key)
    const title = tabInfo?.name ? `${tabInfo.name}商品` : `${key} 商品`
    const list = groups.get(title) || []
    list.push(item)
    groups.set(title, list)
  }

  return groups
}

function buildShopGoodsSummaryMessage (data = {}, query = {}) {
  const goods = getShopGoodsItems(data)
  const tabs = Array.isArray(data?.tabs) ? data.tabs : []
  const currentTime = formatDateTime(data?.nowTime)

  return joinLines([
    '塔吉多商城',
    `商品数：${goods.length}`,
    `分类：${query?.tab || 'all'}`,
    `数量：${query?.count ?? SHOP_LIST_DEFAULT_COUNT}`,
    `分页版本：${data?.version ?? query?.version ?? SHOP_LIST_DEFAULT_VERSION}`,
    `更多：${data?.more ? '有' : '无'}`,
    tabs.length > 0 ? `可用分类：${tabs.map((item) => `${item.name || item.key}(${item.key})`).join('、')}` : '',
    currentTime ? `商城时间：${currentTime}` : ''
  ])
}

function buildShopGoodsGroupMessage (title = '', items = []) {
  const lines = [title]

  if (items.length === 0) {
    lines.push('当前暂无商品')
    return joinLines(lines)
  }

  items.forEach((item, index) => {
    lines.push(`${index + 1}. [${item?.id || '未知ID'}] ${item?.name || '未命名商品'}`)
    lines.push(buildShopGoodsMetaLine(item))
    lines.push(`分类：${item?.tab || '未知'} | 状态：${formatGoodsState(item)}`)

    if (index < items.length - 1) {
      lines.push('===')
    }
  })

  return joinLines(lines)
}

function buildShopGoodsMessages (data = {}, query = {}) {
  const items = getShopGoodsItems(data)
  const messages = [buildShopGoodsSummaryMessage(data, query)]

  if (items.length === 0) {
    return messages
  }

  const groups = groupGoodsByTab(items, getTabMap(data))
  for (const [title, groupItems] of groups.entries()) {
    messages.push(buildShopGoodsGroupMessage(title, groupItems))
  }

  return messages
}

function buildShopGoodsDetailMessage (data = {}) {
  const item = isPlainObject(data?.item) ? data.item : {}
  const rules = isPlainObject(data?.rules) ? data.rules : {}
  const detailText = stripHtml(item?.detail)
  const metaLine = item?.price !== undefined || getPositiveStock(item) !== null || formatGoodsLimit(item)
    ? buildShopGoodsMetaLine(item)
    : ''

  return joinLines([
    '塔吉多商品详情',
    `商品ID：${data?.goodsId || item?.id || '未返回'}`,
    `名称：${item?.name || '未返回'}`,
    metaLine,
    item?.tab ? `分类：${item.tab}` : '',
    item?.state !== undefined ? `状态：${formatGoodsState(item)}` : '',
    detailText ? '' : '',
    detailText ? `详情：${detailText}` : '',
    Object.keys(rules).length > 0 ? '' : '',
    rules?.communityLevel !== undefined ? `社区等级要求：${rules.communityLevel}` : '',
    rules?.gameRoleLevel !== undefined ? `角色等级要求：${rules.gameRoleLevel}` : '',
    rules?.supportServerType !== undefined ? `支持服务器类型：${rules.supportServerType}` : '',
    !Object.keys(rules).length && data?.rulesRaw ? `规则：${data.rulesRaw}` : ''
  ])
}

function buildShopCoinStateMessage (data = {}) {
  const todayGet = Number(data?.todayGet)
  const todayTotal = Number(data?.todayTotal)
  const total = pickFirstNonEmpty(data?.total, '未返回')
  const remaining = Number.isFinite(todayGet) && Number.isFinite(todayTotal) ? Math.max(todayTotal - todayGet, 0) : undefined

  return joinLines([
    '塔吉多币状态',
    `当前总数：${total}`,
    Number.isFinite(todayGet) && Number.isFinite(todayTotal) ? `今日获取：${todayGet}/${todayTotal}` : '',
    remaining !== undefined ? `今日剩余：${remaining}` : ''
  ])
}

function buildShopRolesMessage (data = {}, game = null) {
  const roles = Array.isArray(data?.roles) ? data.roles.filter((item) => isPlainObject(item)) : []

  const lines = [
    `${game?.name || data?.gameId || '未知游戏'}商城角色`,
    `游戏：${game?.name || data?.gameId || '未返回'}${game?.id ? ` (${game.id})` : ''}`,
    data?.bindRole !== undefined ? `当前绑定角色：${data.bindRole}` : '',
    `角色数量：${roles.length}`
  ]

  if (roles.length === 0) {
    lines.push('当前暂无角色数据')
    return joinLines(lines)
  }

  roles.forEach((item, index) => {
    const parts = [`${index + 1}. ${item?.roleName || '未命名角色'}`]

    if (item?.lev !== undefined) {
      parts.push(`等级 ${item.lev}`)
    }

    if (item?.serverName) {
      parts.push(`区服 ${item.serverName}`)
    }

    if (String(data?.bindRole || '') === String(item?.roleId || '')) {
      parts.push('当前绑定')
    }

    lines.push(parts.join(' | '))
    lines.push(`roleId：${item?.roleId || '未返回'}`)
  })

  return joinLines(lines)
}

function buildShopExchangeReply (data = {}, payload = {}) {
  const resultText = data?.upstream?.success === true
    ? '成功'
    : pickFirstNonEmpty(data?.message, data?.upstream?.message, '提交成功')

  return joinLines([
    '塔吉多商品兑换完成',
    payload?.item?.name ? `商品：${payload.item.name}` : '',
    `商品ID：${data?.goodsId || payload?.goodsId || '未返回'}`,
    `游戏：${payload?.game?.name || payload?.game?.id || payload?.gameId || '未返回'}`,
    payload?.role?.roleName ? `角色：${payload.role.roleName}` : '',
    `角色ID：${data?.roleId || payload?.role?.roleId || payload?.roleId || '未返回'}`,
    `数量：${data?.count || payload?.count || 1}`,
    `结果：${resultText}`
  ])
}

function normalizeSearchText (value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function buildGoodsChoiceMessage (keyword = '', matches = []) {
  const lines = [
    `找到多个商品：${keyword}`,
    '请改用商品ID重新发送'
  ]

  matches.slice(0, 10).forEach((item, index) => {
    lines.push(`${index + 1}. [${item?.id || '未知ID'}] ${item?.name || '未命名商品'}`)
  })

  return joinLines(lines)
}

function findGoodsMatches (items = [], keyword = '') {
  const normalizedKeyword = normalizeSearchText(keyword)
  if (!normalizedKeyword) {
    return []
  }

  const exactMatches = items.filter((item) => normalizeSearchText(item?.name) === normalizedKeyword)
  if (exactMatches.length > 0) {
    return exactMatches
  }

  const startsWithMatches = items.filter((item) => normalizeSearchText(item?.name).startsWith(normalizedKeyword))
  if (startsWithMatches.length > 0) {
    return startsWithMatches
  }

  return items.filter((item) => normalizeSearchText(item?.name).includes(normalizedKeyword))
}

function normalizeAccountItem (item = {}, currentSession = {}) {
  const fwt = String(item?.fwt || '').trim()
  if (!fwt) {
    return null
  }

  return {
    fwt,
    username: String(item?.username || (currentSession?.fwt === fwt ? currentSession?.username : '') || '').trim(),
    tgdUid: String(item?.tjdUid || item?.tgdUid || '').trim(),
    isPrimary: item?.isPrimary === true || currentSession?.fwt === fwt
  }
}

function formatAccountLabel (account = {}, index = 0) {
  const parts = []

  if (account?.username) {
    parts.push(account.username)
  }

  if (account?.tgdUid) {
    parts.push(`UID ${account.tgdUid}`)
  }

  if (account?.isPrimary) {
    parts.push('当前')
  }

  const text = parts.join(' | ') || `账号 ${index + 1}`
  return `${index + 1}. ${text}`
}

function buildAccountSelectionReply (accounts = []) {
  const lines = ['请选择账号']

  accounts.forEach((account, index) => {
    lines.push(formatAccountLabel(account, index))
  })

  lines.push('请直接回复序号即可')
  return joinLines(lines)
}

function buildAccountChoiceHint (account = {}) {
  return account?.username
    ? `${account.username}${account?.tgdUid ? ` | UID ${account.tgdUid}` : ''}`
    : account?.tgdUid
      ? `UID ${account.tgdUid}`
      : '已选择账号'
}

function sortAccounts (accounts = []) {
  return [...accounts].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
      return left.isPrimary ? -1 : 1
    }

    const leftName = `${left.username || ''}|${left.tgdUid || ''}`
    const rightName = `${right.username || ''}|${right.tgdUid || ''}`
    return leftName.localeCompare(rightName, 'zh-CN')
  })
}

function dedupeAccounts (accounts = []) {
  const map = new Map()
  for (const account of accounts) {
    const normalized = normalizeAccountItem(account)
    if (normalized?.fwt) {
      map.set(normalized.fwt, normalized)
    }
  }
  return [...map.values()]
}

function getBoundRole (data = {}) {
  const roles = Array.isArray(data?.roles) ? data.roles.filter((item) => isPlainObject(item)) : []
  const bindRole = String(data?.bindRole || '').trim()

  if (bindRole) {
    return roles.find((item) => String(item?.roleId || '') === bindRole) || { roleId: bindRole }
  }

  if (roles.length === 1) {
    return roles[0]
  }

  return null
}

export class Shop extends plugin {
  constructor () {
    super({
      name: '[TaJiDuo-plugin] 商城',
      dsc: 'TaJiDuo 商城查询与兑换',
      event: 'message',
      priority: 92,
      rule: [
        { reg: buildCommandReg('商城(?:\\s+.*)?'), fnc: 'listShopGoods' },
        { reg: buildCommandReg('商品(?:\\s+.+)?'), fnc: 'showShopGoodsDetail' },
        { reg: buildCommandReg('(?:塔吉多币查询|塔吉多币|塔币查询|塔币|币状态)'), fnc: 'showShopCoinState' },
        { reg: buildCommandReg('(?:商城角色列表|商城角色)(?:\\s+.*)?'), fnc: 'listShopGameRoles' },
        { reg: buildCommandReg('(?:兑换商品|商城兑换)(?:\\s+.+)?'), fnc: 'exchangeShopGoods' },
        { reg: ACCOUNT_SELECTION_MESSAGE_REG, fnc: 'consumeAccountSelection' }
      ]
    })

    this.api = new TaJiDuoApi()
  }

  async listShopGoods () {
    const parsed = parseShopGoodsArgs(this.e.msg)
    if (!parsed.valid) {
      await this.reply(`格式：${SHOP_COMMAND_EXAMPLES.goods}`)
      return true
    }

    try {
      await this.startAccountSelection({
        type: 'goods',
        payload: parsed
      })
    } catch (error) {
      return this.replyFailure('塔吉多商城失败', error)
    }

    return true
  }

  async showShopGoodsDetail () {
    const parsed = parseShopGoodsDetailArgs(this.e.msg)
    if (!parsed.valid) {
      await this.reply(`格式：${SHOP_COMMAND_HINTS.detail}`)
      return true
    }

    try {
      await this.startAccountSelection({
        type: 'detail',
        payload: parsed
      })
    } catch (error) {
      return this.replyFailure('塔吉多商品详情失败', error)
    }

    return true
  }

  async showShopCoinState () {
    try {
      await this.startAccountSelection({
        type: 'coin',
        payload: {}
      })
    } catch (error) {
      return this.replyFailure('塔吉多币状态失败', error)
    }

    return true
  }

  async listShopGameRoles () {
    const parsed = parseShopRolesArgs(this.e.msg)
    if (!parsed.valid) {
      await this.reply(`格式：${SHOP_COMMAND_EXAMPLES.roles}`)
      return true
    }

    try {
      await this.startAccountSelection({
        type: 'roles',
        payload: parsed
      })
    } catch (error) {
      return this.replyFailure('塔吉多商城角色失败', error)
    }

    return true
  }

  async exchangeShopGoods () {
    const parsed = parseShopExchangeArgs(this.e.msg)
    if (!parsed.valid) {
      await this.reply(`格式：${SHOP_COMMAND_HINTS.exchange}`)
      return true
    }

    try {
      await this.startAccountSelection({
        type: 'exchange',
        payload: parsed
      })
    } catch (error) {
      return this.replyFailure('塔吉多商品兑换失败', error)
    }

    return true
  }

  async consumeAccountSelection () {
    const pendingAction = this.getPendingAction()
    if (!pendingAction) {
      return false
    }

    const selectedIndex = normalizePositiveInt(String(this.e.msg || '').trim())
    if (!selectedIndex) {
      return false
    }

    const selectedAccount = pendingAction.accounts[selectedIndex - 1]
    if (!selectedAccount) {
      await this.reply(`序号无效，请直接回复 1-${pendingAction.accounts.length}`)
      return true
    }

    this.clearPendingAction()

    try {
      await this.executeAction(pendingAction.action, selectedAccount)
    } catch (error) {
      return this.replyFailure(pendingAction.action?.title || '塔吉多商城操作失败', error, selectedAccount)
    }

    return true
  }

  async startAccountSelection (action = {}) {
    const accounts = await this.getAvailableAccounts()

    if (accounts.length <= 1) {
      await this.executeAction(action, accounts[0])
      return
    }

    this.savePendingAction(action, accounts)
    await this.reply(buildAccountSelectionReply(accounts))
  }

  async executeAction (action = {}, account = {}) {
    const type = String(action?.type || '').trim()
    const payload = isPlainObject(action?.payload) ? action.payload : {}

    if (!account?.fwt) {
      throw new Error('未找到可用账号，请重新登录后再试')
    }

    if (type === 'goods') {
      await this.executeListShopGoods(account, payload)
      return
    }

    if (type === 'detail') {
      await this.executeShowShopGoodsDetail(account, payload)
      return
    }

    if (type === 'coin') {
      await this.executeShowShopCoinState(account)
      return
    }

    if (type === 'roles') {
      await this.executeListShopGameRoles(account, payload)
      return
    }

    if (type === 'exchange') {
      await this.executeExchangeShopGoods(account, payload)
      return
    }

    throw new Error('未识别的商城操作')
  }

  async executeListShopGoods (account = {}, payload = {}) {
    await this.reply(joinLines([
      `已选择账号：${buildAccountChoiceHint(account)}`,
      '塔吉多商城查询中，请稍候...'
    ]))

    const data = await this.api.listShopGoods({
      fwt: account.fwt,
      tab: payload?.tab,
      count: payload?.count,
      version: payload?.version
    })

    await this.replyForwardMessages('塔吉多商城', buildShopGoodsMessages(data, payload))
  }

  async executeShowShopGoodsDetail (account = {}, payload = {}) {
    await this.reply(joinLines([
      `已选择账号：${buildAccountChoiceHint(account)}`,
      '塔吉多商品详情查询中，请稍候...'
    ]))

    const resolved = await this.resolveGoods(account.fwt, payload?.keyword)
    const data = await this.api.getShopGoodsDetail(resolved.goodsId, { fwt: account.fwt })

    if (resolved?.item?.tab && !data?.item?.tab) {
      data.item = {
        ...data.item,
        tab: resolved.item.tab,
        state: resolved.item.state,
        stock: resolved.item.stock,
        limit: resolved.item.limit,
        exchangeNum: resolved.item.exchangeNum,
        cycleLimit: resolved.item.cycleLimit,
        cycleType: resolved.item.cycleType
      }
    }

    await this.reply(buildShopGoodsDetailMessage(data))
  }

  async executeShowShopCoinState (account = {}) {
    await this.reply(joinLines([
      `已选择账号：${buildAccountChoiceHint(account)}`,
      '塔吉多币状态查询中，请稍候...'
    ]))

    const data = await this.api.getShopCoinState({ fwt: account.fwt })
    await this.reply(buildShopCoinStateMessage(data))
  }

  async executeListShopGameRoles (account = {}, payload = {}) {
    const games = Array.isArray(payload?.games) && payload.games.length > 0
      ? payload.games
      : [...SHOP_GAME_CONFIGS]

    await this.reply(joinLines([
      `已选择账号：${buildAccountChoiceHint(account)}`,
      '塔吉多商城角色查询中，请稍候...'
    ]))

    const results = await Promise.allSettled(
      games.map((game) => this.api.getShopGameRoles({
        fwt: account.fwt,
        gameId: game.id
      }))
    )

    const messages = results.map((result, index) => {
      const game = games[index]

      if (result.status === 'fulfilled') {
        return buildShopRolesMessage(result.value, game)
      }

      return joinLines([
        `${game?.name || '未知游戏'}商城角色`,
        `查询失败：${getErrorMessage(result.reason)}`
      ])
    })

    await this.replyForwardMessages('塔吉多商城角色列表', messages)
  }

  async executeExchangeShopGoods (account = {}, payload = {}) {
    await this.reply(joinLines([
      `已选择账号：${buildAccountChoiceHint(account)}`,
      '塔吉多商品兑换中，请稍候...'
    ]))

    const resolved = await this.resolveGoods(account.fwt, payload?.keyword, {
      requireCatalog: true
    })

    const game = resolveShopGameByTab(resolved?.item?.tab, resolved?.catalog?.tabs)
    if (!game?.id) {
      throw new Error('未能识别该商品所属游戏，暂时无法自动兑换')
    }

    const rolesData = await this.api.getShopGameRoles({
      fwt: account.fwt,
      gameId: game.id
    })
    const role = getBoundRole(rolesData)

    if (!role?.roleId) {
      throw new Error(joinLines([
        `当前账号未返回 ${game.name} 的已绑定商城角色，暂时无法自动兑换`,
        `可先发送 ${formatCommand('商城角色列表')} 查看角色列表`
      ]))
    }

    const data = await this.api.shopExchange({
      fwt: account.fwt,
      goodsId: resolved.goodsId,
      gameId: game.id,
      roleId: String(role.roleId),
      count: payload?.count
    })

    await this.reply(buildShopExchangeReply(data, {
      ...payload,
      goodsId: resolved.goodsId,
      item: resolved.item,
      game,
      role
    }))
  }

  async getAvailableAccounts () {
    const currentSession = await getStoredSession(this.e)
    if (!currentSession?.fwt) {
      throw new Error(NO_SESSION_REPLY)
    }

    const data = await this.api.listAccounts({ fwt: currentSession.fwt })
    const items = Array.isArray(data?.items) ? data.items : []

    const normalizedAccounts = dedupeAccounts([
      ...items.map((item) => normalizeAccountItem(item, currentSession)).filter(Boolean),
      normalizeAccountItem(currentSession, currentSession)
    ])

    if (normalizedAccounts.length === 0) {
      throw new Error(NO_SESSION_REPLY)
    }

    return sortAccounts(normalizedAccounts)
  }

  async fetchShopGoodsCatalog (fwt = '', options = {}) {
    const tab = normalizeShopTab(options?.tab || 'all') || 'all'
    const count = normalizePositiveInt(options?.count) || SHOP_CATALOG_FETCH_COUNT
    let version = SHOP_LIST_DEFAULT_VERSION
    let previousVersion = null
    let nowTime = ''
    let more = false

    const goodsMap = new Map()
    const tabsMap = new Map()

    for (let page = 0; page < SHOP_CATALOG_MAX_PAGES; page += 1) {
      const data = await this.api.listShopGoods({
        fwt,
        tab,
        count,
        version
      })

      getShopGoodsItems(data).forEach((item) => {
        const key = String(item?.id || '').trim()
        if (key) {
          goodsMap.set(key, item)
        }
      })

      const tabs = Array.isArray(data?.tabs) ? data.tabs : []
      tabs.forEach((item) => {
        const key = String(item?.key || '').trim()
        if (key) {
          tabsMap.set(key, item)
        }
      })

      nowTime = data?.nowTime || nowTime
      more = Boolean(data?.more)

      const nextVersion = Number(data?.version)
      if (!more || !Number.isFinite(nextVersion) || nextVersion === previousVersion) {
        version = nextVersion
        break
      }

      previousVersion = version
      version = nextVersion
    }

    return {
      goods: [...goodsMap.values()],
      tabs: [...tabsMap.values()],
      more,
      version,
      nowTime
    }
  }

  async resolveGoods (fwt = '', keyword = '', options = {}) {
    const text = String(keyword || '').trim()
    if (!text) {
      throw new Error('缺少商品 ID 或名称')
    }

    const requireCatalog = options?.requireCatalog === true || !/^\d+$/.test(text)
    if (!requireCatalog) {
      return {
        goodsId: text,
        item: null,
        catalog: null
      }
    }

    const catalog = await this.fetchShopGoodsCatalog(fwt)
    const items = getShopGoodsItems(catalog)

    if (/^\d+$/.test(text)) {
      const matchedById = items.find((item) => String(item?.id || '').trim() === text)
      if (!matchedById) {
        throw new Error(`未找到商品：${text}`)
      }

      return {
        goodsId: text,
        item: matchedById,
        catalog
      }
    }

    const matches = findGoodsMatches(items, text)
    if (matches.length === 0) {
      throw new Error(`未找到商品：${text}`)
    }

    if (matches.length > 1) {
      throw new Error(buildGoodsChoiceMessage(text, matches))
    }

    return {
      goodsId: String(matches[0]?.id || '').trim(),
      item: matches[0],
      catalog
    }
  }

  getPendingKey () {
    const { selfId, userId } = getSessionIdentity(this.e)
    return `${selfId}:${String(userId || '').trim()}`
  }

  getPendingAction () {
    const pendingAction = PENDING_SHOP_ACTION_MAP.get(this.getPendingKey())
    if (!pendingAction) {
      return null
    }

    if (Date.now() > Number(pendingAction.expiresAt || 0)) {
      this.clearPendingAction()
      this.reply('账号选择已过期，请重新发送商城命令').catch(() => {})
      return null
    }

    return pendingAction
  }

  savePendingAction (action = {}, accounts = []) {
    PENDING_SHOP_ACTION_MAP.set(this.getPendingKey(), {
      action: {
        ...action,
        title: action?.title || this.getActionTitle(action?.type)
      },
      accounts,
      expiresAt: Date.now() + SHOP_SELECTION_TIMEOUT_MS
    })
  }

  clearPendingAction () {
    PENDING_SHOP_ACTION_MAP.delete(this.getPendingKey())
  }

  getActionTitle (type = '') {
    if (type === 'goods') return '塔吉多商城失败'
    if (type === 'detail') return '塔吉多商品详情失败'
    if (type === 'coin') return '塔吉多币状态失败'
    if (type === 'roles') return '塔吉多商城角色失败'
    if (type === 'exchange') return '塔吉多商品兑换失败'
    return '塔吉多商城操作失败'
  }

  async replyForwardMessages (title = '', messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) {
      await this.reply(`${title}\n暂无数据`)
      return
    }

    if (messages.length === 1) {
      await this.reply(messages[0])
      return
    }

    const forward = await common.makeForwardMsg(this.e, messages, title)
    await this.reply(forward)
  }

  async replyFailure (title = '', error, account = null) {
    if (isAuthExpiredError(error)) {
      const currentSession = await getStoredSession(this.e)

      if (currentSession?.fwt && (!account?.fwt || account.fwt === currentSession.fwt)) {
        await clearCurrentUserSession(this.e)
        this.clearPendingAction()
        await this.reply(buildReloginReply(title, getErrorMessage(error) || AUTH_EXPIRED_MESSAGE))
        return true
      }

      await this.reply(`${title}：当前选择的账号已失效，请重新登录该账号或切换其他账号`)
      return true
    }

    await this.reply(`${title}：${getErrorMessage(error)}`)
    return true
  }
}
