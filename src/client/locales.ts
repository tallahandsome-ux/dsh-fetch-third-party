/**
 * Locale copy for the fetch-third-party settings card.
 * @module dsh-fetch-third-party/client/locales
 */

/** Locale keys this surface renders. */
export type FetchCardLocaleKey =
  | 'title' | 'description'
  | 'level1' | 'level2'
  | 'adapter' | 'adapterHint'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint' | 'customEndpointHint'
  | 'maxFetches' | 'maxFetchesHint'
  | 'cacheSection' | 'cacheEnable' | 'cacheSeconds' | 'cacheHint'
  | 'proxy' | 'proxyHint' | 'proxyEnable' | 'proxyOffHint'
  | 'save' | 'saving' | 'saveSuccess' | 'saveFailed'
  | 'clear'
  | 'defaultProvider' | 'fallbackProvider' | 'fallbackNone' | 'fallbackSuffix'
  | 'test' | 'testUrl' | 'testRun' | 'testing' | 'testQuotaWarn'
  | 'testOk' | 'testFail' | 'testError'
  | 'customSection' | 'customAdd' | 'customSave' | 'customDelete'
  | 'customName' | 'customType' | 'customKeyRef' | 'customConditions'
  | 'keyRefHint'
  | 'loading'

/** English copy. */
export const en: Record<FetchCardLocaleKey, string> = {
  title: 'Web fetch (third party)',
  description: 'Fetch page content through a third-party service you configure. The local machine never connects to the target URL.',
  level1: 'Basic (provider & proxy)',
  level2: 'Provider settings (endpoint & key)',
  adapter: 'Provider',
  adapterHint: 'Which service performs the fetch. Jina works without a key.',
  apiKey: 'API key',
  apiKeyHint: 'Stored in the managed credentials store (0600); never shown again.',
  apiKeySet: 'Configured',
  apiKeyUnset: 'Not configured',
  baseUrl: 'Endpoint',
  baseUrlHint: 'The service base URL. Leave blank for the provider default.',
  customEndpointHint: 'Endpoint of this custom provider; editing it updates where it fetches.',
  maxFetches: 'Fetch cap per session',
  maxFetchesHint: 'Stop fetching once this many calls happen in one session.',
  cacheSection: 'Fetch cache',
  cacheEnable: 'Enable',
  cacheSeconds: 'seconds TTL',
  cacheHint: 'Repeated fetches of the same URL within the TTL are served from memory — no third-party quota used, no budget consumed.',
  proxy: 'Local proxy',
  proxyHint: 'Optional HTTP proxy, e.g. http://127.0.0.1:27822, for networks that block the service. Applies per request to every provider; leave blank for direct.',
  proxyEnable: 'Enable',
  proxyOffHint: 'Proxy off: the address is kept but requests go direct.',
  save: 'Save',
  saving: 'Saving…',
  saveSuccess: 'Saved.',
  saveFailed: 'The change was not accepted.',
  clear: 'Clear',
  defaultProvider: 'Default provider',
  fallbackProvider: 'Fallback provider',
  fallbackNone: 'None (no fallback)',
  fallbackSuffix: ' (auto when the primary fails)',
  test: 'Test connection',
  testUrl: 'Test URL',
  testRun: 'Test',
  testing: 'Testing…',
  testQuotaWarn: '⚠ Testing calls the provider for real and consumes its API quota.',
  testOk: 'OK',
  testFail: 'Failed',
  testError: 'Error',
  customSection: 'Custom providers',
  customAdd: '+ Add custom provider',
  customSave: 'Save providers',
  customDelete: 'Delete',
  customName: 'Name',
  customType: 'Type',
  customKeyRef: 'API key ref',
  customConditions: 'Adapter conditions: a custom service must satisfy contract v1 — POST {endpoint}, body { "url": "<target>" }, optional Authorization: Bearer <key>; respond 200 JSON { content, statusCode?, title? }. Or reuse a built-in adapter (pick jina/tavily/firecrawl + local endpoint, e.g. self-hosted Jina). See docs/contract.md.',
  keyRefHint: 'Key ref:',
  loading: 'Loading…',
}

/** 中文文案。 */
export const zh: Record<FetchCardLocaleKey, string> = {
  title: '网页抓取（第三方）',
  description: '通过你自行配置的第三方服务抓取网页内容。本机不直接连接目标网址。',
  level1: '基础设置（服务商与代理）',
  level2: '服务商配置（接口地址与 API Key）',
  adapter: '服务商',
  adapterHint: '由哪个服务执行抓取。Jina 无需 key 即可用。',
  apiKey: 'API Key',
  apiKeyHint: '写入托管保险箱（0600 权限），此后不再回显。',
  apiKeySet: '已配置',
  apiKeyUnset: '未配置',
  baseUrl: '接口地址',
  baseUrlHint: '服务接口地址；留空使用服务商默认值。',
  customEndpointHint: '该自定义服务商的抓取地址；修改后即更新其接口。',
  maxFetches: '每会话抓取上限',
  maxFetchesHint: '单个会话抓取次数达到该值后停止。',
  cacheSection: '抓取缓存',
  cacheEnable: '启用',
  cacheSeconds: '秒有效期',
  cacheHint: '同一 URL 在有效期内重复抓取直接走内存缓存——不消耗第三方额度，也不消耗会话预算。',
  proxy: '本地代理',
  proxyHint: '可选 HTTP 代理，如 http://127.0.0.1:27822，用于网络被阻断的服务。对所有服务商生效，按请求代理；留空走直连。',
  proxyEnable: '启用',
  proxyOffHint: '代理已关闭：地址保留，请求走直连。',
  save: '保存',
  saving: '保存中…',
  saveSuccess: '已保存。',
  saveFailed: '保存未成功。',
  clear: '清除',
  defaultProvider: '默认服务商',
  fallbackProvider: '兜底服务商',
  fallbackNone: '无（不兜底）',
  fallbackSuffix: '（主服务商失败时自动回退）',
  test: '测试连接',
  testUrl: '测试 URL',
  testRun: '测试',
  testing: '测试中…',
  testQuotaWarn: '⚠ 测试会真实调用第三方服务，消耗该服务商的 API 额度',
  testOk: '成功',
  testFail: '失败',
  testError: '错误',
  customSection: '自定义服务商',
  customAdd: '+ 添加自定义服务商',
  customSave: '保存自定义服务商',
  customDelete: '删除',
  customName: '名称',
  customType: '类型',
  customKeyRef: 'API Key 引用',
  customConditions: '适配条件：自定义服务需满足契约 v1 —— POST {接口地址}，Body { "url": "目标网址" }，可选 Authorization: Bearer {key}；返回 200 JSON { content, statusCode?, title? }。也可复用内置适配器（类型选 jina/tavily/firecrawl 并填本地地址，如自托管 Jina）。详见 docs/contract.md。',
  keyRefHint: 'Key 引用：',
  loading: '加载中…',
}
