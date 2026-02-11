/**
 * 管理画面専用ユーティリティ関数
 *
 * ダッシュボード・メディア管理など、管理画面でのみ使用する関数
 */

// =============================================================================
// ダッシュボード専用
// =============================================================================

/**
 * 変化率のフォーマット（+/-記号付き）
 *
 * @example
 * formatChange(15)  // → '+15%'
 * formatChange(-5)  // → '-5%'
 * formatChange(0)   // → '0%'
 */
export function formatChange(change: number): string {
  if (change > 0) return `+${change}%`
  if (change < 0) return `${change}%`
  return '0%'
}

/**
 * 変化率に応じた色クラスを取得
 *
 * @example
 * getChangeColor(15)  // → 'text-success'
 * getChangeColor(-5)  // → 'text-destructive'
 * getChangeColor(0)   // → 'text-muted-foreground'
 */
export function getChangeColor(change: number): string {
  if (change > 0) return 'text-success'
  if (change < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

// =============================================================================
// メディア管理専用
// =============================================================================

/**
 * バイト数を人間が読みやすい形式にフォーマット
 *
 * @example
 * formatBytes(1024)      // → '1 KB'
 * formatBytes(1048576)   // → '1 MB'
 * formatBytes(500)       // → '500 B'
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}
