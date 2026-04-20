# TaJiDuo-plugin

Yunzai-Bot 的塔吉多社区插件。

当前版本专注于塔吉多登录态管理与社区签到，支持幻塔、异环，以及一键社区签到。

## 功能简介

- 短信验证码登录塔吉多账号
- 查看当前登录账号
- 刷新当前登录账号
- 退出当前登录
- 删除当前登录账号
- 幻塔社区签到
- 异环社区签到
- 幻塔 + 异环一键社区签到
- 每天 `00:20` 自动社区签到

## 安装方式

### GitHub HTTPS

```bash
git clone https://github.com/Entropy-Increase-Team/TaJiDuo-plguin.git ./plugins/TaJiDuo-plugin
```

### GitHub SSH

```bash
git clone git@github.com:Entropy-Increase-Team/TaJiDuo-plguin.git ./plugins/TaJiDuo-plugin
```

安装完成后，重启 Yunzai 即可加载插件。

## 配置文件

默认配置：

- [config/tajiduo_default.yaml](./config/tajiduo_default.yaml)

实际生效配置：

- `plugins/TaJiDuo-plugin/config/config/tajiduo.yaml`

当前默认配置：

```yaml
tajiduo:
  base_url: 'https://tajiduo.shallow.ink'
  request_timeout_ms: 15000
  captcha_wait_timeout_ms: 300000
  community_task_timeout_ms: 300000
  action_delay_ms: 3000
  step_delay_ms: 8000
  between_communities_ms: 15000
```

字段说明：

- `base_url`: 塔吉多后端地址
- `request_timeout_ms`: 普通请求超时
- `captcha_wait_timeout_ms`: 登录等待验证码超时
- `community_task_timeout_ms`: 社区任务总超时
- `action_delay_ms`: 单步动作间隔
- `step_delay_ms`: 步骤间隔
- `between_communities_ms`: 一键社区签到时两个社区之间的间隔

说明：

- `base_url` 即使只写 `tajiduo.shallow.ink`，插件也会自动补上 `https://`

## 命令说明

### 帮助命令

| 命令 | 说明 |
| --- | --- |
| `#塔吉多帮助` | 查看帮助 |

### 登录命令

以下命令仅支持私聊使用：

| 命令 | 说明 |
| --- | --- |
| `#塔吉多登录 13800138000` | 发送验证码并等待下一条 `6` 位验证码 |
| `#塔吉多账号` | 查看当前登录账号 |
| `#塔吉多刷新登录` | 刷新当前登录账号 |
| `#塔吉多退出登录` | 退出当前登录 |
| `#塔吉多删除账号` | 删除当前登录账号 |

### 签到命令

| 命令 | 说明 |
| --- | --- |
| `#塔吉多异环社区签到` | 执行异环社区签到 |
| `#塔吉多幻塔社区签到` | 执行幻塔社区签到 |
| `#塔吉多社区签到` | 依次执行幻塔 + 异环社区签到 |

## 自动社区签到

插件会在每天 `00:20` 自动遍历 Redis 中已保存的账号，并执行一键社区签到：

- `POST /api/v1/games/community/sign/all`

如果当前没有已保存账号，自动任务会直接跳过，并在日志中输出提示。
