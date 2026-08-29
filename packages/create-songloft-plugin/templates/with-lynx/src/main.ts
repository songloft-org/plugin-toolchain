import { definePlugin } from '@songloft/plugin-sdk'

definePlugin({
  onLoad() {
    console.log('{{name}} loaded (Lynx native plugin)')
  },
})
