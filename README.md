# dsh-fetch-third-party

[English](README.en.md) | 中文

**安全的第三方网页抓取插件**（DSH / DeepSeek Harness）——让 AI 在「搜索摘要不够」时，能自主抓取网页全文来回答问题。

## 简介

本插件为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）提供**安全的网页抓取能力**：抓取委托给**用户自选/自建的第三方服务**（Tavily / Jina Reader / Firecrawl / 自定义契约服务），本机从不直接连接目标网址，因此**没有 SSRF 攻击面**。

核心能力：

- **自主抓取**：模型先用官方 `web_search` 搜索，当摘要不足以回答问题时，会自动调用 `web_fetch_url` 抓取目标网页全文，无需用户提示。
- **快递员模式**：目标网址只经用户配置的第三方服务抓取，本机零出站到任意 URL（无 SSRF 面）。
- **多服务商 + 路由**：Tavily / Jina Reader / Firecrawl / 自定义服务（契约 v1，可多实例并存），主服务商失败自动回退到兜底服务商。
- **API key 单一写入点**：key 只存托管保险箱（0600），卡片只显示“已配置/未配置”，永不回显。
- **会话级预算**：默认每会话 10 次，超限拒绝并给出明确提示。
- **GUI 设置卡片**：测试连接 / 本地代理 / 自定义服务商管理 / 清除 key。
- **自建 Crawl4AI 栈自动管理**：当默认或兜底服务商是 loopback 地址的自定义服务商时，插件自动拉起容器与包装进程，并带实时 watchdog 自愈。
- **抓取缓存**：同一 URL 在有效期内重复抓取直接走内存缓存——不消耗第三方额度，也不消耗会话预算。
- **SSRF 纵深防御**：转发给第三方前，拒绝模型请求的内网/保留地址目标（自建 Crawl4AI 与本机同网段时尤其重要）。
- **动态回退链**：有序服务商链 + 配额/失败冷却（指数退避），失败自动降级、到期自动恢复，不再只是「主+兜底」两档。
- **结构化输出**：`web_fetch_url` 除正文外返回标题/标题大纲/链接/字数/预计阅读时长，方便模型引用与核对。

## 工作原理

```
用户提问
  → 模型调用 web_search（官方搜索）
    → 摘要足够？ → 是 → 直接回答
    → 否 → 模型自主调用 web_fetch_url({ url })
      → ctx.web.fetch → third-party provider
        → 第三方服务（Tavily / Jina / Firecrawl / 自定义）抓取目标网页
        → 返回正文 → 模型基于全文回答
```

## 目录结构

```
fetch/
├── package.json        # dsh.bundle + dsh.client 清单
├── cordis.patch.yml    # 补丁层
├── docs/               # 契约 v1 / 自建爬虫调研
├── scripts/            # 验证脚本 + 契约 v1 包装 + 启动脚本
├── tests/              # vitest 单测
└── src/                # 源码（Host + Client 两半区）
```

## 安装到 DeepSeek Harness

前置：已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）与 pnpm。

### 方式一：git 安装（推荐）

```powershell
dsh plugin --profile web add https://github.com/tallahandsome-ux/dsh-fetch-third-party.git
```

> **pnpm v11 首次安装提示**：pnpm v11 默认拦截 git 依赖的构建脚本，首次执行可能报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。报错信息会给出需要放行的 key，把它加入 web profile 的 `pnpm-workspace.yaml` 后重新执行即可，例如：
>
> ```yaml
> # %USERPROFILE%\.dsh\profiles\web\pnpm-workspace.yaml
> allowBuilds:
>   "dsh-fetch-third-party@git+https://github.com/tallahandsome-ux/dsh-fetch-third-party.git#<commit>": true
> ```

安装完成后**重启 `dsh web`**；在 设置 → 插件 → 插件配置 中出现「网页抓取（第三方）」卡片即安装成功。

### 方式二：本地构建后安装

适用于已有本地副本（如 `git clone` 下来自行修改）的情况。

**关键：`file:` 后面要填克隆目录的完整绝对路径——也就是能直接看到 `package.json` 的那个文件夹。** 不是仓库名，不是某个文件，也不是父目录。

