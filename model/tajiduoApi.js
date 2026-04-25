import setting from '../utils/setting.js'

function queryString(data = {}, keys = Object.keys(data)) {
  const params = new URLSearchParams()
  for (const key of keys) {
    const value = data[key]
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  return params.toString()
}

export default class TaJiDuoApi {
  constructor() {
    this.commonConfig = setting.getConfig('common') || {}
    this.baseUrl = String(this.commonConfig.base_url || 'https://tajiduo.shallow.ink').replace(/\/+$/, '')
  }

  getUrlMap(data = {}) {
    const baseUrl = this.baseUrl
    const game = data.gameCode || data.game || ''
    return {
      games: {
        url: `${baseUrl}/api/v1/games`
      },
      captcha_send: {
        url: `${baseUrl}/api/v1/login/tajiduo/captcha/send`,
        method: 'post',
        body: {
          phone: data.phone,
          ...(data.deviceId ? { deviceId: data.deviceId } : {})
        }
      },
      captcha_check: {
        url: `${baseUrl}/api/v1/login/tajiduo/captcha/check`,
        method: 'post',
        body: {
          phone: data.phone,
          captcha: data.captcha,
          deviceId: data.deviceId
        }
      },
      session: {
        url: `${baseUrl}/api/v1/login/tajiduo/session`,
        method: 'post',
        platform: true,
        body: {
          phone: data.phone,
          captcha: data.captcha,
          deviceId: data.deviceId
        }
      },
      refresh: {
        url: `${baseUrl}/api/v1/login/tajiduo/refresh`,
        method: 'post'
      },
      profile: {
        url: `${baseUrl}/api/v1/login/tajiduo/profile`
      },
      accounts: {
        url: `${baseUrl}/api/v1/login/tajiduo/accounts`
      },
      account_primary: {
        url: `${baseUrl}/api/v1/login/tajiduo/accounts/primary`,
        method: 'post'
      },
      account_delete: {
        url: `${baseUrl}/api/v1/login/tajiduo/accounts/${encodeURIComponent(data.fwt || '')}`,
        method: 'delete'
      },
      redeem_codes: {
        url: `${baseUrl}/api/v1/games/redeem-codes`,
        query: queryString(data, ['gameCode', 'includeExpired'])
      },
      htnews_codes: {
        url: `${baseUrl}/api/v1/redeem-codes/htnews`
      },
      shop_goods: {
        url: `${baseUrl}/api/v1/games/shop/goods`,
        query: queryString({
          version: data.version ?? 0,
          count: data.count ?? 20,
          tab: data.tab || 'all'
        })
      },
      shop_goods_detail: {
        url: `${baseUrl}/api/v1/games/shop/goods/${encodeURIComponent(data.goodsId || '')}`
      },
      shop_coin_state: {
        url: `${baseUrl}/api/v1/games/shop/coin/state`
      },
      shop_coin_income: {
        url: `${baseUrl}/api/v1/games/shop/coin/records/income`,
        query: queryString({ size: data.size ?? 20, version: data.version ?? 0 })
      },
      shop_coin_consume: {
        url: `${baseUrl}/api/v1/games/shop/coin/records/consume`,
        query: queryString({ size: data.size ?? 20, version: data.version ?? 0 })
      },
      shop_game_roles: {
        url: `${baseUrl}/api/v1/games/shop/game-roles`,
        query: queryString({ gameId: data.gameId })
      },
      shop_exchange: {
        url: `${baseUrl}/api/v1/games/shop/exchange`,
        method: 'post',
        body: {
          goodsId: data.goodsId,
          gameId: data.gameId,
          roleId: data.roleId,
          count: data.count ?? 1
        }
      },
      role_bind: {
        url: `${baseUrl}/api/v1/games/roles/bind`,
        method: 'post',
        body: {
          gameId: data.gameId,
          roleId: data.roleId
        }
      },
      sign_reward_records: {
        url: `${baseUrl}/api/v1/games/sign/reward-records`,
        query: queryString({ gameId: data.gameId })
      },
      game_roles: {
        url: `${baseUrl}/api/v1/games/${game}/roles`
      },
      sign_state: {
        url: `${baseUrl}/api/v1/games/${game}/sign/state`
      },
      sign_rewards: {
        url: `${baseUrl}/api/v1/games/${game}/sign/rewards`,
        query: queryString({ roleId: data.roleId })
      },
      resign_info: {
        url: `${baseUrl}/api/v1/games/${game}/sign/resign-info`
      },
      sign_game: {
        url: `${baseUrl}/api/v1/games/${game}/sign/game`,
        method: 'post',
        body: { roleId: data.roleId }
      },
      sign_resign: {
        url: `${baseUrl}/api/v1/games/${game}/sign/resign`,
        method: 'post',
        body: { roleId: data.roleId }
      },
      huanta_sign_all: {
        url: `${baseUrl}/api/v1/games/huanta/sign/all`,
        method: 'post',
        body: data.roles ? { roles: data.roles } : {}
      },
      sign_app: {
        url: `${baseUrl}/api/v1/games/${game}/sign/app`,
        method: 'post',
        body: {}
      },
      community_sign_all: {
        url: `${baseUrl}/api/v1/games/${game}/community/sign/all`,
        method: 'post',
        body: {
          actionDelayMs: data.actionDelayMs ?? 3000,
          stepDelayMs: data.stepDelayMs ?? 8000
        }
      },
      community_task_status: {
        url: `${baseUrl}/api/v1/games/${game}/community/sign/tasks/${encodeURIComponent(data.taskId || '')}`
      },
      community_sign_state: {
        url: `${baseUrl}/api/v1/games/${game}/community/sign/state`
      },
      community_tasks: {
        url: `${baseUrl}/api/v1/games/${game}/community/tasks`,
        query: queryString({ gid: data.gid ?? 2 })
      },
      community_exp_level: {
        url: `${baseUrl}/api/v1/games/${game}/community/exp/level`
      },
      community_exp_records: {
        url: `${baseUrl}/api/v1/games/${game}/community/exp/records`
      },
      all_community_sign: {
        url: `${baseUrl}/api/v1/games/community/sign/all`,
        method: 'post',
        body: {
          gameCodes: data.gameCodes,
          actionDelayMs: data.actionDelayMs ?? 3000,
          stepDelayMs: data.stepDelayMs ?? 8000,
          betweenCommunitiesMs: data.betweenCommunitiesMs ?? 15000
        }
      },
      all_community_task_status: {
        url: `${baseUrl}/api/v1/games/community/sign/tasks/${encodeURIComponent(data.taskId || '')}`
      },
      yihuan_role_home: {
        url: `${baseUrl}/api/v1/games/yihuan/role-home`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_characters: {
        url: `${baseUrl}/api/v1/games/yihuan/characters`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_achieve_progress: {
        url: `${baseUrl}/api/v1/games/yihuan/achieve-progress`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_area_progress: {
        url: `${baseUrl}/api/v1/games/yihuan/area-progress`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_real_estate: {
        url: `${baseUrl}/api/v1/games/yihuan/real-estate`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_vehicles: {
        url: `${baseUrl}/api/v1/games/yihuan/vehicles`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_team: {
        url: `${baseUrl}/api/v1/games/yihuan/team`
      }
    }
  }
}
