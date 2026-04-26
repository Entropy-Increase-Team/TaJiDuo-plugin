import TaJiDuoUser from '../model/tajiduoUser.js'
import setting from './setting.js'
import { GAME, summarizeApiError } from './common.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getCommunityConfig() {
  const common = setting.getConfig('common') || {}
  return common.community_task || {}
}

export function batchResultLines(data = {}) {
  const source = data.result?.batch?.items || data.result?.items || data.items || []
  const items = Array.isArray(source) ? source : []
  return items.map((item) => {
    const gameName = item.gameName || GAME[item.gameCode]?.name || item.gameCode || '未知游戏'
    return `${gameName}：${item.message || (item.success ? '完成' : '失败')}`
  })
}

export async function pollAllCommunityTask(user, taskId, cfg = getCommunityConfig()) {
  if (!taskId) return { ok: false, lines: ['塔吉多社区签到失败：缺少任务 ID'] }

  const baseTimes = Math.max(0, Number(cfg.poll_times ?? 8))
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
    lines: [
      `塔吉多社区签到完成：${data.message || '完成'}`,
      ...batchResultLines(data)
    ]
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
  const lines = [`已提交塔吉多社区签到：${data.taskId || ''}\n状态：${data.status || ''}`]
  const final = await pollAllCommunityTask(user, data.taskId, cfg)
  lines.push(...final.lines)
  return { ok: final.ok, lines }
}

export async function runAllCommunitySignTask(manual = false) {
  if (!redis) return { total: 0, success: 0, fail: 0, lines: ['redis 不可用'] }

  const cfg = getCommunityConfig()
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
