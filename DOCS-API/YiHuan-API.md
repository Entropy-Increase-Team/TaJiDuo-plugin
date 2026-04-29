# YiHuan API

本文档描述异环模块接口。

在调用本文件中的接口前，请先参考 [TaJiDuo-API.md](./TaJiDuo-API.md) 完成：

- `fwt` 获取
- 默认请求头 `X-API-Key` + `X-Framework-Token`
- 平台层账号管理
- 首次登录时由上游后端注入 `X-Platform-Id` 与 `X-Platform-User-Id`

## 模块信息

- `gameCode = yihuan`
- 参考主游戏 `gameId = 1289`
- `communityId = 2`
- 路由前缀：`/api/v1/games/yihuan`
- 当前已开放游戏数据、游戏签到、补签、角色列表与社区层能力

## 响应格式

当前接口统一返回：

```json
{
  "code": 0,
  "message": "成功",
  "data": {}
}
```

错误响应示例：

```json
{
  "code": 400,
  "message": "缺少 fwt"
}
```

```json
{
  "code": 401,
  "message": "当前 fwt 已失效，请重新登录"
}
```

## 登录态使用方式

本文档默认统一使用请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

补充：

- 必须显式传 `fwt`
- 本文档默认不再把 `apiKey` 放进 URL，也不再把 `fwt` 放进请求体或查询参数示例
- 不接受原始 `accessToken / refreshToken / tgdUid / deviceId` 作为业务接口入口
- 当前 `fwt` 无效、已删除或已失效时返回 `401`
- 不再自动回落到主账号

## 已实现接口

| 方法 | 路径 | 请求参数 / 请求体 | 成功返回 `data` |
| --- | --- | --- | --- |
| `GET` | `/api/v1/games/yihuan/roles` | 无 | `gameId`、`bindRole`、`roles` |
| `GET` | `/api/v1/games/yihuan/record-card` | 无 | `uid`、`gameId`、`cards` |
| `GET` | `/api/v1/games/yihuan/role-home` | 无；兼容 `roleId` 但不透传 | 角色面板总览、`upstream` |
| `GET` | `/api/v1/games/yihuan/characters` | Query：`roleId` 必填 | 角色详细面板数组、`upstream` |
| `GET` | `/api/v1/games/yihuan/achieve-progress` | Query：`roleId` 必填 | `data`、`upstream` |
| `GET` | `/api/v1/games/yihuan/area-progress` | Query：`roleId` 必填 | `data`、`upstream` |
| `GET` | `/api/v1/games/yihuan/real-estate` | Query：`roleId` 必填 | `data`、`upstream` |
| `GET` | `/api/v1/games/yihuan/vehicles` | Query：`roleId` 必填 | `data`、`upstream` |
| `GET` | `/api/v1/games/yihuan/team` | 无 | `data`、`upstream` |
| `GET` | `/api/v1/games/yihuan/sign/state` | 无 | `gameId`、`day`、`days`、`month`、`reSignCnt`、`todaySign` |
| `GET` | `/api/v1/games/yihuan/sign/rewards` | Query：`roleId` 可选 | `gameId`、`roleId`、`items` |
| `GET` | `/api/v1/games/yihuan/sign/resign-info` | 无 | `gameId`、`coin`、`cost`、`reSignCnt`、`reSignLimit`、`todaySign` |
| `POST` | `/api/v1/games/yihuan/sign/game` | JSON：`roleId` 必填 | `gameId`、`roleId`、`upstream` |
| `POST` | `/api/v1/games/yihuan/sign/resign` | JSON：`roleId` 必填 | `gameId`、`roleId`、`upstream` |
| `POST` | `/api/v1/games/yihuan/sign/all` | JSON：可空；`roles`、`signGameIds` 可选 | `deviceId`、`tgdUid`、`app`（含社区签到）、`games` |
| `POST` | `/api/v1/games/yihuan/sign/app` | JSON：可空 | `communityId`、`success`、`message`、`exp`、`goldCoin` |
| `POST` | `/api/v1/games/yihuan/community/sign/all` | JSON：`actionDelayMs`、`stepDelayMs` 可选 | `taskId`、`status`、`request` |
| `GET` | `/api/v1/games/yihuan/community/sign/tasks/:taskId` | Path：`taskId` 必填 | 任务状态和执行结果 |
| `GET` | `/api/v1/games/yihuan/community/sign/state` | 无 | `communityId`、`signed` |
| `GET` | `/api/v1/games/yihuan/community/tasks` | Query：`gid` 可选，默认 `2` | `communityId`、`gid`、`groups` |
| `GET` | `/api/v1/games/yihuan/community/exp/level` | 无 | `communityId`、等级和经验字段 |
| `GET` | `/api/v1/games/yihuan/community/exp/records` | 无 | `communityId`、`items` |

