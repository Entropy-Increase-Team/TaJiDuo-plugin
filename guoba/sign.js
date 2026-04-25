const gameOptions = [
  { label: '幻塔', value: 'huanta' },
  { label: '异环', value: 'yihuan' }
]

/** 锅巴配置：自动签到 */
export default function getSignSchemas(groupList) {
  return [
    {
      label: '签到配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'sign.auto_sign',
      label: '自动签到开关',
      bottomHelpMessage: '开启后按 cron 自动执行配置游戏的签到',
      component: 'Switch',
      componentProps: {
        checkedChildren: '开启',
        unCheckedChildren: '关闭'
      }
    },
    {
      field: 'sign.auto_sign_cron',
      label: '自动签到时间',
      bottomHelpMessage: '可视化设置定时任务，也可以直接编辑 cron 表达式',
      component: 'EasyCron'
    },
    {
      field: 'sign.games',
      label: '自动签到游戏',
      bottomHelpMessage: '选择自动签到需要执行的游戏',
      component: 'Select',
      componentProps: {
        mode: 'multiple',
        options: gameOptions,
        placeholder: '请选择游戏'
      }
    },
    {
      field: 'sign.notify_list.friend',
      label: '好友通知列表',
      bottomHelpMessage: '自动签到完成后向这些 QQ 发送私聊通知',
      component: 'GTags',
      componentProps: {
        placeholder: '请输入 QQ 号后回车'
      }
    },
    {
      field: 'sign.notify_list.group',
      label: '群通知列表',
      bottomHelpMessage: '自动签到完成后向这些群发送通知',
      component: 'Select',
      componentProps: {
        allowAdd: true,
        allowDel: true,
        mode: 'multiple',
        options: groupList,
        placeholder: '选择或输入群号'
      }
    }
  ]
}
