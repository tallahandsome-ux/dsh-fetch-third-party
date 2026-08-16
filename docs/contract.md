# 抓取契约 v1（Fetch Contract v1）

本文件定义 `dsh-fetch-third-party` 与"用户自建第三方抓取服务"之间的对接标准。
**Tavily 走内置原生适配器，无需按本契约对接**；n8n 工作流、自写爬虫等用户自建服务按本契约收发即可接入。

> 状态：P1 交付物。P2 落地 n8n / custom 适配器时本契约是唯一对接依据。

## 请求（插件 → 你的服务）

```
POST {接口地址}                 （卡片中填写的 baseURL，可含路径）
Content-Type: application/json
Authorization: Bearer {API Key} （可选；你的服务也可以自行处理鉴权）

Body:
{ "url": "<要抓取的网址>" }
```

## 响应（你的服务 → 插件）

**成功（HTTP 200）：**

```json
{
  "title": "可选，页面标题",
  "content": "页面正文文本（markdown 或纯文本）",
  "statusCode": 200
}
```

**失败（HTTP 200 + 空 content，或非 200）：**

- 非 200：插件把状态码与响应体文本作为"结果"返回给模型（模型可见错误）。
- 200 但无法抓取：建议返回 `{ "content": "", "statusCode": 404 }` 之类；插件会将其视为结果。

## 约束

- 单次请求只抓一个 URL（保守策略）。
- 正文长度建议在 100,000 字符以内（超出会被截断并在结果中标记）。
- 你的服务负责实际访问目标网址——**目标网址对插件所在机器不可见**，这正是本设计的安全前提。
- 请勿把接口地址指向内网地址（插件文档提示用户同样遵守）。

## 最小可用示例（Node 8 行思路）

```js
import { createServer } from 'node:http'
createServer(async (req, res) => {
  if (req.method !== 'POST') return res.end('')
  let body = ''
  for await (const chunk of req) body += chunk
  const { url } = JSON.parse(body)
  const text = await (await fetch(url)).text()   // ← 这里由你的服务去抓
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ content: text, statusCode: 200 }))
}).listen(8787)
// 卡片接口地址填：http://127.0.0.1:8787
```
