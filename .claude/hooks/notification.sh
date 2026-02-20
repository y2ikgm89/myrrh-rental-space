#!/usr/bin/env bash
# Notification hook: Windows バルーン通知（PowerShell 組み込み、追加モジュール不要）
# Claude Code が通知を送りたい時（長時間タスク完了・入力待ち）に発火

set -euo pipefail

INPUT=$(cat)

# stdin JSON から message を取得（特殊文字を除去してPowerShell埋め込みを安全にする）
MESSAGE=$(printf '%s' "$INPUT" | jq -r '.message // "入力を待機しています"' 2>/dev/null \
  | tr -d "'\"\`\$\n\r" \
  | cut -c1-150 \
  || echo "入力を待機しています")

# Windows balloon notification（NotifyIcon - Windows 10/11 組み込み）
# 非ブロッキング: & でバックグラウンド実行 → hook はすぐ exit 0 を返す
powershell.exe -NonInteractive -WindowStyle Hidden -Command "
  try {
    Add-Type -AssemblyName System.Windows.Forms
    \$n = New-Object System.Windows.Forms.NotifyIcon
    \$n.Icon = [System.Drawing.SystemIcons]::Information
    \$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    \$n.BalloonTipTitle = 'Claude Code'
    \$n.BalloonTipText = '${MESSAGE}'
    \$n.Visible = \$true
    \$n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    \$n.Dispose()
  } catch { }
" 2>/dev/null &

exit 0
