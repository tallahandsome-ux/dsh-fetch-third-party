# 自定义爬虫调研报告（供契约 v1 自定义服务商测试选型）

> 状态：调研完成（2026-08-16）。
> 目标：为 `dsh-fetch-third-party` 的**自定义服务商**测试挑选一个可自建的开源爬虫，按契约 v1（`docs/contract.md`：POST `{url}` → `{content}`）接入。

---

## 0. 结论速览

| 推荐 | 项目 | 理由 |
|---|---|---|
| 🥇 **首选** | **Crawl4AI**（~78k★，Apache-2.0） | LLM 友好 Markdown、Docker 一键部署（自带 API 服务与监控面板）、活跃维护、Python 生态 |
| 🥈 备选 A | **Scrapling**（~67k★，BSD-3） | 现代 Python 抓取库，自适应选择器抗站点改版 |
| 🥉 备选 B | **Jina Reader 自建**（Apache-2.0） | 复用我们已实现的 `jina` 适配器（custom 条目类型选 jina + 本地地址），**无需写契约包装** |
| 备选 C | **Firecrawl 自建**（AGPL-3.0） | 成熟但自建运维重（代理/浏览器池） |
| 备选 D | **Maxun**（~16k★，AGPL-3.0） | 无代码点选训练，适合不想写代码 |

**核心事实**：目前**没有任何爬虫原生说"契约 v1"**——绝大多数需要一层薄包装（约 30 行 HTTP 服务：收到 `POST {url}` → 调爬虫 → 返回 `{content}`）。这正是"自定义服务商"的设计初衷：**用户用契约包任意爬虫**。

---

## 1. 业界盘点（2026，scrapfly 评测）

| 工具 | 语言 | 协议 | Stars | JS 渲染 | 定位 |
|---|---|---|---|---|---|
| Scrapy | Python | BSD-3 | ~63k | 需插件 | 生产级 Python 爬取框架 |
| Crawlee | JS/TS/Py | Apache-2.0 | ~24k | ✅ | Node.js 全能 |
| Playwright | 多语言 | Apache-2.0 | ~92k | ✅ | JS 重站点 |
| Puppeteer | Node | Apache-2.0 | ~95k | ✅ | Chrome-first |
| Selenium | 多语言 | Apache-2.0 | ~34k | ✅ | 语言覆盖最广 |
| Camoufox | Python | MPL-2.0 | ~9.7k | ✅ | 反指纹最强 |
| **Crawl4AI** | Python | Apache-2.0 | ~78k | ✅ | **LLM/RAG 输出** |
| Scrapling | Python | BSD-3 | ~67k | 视 fetcher | 现代 Python |
| Colly | Go | Apache-2.0 | ~25k | ❌ | Go 高性能 |
| Maxun | TS | AGPL-3.0 | ~16k | ✅ | 无代码自建 |

> ⚠️ 避坑：**PySpider 已归档**（2024 后无维护）但仍在多份 2026 榜单出现——选型前查最后提交时间，别只看 stars。

## 2. 重点候选详情

