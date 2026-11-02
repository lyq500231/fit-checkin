# ============================================================
#  健身打卡 · 一键局域网共享服务（无需管理员权限、无需安装任何东西）
#  用法：右键本文件 -> 使用 PowerShell 运行；或在本目录执行：
#        powershell -ExecutionPolicy Bypass -File .\serve.ps1
#  然后手机/同事浏览器打开脚本打印出的 http://<本机IP>:8000/
#  参数：-Port 8000  换端口     -AutoStopSec 0  0=一直运行
# ============================================================
param(
  [int]$Port = 8000,
  [int]$AutoStopSec = 0,
  [string]$Root = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
$types = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.webmanifest'='application/manifest+json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml';
  '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8'
}
$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any), $Port
$listener.Start()
Write-Host ""
Write-Host "  健身打卡 已在局域网启动：" -ForegroundColor Green
Write-Host "    本机访问   : http://localhost:$Port/" -ForegroundColor Cyan
try {
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host ("    手机/他人  : http://{0}:{1}/   (同一 Wi-Fi 下)" -f $_.IPAddress, $Port) -ForegroundColor Cyan }
} catch {}
Write-Host "    停止服务   : 回到本窗口按 Ctrl+C" -ForegroundColor DarkGray
Write-Host ""
$t0 = Get-Date
try {
  while ($true) {
    if ($AutoStopSec -gt 0 -and ((Get-Date) - $t0).TotalSeconds -gt $AutoStopSec) { break }
    if (-not $listener.Pending()) { Start-Sleep -Milliseconds 120; continue }
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream(); $stream.ReadTimeout = 6000
      $buf = New-Object byte[] 8192; $ms = New-Object System.IO.MemoryStream
      while ($true) {
        $n = $stream.Read($buf, 0, $buf.Length); if ($n -le 0) { break }
        $ms.Write($buf, 0, $n)
        $txt = [Text.Encoding]::ASCII.GetString($ms.ToArray())
        if ($txt.Contains("`r`n`r`n") -or $ms.Length -gt 65536) { break }
      }
      $first = (([Text.Encoding]::ASCII.GetString($ms.ToArray())) -split "`r`n")[0]
      $parts = $first -split ' '
      $method = $parts[0]; $target = if ($parts.Count -gt 1) { $parts[1] } else { '/' }
      $path = [Uri]::UnescapeDataString(($target -split '\?')[0])
      if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
      $rel = $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      $full = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $rel))
      $rootFull = [IO.Path]::GetFullPath($Root)
      $ok = $full.StartsWith($rootFull)
      if ($ok -and [IO.Directory]::Exists($full)) { $full = [IO.Path]::Combine($full, 'index.html') }
      if (-not $ok -or -not [IO.File]::Exists($full)) { throw [System.IO.FileNotFoundException]::new('404') }
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $ct = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
      $hb = [Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      if ($method -ne 'HEAD') { $stream.Write($bytes, 0, $bytes.Length) }
      $stream.Flush()
    } catch {
      try {
        $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $hb = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
        $s2 = $client.GetStream(); $s2.Write($hb, 0, $hb.Length); $s2.Write($body, 0, $body.Length); $s2.Flush()
      } catch {}
    } finally { $client.Close() }
  }
} finally { $listener.Stop(); Write-Host "服务已停止" }