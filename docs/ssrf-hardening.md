# SSRF 加固清单（给二次开发 / 直连 Provider）

> dsh-fetch-third-party 本身走"快递员模式"（目标 URL 只经第三方服务抓取，本机不直连），默认无 SSRF 面。
> 但如果你基于本插件做二次开发，或实现一个**本机直连目标 URL** 的 Provider（类似官方 `web-fetch-http`），
> 请按下述清单加固，否则模型可诱导你抓取内网/云元数据地址。

## 可直接复用的工具

`src/ssrf.ts` 导出了全部检查函数（MIT，随意引用）：

| 函数 | 作用 |
|---|---|
| `isPrivateOrReserved(ip)` | 判断 IP 是否私网/保留/回环/链路本地/组播等（含 IPv4-mapped IPv6 `::ffff:x.x.x.x` 与 6to4 `2002::/16` 内嵌 IPv4） |
| `isHttpUrlPolicyCompliant(url)` | 仅 http(s)、无内嵌凭据 |
| `validateTargetURL(url)` | 轻量预检：URL 策略 + IP 字面量私网拒绝（本插件纵深防御用） |
| `isPublicHttpURL(url)` | 完整校验：解析全部 A/AAAA，逐个必须公网 |
| `assertPublicHttpURL(url)` | 完整校验的抛错版 |

## 完整清单（直连 Provider 必须逐条落实）

### 1. 协议与格式

- 仅接受 `http:` / `https:`；拒绝其他协议（`file:`、`gopher:`、`ftp:` 等）
- 拒绝 URL 内嵌凭据（`http://user:pass@host/`）
- URL 用 `new URL()` 解析，拒绝解析失败的值

### 2. 地址范围拒绝（连接前）

- IPv4：私网 `10/8`、`172.16/12`、`192.168/16`；回环 `127/8`；链路本地 `169.254/16`；组播 `224/4`；未指定 `0/8`；保留 `240/4`；基准测试 `198.18/15`；CGNAT `100.64/10`
- IPv6：回环 `::1`；未指定 `::`；链路本地 `fe80::/10`；ULA `fc00::/7`；组播 `ff00::/8`
- **IPv4-mapped IPv6**（`::ffff:127.0.0.1`）与 **6to4**（`2002:vvvv:vvvv::/16`）必须解出内嵌 IPv4 再查
- 建议直接复用 `isPrivateOrReserved()`

### 3. DNS 解析后校验（防 DNS Rebinding）

- 解析主机名的**全部** A/AAAA 记录，逐条判定公网；存在任一条私网即拒绝
- 先解析、后连接；连接**钉扎**到已校验的地址（不要二次解析）
- 解析失败 / 无记录 → 拒绝

### 4. 重定向

- 每跳重定向重新执行 1–3 的校验
- 拒绝 `https → http` 降级
- 限制最大重定向跳数（如 5）

### 5. 资源上限

- 响应体体积上限（如 100 KB – 1 MB）
- 请求超时 + 整体墙钟上限
- 可选的 per-host 并发/频率限制

### 6. 可选 allow / deny 列表

- 精确主机名；子域用通配（`*.example.com`）
- 白名单优先于黑名单（更安全）

## 参考实现

- `dsh-safe-web-fetch`（MostlyHarmlessxyz）：DNS 校验 + 连接钉扎 + 同源重定向的完整示例
- 官方 `web-fetch-http` 的 README 明确说明其未做私网/回环/DNS 校验——不要直接照抄其连接方式
