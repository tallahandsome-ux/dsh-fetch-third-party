# P2 开发方案：Jina → Firecrawl 适配器

> 状态：**待用户审核**。审核通过后按 §7 阶段执行。
> 前置：P1 已验收（Tavily 适配器 + `web_fetch_url` 工具 + 预算 + 卡片折叠）。服务商调研见 `docs/p2-vendor-research.md`。

---

## 0. 目标与范围

**目标**：为 `dsh-fetch-third-party` 增加 **Jina Reader** 与 **Firecrawl** 两个抓取适配器，用户可在卡片"服务商"下拉中切换，切换后 `web_fetch_url` 工具走对应第三方服务。

**范围内**（本轮 P2）：
- `jina` 适配器（`r.jina.ai`，key 可选/匿名可用）
- `firecrawl` 适配器（`api.firecrawl.dev/v2/scrape`）
- 设置 schema 与卡片的适配器联动
- 每适配器的独立验证脚本 + 端到端验证

**范围外**（后续客制化目标，已记录）：
- **自建 Jina**（Docker 自托管 `ghcr.io/jina-ai/reader:oss`）——与 n8n、自建爬虫对齐，走"用户自填 baseURL 指向本地实例"的既有机制，纳入 P3 后的客制化专题
- 路由层（多服务商选择/回退，P3）
- n8n / custom 契约适配器（契约 v1 已就绪，随自建/爬虫目标落地）

---

## 1. 已确认决策（用户拍板）

| 决策 | 内容 |
|---|---|
| P2 适配器顺序 | **Jina → Firecrawl**（Jina 免费额度更慷慨、docker 省事、匿名可用；Firecrawl 其次） |
| 自建 Jina | 记为**后续客制化目标之一**，与 n8n、自建爬虫对齐（同走 baseURL 自填 + 契约机制） |
| key 引用名 | `JINA_API_KEY` / `FIRECRAWL_API_KEY`（沿用 Tavily 的 `TAVILY_API_KEY` 命名惯例） |

---

## 2. 架构改动总览（复用 P1 骨架，最小改动）

```
src/
├── adapters/
│   ├── types.ts        # 不变（FetchAdapter 接口）
│   ├── tavily.ts       # 不变
│   ├── jina.ts         # 新增：Jina Reader 适配器
│   └── firecrawl.ts    # 新增：Firecrawl 适配器
├── provider.ts         # 改：ADAPTERS 注册表加两项；key 引用按适配器回退默认
├── settings.ts         # 改：adapter 字段加枚举校验；每适配器默认 key 引用
├── bridge.ts           # 不变（配置读写通用）
├── tool.ts             # 不变（web_fetch_url 无感知适配器切换）
└── client/
    ├── card.tsx        # 改：服务商下拉加 Jina / Firecrawl；切换时联动 key 引用
    └── locales.ts      # 改：新增适配器名称文案
```

**核心不变式**：`web_fetch_url` 工具、预算、凭据保险箱、桥接路由全部与适配器无关——模型无需感知切到了哪家服务商。

---

## 3. Jina 适配器设计（已用真实匿名调用验证响应格式）

### 3.1 请求

```
GET {baseURL}/{encodeURIComponent(目标URL)}
Authorization: Bearer {key}        # 可选——匿名也可用（限速更低）
Accept: application/json           # 拿 JSON 便于归一化
```

- `baseURL` 默认 `https://r.jina.ai`（卡片可改；改指向自建实例即实现自托管 Jina）

### 3.2 响应（实测 JSON 格式）

```json
{
  "code": 200, "status": 200,
  "data": {
    "title": "...", "url": "https://example.com/",
    "content": "markdown 正文...",
    "publishedTime": "...", "warning": "...",
    "metadata": { ... }, "external": { ... }
  }
}
```

归一化：`data.content` → `body {kind:'text', content}`；`data.url` → `url`；`status` → `statusCode`。

### 3.3 错误与边界

| 场景 | 行为 |
|---|---|
| 非 2xx / `code != 200` | 返回结果（statusCode + 错误体文本）或 `WEB_PROVIDER_ERROR` |
| JSON 解析失败 | `WEB_PROVIDER_ERROR` |
| `data.content` 为空 | 按 seam 语义返回 statusCode + 空内容（不抛错） |
| 无 key（匿名） | 照常调用（免费档限速更低）；卡片提示"可选" |
| 缓存快照 | 响应可能带 `warning: cached snapshot`——保留原样传给模型（正文仍有效） |

---

## 4. Firecrawl 适配器设计

### 4.1 请求

```
POST {baseURL}/v2/scrape
Authorization: Bearer {key}        # 必填（无免费匿名档）
Content-Type: application/json
Body: { "url": "<目标URL>", "formats": ["markdown"] }
```

