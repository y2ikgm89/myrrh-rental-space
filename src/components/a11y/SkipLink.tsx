/**
 * スキップリンクコンポーネント
 *
 * キーボードナビゲーション改善のためのコンポーネント
 * 初回Tabキー押下時にのみ表示され、メインコンテンツへジャンプ可能
 */

import { DEFAULT_SKIP_TARGETS, SKIP_LINK_CLASSES, type SkipLinkTarget } from '@/lib/a11y'
import type { ReactElement } from 'react'

interface SkipLinkProps {
  /** カスタムターゲット（デフォルト: main-content） */
  targets?: SkipLinkTarget[]
}

/**
 * スキップリンク
 *
 * 通常は視覚的に非表示だが、キーボードフォーカス時に表示される
 * スクリーンリーダーユーザーやキーボードユーザーのナビゲーションを改善
 */
export function SkipLink({
  targets = DEFAULT_SKIP_TARGETS,
}: SkipLinkProps): ReactElement {
  return (
    <>
      {targets.map((target) => (
        <a
          key={target.id}
          href={`#${target.id}`}
          className={SKIP_LINK_CLASSES.base}
        >
          {target.label}
        </a>
      ))}
    </>
  )
}
