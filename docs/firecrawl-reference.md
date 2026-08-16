# Firecrawl 官方 Skill 参考摘录（供 P2.2 适配器开发使用）

> 状态：参考文档。来源：Firecrawl 官方 skill 文本（面向 **Claude MCP 接入**）。
> ⚠️ **仅参考**：该 skill 是为 agent 终端/MCP 场景设计的，我们的插件是**裸 REST 适配器**，只取其 API 事实，不照搬其 skill 体系。
> P2.2（Firecrawl 适配器）当前**暂停**，本文件是恢复开发时的依据。

---

## 1. 与本插件直接相关的 API 事实

| 项 | 值 |
|---|---|
| Base URL | `https://api.firecrawl.dev/v2` |
| Auth | `Authorization: Bearer fc-<API_KEY>` |
| **我们需要的端点** | `POST /scrape`——单 URL → 干净 markdown；**支持公开文档 URL（PDF/DOCX 等）** |
| 请求示例 | `POST {baseURL}/scrape` body `{ "url": "<目标URL>", "formats": ["markdown"] }` |
| 响应（README 已核实） | `{ success, data: { markdown, html, rawHtml, metadata: { title, sourceURL } } }` |

**适配器归一化**（沿用 P2 方案 §4）：
- `data.markdown` → `body {kind:'text', content}`
- `data.metadata.sourceURL` → `url`
- `success !== true` → `WEB_PROVIDER_ERROR`

## 2. ⚠️ Keyless 免费层的关键限制（修正认知）

Firecrawl 有 keyless 免费层（Path F），但**仅限官方客户端**：

- ✅ 免 key 可用：`search` / `scrape` / `interact` / `parse` / research index——**但仅当请求来自官方客户端（MCP / CLI / SDK）**
- ❌ **裸 REST 调用不带 key 不在其列**——我们的插件是直接 HTTP 调用，**`/scrape` 需要 API key**
- 其他端点（crawl / map / monitor / extract / batch / agent）**一律需要 key**

**结论**：Firecrawl 适配器 **key 必填**（与 Tavily 一致；区别于 Jina 的匿名可用）。卡片上不做"匿名"支持，key 缺失时应给出明确错误。

## 3. 凭据获取（Path D 流程，给用户侧参考）

- 用户在 https://www.firecrawl.dev/signin 注册/登录拿 key
- 或 CLI 浏览器授权：`npx -y firecrawl-cli@latest init --all --browser`
- 拿到 `fc-...` key 后，在我们卡片"API Key"填入 → 写入托管保险箱

## 4. 其余端点（超出 P2.2 范围，仅存档）

| 端点 | 能力 | 是否考虑 |
|---|---|---|
| `POST /search` | 搜索 + 可选全文 | 否（搜索侧另议，且与 Jina s.jina.ai 竞争） |
| `POST /interact` | 页面点击/表单/登录 | 否（超出"抓取"定位） |
| `POST /parse` | **本地/非公开文档** → markdown（multipart，≤50MB） | 否（我们抓 URL 不抓本地文件） |
| `POST /monitor` | 定时监控页面变化 + 通知 | 否（P3+ 可能的独立方向） |
| `GET /search/research/*` | 论文/GitHub 检索 | 否 |
| `POST /support/ask`、`/support/docs-search` | 官方诊断/文档问答 | 否（agent 支持渠道） |

## 5. 测试 key（用户提供，不落盘）

用户提供的 session API key 仅用于本地临时验证（写入保险箱 / `verify-firecrawl.mjs`），**不写入任何代码/文档/配置文件**——本文档不再保留任何 key 片段。

---

## 参考链接

- API 文档（schema 权威）：https://docs.firecrawl.dev
- Skills 仓库（agent 集成模式）：https://github.com/firecrawl/skills
- 服务商调研（免费额度）：`docs/p2-vendor-research.md` §4
- P2 开发方案（适配器设计）：`docs/p2-development-plan.md` §4
