/** 锅巴配置：基础配置、网页登录与社区任务 */
export default function getCommonSchemas() {
  return [
    {
      label: '基础配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      component: 'Divider',
      label: 'API 服务'
    },
    {
      field: 'base_url',
      label: 'API 服务地址',
      bottomHelpMessage: 'TaJiDuo 后端接口地址',
      component: 'Input',
      required: true,
      componentProps: {
        placeholder: 'https://tajiduo.shallow.ink'
      }
    },
    {
      field: 'api_key',
      label: 'API Key',
      bottomHelpMessage: '通过 X-API-Key 请求头传递的接口密钥',
      component: 'InputPassword',
      required: true,
      componentProps: {
        placeholder: '请输入 TaJiDuo API Key'
      }
    },
    {
      field: 'timeout',
      label: '请求超时时间',
      bottomHelpMessage: '单位：毫秒',
      component: 'InputNumber',
      componentProps: {
        min: 1000,
        addonAfter: 'ms'
      }
    },
    {
      component: 'Divider',
      label: '网页登录服务'
    },
    {
      field: 'login_server.enabled',
      label: '启用网页登录',
      bottomHelpMessage: '开启后「tjd登录」生成网页登录链接；关闭后使用「tjd登录 <手机号>」发送短信验证码',
      component: 'Switch',
      componentProps: {
        checkedChildren: '开启',
        unCheckedChildren: '关闭'
      }
    },
    {
      field: 'login_server.port',
      label: '本地服务端口',
      component: 'InputNumber',
      componentProps: {
        min: 1,
        max: 65535
      }
    },
    {
      field: 'login_server.public_link',
      label: '对外登录地址',
      bottomHelpMessage: '部署在公网或反代后请填写用户可访问的地址',
      component: 'Input',
      componentProps: {
        placeholder: 'http://127.0.0.1:25188'
      }
    },
    {
      component: 'Divider',
      label: '社区任务'
    },
    {
      field: 'community_task.action_delay_ms',
      label: '动作间隔',
      bottomHelpMessage: '社区任务单个动作之间的等待时间，单位：毫秒',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        addonAfter: 'ms'
      }
    },
    {
      field: 'community_task.step_delay_ms',
      label: '步骤间隔',
      bottomHelpMessage: '社区任务步骤之间的等待时间，单位：毫秒',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        addonAfter: 'ms'
      }
    },
    {
      field: 'community_task.between_communities_ms',
      label: '双社区间隔',
      bottomHelpMessage: '执行「tjd社区签到」时，幻塔与异环社区之间的等待时间',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        addonAfter: 'ms'
      }
    },
    {
      field: 'community_task.poll_times',
      label: '轮询次数',
      bottomHelpMessage: '单游戏社区任务状态查询次数',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        addonAfter: '次'
      }
    },
    {
      field: 'community_task.poll_interval_ms',
      label: '轮询间隔',
      bottomHelpMessage: '社区任务状态查询间隔，单位：毫秒',
      component: 'InputNumber',
      componentProps: {
        min: 1000,
        addonAfter: 'ms'
      }
    },
    {
      field: 'community_task.batch_poll_times',
      label: '双社区轮询次数',
      bottomHelpMessage: '可选。为空时默认使用轮询次数的 3 倍',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        addonAfter: '次'
      }
    }
  ]
}
