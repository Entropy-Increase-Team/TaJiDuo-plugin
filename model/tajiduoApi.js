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

function signAllBody(data = {}) {
  const body = {}
  if (data.roles) body.roles = data.roles
  if (data.signGameIds) body.signGameIds = data.signGameIds
  return body
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
      health: {
        url: `${baseUrl}/health`,
        auth: false
      },
      health_detailed: {
        url: `${baseUrl}/health/detailed`,
        auth: false
      },
      api_keygen_health: {
        url: `${baseUrl}/_internal/api-keygen/health`,
        auth: false
      },
      games: {
        url: `${baseUrl}/api/v1/games`
      },
      laohu_area_codes: {
        url: `${baseUrl}/api/v1/login/laohu/area-codes`
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
      redeem_code_create: {
        url: `${baseUrl}/api/v1/games/redeem-codes`,
        method: 'post',
        body: {
          gameCode: data.gameCode,
          code: data.code,
          description: data.description,
          exchangeRewards: data.exchangeRewards,
          expiresAt: data.expiresAt
        }
      },
      htnews_codes: {
        url: `${baseUrl}/api/v1/redeem-codes/htnews`
      },
      community_posts_share: {
        url: `${baseUrl}/api/v1/community/posts/share`,
        method: 'post',
        body: {
          postId: data.postId,
          platform: data.platform || 'wx_session'
        }
      },
      community_posts_recommend: {
        url: `${baseUrl}/api/v1/community/posts/recommend`,
        query: queryString({
          communityId: data.communityId ?? 2,
          page: data.page ?? 1,
          count: data.count ?? 20,
          version: data.version
        })
      },
      community_posts_full: {
        url: `${baseUrl}/api/v1/community/posts/full`,
        query: queryString({ postId: data.postId })
      },
      community_posts_like: {
        url: `${baseUrl}/api/v1/community/posts/like`,
        method: 'post',
        body: {
          postId: data.postId
        }
      },
      community_posts_share_data: {
        url: `${baseUrl}/api/v1/community/posts/share-data`,
        query: queryString({ postId: data.postId })
      },
      community_web_all: {
        url: `${baseUrl}/api/v1/community/web/all`
      },
      community_web_official_posts: {
        url: `${baseUrl}/api/v1/community/web/official-posts`,
        query: queryString({
          columnId: data.columnId,
          count: data.count ?? 10,
          version: data.version ?? 0,
          officialType: data.officialType
        })
      },
      community_web_post_full: {
        url: `${baseUrl}/api/v1/community/web/posts/full`,
        query: queryString({ postId: data.postId })
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
      role_bind_get: {
        url: `${baseUrl}/api/v1/games/roles/bind`,
        query: queryString({ gameId: data.gameId })
      },
      sign_reward_records: {
        url: `${baseUrl}/api/v1/games/sign/reward-records`,
        query: queryString({ gameId: data.gameId })
      },
      game_roles: {
        url: `${baseUrl}/api/v1/games/${game}/roles`
      },
      record_card: {
        url: `${baseUrl}/api/v1/games/${game}/record-card`
      },
      game_sign_state: {
        url: `${baseUrl}/api/v1/games/sign/state`,
        query: queryString({ gameId: data.gameId })
      },
      game_sign_rewards: {
        url: `${baseUrl}/api/v1/games/sign/rewards`,
        query: queryString({ gameId: data.gameId, roleId: data.roleId })
      },
      game_sign_game: {
        url: `${baseUrl}/api/v1/games/sign/game`,
        method: 'post',
        body: {
          gameId: data.gameId,
          roleId: data.roleId
        }
      },
      huanta_role_record: {
        url: `${baseUrl}/api/v1/games/huanta/role-record`,
        query: queryString({ roleId: data.roleId, type: data.type ?? 0 })
      },
      huanta_role_record_display: {
        url: `${baseUrl}/api/v1/games/huanta/role-record/display`,
        method: 'post',
        body: {
          roleId: data.roleId,
          type: data.type,
          ...(Array.isArray(data.values) ? { values: data.values } : { value: data.value })
        }
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
        body: {
          roleId: data.roleId,
          ...(data.signGameIds ? { signGameIds: data.signGameIds } : {})
        }
      },
      sign_resign: {
        url: `${baseUrl}/api/v1/games/${game}/sign/resign`,
        method: 'post',
        body: { roleId: data.roleId }
      },
      sign_all: {
        url: game ? `${baseUrl}/api/v1/games/${game}/sign/all` : `${baseUrl}/api/v1/games/sign/all`,
        method: 'post',
        body: signAllBody(data)
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
      all_community_task_status: {
        url: `${baseUrl}/api/v1/games/community/sign/tasks/${encodeURIComponent(data.taskId || '')}`
      },
      yihuan_role_home: {
        url: `${baseUrl}/api/v1/games/yihuan/role-home`,
        query: queryString({ roleId: data.roleId })
      },
      yihuan_record_card: {
        url: `${baseUrl}/api/v1/games/yihuan/record-card`
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
      yihuan_team_recommendations: {
        url: `${baseUrl}/api/v1/games/yihuan/team/recommendations`
      },
      yihuan_team: {
        url: `${baseUrl}/api/v1/games/yihuan/team`,
        query: queryString({ roleId: data.roleId })
      }
    }
  }
}
