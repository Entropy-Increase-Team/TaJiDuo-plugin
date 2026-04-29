import TaJiDuoUser from '../model/tajiduoUser.js'
import {
  compactLine,
  GAME,
  getMessage,
  getUnbindMessage,
  PREFIX,
  summarizeApiError
} from '../utils/common.js'

function flattenTasks(groups = []) {
  const out = []
  for (const group of groups || []) {
    for (const item of group.items || []) {
      out.push(item)
    }
  }
  return out
}

export class commsign extends plugin {
  constructor() {
    super({
      name: '[TaJiDuo-plugin]社区任务',
      dsc: '幻塔/异环社区任务',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${PREFIX.huanta}社区状态$`,
          fnc: 'huantaCommunityState'
        },
        {
          reg: `^${PREFIX.yihuan}社区状态$`,
          fnc: 'yihuanCommunityState'
        },
        {
          reg: `^${PREFIX.huanta}社区等级$`,
          fnc: 'huantaCommunityLevel'
        },
        {
          reg: `^${PREFIX.yihuan}社区等级$`,
          fnc: 'yihuanCommunityLevel'
        },
        {
          reg: `^${PREFIX.huanta}(任务|社区任务列表)$`,
          fnc: 'huantaTasks'
        },
        {
          reg: `^${PREFIX.yihuan}(任务|社区任务列表)$`,
          fnc: 'yihuanTasks'
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

  async communityState(gameCode) {
    const game = GAME[gameCode]
    const users = await this.getUsers()
    if (users.length === 0) return true

    const lines = []
    for (const user of users) {
      const res = await user.tjdReq.getData('community_sign_state', { gameCode })
      if (!res || Number(res.code) !== 0) {
        lines.push(`${user.nickname || user.tjdUid || '账号'}：${summarizeApiError(res)}`)
        continue
      }
      lines.push(`${user.nickname || user.tjdUid || '账号'}：${res.data?.signed ? '已签到' : '未签到'}`)
    }
    await this.reply(getMessage('community.state', { game: game.name, state: '\n' + lines.join('\n') }))
    return true
  }

  async huantaCommunityState() {
    return this.communityState('huanta')
  }

  async yihuanCommunityState() {
    return this.communityState('yihuan')
  }

  async communityLevel(gameCode) {
    const game = GAME[gameCode]
    const users = await this.getUsers()
    if (users.length === 0) return true

    const lines = []
    for (const user of users) {
      const res = await user.tjdReq.getData('community_exp_level', { gameCode })
      if (!res || Number(res.code) !== 0) {
        lines.push(`${user.nickname || user.tjdUid || '账号'}：${summarizeApiError(res)}`)
        continue
      }
      const data = res.data || {}
      lines.push(getMessage('community.level', {
        game: `${game.name}/${user.nickname || user.tjdUid || '账号'}`,
        level: data.level ?? 0,
        todayExp: data.todayExp ?? 0,
        exp: data.exp ?? 0,
        nextLevelExp: data.nextLevelExp ?? 0
      }))
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async huantaCommunityLevel() {
    return this.communityLevel('huanta')
  }

  async yihuanCommunityLevel() {
    return this.communityLevel('yihuan')
  }

  async tasks(gameCode) {
    const game = GAME[gameCode]
    const users = await this.getUsers()
    if (users.length === 0) return true

    const lines = []
    for (const user of users) {
      const res = await user.tjdReq.getData('community_tasks', { gameCode })
      if (!res || Number(res.code) !== 0) {
        lines.push(`${user.nickname || user.tjdUid || '账号'}：${summarizeApiError(res)}`)
        continue
      }
      const items = flattenTasks(res.data?.groups).slice(0, 12)
      lines.push(`【${game.name}/${user.nickname || user.tjdUid || '账号'}】`)
      if (items.length === 0) {
        lines.push(getMessage('common.no_data'))
      } else {
        for (const item of items) {
          const limit = item.limitTimes ?? item.targetTimes ?? 1
          lines.push(getMessage('community.task_item', {
            title: item.title || item.taskKey || '任务',
            completeTimes: item.completeTimes ?? 0,
            limitTimes: limit
          }))
        }
      }
      lines.push(compactLine('社区ID', res.data?.communityId || game.communityId))
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async huantaTasks() {
    return this.tasks('huanta')
  }

  async yihuanTasks() {
    return this.tasks('yihuan')
  }
}