```powershell
git clone https://github.com/tallahandsome-ux/dsh-fetch-third-party.git
cd dsh-fetch-third-party
pnpm install
pnpm build
dsh plugin --profile web add file:D:\你的目录\dsh-fetch-third-party
```

把 `D:\你的目录\dsh-fetch-third-party` 换成你机器上**实际克隆到的目录**。例如克隆到了 `D:\plugins` 下，就填：

```powershell
dsh plugin --profile web add file:D:\plugins\dsh-fetch-third-party
```

判断标准：该路径下应直接看到 `package.json`、`src/`、`tsdown.config.ts`、`scripts/` 等文件；`Test-Path` 能通过且能看到 `package.json` 即正确。若路径填错（不存在/填成文件），`dsh plugin add` 会失败或装不上。

> 若此前装过旧版本，安装后重启 `dsh web` 生效；万一卡片未刷新，可在 profile 目录（`%USERPROFILE%\.dsh\profiles\web`）执行 `pnpm install` 同步依赖后再重启。

### 验证安装

1. 重启 `dsh web`，浏览器 Ctrl+F5 强制刷新。
2. 设置 → 插件 → 插件配置 →「网页抓取（第三方）」卡片。
3. 选择服务商（如 Jina Reader，免 key），点「测试连接」→ 应显示成功。
4. 新建会话，模型即可通过 `web_fetch_url` 工具抓取网页全文。

## 使用说明

### 服务商切换

设置 → 插件 → 插件配置 → **网页抓取（第三方）** 卡片：

1. **服务商**下拉：`Tavily` / `Jina Reader` / `Firecrawl` / 自定义服务商
2. **API Key**：写入托管保险箱（0600），只显示“已配置/未配置”；Jina 可留空（匿名可用），Tavily / Firecrawl 建议配置
3. **接口地址**：默认按服务商自动切换（也可手动改）
4. **每会话抓取上限**：默认 10，达到后本会话拒绝抓取
5. **本地代理**：见下节

### 代理配置（网络被阻断时）

部分网络环境会阻断第三方服务直连（如 `r.jina.ai` 被 DNS 污染），需走本地 HTTP 代理。在卡片「本地代理」填入你的代理地址（**示例端口，请填你本机实际代理端口**）：

```
http://127.0.0.1:27822
```

- 保存后**按请求生效**（undici `ProxyAgent` 的 `dispatcher`），不影响其他网络流量
- 留空 = 直连

### 抓取缓存与目标安全

- **抓取缓存**（卡片二级「抓取缓存」）：开关 + 有效期（秒）。同一 URL 在有效期内重复抓取走内存缓存，不消耗第三方额度与预算。默认开启，有效期 600 秒。
- **内容上限**（卡片二级「单次抓取内容上限」）：单次抓取返回正文的最大字符数，超出截断并标记；0 = 不限（默认 100,000，即契约 v1 上限）。
- **拒绝内网目标**（卡片二级「目标地址安全」）：转发前拒绝回环/私网/保留地址目标，防止模型诱导抓取内网资源。默认开启。
- **工具命名**（配置文件 `toolName`，不进卡片）：`web_fetch_url`（默认）/ `web_fetch` / `auto`。选择官方名 `web_fetch` 时若已被占用会自动回退到 `web_fetch_url`。
- **回退链**（卡片二级「回退链」）：逗号分隔的有序服务商名（留空=主服务商+兜底）；失败/配额耗尽的自动冷却降级（配额 3600s / 普通失败 60s 起指数退避），到期自动恢复；下方实时显示链顺序与冷却状态。
- **结构化输出**：`web_fetch_url` 返回 `{ url, statusCode, content, title?, headings[], links[], wordCount, readingTimeSec }`。
### 自建抓取工具（Crawl4AI，零 API key）

不想依赖商业服务商时，可用自建 **Crawl4AI**（Docker）+ 契约 v1 包装，接入**自定义服务商**——无需 API key，本机仍是“快递员模式”。