## 核心接口

### `GET /api/v1/games/yihuan/roles`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "gameId": "1289",
    "bindRole": 0,
    "roles": [
      {
        "gameId": 1289,
        "gender": 0,
        "lev": 1,
        "roleId": 214075351008,
        "roleName": "9_130707909",
        "serverId": 14001,
        "serverName": "OB游戏服"
      }
    ]
  }
}
```

说明：

- 当前实现直接读取异环角色列表
- `roleId` 可直接用于 `sign/game` 与 `sign/resign`

### 游戏数据接口

以下接口都需要：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

除 `record-card` 外，游戏数据接口会把平台返回的主体放在 `data.data`，并在 `data.upstream` 中带上调用状态：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": {},
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

参数规则：

- `role-home` 按当前登录态返回角色面板总览；兼容 `roleId` 参数，但后端不向上游透传
- `characters`、`achieve-progress`、`area-progress`、`real-estate`、`vehicles` 必须传 `roleId`
- `team` 是账号级接口，不需要 `roleId`

#### `GET /api/v1/games/yihuan/record-card`

用途：查询当前账号名下异环游戏战绩卡 / 角色名片总览。

查询参数：无

请求示例：

```http
GET /api/v1/games/yihuan/record-card
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "uid": "10193432",
    "gameId": "1289",
    "cards": [
      {
        "gameId": 1289,
        "gameName": "异环",
        "bindRoleInfo": {
          "account": "9_130707909",
          "gameId": 1289,
          "gender": 0,
          "lev": 16,
          "roleId": 214075351008,
          "roleName": "清",
          "serverId": 14001,
          "serverName": "异环"
        }
      }
    ]
  }
}
```

说明：

- 当前接口会筛选 `gameId=1289` 的异环卡片

#### `GET /api/v1/games/yihuan/role-home`

查询参数：

- `roleId`：兼容参数；当前后端不向上游透传，按登录态返回角色面板总览

用途：获取异环角色面板总览，例如头像、等级、体力、成就总览、区域总览、角色简表、房产概览、载具概览等。

请求示例：

```http
GET /api/v1/games/yihuan/role-home
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": {
      "roleid": "214075351008",
      "rolename": "9_130707909",
      "serverid": "14001",
      "servername": "OB游戏服",
      "avatar": "https://webstatic.tajiduo.com/bbs/pic/player_003_256.png",
      "lev": 30,
      "worldlevel": 2,
      "tycoonLevel": 5,
      "roleloginDays": 12,
      "charidCnt": 8,
      "achieveProgress": {
        "achievementCnt": 36,
        "total": 120
      },
      "areaProgress": [
        {
          "id": "area_1",
          "name": "海特洛市",
          "total": 72
        }
      ],
      "realestate": {
        "showId": "house_1",
        "showName": "都市公寓",
        "total": 4
      },
      "vehicle": {
        "ownCnt": 3,
        "showId": "vehicle_1",
        "showName": "巡航机车",
        "total": 12
      },
      "characters": [
        {
          "id": "player_003",
          "name": "角色名",
          "alev": 1,
          "awakenLev": 0,
          "elementType": "fire",
          "groupType": "city",
          "quality": "SSR",
          "slev": 30
        }
      ]
    },
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

说明：

- `data.data.roleid` 是游戏角色 ID
- `data.data.characters` 是角色简表，只包含面板首页需要的基础字段
- 要查看单个角色的属性、技能、芯片 / 驱动、武器等详细面板，调用 `GET /api/v1/games/yihuan/characters`

#### `GET /api/v1/games/yihuan/characters`

查询参数：

- `roleId`：必填，游戏角色 ID，不是角色图鉴里的 `id`

用途：获取异环角色详细面板列表。返回值是数组，每一项对应一个角色的详细面板数据。

请求示例：

