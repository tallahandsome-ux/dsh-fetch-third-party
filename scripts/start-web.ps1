# dsh-fetch-third-party 本地启动脚本（带代理）。
#
# 背景：本机网络环境 r.jina.ai 直连被阻断（DNS 污染），需走本地 HTTP 代理
# 127.0.0.1:13004。Node 的 fetch 要生效代理还需 NODE_USE_ENV_PROXY=1
# （dsh CLI 官方文档说明）。这三个变量只能以真实环境变量在启动时注入
# （HTTP(S)_PROXY 属 bootstrap-only，不能写进 .env 文件）。
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts/start-web.ps1
# 代理地址可改：$env:PROXY_URL 或在文件顶部修改。

$proxy = $env:PROXY_URL
if (-not $proxy) { $proxy = 'http://127.0.0.1:13004' }

$env:HTTPS_PROXY = $proxy
$env:HTTP_PROXY = $proxy
$env:NODE_USE_ENV_PROXY = '1'

Write-Host "启动 dsh web（代理: $proxy）..."
dsh web $args
