import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
import TaJiDuoApi from '../model/api.js'
import { clearUserSession, listUserSessions } from '../model/store.js'
import Config from '../utils/config.js'
import {
  AUTH_EXPIRED_MESSAGE,
  buildReloginReply,
  getErrorMessage,
  isAuthExpiredError
} from '../utils/auth.js'
import { joinLines, normalizePositiveInt, pickFirstNonEmpty } from '../utils/common.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'
import {
  describeStoredSessionTarget,
  normalizeNotifyList,
  sendNotifyList
} from '../utils/notify.js'
import {
  clearStoredSessionFromEvent,
  getStoredFwtFromEvent
} from '../utils/session.js'

const DEFAULT_AUTO_GAME_SIGN_CRON = '0 25 0 * * *'

const GAME_SIGN_GAMES = Object.freeze({
  huanta: {
    key: 'huanta',
    name: '幻塔',
    title: '塔吉多幻塔签到',
    prefixKey: 'huanta',
    rolesMethod: 'huantaRoles',
    stateMethod: 'huantaSignState',
    signMethod: 'huantaSignGame',
    parsePatterns: [
      /^#?(?:幻塔|[Tt][Oo][Ff]|[Hh][Tt])\s*(?:签到|游戏签到)\s*(.*)$/u,
      /^#?(?:塔吉多|[Tt][Jj][Dd])\s*(?:幻塔签到|幻塔游戏签到)\s*(.*)$/u
    ],
    explicitCommandPattern: '(?:幻塔签到|幻塔游戏签到)(?:\\s+.*)?'
  },
  yihuan: {
    key: 'yihuan',
    name: '异环',
    title: '塔吉多异环签到',
    prefixKey: 'yihuan',
    rolesMethod: 'yihuanRoles',
    stateMethod: 'yihuanSignState',
    signMethod: 'yihuanSignGame',
    parsePatterns: [
      /^#?(?:异环|[Nn][Tt][Ee]|[Yy][Hh])\s*(?:签到|游戏签到)\s*(.*)$/u,
      /^#?(?:塔吉多|[Tt][Jj][Dd])\s*(?:异环签到|异环游戏签到)\s*(.*)$/u
    ],
    explicitCommandPattern: '(?:异环签到|异环游戏签到)(?:\\s+.*)?'
  }
})

