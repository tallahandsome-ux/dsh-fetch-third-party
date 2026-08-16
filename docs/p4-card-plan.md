# P4 卡片完整版方案（待审核）

> 状态：**方案待审核**。审核通过后进入开发。
> 前置：P1–P3 已完成（三服务商 + 卡片代理 + 路由层默认/回退）。

---

## 0. 背景与目标

P1 交付的是"最小可用卡片"；P4 的目标是把它补齐为**完整形态**，并与 P3 路由层衔接——让用户无需开会话就能验证配置、看清路由状态、管理 key。

## 1. 现状盘点（当前卡片有什么）

- 标题 + key 状态徽章 + 整体折叠
- 一级（常驻）：服务商下拉 + 本地代理
- 二级（可折叠）：接口地址 + API Key（仅保存）+ 抓取上限
- 联动：切服务商自动改 key 引用与接口地址
- 缺口：提示文案定义了但**没渲染**、key **不能清除**、无**配置验证**手段、fallback 不可见、无字段重置

## 2. 布局设计（保持两级结构，扩充内容）

```
┌─ 网页抓取（第三方）  [● 已配置]  ▾ ──────────────────┐
│  描述文案                                         │
│  ── 基础设置 ──────────────────────────────      │
│  服务商:   [Jina Reader ▾]  (hint)                │
│  本地代理: [http://127.0.0.1:27822]  (hint)       │
│  [ 测试连接 ] → 结果行（服务商/耗时/成败）          │
│  ── 服务商配置 ──────────────── [▾] ──────      │
│  接口地址: [https://r.jina.ai]  (hint)             │
│  每会话抓取上限: [10]  (hint)                       │
│  API Key: [••••] [保存] [清除]  (hint)            │
│  兜底服务商: Jina Reader（主服务商失败时自动回退）    │
└──────────────────────────────────────────────────┘
```

## 3. 新增能力详设

### 3.1 ⭐ 测试连接（重点新增，已按审核修订）

**目的**：不开会话即可验证"当前配置（服务商+key+代理+地址）能否真的抓到"。

| 项 | 设计（修订后） |
|---|---|
| 桥接路由 | `POST /api/fetch-third-party/test`（body `url` 可选） |
| 测试 URL | **默认 `https://example.com`，用户可修改**（输入框） |
| provider 方法 | `testFetch(url)`——走**主+回退**完整逻辑，**不计会话预算**（不消耗 `maxFetchesPerSession`） |
| ⚠️ **额度消耗提醒** | **测试会真实调用第三方服务，消耗该服务商的 API 额度**（Tavily/Firecrawl credits、Jina tokens）——卡片在测试按钮旁**常驻提示**此点（审核确认） |
| 返回值 | `{ ok, servedBy, statusCode, contentLength, durationMs, error? }`——`servedBy` 显示实际服务商（主 or 回退），顺带验证路由层 |
| 卡片 UI | 一级底部：URL 输入 + "测试连接"按钮 + 结果行（✅ 服务商/耗时/长度 / ❌ 错误）+ 额度提示 |
| 安全 | 测试 URL 用户可填；loopback-only（与现有桥接一致） |

### 3.2 ~~每字段恢复默认（重置）~~ 已取消

- 审核决定：**不做重置按钮**。接口地址与服务商绑定（切换自动换）、抓取上限用户自调（默认 10 无问题）。

### 3.3 提示文案渲染

- locales 里已有的 `adapterHint` / `proxyHint` / `baseUrlHint` / `maxFetchesHint` / `apiKeyHint` 全部渲染为字段下方的灰色小字（现在定义了没用）

### 3.4 API Key 清除

- key 输入行加"清除"按钮（当已配置时）：调桥接 key 路由 `{ unset: true }` → 徽章变"未配置"（审核确认保留）

### 3.5 兜底服务商显示（只读）

- 二级底部一行："兜底服务商：Jina Reader（主服务商失败时自动回退）"——显示 `fallback` 字段的实际值，不加编辑控件（审核确认保留）

### 3.6 输入轻校验

- baseURL / proxy 失焦时若为非空且非合法 URL，标红 + 提示（不阻止保存，仅提示）

### 3.7 客制化注册能否在卡片中实现？（判断分析，暂不实现）

**结论：单个自定义服务商可以；多个不可以（当前架构）。**

| 场景 | 能否在卡片实现 | 说明 |
|---|---|---|
| **单个自定义服务商**（n8n / 自建爬虫 / 自托管 Jina） | ✅ **可以** | 卡片已有全部所需字段（服务商选择 + 接口地址 + API Key + 代理）。前提：实现 **`custom` 契约适配器**（`docs/contract.md` 的 POST `{url}` → `{content}`），并在服务商下拉加"自定义（契约 v1）"选项——之后用户在卡片填自己的 baseURL/key 即完成注册，**零代码** |
| **多个自定义服务商并存**（同时 n8n + 自托管 Jina） | ❌ 当前不行 | 需要一个主服务商只能配一个；多实例需要**路由配置升级为列表**（P3 预留的扩展方向），卡片相应加"提供方列表"管理 UI——更大的架构步骤，留待路由列表落地 |
| 契约不匹配的自定义服务（如 GET 式/特殊响应） | ⚠️ 部分 | 契约 v1 固定 POST+JSON；特殊形态需扩展契约变体（后续） |

