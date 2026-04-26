# 0022. 管理画面 table の checkbox は CheckboxCell ラッパーで 44px ヒットエリア化

- Status: Accepted
- Date: 2026-04-26

## Context

CLAUDE.md ハードルール「全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須」に対し、管理画面の posts / reservations / pages テーブルの全選択 checkbox + 行 checkbox が `<input type="checkbox" className="h-4 w-4">`（16px）の裸配置で WCAG 2.5.5 を大幅に下回っていた。`accessibility.md` の OK パターン例「checkbox は label wrapper で 44px」を共通コンポーネントとして昇格する。

## Decision

`@/admin/_shared/components/table/CheckboxCell` を新設し、管理画面の全 table checkbox を統一する。

```tsx
<CheckboxCell
  checked={isSelected}
  onChange={handleChange}
  aria-label={`${entity.name} を選択`}
/>
```

実装は `<label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">` で 44px ヒットエリアを確保し、内部 `<input type="checkbox" className="h-4 w-4">` の visual サイズを保つ（業界標準: GitHub / Linear / Asana の table checkbox と同等）。

行 checkbox の `aria-label` は意味のある識別子（タイトル / 予約日時+スペース名 等）を渡し、SR ユーザーが対象を判別できるようにする。`reservation.id.slice(0, 8)` のような技術的識別子は禁止。

## Consequences

- 管理画面 table checkbox の WCAG 2.5.5 Enhanced (AAA) 準拠が一括達成される
- `<input type="checkbox">` の裸配置は table 配下では原則禁止（このパターンを横断 grep で検出）
- 公開ページの checkbox（`agreeToTerms` 等）は既に label wrapper を持つため対象外
- 新規 admin table 追加時は最初から `CheckboxCell` を採用（個別 `<input type="checkbox">` 直書き禁止）