**自动管理（插件内置，无需命令）**：启动 `dsh web` 后，只要「默认服务商」或「兜底服务商」是 loopback 地址的自定义服务商（如 `crawl4ai` → `http://127.0.0.1:8787`），插件会自动拉起包装进程，并尽力确保 Crawl4AI 容器在运行。前提：**Docker Desktop 已启动**（建议设为开机自启）且镜像已拉取。

手动兜底 / 首次拉取镜像：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-crawl4ai.ps1
```

卡片注册：**自定义服务商** → 名称 `crawl4ai` / 类型 `custom（契约 v1）` / 接口地址 `http://127.0.0.1:8787` → 保存 → 「默认服务商」下拉选它。

> 契约 v1 对接标准见 [docs/contract.md](docs/contract.md)；选型与验证记录见 [docs/custom-crawler-research.md](docs/custom-crawler-research.md)。

### 验证脚本

```powershell
node scripts/verify-tavily.mjs            # 需 TAVILY_API_KEY
node scripts/verify-jina.mjs              # 匿名即可；带 key 传参或设 JINA_API_KEY
node scripts/verify-firecrawl.mjs         # 需 FIRECRAWL_API_KEY
```

## 开发与构建

```bash
git clone https://github.com/tallahandsome-ux/dsh-fetch-third-party.git
cd dsh-fetch-third-party
pnpm install        # 安装构建工具 + 类型依赖（@deepseek-ai/* 以 peer/dev 声明，均来自 npm）
pnpm build          # tsdown 双产物 → lib/index.js（Host）+ lib/client.js（浏览器卡片）
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest（settings 解析 / budget 预算 / B1 回归）
```

- **运行时**：`@deepseek-ai/*` 由 dsh 宿主提供（插件安装进 dsh profile 后从宿主 node_modules 解析），构建时按 external 处理，插件自身只声明 `undici` 为真实运行时依赖。
- **本机开发**：改动 `src/` 后 `pnpm build` 重建 `lib/`，重启 `dsh web` 生效。

## 项目边界与依赖归属

### 本插件原创（MIT）

- `dsh-fetch-third-party` 插件本体：提供方注册、主+兜底路由、会话预算、设置桥接、GUI 卡片、契约 v1 自定义服务适配器、本地栈自动管理（`local-stack` + watchdog）
- **抓取契约 v1**：自定义抓取服务的对接标准（见 [docs/contract.md](docs/contract.md)）

### 使用/依赖的第三方项目

| 项目 | 用途 | 协议 |
|---|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（@deepseek-ai/dsh-*） | 宿主平台：cordis 插件机制、settings / credentials / tools / web 服务 | MIT |
| [undici](https://github.com/nodejs/undici) | Node HTTP 客户端（按请求代理） | MIT |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | 可选：自建抓取栈（用户自行 Docker 部署，插件经契约 v1 包装对接） | Apache-2.0 |
| [Jina Reader](https://github.com/jina-ai/reader) | Jina 服务商（公共 API 或自托管） | Apache-2.0 |
| Tavily / Firecrawl | 第三方 SaaS 抓取服务（插件仅调用其公开 API，不打包） | 各服务商服务条款 |
| react / tsdown / typescript / vitest | 构建与测试工具链 | MIT 系 |

### 边界说明

- **本插件不打包/不内置任何第三方爬虫引擎**。Crawl4AI、Jina Reader 等由用户按需部署，插件通过契约 v1 或复用内置适配器对接，目标网址仅经用户配置的第三方服务抓取。
- **API key 只存托管保险箱**，不进代码 / 配置 / 文档；插件每次请求从保险箱现取，卡片永不回显。
- **key 与安装方式无关**：无论从 git / 本地 / npm 哪种方式安装，插件都只从本机保险箱（`%USERPROFILE%\.dsh\.credentials.yaml`，0600）按引用名读取 key——仓库、代码、文档中不含任何密钥，从 GitHub 克隆也不会携带或泄露任何 key。
- 本机**唯一出站面**是用户配置的第三方端点（“快递员模式”的代价，信任边界由用户决定）。
- 自建 Crawl4AI 自身带 SSRF 防护，与本插件“本机不直连目标”的安全前提互补。

## 许可证

MIT License — 见 [LICENSE](LICENSE)