```http
GET /api/v1/games/yihuan/characters?roleId=214075351008
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": [
      {
        "id": "player_003",
        "name": "角色名",
        "alev": 1,
        "awakenLev": 0,
        "awakenEffect": ["攻击提升"],
        "elementType": "fire",
        "groupType": "city",
        "quality": "SSR",
        "properties": [
          {
            "id": "atk",
            "name": "攻击",
            "value": "1200"
          }
        ],
        "skills": [
          {
            "id": "skill_1",
            "name": "技能名",
            "type": "active",
            "level": 3,
            "items": [
              {
                "title": "效果",
                "desc": "造成伤害"
              }
            ]
          }
        ],
        "citySkills": [],
        "fork": {
          "id": "fork_1",
          "alev": "1",
          "blev": "0",
          "slev": "30",
          "properties": []
        },
        "suit": {
          "suitActivateNum": 2
        }
      }
    ],
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

说明：

- 返回的是当前游戏角色名下的角色详细面板数组
- 每个角色对象里通常包含 `properties`、`skills`、`citySkills`、`fork`、`suit` 等面板字段
- 如果前端只需要某一个角色的面板，可以按数组项里的 `id` 自行筛选

#### `GET /api/v1/games/yihuan/achieve-progress`

查询参数：

- `roleId`：必填

用途：获取异环成就进度。

请求示例：

```http
GET /api/v1/games/yihuan/achieve-progress?roleId=214075351008
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": {
      "achievementCnt": 36,
      "total": 120,
      "bronzeUmdCnt": 12,
      "silverUmdCnt": 3,
      "goldUmdCnt": 1,
      "detail": [
        {
          "id": "achieve_city",
          "name": "都市见闻",
          "progress": 8,
          "total": 20
        }
      ]
    },
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

#### `GET /api/v1/games/yihuan/area-progress`

查询参数：

- `roleId`：必填

用途：获取异环区域探索进度。

请求示例：

```http
GET /api/v1/games/yihuan/area-progress?roleId=214075351008
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": [
      {
        "id": "area_1",
        "name": "海特洛市",
        "total": 72,
        "detail": [
          {
            "id": "spot_1",
            "name": "观景点",
            "total": 10
          }
        ]
      }
    ],
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

#### `GET /api/v1/games/yihuan/real-estate`

查询参数：

- `roleId`：必填

用途：获取异环房产数据。

请求示例：

```http
GET /api/v1/games/yihuan/real-estate?roleId=214075351008
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": {
      "detail": [
        {
          "id": "house_1",
          "name": "都市公寓",
          "own": true,
          "fdetail": [
            {
              "id": "furniture_1",
              "name": "沙发",
              "own": true
            }
          ]
        }
      ]
    },
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

#### `GET /api/v1/games/yihuan/vehicles`

查询参数：

- `roleId`：必填

用途：获取异环载具数据。

请求示例：

```http
GET /api/v1/games/yihuan/vehicles?roleId=214075351008
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": {
      "detail": [
        {
          "id": "vehicle_1",
          "name": "巡航机车",
          "own": true
        }
      ],
      "ownCnt": 3,
      "showId": "vehicle_1",
      "showName": "巡航机车",
      "total": 12
    },
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

#### `GET /api/v1/games/yihuan/team`

用途：获取异环配队推荐列表。

请求示例：

```http
GET /api/v1/games/yihuan/team
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "data": [
      {
        "id": "team_1",
        "name": "火系爆发队",
        "icon": "https://webstatic.tajiduo.com/bbs/pic/team.png",
        "desc": "适合快速清场",
        "imgs": [
          "https://webstatic.tajiduo.com/bbs/pic/player_003_256.png"
        ]
      }
    ],
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

### `GET /api/v1/games/yihuan/sign/state`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "gameId": "1289",
    "day": 23,
    "days": 0,
    "month": 4,
    "reSignCnt": 0,
    "todaySign": false
  }
}
```

说明：

- `todaySign` 表示今天是否已签到
- `days` 表示当前累计签到天数
- `reSignCnt` 表示当前补签次数

### `GET /api/v1/games/yihuan/sign/rewards`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

查询参数：

- `roleId`：可选

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "gameId": "1289",
    "roleId": "214075351008",
    "items": [
      {
        "name": "甲硬币",
        "num": 10000
      }
    ]
  }
}
```

说明：

- 支持带 `roleId` 查询指定角色对应的奖励表
- 不传 `roleId` 也可以正常返回奖励表

