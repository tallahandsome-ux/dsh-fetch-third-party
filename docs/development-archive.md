# dsh-fetch-third-party 开发档案

> 归档日期：2026-08-16（第一阶段开发告一段落，准备休息）
> 项目位置：仓库根目录 `fetch/`（开源后随仓库分发，不含任何本机绝对路径）
> 一句话：**安全的第三方抓取插件**——把"抓取网页"委托给用户自选/自建的第三方服务，本机不直连目标网址（无 SSRF 面）；API key 只进托管保险箱；会话预算兜底；默认+兜底服务商全部用户自选。

---

## 1. 开发时间线

### 阶段 0：需求调研与设计评审（多轮）
- 梳理 deepseek-harness 架构（[CLI/插件机制](https://github.com/deepseek-ai/deepseek-harness)）、skill 机制、凭据体系（环境变量 > 托管保险箱 > .env）
- 确定"抓取委托第三方（快递员模式）"的安全路线；API key 单一写入点（托管保险箱 0600）
- **重要发现**：官方 apiproxy 对设置命名空间有硬编码白名单 → 第三方设置无法走官方通道 → 自建**桥接路由**（webServer 直挂）
- 产出：`docs/design.md`（v2 设计框架，含 P1 验收标准）

### 阶段 P1：基础能力（Tavily）
- 实现：`web_fetch_url` 工具 + `third-party` fetch provider + **Tavily 适配器** + 会话预算 + 设置区块 + 桥接 + 最小卡片
- 关键 bug 修复：**函数值传递**（setSource 后 provider/bridge 仍持旧函数 → 写入不刷新）→ 改稳定读取器
- 端到端验证：headless 真实任务抓 example.com 成功

### 阶段 P2.1：Jina 适配器 + 卡片本地代理
- Jina Reader（GET r.jina.ai，匿名可用）；`KEY_ENV/BASE_URL_BY_ADAPTER` 按适配器回退默认
- **网络发现**：本机 r.jina.ai 被 DNS 污染/阻断，需走本地 HTTP 代理 `127.0.0.1:13004`；Node fetch 走代理需 `NODE_USE_ENV_PROXY=1`
- **卡片本地代理**：undici `ProxyAgent` 按请求代理（dispatcher），不依赖环境变量、不影响其他流量
- 事故与修复：PowerShell 读写 settings.yaml 中文（pet 名）编码损坏 → 显式 UTF-8 重写修复

### 阶段 P2.2：Firecrawl 适配器
- 参考官方 skill（`docs/firecrawl-reference.md`）实现 `/v2/scrape` 适配器（key 必填认知——后经实测修正）
- 用户 GUI 实测抓取成功

### 阶段 P3：路由层
- 默认服务商（曾为 Jina 匿名）+ 回退 Jina 兜底 + 客制化接口预留
- 端到端验证：主服务商故意失败 → 自动回退 Jina 成功
- 修复：空 key 引用 `credentialRef('')` 崩溃 → 空=匿名跳过取 key

### 阶段 P4：卡片完整版 + 多自定义服务商
- **测试连接**（默认 example.com 可改、真实调用消耗第三方额度、返回 servedBy 验证路由）
- **多自定义服务商并存**：`customProviders` 实例表 + `custom` 契约 v1 适配器 + 卡片注册 UI + **适配条件提示**
- 清除 key、hints 渲染、兜底行、URL 校验
- 验证：自定义作主/作兜底均端到端通过（本地契约 fixture）；`/custom` 路由增删改+校验

### 阶段 P4.5：代理开关 + 默认/兜底用户自选
- **代理开关**（`proxyEnabled`）：关闭时地址保留但直连
- **默认/兜底改为用户自选**：卡片"默认服务商"+"兜底服务商"两个下拉（内置+自定义，"无"=不兜底）
- 默认值调整：`DEFAULT_ADAPTER` jina→**firecrawl**（jina 匿名 401、firecrawl keyless 可用）；`DEFAULT_FALLBACK` →**空**（不替用户指定）

### 阶段 P4.6：自建 Crawl4AI + 插件侧自动管理（2026-08-16 续）
- **Crawl4AI Docker 端到端验证**：`unclecode/crawl4ai:latest`（v0.9.2）+ `scripts/crawl4ai-wrapper.mjs` 契约 v1 包装（`POST /md` 取 markdown，规避 /crawl 结果无 markdown 字段的坑）；example.com / httpbin / 维基百科均真实返回正文；验证记录见 `docs/custom-crawler-research.md` §5
- **接口地址修复**：卡片"接口地址"在自定义主服务商下显示/编辑该自定义条目自身的 baseURL（`saveBaseURL` 路由），切换服务商自动对齐端点（自定义→内置也重置为内置默认）；不再锁定该字段
- **B1 默认端点错配修复**：`DEFAULT_BASE_URL` 曾为 tavily 而默认适配器为 firecrawl，新装会打错端点 → schema/默认配置 `baseURL` 改为 `''`（留空=适配器默认）
- **插件侧进程管理**（`src/local-stack.ts`）：默认/兜底服务商为 loopback 自定义服务商时，启动后自动拉起容器（尽力）+ 包装进程（净化环境变量）；配置变更联动启停；**实时 watchdog**（20s 轮询 + 退出快速自愈，容器 60s 冷却限频）

---

## 2. 当前能力全景

| 能力 | 状态 |
|---|---|
| 服务商 | Tavily / Jina Reader / Firecrawl / **自定义（契约 v1，可多个并存）** |
| 路由 | 默认服务商 + 兜底服务商（用户自选，含"无"） |
| 安全 | 本机不直连目标 URL；API key 只进托管保险箱（0600）；按请求代理 |
| 预算 | 会话级抓取上限（默认 10，超限拒绝） |
| 卡片 | 两级布局 + 自定义小节 + 测试连接 + 代理开关 + 清除 key + hints |
| 适配条件 | 卡片常驻提示契约 v1 对接要求 |
| 自建 Crawl4AI | 契约 v1 包装 + 卡片注册 + **插件侧自动管理**（loopback 自定义服务商自动拉起容器/包装进程，watchdog 自愈） |

## 3. 关键架构决策（备忘）

1. **快递员模式**：抓取委托第三方服务器，本机零出站到目标 → 无 SSRF 面
2. **桥接路由**：绕过 apiproxy 设置白名单，webServer 自挂 `/api/fetch-third-party/*`
3. **提供方实例表**：`adapter`/`fallback` 可指向内置或自定义名；`resolveProvider` 统一解析
4. **按请求代理**：undici ProxyAgent dispatcher（不污染进程环境）
5. **key 单一写入点**：托管保险箱，卡片只显示已配置/未配置
6. **测试不计会话预算**（但消耗第三方额度，卡片已提醒）

## 4. 实测发现记录（重要）

| 发现 | 说明 |
|---|---|
| **Jina 匿名 401**（2026-08-16 变化） | r.jina.ai 匿名请求现返回 401（curl 实测）；此前 200。**服务端收紧**，非插件问题。处理：配 Jina key 或换默认服务商 |
| **Firecrawl keyless 可用** | `/v2/scrape` 无 key 返回 200+真实内容（限速）——修正"裸 REST 必带 key"认知 |
| **api.firecrawl.dev 本机直连可达** | 不需要代理（r.jina.ai 才需要） |
| **Node fetch 代理** | 需 `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`（bootstrap-only，只能启动时注入） |
| **settings.yaml 中文** | PowerShell 读写需显式 UTF-8（pet 名事故教训） |

## 5. 待办（下一步候选，休息后继续）

- [ ] **P5 打包发布**：依赖声明规范化（peerDependencies）、git init、npm pack + 干净 profile 安装验证、版本号（详见 README/审计结论）
- [x] **爬虫自定义测试**（2026-08-16 完成）：Crawl4AI Docker + 契约包装 + 插件侧自动管理 + watchdog
- [x] **Jina 匿名可用**（2026-08-16 澄清）：开发期 401 系本机访问被标记可疑，非服务端收紧；Jina 可留空匿名使用
- [ ] 客制化专题：自建 Jina / n8n（契约 v1 已就绪；Crawl4AI 路径已完成）
- [ ] 路由列表升级（多级回退链）——P3 预留，未做

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| `README.md` | 项目说明 + 使用指南（服务商切换/代理配置/验证脚本） |
| `docs/design.md` | 设计框架 v2 + 路线图 + P1 验证记录 + P3 路由层设计 |
| `docs/contract.md` | **抓取契约 v1**（自定义服务对接标准） |
| `docs/p2-vendor-research.md` | 服务商调研（Tavily/Jina/Firecrawl/Exa/Apify/Google 免费额度） |
| `docs/p2-development-plan.md` | P2 开发方案 + P2.1/P2.2 交付与验证记录 |
| `docs/p4-card-plan.md` | P4 卡片完整版方案 + 多自定义服务商设计 + 验证记录 |
| `docs/firecrawl-reference.md` | Firecrawl 官方 skill 参考摘录 |
| `docs/custom-crawler-research.md` | 开源爬虫选型报告（Crawl4AI 首选） |

## 7. 验证脚本

```powershell
node scripts/verify-tavily.mjs            # 需 TAVILY_API_KEY
node scripts/verify-jina.mjs              # 匿名/带 key
node scripts/verify-firecrawl.mjs         # 需 FIRECRAWL_API_KEY
node scripts/fixture-contract-server.mjs  # 契约 v1 本地测试服务
powershell -File scripts/start-web.ps1    # 带代理启动 GUI（备选）
```
