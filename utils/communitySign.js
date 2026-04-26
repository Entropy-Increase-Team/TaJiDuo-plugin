import TaJiDuoUser from '../model/tajiduoUser.js'
import setting from './setting.js'
import { GAME, summarizeApiError } from './common.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DEFAULT_POLL_TIMES = 36
const BACKEND_TASK_TIMEOUT_MS = 20 * 60 * 1000

export function getCommunityConfig() {
  const common = setting.getConfig('common') || {}
  return common.community_task || {}
}

export function batchResultLines(data = {}) {
  const source = getBatchItems(data)
  const items = Array.isArray(source) ? source : []
  return items.map((item) => {
    const gameName = item.gameName || GAME[item.gameCode]?.name || item.gameCode || '未知游戏'
    return `${gameName}：${item.message || (item.success ? '完成' : '失败')}`
  })
}

function getBatchItems(data = {}) {
  return data.result?.batch?.items || data.result?.items || data.items || data.batch?.items || []
}

function getGameCode(item = {}) {
  const raw = String(item.gameCode || item.game || item.code || '').toLowerCase()
  if (GAME[raw]) return raw
  const name = String(item.gameName || item.name || '')
  return Object.keys(GAME).find((code) => GAME[code].name === name) || raw
}

function getItemMessage(item = {}) {
  if (item.message) return item.message
  if (item.success === false || item.status === 'failed') return '社区任务执行失败'
  return '社区任务全部完成'
}

function getNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function collectRewards(data = {}) {
  const rewards = { exp: 0, coin: 0 }
  const seen = new Set()

  function addNamedReward(name, value) {
    const text = String(name || '').toLowerCase()
    const amount = getNumber(value)
    if (!amount) return
    if (text.includes('exp') || text.includes('经验')) rewards.exp += amount
    if (text.includes('coin') || text.includes('塔塔币') || text.includes('塔币')) rewards.coin += amount
  }

  function walk(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)

    const rewardName = value.name || value.title || value.label || value.rewardName || value.type || value.key
    const rewardValue = value.num ?? value.count ?? value.amount ?? value.value ?? value.quantity
    if (rewardName !== undefined && rewardValue !== undefined) {
      addNamedReward(rewardName, rewardValue)
    }

    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase()
      if (typeof item === 'number' || typeof item === 'string') {
        if (['exp', 'addexp', 'rewardexp', 'communityexp'].includes(normalizedKey)) {
          rewards.exp += getNumber(item)
          continue
        }
        if (['coin', 'coins', 'goldcoin', 'gold_coin', 'tatacoin', 'tata_coin', 'ttc'].includes(normalizedKey) || key.includes('塔塔币')) {
          rewards.coin += getNumber(item)
          continue
        }
      }
      walk(item)
    }
  }

  walk(data)
  return rewards
}

export function formatAllCommunityDoneLines(data = {}) {
  const items = Array.isArray(getBatchItems(data)) ? getBatchItems(data) : []
  const byGame = new Map(items.map((item) => [getGameCode(item), item]))
  const lines = [
    `塔吉多社区签到完成：${data.message || data.result?.message || '两个社区任务流程执行完成'}`
  ]

  for (const gameCode of ['huanta', 'yihuan']) {
    const item = byGame.get(gameCode)
    lines.push(`${GAME[gameCode].name}：${getItemMessage(item)}`)
  }

  for (const item of items) {
    const gameCode = getGameCode(item)
    if (gameCode === 'huanta' || gameCode === 'yihuan') continue
    const gameName = item.gameName || GAME[gameCode]?.name || gameCode || '未知游戏'
    lines.push(`${gameName}：${getItemMessage(item)}`)
  }

  const rewards = collectRewards(data)
  lines.push('-----')
  lines.push(`exp+${rewards.exp} | 塔塔币+${rewards.coin}`)
  return lines
}

export async function pollAllCommunityTask(user, taskId, cfg = getCommunityConfig()) {
  if (!taskId) return { ok: false, lines: ['塔吉多社区签到失败：缺少任务 ID'] }

  const baseTimes = Math.max(0, Number(cfg.poll_times ?? DEFAULT_POLL_TIMES))
  const times = Math.max(0, Number(cfg.batch_poll_times ?? cfg.all_poll_times ?? baseTimes * 3))
  const interval = Math.max(1000, Number(cfg.poll_interval_ms ?? 5000))

  let latest = null
  for (let i = 0; i < times; i++) {
    await sleep(interval)
    latest = await user.tjdReq.getData('all_community_task_status', { taskId })
    if (!latest || Number(latest.code) !== 0) {
      return { ok: false, lines: [`塔吉多社区签到失败：${summarizeApiError(latest)}`] }
    }
    if (latest.data?.completed) break
  }

  const data = latest?.data
  if (!data) return { ok: false, lines: ['塔吉多社区签到失败：没有拿到任务状态'] }
  if (!data.completed) {
    return {
      ok: false,
      lines: [`塔吉多社区签到仍在执行：${data.status || 'running'}\n任务 ID：${taskId}`]
    }
  }
  if (data.success === false || data.status === 'failed') {
    return { ok: false, lines: [`塔吉多社区签到失败：${data.message || '失败'}`] }
  }

  return {
    ok: true,
    lines: formatAllCommunityDoneLines(data)
  }
}

function withLongCommunityPoll(cfg = {}) {
  const interval = Math.max(1000, Number(cfg.poll_interval_ms ?? 5000))
  const backendTimeoutTimes = Math.ceil(BACKEND_TASK_TIMEOUT_MS / interval)
  const currentTimes = Number(cfg.batch_poll_times ?? cfg.all_poll_times)
  return {
    ...cfg,
    batch_poll_times: Number.isFinite(currentTimes)
      ? Math.max(currentTimes, backendTimeoutTimes)
      : backendTimeoutTimes
  }
}

export async function signAllCommunities(user, cfg = getCommunityConfig()) {
  const res = await user.tjdReq.getData('all_community_sign', {
    gameCodes: ['huanta', 'yihuan'],
    actionDelayMs: cfg.action_delay_ms,
    stepDelayMs: cfg.step_delay_ms,
    betweenCommunitiesMs: cfg.between_communities_ms
  })
  if (!res || Number(res.code) !== 0) {
    return { ok: false, lines: [`塔吉多社区签到失败：${summarizeApiError(res)}`] }
  }

  const data = res.data || {}
  const final = await pollAllCommunityTask(user, data.taskId, cfg)
  if (final.ok) return final

  return {
    ok: false,
    lines: [
      `已提交塔吉多社区签到：${data.taskId || ''}\n状态：${data.status || ''}`,
      ...final.lines
    ]
  }
}

export async function runAllCommunitySignTask(manual = false, option = {}) {
  if (!redis) return { total: 0, success: 0, fail: 0, lines: ['redis 不可用'] }

  const cfg = option.waitUntilDone ? withLongCommunityPoll(getCommunityConfig()) : getCommunityConfig()
  const keys = await redis.keys('TJD:USER:*')
  const stats = { total: 0, success: 0, fail: 0, lines: [] }
  for (const key of keys) {
    const userId = key.replace(/^TJD:USER:/, '')
    const users = await TaJiDuoUser.getAllUsers(userId, { log: false })
    for (const user of users) {
      stats.total++
      const result = await signAllCommunities(user, cfg)
      if (result.ok) stats.success++
      else stats.fail++
      if (manual) {
        stats.lines.push(`${userId}/${user.nickname || user.tjdUid || '账号'}：${result.lines.join('；')}`)
      }
    }
  }
  return stats
}