### `GET /api/v1/games/yihuan/sign/resign-info`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "gameId": "1289",
    "coin": 390,
    "cost": 200,
    "reSignCnt": 0,
    "reSignLimit": 3,
    "todaySign": true
  }
}
```

说明：

- `coin` 是当前补签币余额
- `cost` 是本次补签消耗
- `reSignCnt` 是当前已补签次数
- `reSignLimit` 是补签上限

### `POST /api/v1/games/yihuan/sign/game`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

请求：

```json
{
  "roleId": "214075351008",
  "signGameIds": ["1289", "1257"]
}
```

响应示例：

```json
{
  "code": 0,
  "message": "签到成功，今日物品：异核x10",
  "data": {
    "gameId": "1289",
    "attemptedGameIds": ["1289"],
    "role": {
      "roleId": "214075351008",
      "gameId": "1289"
    },
    "success": true,
    "message": "签到成功，今日物品：异核x10",
    "reward": "异核x10",
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

说明：

- 需要显式传 `roleId`
- `signGameIds` 可选；不传时会按角色 `gameId`、默认 `1289`、兼容 `1257` 依次尝试
- 如果上游返回已签到，会复查 `sign/state.todaySign`，确认后按成功返回

### `POST /api/v1/games/yihuan/sign/all`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

请求：

```json
{}
```

也支持显式传角色：

```json
{
  "signGameIds": ["1289", "1257"],
  "roles": [
    {
      "roleId": "214075351008",
      "roleName": "主角",
      "gameId": "1289"
    }
  ]
}
```

它会尽量完成：

1. 使用已保存 `refreshToken` 刷新账号
2. 执行一次异环社区 `sign/app`
3. 自动补拉异环角色
4. 对每个角色按 `signGameIds`、角色 `gameId`、默认 `1289`、兼容 `1257` 依次尝试 `sign/game`
5. 成功或确认已签到后查询游戏签到状态和签到奖励表，返回今日物品

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "success": true,
    "message": "异环聚合签到完成",
    "deviceId": "device-x",
    "tgdUid": "10001",
    "roles": [
      {
        "roleId": "214075351008",
        "roleName": "主角",
        "gameId": "1289"
      }
    ],
    "app": {
      "success": true,
      "message": "社区任务签到成功，获得5经验，12金币",
      "exp": 5,
      "goldCoin": 12
    },
    "games": [
      {
        "gameId": "1289",
        "attemptedGameIds": ["1289"],
        "role": {
          "roleId": "214075351008",
          "roleName": "主角",
          "gameId": "1289"
        },
        "success": true,
        "message": "今日已签到，今日物品：异核x10",
        "alreadySigned": true,
        "reward": "异核x10"
      }
    ]
  }
}
```

说明：

- 必须显式传 `fwt`
- 当前 `fwt` 无效、已删除或已失效时返回 `401`
- 如果本次走的是已保存账号，刷新后的原始 token 只会回写数据库
- `app` 是社区签到摘要
- `games[*]` 是每个角色的游戏签到摘要
- `signGameIds` 可选，用于覆盖/补充游戏签到候选 `gameId`
- `games[*].gameId` 是本次实际成功或确认已签到的 `gameId`
- `reward` 会根据 `sign/state.days` 和 `sign/rewards` 推算今日物品，格式为 `物品x数量`
- 如果上游奖励表缺失，则保留上游签到消息

### `POST /api/v1/games/yihuan/sign/resign`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

请求：

```json
{
  "roleId": "214075351008"
}
```

响应示例：

```json
{
  "code": 0,
  "message": "异环游戏补签成功",
  "data": {
    "gameId": "1289",
    "roleId": "214075351008",
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

说明：

- 当前是单角色直接补签
- 需要显式传 `roleId`
- 补签前建议先查 `sign/resign-info`

### `POST /api/v1/games/yihuan/sign/app`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

请求：

```json
{}
```

作用：

- 只做异环社区签到单步

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "communityId": "2",
    "success": true,
    "message": "社区任务签到成功，获得5经验，12金币",
    "exp": 5,
    "goldCoin": 12,
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok",
      "data": {
        "exp": 5,
        "goldCoin": 12
      }
    }
  }
}
```

说明：

- 如果今天已经签过，会被归一化成成功响应
- `alreadySigned` 为 `true` 时表示今天已签过
- 必须显式传 `fwt`
- 当前 `fwt` 无效、已删除或已失效时返回 `401`

### `POST /api/v1/games/yihuan/community/sign/all`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

请求：

```json
{
  "actionDelayMs": 3000,
  "stepDelayMs": 8000
}
```

固定跑 5 步：

1. 签到
2. 浏览帖子
3. 发送主帖
4. 发送评论
5. 点赞帖子

提交后会立即返回任务信息，不再等待 5 步全部执行完。

响应示例：

```json
{
  "code": 0,
  "message": "任务已开始",
  "data": {
    "taskId": "c593bf0748c7496dbe6f50fce89a6b5b",
    "gameCode": "yihuan",
    "gameName": "异环",
    "scope": "community-game",
    "status": "pending",
    "completed": false,
    "message": "任务已创建",
    "createdAt": "2026-04-21T12:10:00+08:00",
    "request": {
      "deviceId": "a054f73b9a3f9aafd1f8b006e8a595d9",
      "tgdUid": "10193432",
      "delays": {
        "actionDelayMs": 3000,
        "stepDelayMs": 8000
      }
    }
  }
}
```

说明：

- 必须显式传 `fwt`
- 如果当前 `fwt` 无效、已删除，或预检时上游明确判定登录态失效，直接返回 `401`，不会创建任务
- 如果同一个 `fwt` 已经有一个异环社区任务在执行，会直接返回同一个 `taskId`
- 复用已有任务时，顶层 `message` 会是 `已有进行中的任务`
- 真正执行结果需要再调用状态查询接口

### `GET /api/v1/games/yihuan/community/sign/tasks/:taskId`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

执行完成响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "taskId": "c593bf0748c7496dbe6f50fce89a6b5b",
    "gameCode": "yihuan",
    "gameName": "异环",
    "scope": "community-game",
    "status": "finished",
    "completed": true,
    "success": true,
    "message": "社区任务全部完成",
    "createdAt": "2026-04-21T12:10:00+08:00",
    "startedAt": "2026-04-21T12:10:00+08:00",
    "finishedAt": "2026-04-21T12:10:47+08:00",
    "request": {
      "deviceId": "a054f73b9a3f9aafd1f8b006e8a595d9",
      "tgdUid": "10193432",
      "delays": {
        "actionDelayMs": 3000,
        "stepDelayMs": 8000
      }
    },
    "result": {
      "item": {
        "gameCode": "yihuan",
        "gameName": "异环",
        "communityId": "2",
        "deviceId": "a054f73b9a3f9aafd1f8b006e8a595d9",
        "tgdUid": "10193432",
        "success": true,
        "message": "社区任务全部完成",
        "delays": {
          "actionDelayMs": 3000,
          "stepDelayMs": 8000
        },
        "tasksBefore": [
          {
            "taskKey": "signin_exp",
            "title": "签到",
            "completeTimes": 0,
            "limitTimes": 1,
            "targetTimes": 1,
            "remaining": 1
          },
          {
            "taskKey": "browse_post_exp",
            "title": "浏览帖子",
            "completeTimes": 0,
            "limitTimes": 1,
            "targetTimes": 1,
            "remaining": 1
          }
        ],
        "tasksAfter": [
          {
            "taskKey": "signin_exp",
            "title": "签到",
            "completeTimes": 1,
            "limitTimes": 1,
            "targetTimes": 1,
            "remaining": 0
          },
          {
            "taskKey": "browse_post_exp",
            "title": "浏览帖子",
            "completeTimes": 1,
            "limitTimes": 1,
            "targetTimes": 1,
            "remaining": 0
          }
        ],
        "steps": [
          {
            "taskKey": "signin_exp",
            "title": "签到",
            "planned": 1,
            "alreadyComplete": 0,
            "remainingBefore": 1,
            "attempted": 1,
            "successCount": 1,
            "success": true,
            "message": "社区任务签到成功，获得5经验，12金币"
          },
          {
            "taskKey": "browse_post_exp",
            "title": "浏览帖子",
            "planned": 1,
            "alreadyComplete": 0,
            "remainingBefore": 1,
            "attempted": 1,
            "successCount": 1,
            "success": true,
            "message": "浏览帖子任务完成"
          }
        ]
      }
    }
  }
}
```

