# P2 服务商调研：第三方抓取服务与免费额度

> 状态：调研完成（2026-08-15）。目标：为 `dsh-fetch-third-party` 的 P2 适配器清单提供决策依据。
> 筛选标准：**必须能"给定 URL 返回页面正文"（抓取/extract 能力）**，且对个人用户有可用免费额度。

---

## 1. 结论速览

| 服务商 | 抓取能力 | 免费额度 | 接入复杂度 | 结论 |
|---|---|---|---|---|
| **Tavily** | ✅ `/extract` 单/多 URL → 正文 | ~1,000 credits/月 | 适配器**已就绪**（P1） | ✅ 已接入，作为基准 |
| **Jina Reader** | ✅ `r.jina.ai/<URL>` → Markdown | **低量免费，基础用法无需 key** | 极简（GET） | 🥇 **P2 首选** |
| **Firecrawl** | ✅ `/scrape` URL → Markdown，支持整站爬 | 500 credits/月（1 credit=1页） | 中 | 🥈 P2 第二（可自建） |
| **Exa** | ✅ `/contents` URL → 全文（另有 /search） | 注册送额度（精确数以官网为准） | 中 | 可选（搜索+抓取一体） |
| **Apify** | ✅ Actor 平台，反爬最强 | $5/月起步 | 高 | 对我们场景过重 |
| **Google Custom Search** | ❌ **仅搜索，无抓取** | 100 次/天（非 1000） | 中 | ❌ **不适用**（见 §5） |
| n8n / 自建爬虫 | ✅ 按 `docs/contract.md` 契约 | 完全免费（自建成本） | 高 | 备选（P3 路由层后更有意义） |

---

## 2. Tavily（已接入，P1 基准）

