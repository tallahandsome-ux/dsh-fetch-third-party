# start-crawl4ai.ps1 — 一键拉起 Crawl4AI 容器 + 契约 v1 包装进程
#
# 背景：包装进程（node scripts/crawl4ai-wrapper.mjs）是前台进程，不随 GUI 常驻；
# 机器重启或进程退出后 crawl4ai 自定义服务商会抓取失败并落到兜底服务商。
# 本脚本一次性保证：容器在跑 + 包装进程在跑。
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts/start-crawl4ai.ps1
# 说明：包装进程在前台运行（Ctrl+C 退出，容器继续运行）；
#       若容器是用别的 token 创建的，先 $env:CRAWL4AI_API_TOKEN="你的token" 再运行本脚本。

$ErrorActionPreference = "Stop"

$token = $env:CRAWL4AI_API_TOKEN
if (-not $token) { $token = "dev-crawl4ai-token" }   # 默认与教程中的 token 一致
$containerName = "crawl4ai"

# 1) 确保容器在运行
$exists = docker ps -a --filter "name=$containerName" --format "{{.Names}}" | Select-Object -First 1
if ($exists) {
  $running = docker ps --filter "name=$containerName" --filter "status=running" --format "{{.Names}}" | Select-Object -First 1
  if ($running) {
    Write-Host "容器 $containerName 已在运行。"
  } else {
    Write-Host "启动已有容器 $containerName ..."
    docker start $containerName | Out-Null
  }
} else {
  Write-Host "创建并启动容器 $containerName ..."
  docker run -d -p 127.0.0.1:11235:11235 --name $containerName --shm-size=1g -e "CRAWL4AI_API_TOKEN=$token" unclecode/crawl4ai:latest | Out-Null
}

# 2) 前台运行包装进程（Ctrl+C 退出；容器保持运行）
Write-Host "启动契约 v1 包装进程 http://127.0.0.1:8787（token=$token）..."
$env:CRAWL4AI_API_TOKEN = $token
if (-not $env:WRAPPER_PORT) { $env:WRAPPER_PORT = "8787" }
node scripts/crawl4ai-wrapper.mjs