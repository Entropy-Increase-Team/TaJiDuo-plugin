import TaJiDuoUser, { addOrUpdateAccount } from '../model/tajiduoUser.js'
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

export class profile extends plugin {
  constructor() {
    super({
      name: '[TaJiDuo-plugin]资料',
      dsc: '塔吉多与角色资料查询',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${PREFIX.tajiduo}(资料|信息|个人资料|账号资料)$`,
          fnc: 'profile'
        },
        {
          reg: `^${PREFIX.huanta}(角色|角色列表)$`,
          fnc: 'huantaRoles'
        },
        {
          reg: `^${PREFIX.yihuan}(角色|角色列表)$`,
          fnc: 'yihuanRoles'
        },
        {
          reg: `^${PREFIX.yihuan}(主页|角色主页)(?:\\s*\\d+)?$`,
          fnc: 'yihuanHome'
        },
        {
          reg: `^${PREFIX.yihuan}(成就|成就进度)(?:\\s*\\d+)?$`,
          fnc: 'yihuanAchieve'
        },
        {
          reg: `^${PREFIX.yihuan}(探索|区域|区域探索)(?:\\s*\\d+)?$`,
          fnc: 'yihuanArea'
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

  async showRoles(gameCode) {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const game = gameCode === 'huanta' ? '幻塔' : '异环'
    const res = await tjdUser.tjdReq.getData('game_roles', { gameCode })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const roles = (res.data?.roles || []).map(normalizeRole).filter((role) => role.roleId)
    if (roles.length === 0) {
      await this.reply(getMessage('game.roles_empty', { game }))
      return true
    }

    const lines = [getMessage('game.roles_title', { game })]
    roles.forEach((role, index) => {
      lines.push(getMessage('game.role_line', {
        index: index + 1,
        name: role.roleName || '未命名',
        roleId: role.roleId,
        server: role.serverName ? ` / ${role.serverName}` : '',
        level: role.level !== '' ? ` / Lv.${role.level}` : ''
      }))
    })
    await this.reply(lines.join('\n'))
    return true
  }

  async huantaRoles() {
    return this.showRoles('huanta')
  }

  async yihuanRoles() {
    return this.showRoles('yihuan')
  }

  async getYihuanRole(tjdUser, roleId = '') {
    const rolesRes = await tjdUser.tjdReq.getData('game_roles', { gameCode: 'yihuan' })
    const roles = (rolesRes?.data?.roles || []).map(normalizeRole).filter((role) => role.roleId)
    return pickRole(roles, roleId)
  }

  async yihuanHome() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const role = await this.getYihuanRole(tjdUser, getRoleId(trimMsg(this.e)))
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_role_home', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data?.data || res.data || {}
    const achieve = data.achieveProgress || {}
    const estate = data.realestate || {}
    const vehicle = data.vehicle || {}
    const lines = [
      `异环角色主页：${data.rolename || role.roleName || role.roleId}`,
      compactLine('等级', data.lev),
      compactLine('世界等级', data.worldlevel),
      compactLine('登录天数', data.roleloginDays),
      compactLine('角色数量', data.charidCnt),
      compactLine('成就', `${achieve.achievementCnt ?? 0}/${achieve.total ?? 0}`),
      compactLine('房产', `${estate.showName || ''} ${estate.total ?? ''}`.trim()),
      compactLine('载具', `${vehicle.showName || ''} ${vehicle.ownCnt ?? 0}/${vehicle.total ?? 0}`.trim())
    ]
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanAchieve() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const role = await this.getYihuanRole(tjdUser, getRoleId(trimMsg(this.e)))
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_achieve_progress', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const data = res.data?.data || res.data || {}
    const lines = [
      `异环成就：${role.roleName || role.roleId}`,
      compactLine('总进度', `${data.achievementCnt ?? 0}/${data.total ?? 0}`),
      compactLine('铜', data.bronzeUmdCnt ?? 0),
      compactLine('银', data.silverUmdCnt ?? 0),
      compactLine('金', data.goldUmdCnt ?? 0)
    ]
    await this.reply(lines.join('\n'))
    return true
  }

  async yihuanArea() {
    const tjdUser = await this.getCurrentUser()
    if (!tjdUser) return true

    const role = await this.getYihuanRole(tjdUser, getRoleId(trimMsg(this.e)))
    if (!role) {
      await this.reply(getMessage('game.roles_empty', { game: '异环' }))
      return true
    }

    const res = await tjdUser.tjdReq.getData('yihuan_area_progress', { roleId: role.roleId })
    if (!res || Number(res.code) !== 0) {
      await this.reply(getMessage('common.request_failed', { error: summarizeApiError(res) }))
      return true
    }

    const items = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : [])
    const lines = [`异环区域探索：${role.roleName || role.roleId}`]
    for (const item of items.slice(0, 10)) {
      lines.push(compactLine(item.name || item.id, item.total ?? ''))
    }
    await this.reply(lines.join('\n'))
    return true
  }
}