**判断依据**：卡片"注册"的本质 = 配置（id + baseURL + key + 代理）。内置服务商靠的是 registry 里已实现适配器；自定义服务商只要 `custom` 契约适配器存在，配置字段就够用。

> **审核决定（2026-08-16）**：**多个自定义服务商并存是硬需求**，纳入 P4 一并实现（方案见 §4）。

## 4. 多自定义服务商并存方案（P4 新增，审核中）

### 4.1 模型：提供方实例表（自定义）+ 主/兜底引用

保持现有扁平主配置不变（向后兼容），**新增自定义提供方实例表**；`adapter`/`fallback` 字段既可填**内置名**（tavily/jina/firecrawl），也可填**自定义名**。

```yaml
web-fetch-third-party:
  adapter: my-n8n            # 主：内置名 或 自定义名
  fallback: jina             # 兜底：内置名 或 自定义名（默认 jina）
  baseURL: https://api.firecrawl.dev   # 仅主是内置时生效（其自定义地址）
  apiKeyEnv: FIRECRAWL_API_KEY
  proxy: http://127.0.0.1:27822
  maxFetchesPerSession: 10
  customProviders:           # ← 新增：自定义提供方实例表
    - name: my-n8n           # n8n webhook（契约 v1）
      adapter: custom        # 缺省即 custom
      baseURL: http://127.0.0.1:8787
      apiKeyEnv: MY_N8N_KEY
    - name: local-jina       # 自托管 Jina（复用 jina 适配器）
      adapter: jina
      baseURL: http://127.0.0.1:3000
      apiKeyEnv: ''
```

### 4.2 解析规则（provider 层）

`resolveProvider(config, name)` → `{ adapter, baseURL, apiKeyEnv }`：

| name | 解析 |
|---|---|
| 内置名 | 现有行为：主内置时用扁平 `baseURL`/`apiKeyEnv`（自定义值）；否则用该适配器默认 |
| 自定义名 | 查 `customProviders` 表 → `{ adapter: entry.adapter ?? 'custom', baseURL: entry.baseURL, apiKeyEnv: entry.apiKeyEnv }` |
| 都不匹配 | `WEB_PROVIDER_ERROR: unknown provider "X"` |

- 主/兜底都走同一解析 → **多个自定义并存**（n8n 主 + 自托管 Jina 兜底、或两个 n8n 互备）都成立
- 主/兜底**不计入会话预算**的规则不变（一次调用一次额度）
- 代理（proxy）仍为全局共享

### 4.3 新增 `custom` 契约适配器（前置依赖）

自定义服务商要真能用，必须实现契约 v1 适配器（`docs/contract.md`）：

```
POST {baseURL}         Authorization: Bearer {key}
Body: { "url": "<目标>" }
→ 200 { "content": "...", "statusCode": 200, "title"? }
```

- 归一化：`content` → body；`statusCode` → 状态码；错误/超时 → WebError（可回退）
- 自托管 Jina 这类**复用内置适配器**的自定义条目**不需要** custom 适配器（adapter=jina + 本地 baseURL 即可）

### 4.4 卡片 UI（新增"自定义服务商"小节）

```
│  ── 自定义服务商 ─────────────── [▾] ────────      │
│  名称: [my-n8n]  类型: [custom ▾]   [删除]         │
│  接口地址: [http://127.0.0.1:8787]                 │
│  API Key 引用: [MY_N8N_KEY]                        │
│  ─────────────────────────────────────            │
│  [ + 添加自定义服务商 ]                             │
```

- **一级服务商下拉**：内置 + 自定义名（`my-n8n`、`local-jina`…）
- 自定义小节（可折叠）：条目列表（名称/类型/地址/key 引用/删除）+ 添加按钮
- 类型下拉：`custom`（契约 v1）/ `jina` / `tavily` / `firecrawl`（复用适配器）
- 校验：名称 kebab-case 且唯一；地址必填且为 URL；key 引用可选（空=该适配器默认）
- 桥接新增 `/custom` 路由：`{ op: 'add'|'update'|'remove', entry }`

### 4.5 向后兼容与迁移

- `customProviders` 为**新增可选字段**（默认空表）——现有扁平配置不受影响
- 扁平 `adapter`/`fallback` 值（tavily/jina/firecrawl）语义不变
- 无迁移负担

### 4.6 明确不做（此轮边界）

- ❌ 回退链（多级回退列表）——仍是单一 fallback，但**可以指向任意自定义**
- ❌ 自定义条目的代理独立配置——全局共享一个代理
- ❌ 契约变体（GET 式等）——契约 v1 先行，特殊形态后续扩展