- `baseURL` 默认 `https://api.firecrawl.dev`（卡片可改）

### 4.2 响应（按官方 README 形态）

```json
{
  "success": true,
  "data": {
    "markdown": "...", "html": "...", "rawHtml": "...",
    "metadata": { "title": "...", "sourceURL": "..." }
  }
}
```

归一化：`data.markdown` → `body {kind:'text', content}`；`data.metadata.sourceURL` → `url`；`success` 非真 → `WEB_PROVIDER_ERROR`。

### 4.3 错误与边界

| 场景 | 行为 |
|---|---|
| `success: false` 或非 2xx | `WEB_PROVIDER_ERROR`（附服务端 message） |
| credits 耗尽（402/403） | 结果或错误透传给模型（提示需充值/换服务商） |
| `data.markdown` 为空 | 返回空内容结果（不抛错） |

> ⚠️ 注意：Firecrawl 免费档 **500 credits/月**；低层计划 crawl 限 50 页（我们只用单页 scrape，不受 crawl 限制）。AI Extract（$89/月）不在本适配器范围。

---

## 5. 凭据与 key 策略

| 适配器 | 默认 key 引用 | key 必填？ |
|---|---|---|
| `tavily` | `TAVILY_API_KEY` | 必填 |
| `jina` | `JINA_API_KEY` | **可选**（匿名可用） |
| `firecrawl` | `FIRECRAWL_API_KEY` | 必填 |

- **每适配器 key 引用回退**：设置区块的 `apiKeyEnv` 保留单一字段；provider 解析时若为空，按当前 `adapter` 回退到上表默认名 → 用户切换服务商后无需手改引用名
- **卡片联动**：切换"服务商"下拉时，卡片自动把 `apiKeyEnv` 设为该适配器的默认引用名（可手动改），key 状态徽章随之刷新
- 写入位置不变：托管保险箱（0600），每引用一个 key

---

## 6. 测试与验收

| 阶段 | 方法 | 验收标准 |
|---|---|---|
| 独立验证脚本 | `scripts/verify-jina.mjs`、`scripts/verify-firecrawl.mjs`（仿 `verify-tavily.mjs`：env/argv 传 key，抓 example.com 打印正文头） | Jina 匿名与带 key 均 200；Firecrawl 带 key 200 |
| 类型检查 + 构建 | `pnpm typecheck` / `pnpm build` | 无错误；lib 更新 |
| **端到端（headless）** | 临时 profile（base+headless+本插件），卡片侧改设置后跑"用 web_fetch_url 抓 example.com" | 模型成功返回正文（Jina、Firecrawl 各一次） |
| GUI 卡片 | 用户刷新后查看服务商下拉 | 三个选项（Tavily/Jina/Firecrawl），切换联动 key 引用 |
| 回归 | Tavily 仍可抓 | P1 能力不回退 |

---

## 7. 交付物与文件清单

| 阶段 | 内容 | 交付物 |
|---|---|---|
| **P2.1** | ✅ 完成并验收：Jina 适配器 + registry + settings/card 联动 + 卡片代理 | `src/adapters/jina.ts`、`scripts/verify-jina.mjs` 等 |
| **P2.2（代码完成，真实测试待用户）** | Firecrawl 适配器 + 验证脚本 | `src/adapters/firecrawl.ts`、`scripts/verify-firecrawl.mjs` |
| **P2.3** | 构建 + headless 端到端 + 回归（**暂停中**：按用户指示，等用户重启 GUI 并填入 FIRECRAWL_API_KEY 后再测） | 验证记录（追加到 design.md） |

---

## 8. 不做的事（明确排除，避免范围蔓延）

- ❌ 自建 Jina 部署/文档（后续客制化专题，与 n8n/爬虫对齐）
- ❌ 路由层（P3：多服务商选择/回退）
- ❌ n8n / custom 契约适配器（契约 v1 已就绪，随客制化目标落地）
- ❌ 搜索侧能力（`s.jina.ai`、Firecrawl /search——后续如需再做）
- ❌ AI Extract 等付费功能适配

---

## 9. 待审核决策点（已全部确认 ✅）

- [x] 每适配器 key 引用回退方案（§5）——**通过**
- [x] 卡片"服务商"切换时自动改 key 引用名——**通过**（实现时同步加入 **baseURL 联动**：切换适配器时若 baseURL 是旧适配器默认值则替换为新适配器默认，自定义保留）
- [x] Jina 匿名（无 key）作为正式能力——**通过**（卡片标注"可选"）
- [x] 适配器命名：`jina` / `firecrawl` 小写——**通过**
- [x] **P2.1 → P2.2 分两阶段**——**通过**

