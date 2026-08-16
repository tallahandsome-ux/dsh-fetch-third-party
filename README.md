# dsh-fetch-third-party

安全的**第三方抓取服务**插件。

- 设计框架文档：[docs/design.md](docs/design.md)
- 一句话：抓取委托给**用户自己配置**的第三方服务（Tavily / Jina / Firecrawl / n8n / 自建爬虫，不止一家），本机不直连目标网址 → 无 SSRF 面；API key 只写入托管保险箱（0600）；会话级抓取预算兜底；默认由 AI 保守决定抓哪些搜索结果。

## 目录

```
fetch/
├── package.json       # dsh.bundle + dsh.client 清单
├── cordis.patch.yml   # 补丁层
├── docs/development-archive.md  # 📁 开发档案（时间线/决策/发现/待办）
├── docs/design.md     # 设计框架（v2 + 路线图 + 验证记录）
├── docs/contract.md   # 抓取契约 v1（供 n8n/自建爬虫对接）
├── docs/p2-vendor-research.md  # P2 服务商调研（免费额度对比）
├── docs/p2-development-plan.md # P2 开发方案与验证记录
├── docs/p4-card-plan.md        # P4 卡片完整版方案与验证记录
├── docs/firecrawl-reference.md # Firecrawl 官方 skill 参考摘录
├── docs/custom-crawler-research.md # 开源爬虫选型报告
├── scripts/verify-tavily.mjs   # Tavily key 独立验证脚本
├── scripts/verify-jina.mjs     # Jina 独立验证脚本（匿名/带 key）
├── scripts/verify-firecrawl.mjs # Firecrawl key 独立验证脚本
├── scripts/fixture-contract-server.mjs # 契约 v1 本地测试服务
├── scripts/crawl4ai-wrapper.mjs # Crawl4AI 契约 v1 包装（自建抓取工具）
├── scripts/start-crawl4ai.ps1  # 一键拉起 Crawl4AI 容器+包装（推荐）
├── scripts/start-web.ps1       # 带代理启动 GUI 的备选脚本
└── src/               # 源码（Host + Client 两半区）
```

## 状态

| 阶段 | 状态 |
|---|---|
| P1 | ✅ 完成（Tavily 适配器 + `web_fetch_url` 工具 + 预算 + 设置卡片折叠），端到端验证通过 |
| P2.1 Jina 适配器 | ✅ 完成并验收（含**卡片本地代理**功能），端到端验证通过 |
| P2.2 Firecrawl 适配器 | ✅ 完成并验收（2026-08-16），GUI 实测抓取成功 |
| P3 路由层 | ✅ 完成并验证（主服务商 + 兜底服务商，用户自选；客制化接口预留） |
| P4 卡片完整版 | ✅ 完成并验证（测试连接 + 多自定义服务商并存 + 适配条件提示） |
| P4.5 默认/兜底自选 | ✅ 代理开关 + 默认服务商/兜底服务商用户自选（含“无”） |
| P4.6 自建 Crawl4AI | ✅ 完成并验证（契约 v1 包装 + 卡片注册 + **插件侧自动管理**：默认服务商为 loopback 自定义服务商时自动拉起容器与包装进程，含实时 watchdog 自愈） |
| P5 发布 | ⏳ 待打包发布（计划见下） |

## 使用说明

### 服务商切换

设置 → 插件 → 插件配置 → **网页抓取（第三方）** 卡片：

1. **服务商**下拉：`Tavily` / `Jina Reader` / `Firecrawl`
2. **API Key**：写入托管保险箱（0600），只显示"已配置/未配置"；Jina 可留空（匿名可用），Tavily / Firecrawl **必填**
3. **接口地址**：默认按服务商自动切换（Tavily `api.tavily.com` / Jina `r.jina.ai` / Firecrawl `api.firecrawl.dev`）
4. **每会话抓取上限**：默认 10，达到后本会话拒绝抓取
5. **本地代理（仅 Jina 显示）**：见下节；**代理字段对全部服务商生效**（Firecrawl 实测同样走代理）

### 代理配置（Jina 需要时）

**背景**：部分网络环境（如本机）会阻断 `r.jina.ai` 直连（DNS 污染、连接超时），必须走本地 HTTP 代理。

**方法一（推荐，卡片配置）**：服务商选 **Jina** 后，卡片出现"**本地代理（Jina）**"输入行，填入你的 HTTP 代理地址，例如：

```
http://127.0.0.1:13004
```

- 保存后**按请求生效**（用 undici `ProxyAgent` 的 `dispatcher`），**不依赖进程环境变量、不影响其他网络流量**
- 留空 = 直连（能直连的环境不需要填）

