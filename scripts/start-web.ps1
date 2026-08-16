# dsh-fetch-third-party 本地启动脚本（带代理）。
#
# 背景：部分网络环境会阻断第三方服务直连（如 r.jina.ai 被 DNS 污染），
# 需走本地 HTTP 代理。Node 的 fetch 要生效代理还需 NODE_USE_ENV_PROXY=1
# （dsh CLI 官方文档说明）。这三个变量只能以真实环境变量在启动时注入
# （HTTP(S)_PROXY 属 bootstrap-only，不能写进 .env 文件）。
#
# 用法：先设置你的代理地址，再运行本脚本：
#   $env:PROXY_URL = "http://127.0.0.1:27822"   # 换成你本机实际代理端口
#   powershell -ExecutionPolicy Bypass -File scripts/start-web.ps1

$proxy = $env:PROXY_URL
if (-not $proxy) {
  Write-Host "请先设置你的本地代理地址：`$env:PROXY_URL = `"http://127.0.0.1:<你的代理端口>`"" -ForegroundColor Yellow
  exit 1
}

$env:HTTPS_PROXY = $proxy
$env:HTTP_PROXY = $proxy
$env:NODE_USE_ENV_PROXY = '1'

Write-Host "启动 dsh web（代理: $proxy）..."
dsh web $args