---

## 10. P2.1 交付记录（2026-08-15）

### 交付物
- `src/adapters/jina.ts`（GET + 可选 Bearer + Accept JSON，匿名可用）
- `src/settings.ts`：`KEY_ENV_BY_ADAPTER` / `BASE_URL_BY_ADAPTER` + `resolveKeyEnv` / `resolveBaseURL`（key 引用与端点均按适配器回退默认）
- `src/provider.ts`：适配器注册表 + 按适配器解析端点/key
- `src/bridge.ts`：卡片视图用解析后的端点与 key 引用
- `src/client/card.tsx`：服务商下拉（Tavily / Jina Reader）+ 切换联动 key 引用与 baseURL
- `scripts/verify-jina.mjs`（匿名/带 key 均可）

### 验证结果（全部实测）
| 项 | 结果 |
|---|---|
| typecheck + build | ✅ |
| `verify-jina.mjs` 匿名 | ✅ HTTP 200，example.com 正文 149 chars |
| **headless 端到端（adapter=jina）** | ✅ 模型调 `web_fetch_url` → Jina → 正文返回 |
| **Tavily 回归（adapter=tavily）** | ✅ 直连无代理仍正常 |
| 设置切换 | ✅ settings.yaml 改 adapter 即生效（热重载） |

### ⚠️ 网络环境注意事项（本机实测发现）
- 本机 **r.jina.ai 被网络阻断**（DNS 指向 Facebook IP、直连超时），但走本地 HTTP 代理（示例 `127.0.0.1:27822`）可通
- **✅ 已内置卡片代理字段解决**（2026-08-16 追加）：卡片在服务商为 Jina 时显示"本地代理"输入行；适配器用 undici `ProxyAgent` 做**按请求**代理（`dispatcher`），**不依赖进程环境变量**、不影响其他网络流量
- 端到端实测：**清空代理环境变量、仅靠卡片 proxy 字段** → Jina 抓取成功（HTTP 200）
- 因此 **GUI 使用 Jina 无需再设环境变量**：卡片填 `http://127.0.0.1:27822` 即可；`scripts/start-web.ps1` 保留为备选方案
- Tavily 直连可达无需代理

### 代理功能说明（2026-08-16 新增）
- 设置新增 `proxy` 字段（string，默认空）
- 适配器上下文新增 `proxy`；适配器（tavily/jina/firecrawl）在配置代理时用 `undici.ProxyAgent` 作为 fetch `dispatcher`（按代理 URL 缓存复用连接）
- 卡片：仅当服务商为 `jina` 时显示"本地代理（Jina）"输入行（placeholder `http://127.0.0.1:27822`）；**代理字段对全部适配器生效**（Firecrawl 实测也走该代理）
- 运行时依赖：`undici`（已加入 package.json dependencies，构建外部化）
- 修复教训：`settings.yaml` 含中文（pet 名），PowerShell 读写需显式 UTF-8（已修复并验证解析）

---

## 11. P2.2 交付记录（2026-08-16）

### 交付物
- `src/adapters/firecrawl.ts`（`POST {baseURL}/v2/scrape` + Bearer + `{url, formats:["markdown"]}`，含网络错误捕获与代理支持；参考 `docs/firecrawl-reference.md`）
- `src/settings.ts`：`KEY_ENV_BY_ADAPTER` / `BASE_URL_BY_ADAPTER` 加 `firecrawl`（`FIRECRAWL_API_KEY` / `https://api.firecrawl.dev`）
- `src/provider.ts`：适配器注册表加 firecrawl
- `src/client/card.tsx`：服务商下拉加 **Firecrawl**（切换联动 key 引用与 baseURL）
- `scripts/verify-firecrawl.mjs`（key 必填）

### 验证结果
| 项 | 结果 |
|---|---|
| typecheck + build | ✅ |
| 产物含 firecrawl（/v2/scrape + 卡片选项） | ✅ |
| **用户 GUI 实测**（重启 + 填入 fc key + 新建会话） | ✅ **抓取成功**（adapter=firecrawl，走卡片代理（示例端口）4） |
| 卡片联动 | ✅ baseURL / apiKeyEnv 自动切换为 firecrawl 默认值 |
| key 写入保险箱 | ✅ `apiKeyConfigured: true` |

### 备注
- Firecrawl **key 必填**（keyless 免费层仅限官方客户端，见 firecrawl-reference.md §2）——与 Jina 匿名可用不同
- 本机实测 `api.firecrawl.dev` 也走代理可达（与 r.jina.ai 相同网络环境）；代理字段对全部适配器生效