const GAME_SIGN_GAME_KEYS = Object.freeze(Object.keys(GAME_SIGN_GAMES))

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSearchText (value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function normalizeCronExpression (cronExpression = '') {
  if (!cronExpression || typeof cronExpression !== 'string') {
    throw new Error('无效的 cron 表达式：输入必须是字符串')
  }

  const cron = cronExpression.replace(/\?/g, '*')
  const parts = cron.split(/\s+/).filter(Boolean)

  if (parts.length === 5) {
    parts.unshift('0')
  } else if (parts.length === 7) {
    parts.pop()
  }

  if (parts.length !== 6) {
    throw new Error(`无效的 cron 表达式 "${cronExpression}"，无法转换为六位格式`)
  }

  return parts.join(' ')
}

function getGameConfig (gameKey = '') {
  return GAME_SIGN_GAMES[String(gameKey || '').trim()]
}

function normalizeRoleList (data = {}) {
  const roles = Array.isArray(data?.roles) ? data.roles.filter((item) => isPlainObject(item)) : []
  const bindRole = String(data?.bindRole || '').trim()
  const normalizedBindRole = bindRole === '0' ? '' : bindRole
  const seenRoleIds = new Set()
  const list = []

  for (const item of roles) {
    const roleId = String(item?.roleId || '').trim()
    if (!roleId || seenRoleIds.has(roleId)) {
      continue
    }

    seenRoleIds.add(roleId)
    list.push({
      ...item,
      roleId,
      isBound: normalizedBindRole && normalizedBindRole === roleId
    })
  }

  if (normalizedBindRole && !seenRoleIds.has(normalizedBindRole)) {
    list.unshift({
      roleId: normalizedBindRole,
      isBound: true
    })
  }

  return list
}

function buildRoleLabel (role = {}, index = 0) {
  const parts = [`${index + 1}. ${role?.roleName || role?.roleId || '未命名角色'}`]

  if (role?.lev !== undefined) {
    parts.push(`等级 ${role.lev}`)
  }

  if (role?.serverName) {
    parts.push(`区服 ${role.serverName}`)
  }

  if (role?.isBound) {
    parts.push('绑定角色')
  }

  return parts.join(' | ')
}

function buildRoleSelectionReply (gameKey = '', rolesData = {}, query = '') {
  const config = getGameConfig(gameKey)
  const roles = normalizeRoleList(rolesData)
  const commandPrefix = formatCommand('签到', config?.prefixKey)
  const gameName = config?.name || gameKey

  if (roles.length === 0) {
    return joinLines([
      `当前账号下未查询到${gameName}角色`,
      `请确认该塔吉多账号已绑定${gameName}角色后再试`
    ])
  }

  const lines = [
    query
      ? `未找到匹配的${gameName}角色：${query}`
      : `当前账号下存在多个${gameName}角色，请指定要签到的角色`
  ]

  roles.forEach((role, index) => {
    lines.push(buildRoleLabel(role, index))
    lines.push(`roleId：${role.roleId}`)
  })

  lines.push('')
  lines.push(`示例：${commandPrefix} 1`)

  if (roles[0]?.roleId) {
    lines.push(`或：${commandPrefix} ${roles[0].roleId}`)
  }

  lines.push(`也支持：${commandPrefix} 角色名`)
  return joinLines(lines)
}

function buildRoleDetailLines (role = {}, selectionSource = '') {
  const lines = []

  if (selectionSource === 'bound') {
    lines.push('角色选择：已自动使用绑定角色')
  } else if (selectionSource === 'single') {
    lines.push('角色选择：当前仅有一个角色，已自动使用')
  }

  lines.push(`角色：${role?.roleName || role?.roleId || '未返回'}`)

  if (role?.serverName) {
    lines.push(`区服：${role.serverName}`)
  }

  if (role?.lev !== undefined) {
    lines.push(`等级：${role.lev}`)
  }

  if (role?.roleId) {
    lines.push(`角色ID：${role.roleId}`)
  }

  return lines
}

function buildStateLines (state = {}) {
  const lines = []
  const month = Number(state?.month)
  const day = Number(state?.day)

  if (Number.isFinite(month) && Number.isFinite(day)) {
    lines.push(`日期：${month}月${day}日`)
  }

  if (state?.todaySign !== undefined) {
    lines.push(`今日状态：${state.todaySign ? '已签到' : '未签到'}`)
  }

  if (state?.days !== undefined) {
    lines.push(`累计签到：${state.days}`)
  }

  if (state?.reSignCnt !== undefined) {
    lines.push(`补签次数：${state.reSignCnt}`)
  }

  return lines
}

function normalizeUpstreamMessage (value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (['ok', 'success'].includes(text.toLowerCase())) {
    return ''
  }

  return text
}

function buildAlreadySignedReply (gameKey = '', state = {}, role = null, selectionSource = '', fallbackMessage = '') {
  const config = getGameConfig(gameKey)

  return joinLines([
    config?.title || `${config?.name || gameKey}签到`,
    ...(role ? buildRoleDetailLines(role, selectionSource) : []),
    ...buildStateLines(state),
    `结果：${pickFirstNonEmpty(fallbackMessage, '今天已经签到过了')}`
  ])
}

function buildGameSignReply (gameKey = '', role = {}, selectionSource = '', data = {}, state = {}) {
  const config = getGameConfig(gameKey)
  const upstream = isPlainObject(data?.upstream) ? data.upstream : {}
  const success = data?.success !== false && upstream?.success !== false
  const resultMessage = pickFirstNonEmpty(
    normalizeUpstreamMessage(data?.reward),
    normalizeUpstreamMessage(data?.message),
    normalizeUpstreamMessage(upstream?.message),
    success ? '签到成功' : '签到失败'
  )

  return joinLines([
    `${config?.title || `${config?.name || gameKey}签到`}完成`,
    ...buildRoleDetailLines(role, selectionSource),
    ...buildStateLines(state),
    `结果：${success ? '成功' : '失败'}${resultMessage ? ` | ${resultMessage}` : ''}`
  ])
}

function resolveRoleSelection (rolesData = {}, query = '') {
  const roles = normalizeRoleList(rolesData)
  const keyword = String(query || '').trim()

  if (!keyword) {
    const boundRole = roles.find((item) => item?.isBound)
    if (boundRole) {
      return {
        role: boundRole,
        roles,
        selectionSource: 'bound'
      }
    }

    if (roles.length === 1) {
      return {
        role: roles[0],
        roles,
        selectionSource: 'single'
      }
    }

    return {
      role: null,
      roles,
      selectionSource: ''
    }
  }

  const directRole = roles.find((item) => String(item?.roleId || '') === keyword)
  if (directRole) {
    return {
      role: directRole,
      roles,
      selectionSource: 'roleId'
    }
  }

  const selectedIndex = normalizePositiveInt(keyword)
  if (selectedIndex && roles[selectedIndex - 1]) {
    return {
      role: roles[selectedIndex - 1],
      roles,
      selectionSource: 'index'
    }
  }

  const normalizedKeyword = normalizeSearchText(keyword)

  const exactRole = roles.find((item) => {
    const roleName = normalizeSearchText(item?.roleName)
    const serverName = normalizeSearchText(item?.serverName)
    return roleName === normalizedKeyword || serverName === normalizedKeyword
  })

  if (exactRole) {
    return {
      role: exactRole,
      roles,
      selectionSource: 'name'
    }
  }

  const fuzzyMatches = roles.filter((item) => {
    const roleName = normalizeSearchText(item?.roleName)
    const serverName = normalizeSearchText(item?.serverName)
    return roleName.includes(normalizedKeyword) || serverName.includes(normalizedKeyword)
  })

  if (fuzzyMatches.length === 1) {
    return {
      role: fuzzyMatches[0],
      roles,
      selectionSource: 'name'
    }
  }

  return {
    role: null,
    roles,
    selectionSource: ''
  }
}

function resolveAutoGameRole (rolesData = {}) {
  const roles = normalizeRoleList(rolesData)

  if (roles.length === 0) {
    return {
      role: null,
      roles,
      selectionSource: 'none'
    }
  }

  const boundRole = roles.find((item) => item?.isBound)
  if (boundRole) {
    return {
      role: boundRole,
      roles,
      selectionSource: 'bound'
    }
  }

  if (roles.length === 1) {
    return {
      role: roles[0],
      roles,
      selectionSource: 'single'
    }
  }

  return {
    role: null,
    roles,
    selectionSource: 'ambiguous'
  }
}

function parseGameSignArgs (gameKey = '', message = '') {
  const config = getGameConfig(gameKey)
  const text = String(message || '').trim()

  for (const pattern of config?.parsePatterns || []) {
    const matched = text.match(pattern)
    if (matched) {
      return String(matched[1] || '').trim()
    }
  }

  return ''
}

function isAlreadySignedError (error) {
  return /已签|签到过/.test(getErrorMessage(error))
}

function getAutoGameSignConfig () {
  const config = isPlainObject(Config.get('tajiduo', 'auto_game_sign'))
    ? Config.get('tajiduo', 'auto_game_sign')
    : {}
  const communityConfig = isPlainObject(Config.get('tajiduo', 'auto_sign'))
    ? Config.get('tajiduo', 'auto_sign')
    : {}

  return {
    enabled: config?.enabled !== false,
    cron: String(config?.cron || DEFAULT_AUTO_GAME_SIGN_CRON).trim() || DEFAULT_AUTO_GAME_SIGN_CRON,
    notifyList: normalizeNotifyList(config?.notify_list, communityConfig?.notify_list)
  }
}

function getAutoGameSignTaskCron () {
  const configuredCron = getAutoGameSignConfig().cron || DEFAULT_AUTO_GAME_SIGN_CRON

  try {
    return normalizeCronExpression(configuredCron)
  } catch (error) {
    logger.error(`[TaJiDuo-plugin] 自动游戏签到 cron 表达式无效，已回退默认值: ${error?.message || error}`)
    return DEFAULT_AUTO_GAME_SIGN_CRON
  }
}

function buildAutoGameSignStartMessage (count = 0) {
  return joinLines([
    '塔吉多每日游戏签到开始',
    `执行账号数：${Math.max(0, Number(count) || 0)}`,
    `执行游戏：${GAME_SIGN_GAME_KEYS.map((gameKey) => GAME_SIGN_GAMES[gameKey]?.name || gameKey).join('、')}`
  ])
}

function buildGameSignResultLines (result = {}) {
  const lines = [`${result?.gameName || '游戏'}签到：`]

  if (result?.ignored) {
    lines.push(`结果：已跳过 | ${result?.errorMessage || result?.message || '当前账号未绑定可执行角色'}`)
    return lines
  }

  if (!result?.success) {
    lines.push(`结果：失败 | ${result?.errorMessage || '执行失败'}`)
    return lines
  }

  const resultText = result?.skipped ? '已跳过' : '成功'
  lines.push(`结果：${resultText}${result?.message ? ` | ${result.message}` : ''}`)

  if (result?.role) {
    lines.push(...buildRoleDetailLines(result.role, result.selectionSource))
  }

  const stateLines = buildStateLines(result?.stateAfter || result?.stateBefore)
  if (stateLines.length > 0) {
    lines.push(...stateLines)
  }

  return lines
}

function getAutoGameSignEntryStats (entry = {}) {
  const results = Array.isArray(entry?.results) ? entry.results : []
  const applicableResults = results.filter((result) => result?.ignored !== true)
  const completedResults = applicableResults.filter((result) => result?.success)
  const ignoredResults = results.filter((result) => result?.ignored === true)

  return {
    applicableResults,
    completedResults,
    ignoredResults
  }
}

function buildAutoGameSignAccountStatusLine (entry = {}) {
  if (entry?.errorMessage) {
    return `账号结果：失败 | ${entry.errorMessage}`
  }

  const {
    applicableResults,
    completedResults,
    ignoredResults
  } = getAutoGameSignEntryStats(entry)

  if (applicableResults.length === 0) {
    if (ignoredResults.length > 0) {
      return '账号结果：已跳过 | 当前账号没有已绑定的可执行游戏'
    }

    return '账号结果：暂无数据'
  }

  const progressText = `${completedResults.length}/${applicableResults.length} 个已绑定游戏`
  if (completedResults.length === applicableResults.length) {
    return `账号结果：已完成 | ${progressText}`
  }

  if (completedResults.length > 0) {
    return `账号结果：部分完成 | ${progressText}`
  }

  return `账号结果：失败 | ${progressText}`
}

function buildAutoGameSignSummaryLines (results = [], total = 0) {
  const statsMap = Object.fromEntries(
    GAME_SIGN_GAME_KEYS.map((gameKey) => [gameKey, {
      name: GAME_SIGN_GAMES[gameKey]?.name || gameKey,
      completedCount: 0
    }])
  )

  for (const entry of Array.isArray(results) ? results : []) {
    for (const result of Array.isArray(entry?.results) ? entry.results : []) {
      const gameKey = String(result?.gameKey || '').trim()
      if (!statsMap[gameKey]) {
        continue
      }

      if (result?.success) {
        statsMap[gameKey].completedCount += 1
      }
    }
  }

  return [
    `执行账号数：${Math.max(0, Number(total) || 0)}`,
    ...GAME_SIGN_GAME_KEYS.map((gameKey) => `${statsMap[gameKey].name}完成：${statsMap[gameKey].completedCount}`)
  ]
}

function buildAutoGameSignAccountResultLines (entry = {}) {
  const lines = [describeStoredSessionTarget(entry?.item)]

  lines.push(buildAutoGameSignAccountStatusLine(entry))

  const results = Array.isArray(entry?.results) ? entry.results : []
  if (results.length === 0) {
    lines.push('游戏结果：暂无数据')
    return lines
  }

  results.forEach((result) => {
    lines.push('', ...buildGameSignResultLines(result))
  })

  return lines
}

function buildAutoGameSignCompleteMessages (payload = {}) {
  const total = Math.max(0, Number(payload?.total) || 0)
  const results = Array.isArray(payload?.results) ? payload.results : []
  const summary = joinLines([
    '塔吉多每日游戏签到完成',
    ...buildAutoGameSignSummaryLines(results, total)
  ])

  return [
    summary,
    ...results.map((entry, index) => joinLines([
      `${index + 1}. ${describeStoredSessionTarget(entry?.item)}`,
      ...buildAutoGameSignAccountResultLines(entry).slice(1)
    ]))
  ]
}

export class GameSign extends plugin {
  constructor () {
    super({
      name: '[TaJiDuo-plugin] 游戏签到',
      dsc: 'TaJiDuo 游戏签到',
      event: 'message',
      priority: 96,
      rule: [
        { reg: buildCommandReg(GAME_SIGN_GAMES.huanta.explicitCommandPattern), fnc: 'signHuantaGame' },
        { reg: buildCommandReg('(?:签到|游戏签到)(?:\\s+.*)?', 'huanta'), fnc: 'signHuantaGame' },
        { reg: buildCommandReg(GAME_SIGN_GAMES.yihuan.explicitCommandPattern), fnc: 'signYihuanGame' },
        { reg: buildCommandReg('(?:签到|游戏签到)(?:\\s+.*)?', 'yihuan'), fnc: 'signYihuanGame' },
        {
          reg: buildCommandReg('(?:全部游戏签到|手动游戏签到|管理员游戏签到)'),
          fnc: 'manualAllGameSign',
          permission: 'admin'
        }
      ]
    })

    this.api = new TaJiDuoApi()
    this.task = [
      {
        name: '[TaJiDuo-plugin] 每日游戏签到',
        cron: getAutoGameSignTaskCron(),
        fnc: () => this.autoDailyGameSign()
      }
    ]
  }

  async signHuantaGame () {
    return this.signSingleGame('huanta')
  }

  async signYihuanGame () {
    return this.signSingleGame('yihuan')
  }

  async signSingleGame (gameKey = '') {
    const config = getGameConfig(gameKey)
    const roleQuery = parseGameSignArgs(gameKey, this.e.msg)

    try {
      const fwt = await getStoredFwtFromEvent(this.e)
      const stateBefore = await this.getGameSignState(gameKey, fwt, { silent: true })

      if (stateBefore?.todaySign === true) {
        await this.reply(buildAlreadySignedReply(gameKey, stateBefore))
        return true
      }

      const { fetchRoles, signGame } = this.getGameSignApiMethods(gameKey)
      const rolesData = await fetchRoles({ fwt })
      const selection = resolveRoleSelection(rolesData, roleQuery)

      if (!selection?.role?.roleId) {
        await this.reply(buildRoleSelectionReply(gameKey, rolesData, roleQuery))
        return true
      }

      await this.reply(joinLines([
        `${config?.title || `${config?.name || gameKey}签到`}中，请稍候...`,
        ...buildRoleDetailLines(selection.role, selection.selectionSource)
      ]))

      let signData
      try {
        signData = await signGame({
          fwt,
          roleId: String(selection.role.roleId)
        })
      } catch (error) {
        if (!isAlreadySignedError(error)) {
          throw error
        }

        await this.reply(buildAlreadySignedReply(
          gameKey,
          {
            ...(stateBefore || {}),
            todaySign: true
          },
          selection.role,
          selection.selectionSource,
          getErrorMessage(error)
        ))
        return true
      }

      const stateAfter = await this.getGameSignState(gameKey, fwt, { silent: true })
      await this.reply(buildGameSignReply(
        gameKey,
        selection.role,
        selection.selectionSource,
        signData,
        stateAfter || stateBefore || {}
      ))
      return true
    } catch (error) {
      return this.replyFailure(`${config?.title || `${config?.name || gameKey}签到`}失败`, error)
    }
  }

  async ensureManualSignPermission () {
    if (this.e?.isMaster) {
      return true
    }

    if (this.e?.isGroup && (this.e?.member?.is_owner || this.e?.member?.is_admin)) {
      return true
    }

    await this.reply('暂无权限，只有群管理员或主人才能操作')
    return false
  }

  async manualAllGameSign () {
    if (!(await this.ensureManualSignPermission())) {
      return true
    }

    try {
      const sessions = await listUserSessions()
      if (sessions.length === 0) {
        await this.reply('当前没有已保存账号，无法执行全部游戏签到')
        return true
      }

      await this.reply(`塔吉多全部游戏签到开始，共 ${sessions.length} 个账号，请稍候...`)
      const { results } = await this.executeGameSignForSessions(sessions, {
        logLabel: '手动全部游戏签到'
      })
      await this.replyQueryForward(
        '塔吉多全部游戏签到结果',
        buildAutoGameSignCompleteMessages({
          total: sessions.length,
          results
        })
      )
      return true
    } catch (error) {
      await this.reply(`塔吉多全部游戏签到失败：${getErrorMessage(error)}`)
      return true
    }
  }

  async autoDailyGameSign () {
    const autoSign = getAutoGameSignConfig()
    if (autoSign.enabled === false) {
      logger.info('[TaJiDuo-plugin] 每日自动游戏签到已关闭，跳过本次执行')
      return true
    }

    const sessions = await listUserSessions()
    if (sessions.length === 0) {
      logger.info('[TaJiDuo-plugin] 每日 00:25 自动游戏签到跳过：当前没有已保存账号')
      return true
    }

    logger.info(`[TaJiDuo-plugin] 每日 00:25 自动游戏签到开始，共 ${sessions.length} 个账号`)
    await sendNotifyList(autoSign.notifyList, buildAutoGameSignStartMessage(sessions.length), {
      logLabel: '自动游戏签到开始通知'
    })

    const { results } = await this.executeGameSignForSessions(sessions, {
      logLabel: '自动游戏签到'
    })

    await sendNotifyList(autoSign.notifyList, buildAutoGameSignCompleteMessages({
      total: sessions.length,
      results
    }), {
      useForward: true,
      forwardTitle: '塔吉多每日游戏签到完成',
      logLabel: '自动游戏签到完成通知'
    })

    logger.info(`[TaJiDuo-plugin] 每日 00:25 自动游戏签到完成：${buildAutoGameSignSummaryLines(results, sessions.length).join(' | ')}`)
    return true
  }

  async executeGameSignForSessions (sessions = [], options = {}) {
    const logLabel = String(options?.logLabel || '批量游戏签到').trim() || '批量游戏签到'
    const results = []

    for (const item of Array.isArray(sessions) ? sessions : []) {
      const targetText = describeStoredSessionTarget(item)

      try {
        const data = await this.runAllGameSign(item.session.fwt)
        results.push({
          item,
          success: data.success,
          results: data.results
        })

        const summary = data.results
          .map((result) => `${result.gameName}:${result.ignored ? '已跳过' : (result.success ? (result.skipped ? '已跳过' : '成功') : '失败')}`)
          .join(' | ')
        logger.info(`[TaJiDuo-plugin] ${logLabel}完成：${targetText} | ${summary || '执行完成'}`)
      } catch (error) {
        if (isAuthExpiredError(error)) {
          await clearUserSession(item.selfId, item.userId)
          results.push({
            item,
            success: false,
            errorMessage: `登录失效，已清理本地会话 | ${getErrorMessage(error)}`
          })
          logger.warn(`[TaJiDuo-plugin] ${logLabel}登录失效，已清理本地会话：${targetText} | ${getErrorMessage(error)}`)
          continue
        }

        results.push({
          item,
          success: false,
          errorMessage: getErrorMessage(error)
        })
        logger.error(`[TaJiDuo-plugin] ${logLabel}失败：${targetText} | ${getErrorMessage(error)}`)
      }
    }

    return {
      results
    }
  }

  async runAllGameSign (fwt = '') {
    const results = []

    for (const gameKey of GAME_SIGN_GAME_KEYS) {
      try {
        results.push(await this.runSingleGameSign(gameKey, fwt))
      } catch (error) {
        if (isAuthExpiredError(error)) {
          throw error
        }

        const config = getGameConfig(gameKey)
        results.push({
          gameKey,
          gameName: config?.name || gameKey,
          success: false,
          errorMessage: getErrorMessage(error)
        })
      }
    }

    const applicableResults = results.filter((item) => item?.ignored !== true)

    return {
      success: applicableResults.length > 0 && applicableResults.every((item) => item?.success),
      results
    }
  }

  async runSingleGameSign (gameKey = '', fwt = '') {
    const { config, fetchRoles, fetchState, signGame } = this.getGameSignApiMethods(gameKey)
    const gameName = config?.name || gameKey
    const stateBefore = await this.fetchGameSignState(fetchState, fwt, gameName, { silent: true })

    if (stateBefore?.todaySign === true) {
      return {
        gameKey,
        gameName,
        success: true,
        skipped: true,
        message: '今天已经签到过了',
        stateBefore
      }
    }

    const rolesData = await fetchRoles({ fwt })
    const selection = resolveAutoGameRole(rolesData)

    if (!selection?.role?.roleId) {
      return {
        gameKey,
        gameName,
        success: false,
        ignored: true,
        errorMessage: selection?.selectionSource === 'ambiguous'
          ? `检测到多个${gameName}角色，但没有可用的绑定角色，已跳过本次自动签到`
          : `未查询到${gameName}角色，请确认该塔吉多账号已绑定${gameName}角色`
      }
    }

    let signData
    try {
      signData = await signGame({
        fwt,
        roleId: String(selection.role.roleId)
      })
    } catch (error) {
      if (!isAlreadySignedError(error)) {
        throw error
      }

      return {
        gameKey,
        gameName,
        success: true,
        skipped: true,
        message: getErrorMessage(error) || '今天已经签到过了',
        role: selection.role,
        selectionSource: selection.selectionSource,
        stateBefore: {
          ...(stateBefore || {}),
          todaySign: true
        }
      }
    }

    const stateAfter = await this.fetchGameSignState(fetchState, fwt, gameName, { silent: true })
    const summary = this.summarizeGameSignData(signData)

    return {
      gameKey,
      gameName,
      success: summary.success,
      skipped: false,
      message: summary.message,
      role: selection.role,
      selectionSource: selection.selectionSource,
      stateBefore,
      stateAfter,
      data: signData
    }
  }

  getGameSignApiMethods (gameKey = '') {
    const config = getGameConfig(gameKey)
    if (!config) {
      throw new Error(`未知游戏签到配置：${gameKey}`)
    }

    return {
      config,
      fetchRoles: this.api[config.rolesMethod].bind(this.api),
      fetchState: this.api[config.stateMethod].bind(this.api),
      signGame: this.api[config.signMethod].bind(this.api)
    }
  }

  async getGameSignState (gameKey = '', fwt = '', options = {}) {
    const { config, fetchState } = this.getGameSignApiMethods(gameKey)
    return this.fetchGameSignState(fetchState, fwt, config?.name || gameKey, options)
  }

  async fetchGameSignState (fetchState, fwt = '', gameName = '游戏', options = {}) {
    try {
      return await fetchState({ fwt })
    } catch (error) {
      if (options?.silent && !isAuthExpiredError(error)) {
        logger.warn(`[TaJiDuo-plugin] ${gameName}签到状态查询失败，已忽略：${getErrorMessage(error)}`)
        return null
      }

      throw error
    }
  }

  summarizeGameSignData (data = {}) {
    const upstream = isPlainObject(data?.upstream) ? data.upstream : {}
    const success = data?.success !== false && upstream?.success !== false
    const message = pickFirstNonEmpty(
      normalizeUpstreamMessage(data?.reward),
      normalizeUpstreamMessage(data?.message),
      normalizeUpstreamMessage(upstream?.message),
      success ? '签到成功' : '签到失败'
    )

    return {
      success,
      message: String(message || '').trim()
    }
  }

  async replyQueryForward (title = '', messages = []) {
    const forward = await common.makeForwardMsg(this.e, messages, title)
    await this.reply(forward)
  }

  async replyFailure (title = '', error) {
    if (isAuthExpiredError(error)) {
      await clearStoredSessionFromEvent(this.e)
      await this.reply(buildReloginReply(title, getErrorMessage(error) || AUTH_EXPIRED_MESSAGE))
      return true
    }

    await this.reply(`${title}：${getErrorMessage(error)}`)
    return true
  }
}
