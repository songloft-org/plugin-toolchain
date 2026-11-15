/// <reference types="@songloft/plugin-sdk" />
import { jsonResponse } from '@songloft/plugin-sdk'

globalThis.onInit = () => { console.log('{{name}} loaded (Lynx native plugin)') }

globalThis.onHTTPRequest = async (request) =>
  request.path === '/api/status'
    ? jsonResponse({ ok: true })
    : jsonResponse({ error: 'not found' }, 404)