说明：

- 必须显式传 `fwt`
- 只能查询当前 `fwt` 自己提交的任务
- 如果当前 `fwt` 已失效，或任务结果已经明确识别到需要重新登录，接口直接返回 `401`
- `status` 只有 `pending`、`running`、`finished`、`failed`
- `result.item.tasksBefore` / `result.item.tasksAfter` 来自任务列表接口
- `result.item.steps` 表示本次主动执行的 5 个任务
- 当前“社区任务全部完成”只按这 5 个主动任务判断
- `被点赞帖子`、`被回复`、`被收藏` 这类被动任务即使仍未完成，也会继续体现在 `result.item.tasksAfter`

登录态失效响应示例：

```json
{
  "code": 401,
  "message": "当前 fwt 已失效，请重新登录",
  "data": {
    "taskId": "c593bf0748c7496dbe6f50fce89a6b5b",
    "gameCode": "yihuan",
    "gameName": "异环",
    "scope": "community-game",
    "status": "failed",
    "completed": true,
    "success": false,
    "message": "当前 fwt 已失效，请重新登录"
  }
}
```

### `GET /api/v1/games/yihuan/community/sign/state`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "communityId": "2",
    "signed": true,
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok",
      "data": true
    }
  }
}
```

说明：

- 必须显式传 `fwt`
- 现在使用 `GET`
- 这个接口只表示“今天社区签到是否已完成”
- 不表示整套社区任务是否全部完成
- 如果上游明确判定登录态失效，接口会转成 `401`

### `GET /api/v1/games/yihuan/community/tasks`

请求：

```http
GET /api/v1/games/yihuan/community/tasks?gid=2
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "communityId": "2",
    "gid": 2,
    "groups": [
      {
        "key": "task_list3",
        "items": [
          {
            "taskKey": "signin_exp",
            "title": "签到",
            "uid": "10193432",
            "exp": 5,
            "coin": 0,
            "completeTimes": 1,
            "contTimes": 0,
            "limitTimes": 1,
            "period": 20260421,
            "targetTimes": 1
          },
          {
            "taskKey": "browse_post_exp",
            "title": "浏览帖子",
            "uid": "10193432",
            "exp": 5,
            "coin": 0,
            "completeTimes": 1,
            "contTimes": 0,
            "limitTimes": 1,
            "period": 20260421,
            "targetTimes": 1
          }
        ]
      }
    ]
  }
}
```

说明：

- 必须显式传 `fwt`
- 现在使用 `GET`
- 这是“任务完成情况接口”
- 如果上游明确判定登录态失效，接口会转成 `401`
- 判断某项任务是否完成，通常看 `completeTimes >= limitTimes`；如果 `limitTimes` 为空，再看 `targetTimes`
- 当前主动执行的 5 个任务对应：
  - `signin_exp`
  - `browse_post_exp`
  - `send_post_exp`
  - `send_comment_exp`
  - `like_post_exp`
- 上游还可能返回 `被点赞帖子`、`被回复`、`被收藏` 等其他任务项，具体 `taskKey` 以上游实际返回为准

### `GET /api/v1/games/yihuan/community/exp/level`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "communityId": "2",
    "exp": 95,
    "level": 2,
    "levelExp": 55,
    "nextLevel": 3,
    "nextLevelExp": 200,
    "todayExp": 90,
    "upstream": {
      "success": true,
      "httpStatus": 200,
      "code": 0,
      "message": "ok"
    }
  }
}
```

说明：

- 必须显式传 `fwt`
- 现在使用 `GET`
- 如果上游明确判定登录态失效，接口会转成 `401`

### `GET /api/v1/games/yihuan/community/exp/records`

请求头：

```http
X-API-Key: your-api-key
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "communityId": "2",
    "items": [
      {
        "communityId": "2",
        "title": "签到",
        "sourceId": "10869184",
        "uid": "10193432",
        "type": 3,
        "num": 5,
        "createTime": 1776530262742,
        "updateTime": 1776530262744
      }
    ]
  }
}
```

说明：

- 这是经验流水接口
- `title` 为经验来源说明
- `num` 为本次经验增量
- 必须显式传 `fwt`
- 现在使用 `GET`
- 如果上游明确判定登录态失效，接口会转成 `401`

## 当前边界

- `community/sign/all` 当前只会主动执行 5 个任务，不会主动补 `被点赞帖子`、`被回复`、`被收藏`
- 异环主游戏 ID 固定为 `1289`
