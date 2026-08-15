# Hole A Wave 4 (close) Implementation Plan

**Goal:** Hole A を閉じる。他 webhook に決済書込は無い。残った配線 mock 引数と settlement 重複 unit を外す。

## Task 1

- [x] Soft-delete claim no-op を reservation settlement に足す。
- [x] claim/save/failed の where 写経 unit を削除。cancelled orphan は残す。

## Task 2

- [x] `refund-status-updated` / orphan-refund の金額書込 mock 引数を呼出有無に薄める。USD 変換と CRITICAL は残す。

## Task 3

- [x] spec / progress で Hole A 完了を書く。GCal / Resend / SwitchBot は決済書込なし。
