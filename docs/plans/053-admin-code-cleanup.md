# 053 管理画面コード整理 (A+B レベル)

管理画面の分析に基づき、重複コードの統一とバグ修正を行う。

## 概要

| 項目 | 内容 |
|------|------|
| 対象 | 管理画面全体 |
| 優先度 | A（即座に実施可能）+ B（中程度） |
| リスク | 低〜中 |

---

## フェーズ構成

### Phase 1: PublishSwitch 統一 (優先度A) `cc:TODO`

**問題**:
- `spaces/_components/PublishSwitch.tsx` と `locations/_components/PublishSwitch.tsx` がほぼ同一
- 唯一の違いは呼び出すServer ActionとプロパティID名

**解決策**:
- `_shared/components/ui/PublishSwitch.tsx` に汎用コンポーネントを作成
- ジェネリック + コールバック方式で統一

**タスク**:
- [ ] `_shared/components/ui/PublishSwitch.tsx` 作成（汎用版）
- [ ] `spaces/_components/SpaceTable.tsx` を更新（新コンポーネント使用）
- [ ] `locations/_components/LocationTable.tsx` を更新
- [ ] 旧 `spaces/_components/PublishSwitch.tsx` 削除
- [ ] 旧 `locations/_components/PublishSwitch.tsx` 削除
- [ ] type-check/lint/build 検証

**変更ファイル**:
- 新規: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/PublishSwitch.tsx`
- 変更: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx`
- 変更: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx`
- 削除: `src/app/(admin)/admin/(dashboard)/spaces/_components/PublishSwitch.tsx`
- 削除: `src/app/(admin)/admin/(dashboard)/locations/_components/PublishSwitch.tsx`

---

### Phase 2: NewsFilters デバウンスバグ修正 (優先度A) `cc:TODO`

**問題**:
- `NewsFilters.tsx` の onChange イベントで `return () => clearTimeout(timeoutId)` を返しているが、onChangeの戻り値は無視される
- 結果：タイムアウトがクリアされず、不要なAPI呼び出しが発生

**解決策**:
- `BlogFilters.tsx` と同じパターン（useRef + useEffect）を採用

**タスク**:
- [ ] `NewsFilters.tsx` に `searchTimeoutRef` を追加
- [ ] useEffect でアンマウント時のクリーンアップを追加
- [ ] onChange ハンドラを `handleSearchChange` 関数に分離
- [ ] type-check/lint/build 検証

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsFilters.tsx`

---

### Phase 3: フィルター基底コンポーネント作成 (優先度B) `cc:TODO`

**問題**:
- フィルターコンポーネントが複数存在（Blog, News, Location, Customer, Reservation, etc.）
- 各々が似たパターンで、ステータス/検索/追加フィルターを実装
- デバウンス処理やURLパラメータ更新のパターンが統一されていない

**解決策**:
- 共通パターンを抽出した `BaseFilters` コンポーネントを作成
- 各フィルターは BaseFilters を使用するか、必要に応じて拡張

**タスク**:
- [ ] `_shared/components/table/BaseFilters.tsx` 作成
  - ステータスセレクト（汎用オプション）
  - 検索入力（デバウンス付き）
  - isPending 状態表示
- [ ] `_shared/components/table/index.ts` バレルエクスポート作成
- [ ] NewsFilters を BaseFilters 使用に移行（シンプルなケース）
- [ ] type-check/lint/build 検証

**新規ファイル**:
- `src/app/(admin)/admin/(dashboard)/_shared/components/table/BaseFilters.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/table/index.ts`

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsFilters.tsx`

**Note**: BlogFilters はカテゴリ選択があるため、BaseFilters 拡張版として残す。他のフィルターは段階的に移行可能。

---

### Phase 4: サイドパネル Shell コンポーネント作成 (優先度B) `cc:TODO`

**問題**:
- `BlogSidePanel.tsx` (227行) と `NewsSidePanel.tsx` (192行) のシェル部分が重複
- オーバーレイ、パネルアニメーション、ヘッダー、閉じるボタンが同一

**解決策**:
- シェル部分を `SidePanelShell` として抽出
- 各パネルは Shell を使用し、コンテンツ部分のみ実装

**タスク**:
- [ ] `_shared/components/editor/inline/SidePanelShell.tsx` 作成
  - オーバーレイ
  - パネルアニメーション
  - ヘッダー（タイトル + 閉じるボタン）
  - children スロット
- [ ] `BlogSidePanel.tsx` を Shell 使用に移行
- [ ] `NewsSidePanel.tsx` を Shell 使用に移行
- [ ] type-check/lint/build 検証

**新規ファイル**:
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/SidePanelShell.tsx`

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/BlogSidePanel.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/NewsSidePanel.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/index.ts`

---

### Phase 5: 検証・ドキュメント `cc:TODO`

- [ ] type-check / lint / build 全体検証
- [ ] UI 動作確認
  - PublishSwitch（スペース・場所）
  - NewsFilters 検索デバウンス
  - BlogSidePanel / NewsSidePanel 開閉
- [ ] docs/plans/README.md 更新

---

## 見送り項目（将来検討）

以下は今回のスコープ外：

| 項目 | 理由 |
|------|------|
| エディター ノード/プラグイン自動化 | 高リスク・1週間以上の工数 |
| フォーム実装パターン統一 | 大規模リファクタリング |
| 全フィルターの BaseFilters 移行 | 段階的に実施可能 |

---

## 期待される効果

1. **コード削減**: PublishSwitch 2ファイル → 1ファイル
2. **バグ修正**: NewsFilters のデバウンス問題解消
3. **パターン統一**: フィルター基底で今後の実装が容易に
4. **保守性向上**: サイドパネル Shell で重複削減

---

## 依存関係

- なし（既存機能の整理のみ）