**方法二（备选，启动环境变量）**：若不想在卡片填，可用脚本带代理启动 GUI：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-web.ps1
# 或手动：
$env:HTTPS_PROXY = "http://127.0.0.1:13004"
$env:HTTP_PROXY  = "http://127.0.0.1:13004"
$env:NODE_USE_ENV_PROXY = "1"
dsh web
```

> 注意：`HTTP_PROXY`/`HTTPS_PROXY` 属 dsh 的 bootstrap-only 环境变量，**只能以真实环境变量在启动前设置**，不能写进 `.env` 文件。

### 验证脚本

```powershell
node scripts/verify-tavily.mjs            # 需 TAVILY_API_KEY
node scripts/verify-jina.mjs              # 匿名即可；带 key 传参或设 JINA_API_KEY
node scripts/verify-firecrawl.mjs         # 需 FIRECRAWL_API_KEY（/scrape key 必填）
```

### 自建抓取工具（Crawl4AI，零 API key）

不想依赖商业服务商、要一个完全自托管的抓取工具时，用自建 **Crawl4AI**（Docker）+ `scripts/crawl4ai-wrapper.mjs` 契约 v1 包装，接入插件的**自定义服务商**即可——无需任何 API key，本机仍是“快递员模式”（由 Crawl4AI 容器去抓目标网址）。

**自动管理（插件内置，无需命令）**：启动 `dsh web` 后，只要「默认服务商」或「兜底服务商」是 loopback 地址的自定义服务商（如 `crawl4ai` → `http://127.0.0.1:8787`），插件会自动拉起包装进程，并尽力确保 Crawl4AI 容器在运行。前提：**Docker Desktop 已启动**（建议设为开机自启）且镜像已拉取。

手动兜底（容器意外停止 / 换 token / 首次拉镜像时）：

        powershell -ExecutionPolicy Bypass -File scripts/start-crawl4ai.ps1

**分步手动**（等价做法，供自定义 token / 端口参考）：

1. 起 Crawl4AI（v0.9+ 需要 token；镜像较大，首次拉取需几分钟）：

        docker run -d -p 127.0.0.1:11235:11235 --name crawl4ai --shm-size=1g -e CRAWL4AI_API_TOKEN=改成你的随机token unclecode/crawl4ai:latest

2. 起契约 v1 包装（把 Crawl4AI 的 `/md` 翻译成 `POST {url} → {content}`）：

        $env:CRAWL4AI_API_TOKEN="改成你的随机token"
        node scripts/crawl4ai-wrapper.mjs      # 默认监听 127.0.0.1:8787

3. 卡片注册：**自定义服务商** → 名称 `crawl4ai` / 类型 `custom（契约 v1）` / 接口地址 `http://127.0.0.1:8787` → 保存 → 一级“默认服务商”下拉选它（或设为兜底）。

    验证（2026-08-16 已实测）：example.com / httpbin.org / 维基百科均返回真实 Markdown 正文（维基百科单篇 ~48KB）；非法/被阻断 URL 返回 `statusCode 502` 错误，走契约 v1 的失败语义。

4. 清理：

        docker rm -f crawl4ai   # 停止并删除容器（镜像保留，下次 docker run 即可）

> 环境变量 `CRAWL4AI_BASE_URL` / `CRAWL4AI_FILTER`（fit|raw|bm25|llm，默认 fit）/ `WRAPPER_PORT` / `WRAPPER_TIMEOUT_MS` 可覆盖默认值。自建 Jina（复用内置 jina 适配器，零包装）是更轻的替代，见 docs/custom-crawler-research.md。

### 开发与构建（给贡献者）

```bash
git clone <本仓库>
cd fetch
pnpm install        # 安装构建工具 + 类型依赖（@deepseek-ai/* 以 peer/dev 声明，均来自 npm）
pnpm build          # tsdown 双产物 → lib/index.js（Host）+ lib/client.js（浏览器卡片）
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest（settings 解析 / budget 预算 / B1 回归）
```

- **运行时**：`@deepseek-ai/*` 由 dsh 宿主提供（插件安装进 dsh profile 后从宿主 node_modules 解析），构建时按 external 处理，插件自身只声明 `undici` 为真实运行时依赖。
- **安装方式**：`dsh plugin --profile web add <git 仓库地址>`（git 渠道会克隆并执行 `prepare` 构建）；本地验证可用 `npm pack` 后 `dsh plugin add <tarball>`。
- **本机开发**：改动 `src/` 后 `pnpm build` 重建 `lib/`，重启 `dsh web` 生效。

## 路线图速览

P1（tavily + 工具 + 预算 + 最小卡片）✅ → P2.1（**Jina + 卡片代理**）✅ → P2.2（**Firecrawl**）✅ → P3（**路由层：主+兜底**）✅ → P4 卡片完整版 ✅ → P4.5 默认/兜底自选 ✅ → **P4.6 自建 Crawl4AI + 插件侧自动管理（watchdog）** ✅ → **P5 打包发布 ✅（v1.0.0）**。详见 design.md §12、p2-vendor-research.md、p2-development-plan.md、firecrawl-reference.md、custom-crawler-research.md。