### 🥇 Crawl4AI（首选）
- **仓库**：[unclecode/crawl4ai](https://github.com/unclecode/crawl4ai)，Apache-2.0，v0.9.2（2026-07），活跃
- **能力**：URL → 干净 LLM 友好 Markdown（去导航/广告）；BFS/DFS 深爬、自适应爬取、表格抽取、PDF；undetected 浏览器可过部分反爬
- **服务化**：Docker 部署（`deploy/docker`，0.9 起安全加固），自带 API 服务 + 监控面板；官方提供 `Crawl4aiDockerClient`（`base_url=http://localhost:11235`）
- **接入我们的方式**：Docker 起服务 → 写约 30 行契约 v1 包装（POST `{url}` → 调 Crawl4AI API → 返回 `{content: markdown}`）→ 卡片注册自定义服务商（类型 custom + 本地地址）
- **注意**：年轻项目、版本间有 breaking change；基于 Playwright，资源占用偏高

### 🥈 Scrapling（备选 A）
- **仓库**：Scrapling，BSD-3，~67k★，现代 Python
- **亮点**：自适应选择器——站点改版后选择器自动重定位，减少维护
- **接入**：同样需薄包装（它偏库不是服务，需自己起 HTTP 服务）
- **注意**：年轻项目、维护者少，生产前需实测目标站点

### 🥉 Jina Reader 自建（备选 B，最省事）
- 已调研过（`docs/p2-vendor-research.md` §3）：`ghcr.io/jina-ai/reader:oss` Docker，**无限制、无 rate limit**
- **接入我们的方式**：卡片"自定义服务商"类型选 **jina** + 地址填 `http://127.0.0.1:3000`——**复用内置 jina 适配器，无需写任何包装代码**（这是 P4 适配条件里"复用内置适配器"路径的现成例子）
- 局限：仅逐 URL、无整站爬；只读网页/PDF/Office

### 备选 C/D
- **Firecrawl 自建**：成熟但 AGPL-3.0 + 自建运维重（代理轮换、浏览器池、反检测——"just run a Docker" 不顶用）
- **Maxun**：无代码点选训练机器人；AGPL-3.0，年轻项目

## 3. 两条接入路径（对应我们的自定义能力）

| 路径 | 做法 | 适用 |
|---|---|---|
| **A. 契约 v1 包装**（类型=custom） | 薄 HTTP 服务：`POST {url}` → 调爬虫 → 返回 `{content}` | 任何爬虫（Crawl4AI / Scrapling / 自写爬虫） |
| **B. 复用内置适配器**（类型=jina/tavily/firecrawl） | 自定义条目直接选内置类型 + 填本地地址 | API 形态与内置一致的（自建 Jina、自建类 Jina 服务） |

## 4. 推荐测试方案

**用 Crawl4AI Docker + 契约 v1 薄包装**做自定义服务商测试：
1. `docker run` Crawl4AI（或本地 pip 安装 + server）
2. 写一个 ~30 行 Node/Flask 包装：`POST {url}` → Crawl4AI API → `{content: markdown}`
3. 卡片：自定义服务商 → 名称/类型 custom/地址 `http://127.0.0.1:<port>` → 保存 → 一级下拉选它
4. 测试连接 / 新建会话抓取

**若想最快跑通**：先试 **Jina 自建**（备选 B，零包装），再上 Crawl4AI（更有代表性）。

## 5. 验证记录（2026-08-16 实测，路径 A 已跑通）

按 §4 推荐方案，用 **Crawl4AI Docker + 契约 v1 包装**在真机完成端到端验证（本机 Docker 29.7.2，镜像 `unclecode/crawl4ai:latest` = v0.9.2）：

| 项 | 结果 |
|---|---|
| 镜像拉取 | ✅ `docker pull unclecode/crawl4ai:latest`（走系统代理，镜像较大） |
| 容器运行 | ✅ `docker run -d -p 11235:11235 --shm-size=1g -e CRAWL4AI_API_TOKEN=…`，`/health` 返回 0.9.2 |
| v0.9 鉴权 | ✅ `Authorization: Bearer <token>`；`/openapi.json` 需 token（401 无凭据 → 200 带凭据） |
| 取 Markdown 的端点 | ✅ 用 `POST /md`（body `{"url", "f":"fit"}`）直接返回 markdown；`/crawl/job` 结果条目里 **无 `markdown` 字段**（在 `CrawlResult._markdown` 私有属性中，默认不序列化） |
| 包装脚本 | ✅ `scripts/crawl4ai-wrapper.mjs`：契约 v1 `POST {url} → {content}`，默认走 `/md`（filter=fit） |
| 真实抓取 | ✅ example.com（166 字符）/ httpbin.org（3.6KB）/ 维基百科 Web_scraping（48KB）均返回真实 Markdown |
| 失败语义 | ✅ 非法 URL → `statusCode 502`；被阻断域名 → Crawl4AI 自带 SSRF 防护返回 400，包装转为 502 |
| 接入插件 | ✅ 契约 v1 与内置 `custom` 适配器完全一致（`POST {url}` + 读 `{content}`），无需改插件代码 |

**结论**：路径 A（契约 v1 包装）可行，`custom` 适配器无需任何改动即可把自建 Crawl4AI 作为“快递员”。

**发现的坑**：
- v0.9.x 的 `/crawl`（同步）与 `/crawl/job`（异步）结果条目默认只给 `html`/`fit_html`/`cleaned_html`，**不含 `markdown`**；取 markdown 应直接用 `POST /md`（同步、Readability 清洗），或对 `cleaned_html` 自行转 markdown。
- v0.9.x 鉴权默认开启：无 token 时绑定 loopback 并打印一次性 token，建议显式 `-e CRAWL4AI_API_TOKEN=…` 以便包装脚本引用。
- 自建 Crawl4AI 本身带 SSRF 防护（阻断内网/非法目标），与本插件“本机不直连目标”的安全前提互补。

---

## 参考
- [scrapfly：2026 十大开源爬虫](https://scrapfly.io/blog/posts/best-open-source-web-scrapers)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)（Apache-2.0，~78k★）
- [awesome-ai-web-scraping（精选清单）](https://github.com/h4ckf0r0day/awesome-ai-web-scraping)
- 契约 v1：`docs/contract.md`
