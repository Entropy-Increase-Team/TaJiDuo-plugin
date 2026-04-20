# Hotta API

幻塔模块信息：

- `gameCode = hotta`
- `gameId = 1256`
- `communityId = 1`
- 路由前缀：`/api/v1/games/hotta`

## 登录态使用方式

推荐只用 `fwt`：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

或者：

```http
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

支持规则：

- 优先读取 `fwt`
- 不传 `fwt` 时读取主账号
- 旧的 `accessToken / refreshToken / tgdUid / deviceId` 仍兼容

## 已实现接口

| 接口 | 用途 | 说明 |
| --- | --- | --- |
| `POST /api/v1/games/hotta/roles` | 拉取角色列表 | 读绑定角色 + 角色列表 |
| `POST /api/v1/games/hotta/sign/game` | 单角色游戏签到 | 只处理一个 `roleId` |
| `POST /api/v1/games/hotta/sign/all` | 幻塔聚合签到 | 社区签到 + 游戏签到 |
| `POST /api/v1/games/hotta/sign/app` | 社区签到单步 | 只做社区签到 |
| `POST /api/v1/games/hotta/community/sign/all` | 社区 5 步任务 | 不做游戏签到 |
| `POST /api/v1/games/hotta/community/sign/state` | 社区签到状态 | 查询是否已签到 |
| `POST /api/v1/games/hotta/community/tasks` | 社区任务列表 | 默认 `gid = 2` |
| `POST /api/v1/games/hotta/community/exp/level` | 社区等级 | 查询经验等级 |
| `POST /api/v1/games/hotta/community/exp/records` | 社区经验流水 | 查询经验记录 |

## 核心接口说明

### `POST /api/v1/games/hotta/roles`

推荐请求：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

作用：

- 聚合绑定角色
- 聚合角色列表
- 给 `sign/game` 和 `sign/all` 提供 `roleId`

### `POST /api/v1/games/hotta/sign/game`

请求：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856",
  "roleId": "20001"
}
```

作用：

- 只执行单个角色的游戏签到

### `POST /api/v1/games/hotta/sign/all`

请求：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

也支持显式传角色：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856",
  "roles": [
    {
      "roleId": "20001",
      "roleName": "Aster",
      "gameId": "1256"
    }
  ]
}
```

它会尽量完成：

1. 使用已保存 `refreshToken` 刷新账号
2. 自动补拉角色
3. 执行 `sign/app`
4. 对每个角色执行 `sign/game`

说明：

- 如果本次走的是已保存账号，刷新后的原始 token 只会回写数据库
- 响应里不再返回 `accessToken`、`refreshToken`

### `POST /api/v1/games/hotta/community/sign/all`

请求：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856",
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

说明：

- 这是社区任务接口，不是游戏签到接口
- `betweenCommunitiesMs` 在单社区接口里不生效

## 默认发帖内容

社区 5 步任务里的“发送主帖”默认固定为：

- 标题：`每日打卡`
- 正文从以下 3 个里随机：
  - `打卡~`
  - `打卡打卡`
  - `早早早`
