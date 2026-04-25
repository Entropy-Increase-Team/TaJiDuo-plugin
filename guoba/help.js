/** 锅巴配置：帮助菜单 */
export default function getHelpSchemas() {
  return [
    {
      label: '帮助菜单',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'help.help_group',
      label: '帮助分组',
      bottomHelpMessage: '每个分组包含一个标题和若干命令行，会用于「塔吉多帮助」菜单',
      component: 'GSubForm',
      componentProps: {
        multiple: true,
        schemas: [
          {
            field: 'group',
            label: '分组标题',
            component: 'Input',
            required: true
          },
          {
            field: 'list',
            label: '命令列表',
            component: 'GTags',
            componentProps: {
              placeholder: '请输入命令后回车'
            }
          }
        ]
      }
    }
  ]
}
