import TaJiDuoUser from '../model/tajiduoUser.js'
import { randomCardLongId } from '../utils/yihuanRender.js'
import {
  GAME,
  getUnbindMessage,
  normalizeRole,
  PREFIX,
  summarizeApiError
} from '../utils/common.js'

function qqAvatarUrl(e = {}) {
  const userId = String(e?.user_id || Bot?.uin || '80000000')
  return 'https://q1.qlogo.cn/g?b=qq&nk=' + encodeURIComponent(userId) + '&s=640'
}

function rewardItems(rewards = [], state = {}) {
  const days = Number(state.days || 0)
  const todaySigned = !!state.todaySign
  return rewards.slice(0, 31).map((reward, index) => ({
    day: index + 1,
    name: reward.name || '奖励',
    num: reward.num ?? 1,
    className: index < days ? 'signed' : (index === days && !todaySigned ? 'today' : '')
  }))
}

function renderAccountCalendar(user = {}, role = {}, state = {}, rewards = []) {
  const todayText = state.todaySign ? '已签' : '未签'
  return {
    name: role?.roleName || user.nickname || user.tjdUid || '账号',
    summary: `本月 ${state.month ?? '-'} 月 / 累计 ${state.days ?? 0} 天 / 可补签 ${state.reSignCnt ?? 0}`,
    todayText,
    stateClass: state.todaySign ? 'done' : '',
    rewards: rewardItems(rewards, state)
  }
}

async function renderSignCalendarCard(e, payload = {}) {
  if (!e?.runtime?.render) return false
  try {
    await e.runtime.render('TaJiDuo-plugin', 'yihuan/sign-calendar', {
      cardLongId: randomCardLongId(),
      avatarUrl: qqAvatarUrl(e),
      footerText: 'Created By Yunzai-Bot & TaJiDuo-plugin',
      viewport: { width: 1080 },
      ...payload
    }, {
      scale: 1
    })
    return true
  } catch (error) {
    logger.error('[TaJiDuo-plugin][签到日历]渲染失败：' + (error?.message || error))
    return false
  }
}

export class signcalendar extends plugin {
  constructor() {
    super({
      name: '[TaJiDuo-plugin]签到日历',
      dsc: '幻塔/异环签到日历',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${PREFIX.yihuan}(签到日历|签到一览|签到记录|签到历史)$`,
          fnc: 'yihuanSignCalendar'
        },
        {
          reg: `^${PREFIX.huanta}(签到日历|签到一览|签到记录|签到历史)$`,
          fnc: 'huantaSignCalendar'
        }
      ]
    })
  }

  async getUsers() {
    const userId = this.e.at || this.e.user_id
    const users = await TaJiDuoUser.getAllUsers(userId)
    if (users.length === 0) {
      await this.reply(getUnbindMessage())
      return []
    }
    return users
  }

  async resolveFirstRole(tjdUser, gameCode) {
    const rolesRes = await tjdUser.tjdReq.getData('game_roles', { gameCode })
    const roles = (rolesRes?.data?.roles || []).map(normalizeRole).filter((role) => role.roleId)
    return roles[0] || null
  }

  async signCalendar(gameCode) {
    const game = GAME[gameCode]
    const users = await this.getUsers()
    if (users.length === 0) return true

    const lines = [`${game.name}签到日历`]
    const accounts = []
    for (const user of users) {
      const role = await this.resolveFirstRole(user, gameCode)
      const stateRes = await user.tjdReq.getData('sign_state', { gameCode })
      const rewardsRes = await user.tjdReq.getData('sign_rewards', { gameCode, roleId: role?.roleId })
      if (!stateRes || Number(stateRes.code) !== 0) {
        lines.push(`${user.nickname || user.tjdUid || '账号'}：${summarizeApiError(stateRes)}`)
        continue
      }
      if (!rewardsRes || Number(rewardsRes.code) !== 0) {
        lines.push(`${user.nickname || user.tjdUid || '账号'}：${summarizeApiError(rewardsRes)}`)
        continue
      }

      const state = stateRes.data || {}
      const rewards = Array.isArray(rewardsRes.data) ? rewardsRes.data : (rewardsRes.data?.items || rewardsRes.data?.rewards || [])
      accounts.push(renderAccountCalendar(user, role, state, rewards))
      lines.push(`【${role?.roleName || user.nickname || user.tjdUid || '账号'}】`)
      lines.push(`本月：${state.month ?? '-'}月 | 累计：${state.days ?? 0}天 | 今日：${state.todaySign ? '已签' : '未签'} | 可补签：${state.reSignCnt ?? 0}`)
      for (const [index, reward] of rewards.slice(0, 31).entries()) {
        const mark = index < Number(state.days || 0) ? '✓' : (index === Number(state.days || 0) && !state.todaySign ? '•' : ' ')
        lines.push(`${mark} 第${index + 1}天 ${reward.name || '奖励'} x${reward.num ?? 1}`)
      }
    }
    if (gameCode === 'yihuan' && accounts.length > 0) {
      const rendered = await renderSignCalendarCard(this.e, {
        pageTitle: `${game.name}签到日历`,
        roleName: game.name,
        subtitle: '签到记录',
        gameCode,
        accounts
      })
      if (rendered) return true
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async huantaSignCalendar() {
    return this.signCalendar('huanta')
  }

  async yihuanSignCalendar() {
    return this.signCalendar('yihuan')
  }
}
