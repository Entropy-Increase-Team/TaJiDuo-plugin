import plugin from '../../../lib/plugins/plugin.js'
import TaJiDuoApi from '../model/api.js'
import { getUserSession, listUserSessions } from '../model/store.js'
import Config from '../utils/config.js'
import { buildCommandReg } from '../utils/command.js'
import { joinLines, normalizePositiveInt } from '../utils/common.js'

const PLATFORM_ALIAS = '(?:TaJiDuo|tajiduo|TAJIDUO|塔吉多)'

const ALL_COMMUNITY_SIGN_REG = buildCommandReg(`${PLATFORM_ALIAS}社区签到`)
const HOTTA_COMMUNITY_SIGN_REG = buildCommandReg(`${PLATFORM_ALIAS}幻塔社区签到`)
const YIHUAN_COMMUNITY_SIGN_REG = buildCommandReg(`${PLATFORM_ALIAS}异环社区签到`)

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function getConfiguredDelay (key, fallback) {
  return normalizePositiveInt(Config.get('tajiduo', key)) || fallback
}

function buildSingleCommunityPayload (fwt = '') {
  return {
    fwt,
    actionDelayMs: getConfiguredDelay('action_delay_ms', 3000),
    stepDelayMs: getConfiguredDelay('step_delay_ms', 8000)
  }
}

function buildAllCommunityPayload (fwt = '') {
  return {
    ...buildSingleCommunityPayload(fwt),
    betweenCommunitiesMs: getConfiguredDelay('between_communities_ms', 15000)
  }
}

function buildDelayLines (payload = {}) {
  const parts = []

  if (payload.actionDelayMs !== undefined) {
    parts.push(`动作间隔 ${payload.actionDelayMs}ms`)
  }

  if (payload.stepDelayMs !== undefined) {
    parts.push(`步骤间隔 ${payload.stepDelayMs}ms`)
  }

  if (payload.betweenCommunitiesMs !== undefined) {
    parts.push(`社区间隔 ${payload.betweenCommunitiesMs}ms`)
  }

  if (parts.length === 0) return []
  return [`执行延时：${parts.join(' | ')}`]
}

function buildTaskSnapshotLines (title = '', tasks = []) {
  const items = Array.isArray(tasks) ? tasks : []
  if (items.length === 0) return []

  const lines = [`${title}：`]

  items.forEach((task, index) => {
    const taskTitle = task?.title || task?.taskKey || `任务${index + 1}`
    const completeTimes = Number(task?.completeTimes)
    const limitTimes = Number(task?.limitTimes)
    const isCompleted = Number.isFinite(limitTimes) && limitTimes > 0 && Number.isFinite(completeTimes) && completeTimes >= limitTimes
    const parts = []

    if (isCompleted) {
      parts.push('已完成')
    } else if (task?.completeTimes !== undefined || task?.limitTimes !== undefined) {
      parts.push(`${task?.completeTimes ?? 0}/${task?.limitTimes ?? '?'}`)
    }

    if (task?.remaining !== undefined) {
      parts.push(`剩余 ${task.remaining}`)
    }

    lines.push(`${index + 1}. ${taskTitle}${parts.length > 0 ? `：${parts.join(' | ')}` : ''}`)
  })

  return lines
}

function summarizeResultObject (value = {}) {
  if (!isPlainObject(value)) return ''

  const parts = []

  if (value.success !== undefined) {
    parts.push(value.success ? '成功' : '失败')
  }

  if (value.message) {
    parts.push(String(value.message))
  }

  if (value.reward && String(value.reward) !== String(value.message || '')) {
    parts.push(`奖励：${value.reward}`)
  }

  return parts.join(' | ')
}

