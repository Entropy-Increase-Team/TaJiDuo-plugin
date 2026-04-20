# TaJiDuo API

`TaJiDuo` 现在等同于 `wegame-api-go` 那边的 `WeGame` 登录层。

它只负责：

- 验证码
- 登录建会话
- 登录态刷新
- 账号列表 / 主账号切换 / 删除账号
- 跨社区总控

它不负责具体游戏 `gameId`。

## 登录态模型

服务端会把以下字段保存到 PostgreSQL：

- `accessToken`
- `refreshToken`
- `tgdUid`
- `deviceId`

客户端只需要保存：

- `fwt`

业务接口可用 3 种方式带登录态：

1. 请求体传 `fwt`
2. 请求头传 `X-Framework-Token`
3. 都不传时，自动使用当前主账号

旧的原始字段 `accessToken / refreshToken / tgdUid / deviceId` 仍兼容，但不再推荐。

## 通用响应

成功：

```json
{
  "code": 0,
  "message": "成功",
  "data": {}
}
```

## 平台接口

| 接口 | 用途 |
| --- | --- |
| `POST /api/v1/login/tajiduo/captcha/send` | 发送短信验证码 |
| `POST /api/v1/login/tajiduo/captcha/check` | 校验短信验证码 |
| `POST /api/v1/login/tajiduo/session` | 登录并保存账号，返回 `username`、展示用 `tjdUid`、`fwt` |
| `POST /api/v1/login/tajiduo/refresh` | 刷新已保存账号 |
| `GET /api/v1/login/tajiduo/accounts` | 查看账号列表 |
| `POST /api/v1/login/tajiduo/accounts/primary` | 切主账号 |
| `DELETE /api/v1/login/tajiduo/accounts/:fwt` | 删除账号 |

## 登录流程

推荐顺序：

1. `POST /api/v1/login/tajiduo/captcha/send`
2. `POST /api/v1/login/tajiduo/session`
3. 客户端只保存返回的 `fwt`
4. 后续所有游戏 / 社区接口都走 `fwt`

### `POST /api/v1/login/tajiduo/session`

请求体：

```json
{
  "phone": "13800138000",
  "captcha": "123456",
  "deviceId": "4f1de0d7d8b54d0ebc62a74b6aef5e42"
}
```

返回：

```json
{
  "username": "jvrAsdSD9",
  "tjdUid": "130707909",
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

说明：

- 返回里的 `username` 来自 `data.user.nickname`
- 返回里的 `tjdUid` 来自 `data.user.account`，仅作展示
- 数据库存的 `tgdUid` 仍然是社区真实 `uid`
- 同一个真实社区 `uid` 再次登录时，会复用已有账号记录
- 新登录账号会自动设为主账号
- 原始 token 不再返回给客户端
- 后续业务请求统一使用 `fwt`

### `POST /api/v1/login/tajiduo/refresh`

推荐用法：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

也可以只传请求头：

```http
X-Framework-Token: 0d53c6f8f56f4d7abf53dbf4f68e7856
```

返回示例：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856",
  "tgdUid": "10193432",
  "deviceId": "a054f73b9a3f9aafd1f8b006e8a595d9",
  "success": true,
  "message": "刷新成功"
}
```

说明：

- 不传 `fwt` 时默认刷新主账号
- 刷新后的原始 token 只会更新数据库，不会下发给客户端
- 后端还会按配置做定时刷新

## 账号管理

### `GET /api/v1/login/tajiduo/accounts`

返回所有已保存账号，以及当前主账号。

### `POST /api/v1/login/tajiduo/accounts/primary`

请求体：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856"
}
```

### `DELETE /api/v1/login/tajiduo/accounts/:fwt`

作用：

- 删除指定账号
- 如果删除的是主账号，会自动把最近使用的下一个账号提升为主账号

## 公共接口

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 基础健康检查 |
| `GET /health/detailed` | 详细健康检查 |
| `GET /api/v1/games` | 游戏列表 |
| `POST /api/v1/games/community/sign/all` | 两个社区顺序执行 |

## `POST /api/v1/games/community/sign/all`

固定顺序：

1. 幻塔社区 5 步任务
2. 等待 `betweenCommunitiesMs`
3. 异环社区 5 步任务

推荐请求体：

```json
{
  "fwt": "0d53c6f8f56f4d7abf53dbf4f68e7856",
  "actionDelayMs": 3000,
  "stepDelayMs": 8000,
  "betweenCommunitiesMs": 15000
}
```

说明：

- 不传 `fwt` 时用主账号
- `actionDelayMs` 默认 `3000`
- `stepDelayMs` 默认 `8000`
- `betweenCommunitiesMs` 默认 `15000`
- 显式传 `0` 表示关闭等待