## 5. 明确不做（范围边界，已按多自定义需求修订）

- ❌ 会话级数据（"上次抓取用了哪个服务商"）——属于运行轨迹，不是设置卡片的职责
- ❌ 回退链 UI（多级回退列表）——保持单一 fallback，但可指向任意提供方（内置或自定义）
- ❌ 卡片皮肤/主题化——跟随 GUI 全局样式
- ~~❌ 自托管/契约服务配置 UI~~ → **已纳入 §4（多自定义服务商）**

## 5. 交付物与文件

| 文件 | 改动 |
|---|---|
| `src/settings.ts` | 新增 `customProviders` 表 + 解析辅助（resolveProvider） |
| `src/adapters/custom.ts` | **新增 custom 契约 v1 适配器**（POST `{url}` → `{content}`） |
| `src/provider.ts` | `testFetch(url)` 方法 + 提供方名解析（内置/自定义） |
| `src/bridge.ts` | 新增 `/test` 路由 + `/custom` 路由（add/update/remove） |
| `src/client/card.tsx` | 测试 URL+按钮+结果+额度提示、清除 key、hints、fallback 行、**自定义服务商小节**、URL 校验 |
| `src/client/locales.ts` | 新增文案：test/custom 小节/校验提示等 |
| `docs/p4-card-plan.md` | 本方案；开发后追加验证记录 |

## 6. 待审核决策点（已按反馈修订）

- [x] **测试连接**：默认 `example.com`，**用户可修改** ✅
- [x] **测试额度**：**会消耗该服务商 API 额度**，卡片常驻提醒 ✅
- [x] **重置按钮**：**取消不做** ✅
- [x] **清除 key**：保留 ✅
- [x] **兜底行**：只读显示 ✅
- [x] **客制化注册在卡片**：判断升级为**需求**——§4 方案支持**多个自定义并存**，随 P4 实现 ✅
- [ ] **§4 多自定义方案**：见下新增决策点

### 6.1 多自定义服务商方案决策点（§4，待审核）

- [ ] **实例表结构**：`customProviders: [{ name, adapter?, baseURL, apiKeyEnv? }]` 是否接受？
- [ ] **主/兜底可指向自定义**（如主=my-n8n、兜底=local-jina）：确认？
- [ ] **custom 契约适配器在 P4 一并实现**（否则自定义不可用）：确认？
- [ ] **卡片 UI**：一级下拉含自定义名 + "自定义服务商"小节（列表增删改）是否满足？
- [ ] **名称规则**：kebab-case 且唯一；地址必填 URL——确认？
- [ ] **key 引用可选**（空=该适配器默认，如自托管 Jina 匿名）：确认？

### 6.2 审核结果（全部通过 ✅，2026-08-16）

用户确认：以上 6 项全部接受；**适配条件（契约 v1 对接要求）需在卡片中告知用户**（已实现为自定义小节顶部的 customConditions 提示）。**P4 开发执行。**

---

## 7. P4 交付记录（2026-08-16）

### 交付物
- `src/settings.ts`：`customProviders` 实例表 + `resolveProvider`（内置/自定义统一解析）
- `src/adapters/custom.ts`：**契约 v1 适配器**（POST `{url}` → `{content}`，含适配条件错误提示）
- `src/provider.ts`：`testFetch(url)`（主+回退、不计会话预算、返回 servedBy）；空 key 引用=匿名（修复 credentialRef('') 崩溃）
- `src/bridge.ts`：`/test` 路由、`/custom` 路由（add/update/remove/replace + 校验）；视图含 customProviders
- `src/client/card.tsx`：三级布局（基础设置+测试 / 服务商配置 / 自定义服务商）+ 清除 key + hints + 兜底行 + 适配条件提示
- `src/client/locales.ts`：全部新增文案（测试/自定义/适配条件等）
- `scripts/fixture-contract-server.mjs`：契约 v1 本地测试服务（测试用）

### 验证结果（全部实测）
| 项 | 结果 |
|---|---|
| typecheck + build | ✅ |
| **自定义作主服务商**（headless E2E + /test） | ✅ 模型调 web_fetch_url → 契约适配器 → 本地 fixture → 内容返回；/test servedBy=my-test |
| **回退到自定义**（主=firecrawl 坏地址必失败） | ✅ /test servedBy=my-test，10ms 本地响应 |
| **/custom 路由**：add/update/remove/replace | ✅ 列表正确增删；重复名返回 400 |
| **空 key 引用（匿名自定义）** | ✅ 修复 credentialRef('') 崩溃；匿名可用 |
| **Firecrawl keyless 实测** | ✅ `/v2/scrape` 无 key 返回 200 + 真实内容（限速）——修正"裸 REST 必须带 key"的认知 |
| 配置恢复 | ✅ settings.yaml 还原（pet 名完好） |

### 备注
- 卡片"适配条件"提示已在自定义小节常驻显示（用户要求）
- 用户 GUI 需刷新/重启以加载新 client 包与 host 代码