function buildNestedCommunityLines (data = {}) {
  const sections = [
    ['幻塔社区', data?.hotta],
    ['异环社区', data?.yihuan]
  ]

  const lines = []

  for (const [title, section] of sections) {
    if (!isPlainObject(section)) continue

    const summary = summarizeResultObject(section)
    if (summary) {
      lines.push(`${title}：${summary}`)
    } else {
      lines.push(`${title}：已返回结果`)
    }

    const delays = buildDelayLines(section?.delays)
    if (delays.length > 0) {
      lines.push(...delays)
    }

    const before = buildTaskSnapshotLines(`${title}执行前任务`, section?.tasksBefore)
    if (before.length > 0) {
      lines.push(...before)
    }

    const after = buildTaskSnapshotLines(`${title}执行后任务`, section?.tasksAfter)
    if (after.length > 0) {
      lines.push(...after)
    }

    lines.push('')
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

function buildCommunityReply (title = '', data = {}, requestPayload = {}) {
  const lines = [
    title,
    summarizeResultObject(data) ? `结果：${summarizeResultObject(data)}` : ''
  ]

  const delays = buildDelayLines(data?.delays || requestPayload)
  if (delays.length > 0) {
    lines.push('', ...delays)
  }

  const before = buildTaskSnapshotLines('执行前任务', data?.tasksBefore)
  if (before.length > 0) {
    lines.push('', ...before)
  }

  const after = buildTaskSnapshotLines('执行后任务', data?.tasksAfter)
  if (after.length > 0) {
    lines.push('', ...after)
  }

  const nested = buildNestedCommunityLines(data)
  if (nested.length > 0) {
    lines.push('', ...nested)
  }

  return joinLines(lines)
}

function describeAutoSignTarget (item = {}) {
  const parts = []

  if (item?.session?.username) {
    parts.push(`昵称=${item.session.username}`)
  }

  if (item?.session?.tgdUid) {
    parts.push(`塔吉多UID=${item.session.tgdUid}`)
  }

  if (item?.userId !== undefined) {
    parts.push(`用户=${item.userId}`)
  }

  return parts.join(' | ') || '未命名账号'
}

export class TaJiDuoCommunitySign extends plugin {
  constructor (e) {
    super({
      name: '[TaJiDuo-plugin] 社区签到',
      dsc: 'TaJiDuo 社区签到',
      event: 'message',
      priority: 100,
      rule: [
        { reg: ALL_COMMUNITY_SIGN_REG, fnc: 'signAllCommunities' },
        { reg: HOTTA_COMMUNITY_SIGN_REG, fnc: 'signHottaCommunity' },
        { reg: YIHUAN_COMMUNITY_SIGN_REG, fnc: 'signYihuanCommunity' }
      ]
    })

    this.e = e
    this.api = new TaJiDuoApi()
    this.task = [
      {
        name: '[TaJiDuo-plugin] 每日社区签到',
        cron: '0 20 0 * * *',
        fnc: () => this.autoDailyCommunitySign()
      }
    ]
  }

  async getStoredFwt () {
    const session = await getUserSession(this.e.self_id || 'bot', this.e.user_id)
    const fwt = String(session?.fwt || '').trim()

    if (!fwt) {
      throw new Error('请先发送 #塔吉多登录 <手机号> 完成登录')
    }

    return fwt
  }

  async signAllCommunities () {
    try {
      const fwt = await this.getStoredFwt()
      await this.reply('塔吉多社区签到开始执行，请稍候...')
      const { payload, data } = await this.runAllCommunitySign(fwt)
      await this.reply(buildCommunityReply('塔吉多社区签到执行完成', data, payload))
      return true
    } catch (error) {
      await this.reply(`塔吉多社区签到失败：${error.message || error}`)
      return true
    }
  }

  async signHottaCommunity () {
    try {
      const payload = buildSingleCommunityPayload(await this.getStoredFwt())
      await this.reply('塔吉多幻塔社区签到开始执行，请稍候...')
      const data = await this.api.hottaCommunitySignAll(payload)
      await this.reply(buildCommunityReply('塔吉多幻塔社区签到执行完成', data, payload))
      return true
    } catch (error) {
      await this.reply(`塔吉多幻塔社区签到失败：${error.message || error}`)
      return true
    }
  }

  async signYihuanCommunity () {
    try {
      const payload = buildSingleCommunityPayload(await this.getStoredFwt())
      await this.reply('塔吉多异环社区签到开始执行，请稍候...')
      const data = await this.api.yihuanCommunitySignAll(payload)
      await this.reply(buildCommunityReply('塔吉多异环社区签到执行完成', data, payload))
      return true
    } catch (error) {
      await this.reply(`塔吉多异环社区签到失败：${error.message || error}`)
      return true
    }
  }

  async runAllCommunitySign (fwt = '') {
    const payload = buildAllCommunityPayload(fwt)
    const data = await this.api.communitySignAll(payload)
    return {
      payload,
      data
    }
  }

  async autoDailyCommunitySign () {
    const sessions = await listUserSessions()

    if (sessions.length === 0) {
      logger.info('[TaJiDuo-plugin] 每日 00:20 自动社区签到跳过：当前没有已保存账号')
      return true
    }

    logger.info(`[TaJiDuo-plugin] 每日 00:20 自动社区签到开始，共 ${sessions.length} 个账号`)

    let successCount = 0

    for (const item of sessions) {
      const targetText = describeAutoSignTarget(item)

      try {
        const { data } = await this.runAllCommunitySign(item.session.fwt)
        successCount += 1
        logger.info(`[TaJiDuo-plugin] 自动社区签到成功：${targetText} | ${summarizeResultObject(data) || '执行完成'}`)
      } catch (error) {
        logger.error(`[TaJiDuo-plugin] 自动社区签到失败：${targetText} | ${error.message || error}`)
      }
    }

    logger.info(`[TaJiDuo-plugin] 每日 00:20 自动社区签到完成：${successCount}/${sessions.length}`)
    return true
  }
}
