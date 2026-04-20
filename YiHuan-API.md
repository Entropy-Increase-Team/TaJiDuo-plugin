# YiHuan API

异环模块信息：

- `gameCode = yihuan`
- 参考主游戏 `gameId = 1289`
- `communityId = 2`
- 路由前缀：`/api/v1/games/yihuan`

当前只开放社区层能力。

## 登录态使用方式

推荐只用：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

或者请求头：

```http
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

不传时会自动使用主账号。

## 已实现接口

| 接口 | 用途 | 说明 |
| --- | --- | --- |
| `POST /api/v1/games/yihuan/sign/app` | 社区签到单步 | 只做签到 |
| `POST /api/v1/games/yihuan/community/sign/all` | 社区 5 步任务 | 不做游戏签到 |
| `POST /api/v1/games/yihuan/community/sign/state` | 社区签到状态 | 查询是否已签到 |
| `POST /api/v1/games/yihuan/community/tasks` | 社区任务列表 | 默认 `gid = 2` |
| `POST /api/v1/games/yihuan/community/exp/level` | 社区等级 | 查询经验等级 |
| `POST /api/v1/games/yihuan/community/exp/records` | 社区经验流水 | 查询经验记录 |

## 核心接口

### `POST /api/v1/games/yihuan/sign/app`

请求：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

作用：

- 只做异环社区签到单步

### `POST /api/v1/games/yihuan/community/sign/all`

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

## 当前边界

- 当前没有 `POST /api/v1/games/yihuan/roles`
- 当前没有 `POST /api/v1/games/yihuan/sign/game`
- 当前没有 `POST /api/v1/games/yihuan/sign/all`
- 不要把 HAR 里出现的 `1257` 当成异环主游戏 ID