- **端点**：`POST https://api.tavily.com/extract`，body `{ urls: [...] }`，支持 Bearer key
- **免费额度**：约 1,000 credits/月（1 次 extract ≈ 1 credit），超出付费
- **特点**：为 AI 设计；搜索（/search）+ 抓取（/extract）一体；服务端取书（本机不直连目标，无 SSRF 面）
- **参考**：[Tavily 定价](https://docs.tavily.com/documentation/api-credits)

## 3. Jina Reader（P2 首选）—— 深度调研（GitHub README + 定价页核实，2026-08-15）

### 3.1 "免费"到底指什么（关键结论）

Jina Reader 的"免费"包含**四层不同含义**，需要分清：

| 层 | 是否免费 | 详情 |
|---|---|---|
| **① SaaS 公共 API**（`r.jina.ai` / `s.jina.ai`） | ✅ **免费** | GitHub README 原话："Feel free to use Reader API in production. It is free, stable and scalable."——官方声明是**核心产品**，允许生产使用 |
| **② 匿名使用（无 key）** | ✅ 免费（限速低） | README："Anonymous traffic is the most aggressively rate-limited and lands in the lowest-trust pool"——能用但最受限 |
| **③ 带免费 key 的额度** | ✅ 免费配额 | 定价页（2026-08 核实）：**新用户送 10M tokens；500 RPM**；另有说法 1M tokens/天（读），搜索限速 |
| **④ 开源代码自建**（[jina-ai/reader](https://github.com/jina-ai/reader)，Apache-2.0） | ✅ **完全免费、无限制** | `docker pull ghcr.io/jina-ai/reader:oss`；README："with no extra config the container is fully stateless — every request hits the live URL, **no cache, no rate limiting**"——**自建 = 无限量、无限流**（代价是自己的机器/带宽） |

**不免费的部分**：
- 超出 token 免费额度的用量 → **按 token 计费**（Stripe 充值，pay-as-you-go）
- 反爬高级功能（托管住宅代理池 `x-proxy: auto`）→ 需 key，属付费档

### 3.2 能力与接口（README 权威信息）

- **Read**：`GET https://r.jina.ai/<目标URL>` → 直接返回 LLM 友好的 Markdown；`Accept: application/json` 可要 JSON
- **Search**：`GET https://s.jina.ai/<查询>` → 搜索并**自动抓取前 5 条结果的正文**（很多搜索 API 只给标题/摘要，Jina 给全文）
- **可读**：网页（headless Chrome / curl-impersonate 智能选）、**PDF**、**MS Office**（Word/Excel/PPT）、**图片**（VLM 生成 alt 说明）
- **有用请求头**：`X-Respond-With: markdown|text|html|frontmatter`、`X-Engine: browser|curl`、`X-Target-Selector`、`X-Max-Tokens`、`X-No-Cache`、`X-Retain-Links` 等
- **自建**：Docker 镜像 `ghcr.io/jina-ai/reader:oss`，端口 8080（h2c）/ 8081（HTTP/1.1）；同一条 URL 路径模式

### 3.3 对本插件的适配器影响（重要设计点）

1. **Jina 是 GET 式接口**（URL 在路径里），与契约 v1 的"POST + JSON body"不同 → **建议新增独立 `jina` 适配器**，而不是走 `custom` 契约：
   ```
   GET {baseURL}/<encodeURIComponent(目标URL)>     # baseURL 默认 https://r.jina.ai
   Authorization: Bearer {key}                      # 可选（匿名也能用）
   Accept: application/json                          # 拿 JSON 便于归一化
   ```
2. **key 可选**：匿名可用 → 卡片上 key 留空也能工作（只是限速更低）——比 Tavily 更省事，也验证了"凭据可选"路径
3. **自建即改 baseURL**：适配器天然支持 `baseURL` 指向本地 Docker 实例（`http://localhost:3000`）→ **零成本无限量**，且自建时目标 URL 由本机直连（SSRF 面回来，需注意，与官方 http 提供方同风险——文档需提示）
4. **搜索+抓取一体**：`s.jina.ai` 一个请求就完成"搜索+抓取前5条全文"——若后续做搜索侧，Jina 是理想候选

- **参考**：[jina-ai/reader GitHub](https://github.com/jina-ai/reader)（Apache-2.0）、[Jina Reader 定价页](https://jina.ai/reader)、[apiscout 对比](https://apiscout.dev/guides/firecrawl-vs-jina-vs-apify-scraping-api-2026)

## 4. Firecrawl（P2 第二）—— 深度调研（GitHub README + 定价拆解核实，2026-08-15）

### 4.1 开源了什么（GitHub：firecrawl/firecrawl，163k★）

| 部分 | 协议 | 内容 |
|---|---|---|
| **核心抓取引擎** | **AGPL-3.0** ⚠️（不是 Apache-2.0） | 完整仓库：/scrape /crawl /map /batch /search 等全部端点、API 服务、docker-compose、SELF_HOST.md |
| **SDK**（Python/Node/Go/Java/Rust/Ruby/.NET/PHP/Elixir） | **MIT** | 8 种语言 SDK |
| **Fire Enrich 及扩展工具** | **MIT** | 数据增强工具（650★）等 |
| **CLI / Skills / Workflows** | 随仓库 | firecrawl-cli、agent skills、MCP server |

**AGPL-3.0 的含义（与 Jina 的 Apache-2.0 关键区别）**：
- ✅ 可以自建、内部使用没问题
- ⚠️ 但如果**包进你的产品并作为网络服务对外提供**，必须开源你整个代码库 → 竞争者不能 fork 后托管变现（Firecrawl 的护城河）
- 💡 商业许可证/云订阅是绕开 AGPL 的官方途径

### 4.2 自建的现实（README + 业界拆解）

- 有 Docker 自建路径（`SELF_HOST.md`），但**"just run a Docker" 不顶用**：规模化抓取需要代理轮换、无头浏览器池、重试、反检测基础设施——**云版卖的就是托管基础设施**
- 对比 Jina：Jina 的 docker 是 stateless 开箱即用；Firecrawl 自建运维成本高

### 4.3 免费了什么（云版）

| 项 | 详情 |
|---|---|
| **免费档** | **500 credits/月**（1 credit = 1 页），注册即得 API key |
| **端点** | `POST https://api.firecrawl.dev/v2/scrape`（body `{url, formats:["markdown"]}`，Bearer key） |
| **限制** | 低层计划 crawls 上限 50 页；**AI Extract（结构化抽取）是独立订阅 $89/月起**（token 计费，不走 credits） |
| **云版独有** | 托管代理轮换、反检测、并发基础设施（README "Open Source vs Cloud"） |

### 4.4 对本插件的适配器影响

1. **独立 `firecrawl` 适配器**：`POST {baseURL}/v2/scrape` + Bearer key + `{url, formats:["markdown"]}` → 解析 `data.markdown` → `WebFetchResult`
2. **免费 500 页/月**：够个人轻度使用；比 Tavily 的 ~1000 credits 少
3. **自建**：AGPL 内部自用合法，但运维成本高 + 自建时本机直连目标（SSRF 面回来）
4. **定位**：作为 Jina 的备选（Jina 免费额度更慷慨、docker 更省事）——P2 优先级 **Jina > Firecrawl**

- **参考**：[firecrawl/firecrawl GitHub](https://github.com/firecrawl/firecrawl)（AGPL-3.0）、[Firecrawl 定价拆解（dev.to）](https://dev.to/beton/firecrawl-pricing-teardown-2026-2eh8)、[apiscout 对比](https://apiscout.dev/guides/firecrawl-vs-jina-vs-apify-scraping-api-2026)

## 5. Google Custom Search JSON API（❌ 不适用）——你记忆中的"1000 免费额度"不成立

核实自[Google 官方文档](https://developers.google.com/custom-search/v1/overview)（2026-02-18 更新）：

| 项 | 事实 |
|---|---|
| 免费额度 | **100 次搜索/天**（不是 1000） |
| 抓取能力 | ❌ **仅返回搜索结果 JSON**（标题/链接/摘要），**没有"给定 URL 返回正文"的端点** |
| 可用性 | ⚠️ **2027-01-01 停服，不再接受新客户**；现价仅对存量客户有效（超出 100 次后 $5/千次） |
| 所需 | Programmable Search Engine ID + API key |

**结论**：Google 官方搜索 API 既没有抓取能力，免费额度也不是 1000，且即将停服——**不纳入适配器清单**。你记忆中的"1000 免费额度"可能是与 Tavily（~1000 credits/月）混淆，或指其他产品（如 Serper 试用、Google Cloud 其他服务免费层）。

## 6. Exa（可选）

- **端点**：`POST /search` + `POST /contents`（URL → 全文）
- **免费额度**：注册送额度（具体数以 [Exa 官网](https://exa.ai) 为准）
- **特点**：神经搜索质量高；搜索+抓取一体；官方 dsh 包 `dsh-web-search-exa` 已存在但只接 /search（官方把 /contents 列为 deferred）
- **对插件的影响**：若想要"搜索+抓取同源"，值得做适配器；否则优先级低于 Jina

## 7. Apify（不推荐，信息备查）

- 平台型（1,500+ 预建 Actor），反爬/复杂站点最强
- 免费档 $5/月 credits 起；计费复杂（平台费 + compute units + 代理）
- 对个人"抓取网页"场景过重

---

## 8. 适配器实施建议（P2 顺序）

1. **Jina Reader**（首选）：利用 `custom` 契约适配器几乎零成本对接；或新增 `jina` 适配器（GET + Bearer）
2. **Firecrawl**：新增 `firecrawl` 适配器（原生 /scrape JSON → 归一化）
3. **Exa**：新增 `exa` 适配器（/contents）
4. **n8n / 自建爬虫**：走 `docs/contract.md` 契约（P3 路由层后再强化）

> 依赖：P2 适配器全部复用 P1 的架构（settings 的 `adapter` 字段 + `src/adapters/*` 每服务一文件），卡片"服务商"下拉随之扩展。

---

## 参考链接

- [Firecrawl vs Tavily vs Exa vs Jina 对比（pondero）](https://pondero.ai/agents/guides/firecrawl-vs-tavily-vs-exa-web-search-api-agents-june-2026/)
- [Firecrawl vs Jina vs Apify 定价明细（apiscout）](https://apiscout.dev/guides/firecrawl-vs-jina-vs-apify-scraping-api-2026)
- [Google Custom Search JSON API 官方文档](https://developers.google.com/custom-search/v1/overview)
- [Tavily 定价文档](https://docs.tavily.com/documentation/api-credits)
