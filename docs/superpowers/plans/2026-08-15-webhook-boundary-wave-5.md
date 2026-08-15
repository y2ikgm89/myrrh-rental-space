# Hole A Wave 5 (Approach A leftover) Implementation Plan

**Goal:** 閉じた契約を壊さず、残った金額書込 mock 引数とイベント finalize の where 写経を外す。

- [x] routing / orphan-claim の金額書込 mock 引数を呼出有無にする（#2338）。
- [x] イベント finalizeSettled を実 DB 累積判定の正本にする。
- [x] 予約・イベントの finalizeSettled where 写経 unit を削除。cancelled orphan は残す。
