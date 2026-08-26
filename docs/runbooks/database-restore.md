# 本番 DB の復旧（Neon instant restore）

本番 Postgres は Neon。Cloud Run runtime は pooled の `DATABASE_URL`、
Prisma CLI と `prisma-migrate` Job は direct の `DIRECT_URL` を使う
（[`../gcp-production-setup.md`](../gcp-production-setup.md)）。

この文書は「データが消えた・壊れた」ときに**どこまで戻せて、何を失い、戻したあと
何を確かめるか**を書く。日次で行を物理削除する cron
（`/api/cron/data-retention`）を本番で回している以上、復旧できるかどうかを障害の
最中に初めて調べる状態にしてはいけない、というのがこの文書の存在理由。

> **RPO 7 日 / RTO は 2026-08-26 に実測した。**
> ブランチ作成（＝復旧そのもの）は **1.12 秒**、そこから SQL が返るまで含めて
> **約 76 秒**（本番コンソール実測。内訳は下の「リハーサル実測」）。
> **ただしこの数字は復旧手順のうち Neon 側だけを測ったもの**で、アプリを
> 復旧先へ向け直す時間は含まない。

## 先に知っておくこと

### 戻せるのは history window の内側だけ（= RPO の上限）

Neon は変更履歴を保持し、その範囲で「ブランチをその時点へ巻き戻す」。
公式の既定値:

| プラン | 既定   | 上限   | 履歴のストレージ上限 |
| ------ | ------ | ------ | -------------------- |
| Free   | 6 時間 | 6 時間 | **1 GB**             |
| Launch | 1 日   | 7 日   | なし                 |
| Scale  | 1 日   | 30 日  | なし                 |

出典: [History window — Neon Docs](https://neon.com/docs/introduction/history-window)

### このプロジェクトの実値（2026-08-26 確認）

| 項目               | 値                                        |
| ------------------ | ----------------------------------------- |
| プラン             | **Launch**                                |
| project id         | `fancy-feather-97499415`                  |
| root ブランチ      | `production`（`br-empty-block-ao8eq1qb`） |
| リージョン         | AWS Asia Pacific 1 (Singapore)            |
| **history window** | **7 日** ＝ **RPO の上限は 7 日**         |
| snapshot           | 0 件。スケジュールも未設定                |
| history storage    | 0 GB（総ストレージ 59.41 MB）             |

Console の 2 画面が一致している。Settings → History window のスライダーが `7d` の
位置にあり、Backup & Restore が
「Instantly restore this branch to any point in the past **7 day history window**」と
明記している。

#### 6 時間から 7 日へ変えた（2026-08-26）

変更前は **6 時間**だった。Free で作ったプロジェクトを Launch へ上げたあと
window を既定へ戻していなかったためで、**Launch の料金を払いながら Free と同じ
RPO で運用している**状態だった（Launch の既定は 1 日、上限は 7 日）。

日次 03:30 JST の `/api/cron/data-retention` は**行を物理削除する**。
6 時間だと**戻せるのは同日 09:30 JST まで**で、朝の始業なら間に合うが
**昼に気づいたら戻せない**。連休を挟めば確実に手遅れになる。

コストで比較した実数（同 account の 2026-08 実績。単価は Billing 画面）:

| 項目                       | 単価                 | 使用量        | 料金       |
| -------------------------- | -------------------- | ------------- | ---------- |
| Compute                    | —                    | 115.05 CU-hrs | **$12.17** |
| Storage (root branches)    | $0.35 / GB-month     | 0.04 GB-month | $0.02      |
| History（instant restore） | **$0.20 / GB-month** | **0 GB**      | **$0.00**  |
| Snapshots                  | $0.09 / GB-month     | 0 GB          | $0.00      |

history は**書き込み量 × 窓の長さ**で決まり、DB のサイズでは決まらない。
6h で 0 GB なので、7d でも上限は「毎日 DB 全体（59.41 MB）を書き換えた場合」の
7 × 59.41 MB ≒ 0.41 GB ＝ **$0.08/月**。実際はその数分の 1 で、
請求全体（$12.19）の **1% 未満**。

snapshot は作らない。7 日の窓が同じ範囲を覆うのに、スケジュール・保持数・
「止まったときに誰が気づくか」という**監視対象が増える**ため。設定を増やさずに
済む側を選ぶ。

**請求の 99.8% は compute。** コストを下げたいならそちらで、この設定ではない。

確認手順（値が変わったときはここを更新する）:

- Console: Settings → History window（スライダーの現在位置）
  / Backup & Restore（文言に window が出る）
- API: `GET /api/v2/projects/{project_id}` の `history_retention_seconds`
  （21600 = 6 時間 / 86400 = 1 日 / 604800 = 7 日 / 2592000 = 30 日）

### restore は「完全上書き」であって「マージ」ではない

指定時点より後の変更は**全部消える**。ブランチ上の全データベースが対象。
root ブランチのみ対象（子ブランチは PITR 不可）。
出典: [Branch restore — Neon Docs](https://neon.com/docs/guides/branch-restore)

### 接続文字列は変わらないが、接続は切れる

compute が復元後のブランチへ移るのでエンドポイントは同じ。restore 中は接続が
切れ、完了後にアプリが張り直す。`DATABASE_URL` / `DIRECT_URL` の
Secret Manager version を触る必要は**無い**。

### `_prisma_migrations` も一緒に戻る

migration 履歴は DB 内のテーブルなので、restore すればスキーマと履歴が同時に
巻き戻る。**DB 単体では整合する。** 危ないのは「DB だけ戻してアプリは新しい
まま」で、その場合 revision が知らない列を読み書きして 500 になる。
→ 下の Step 3 を必ず通す。

## 手順

### Step 0 — 出荷を止める

復旧が終わるまで Deploy Production を dispatch しない。走行中なら
Actions から cancel する。`terraform-apply` → `deploy` → `migrate` の順に
進むので、途中で DB を戻すと最悪の混線になる。

### Step 1 — 現状を記録する（戻す前に必ず取る）

戻したあと「何をどれだけ失ったか」を言えるようにするための材料。
**restore は上書きなので、この記録を取る前に戻してはいけない。**

```sh
export OUT=/tmp/restore-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT"

# 監査ログの到達点。restore 後の値と引き算すると「失った監査対象操作の件数」になる。
psql "$DIRECT_URL" -At -c "SELECT max(sequence) FROM audit_logs;" | tee "$OUT/audit-max-sequence.txt"

# 構造センサス（CHECK / EXCLUDE / trigger / plpgsql / enum の宣言順まで見る）。
bun scripts/db-census.ts --url "$DIRECT_URL" --out "$OUT/census-before.json"
```

```powershell
$OUT = "$env:TEMP\restore-$(Get-Date -Format yyyyMMddTHHmmssZ)"
New-Item -ItemType Directory -Force $OUT | Out-Null

psql $env:DIRECT_URL -At -c "SELECT max(sequence) FROM audit_logs;" | Tee-Object "$OUT\audit-max-sequence.txt"
bun scripts/db-census.ts --url $env:DIRECT_URL --out "$OUT\census-before.json"
```

`db-census.ts` はローカル実測で **0.3 秒**（列 963 / 制約 918 / index 335 /
trigger 21 / 関数 16 / enum 48 / extension 3 を読む）。本番でも同程度のはず。

### Step 2 — 戻す時点を決めて restore する

時点は RFC 3339（UTC）か LSN。**`--preserve-under-name` は自ブランチへの
restore では必須**で、戻す直前の状態が別ブランチとして保存される。

```sh
# 現在のブランチ一覧（root ブランチ名を確認する）
neon branches list --project-id "$NEON_PROJECT_ID"

# 自分の履歴へ巻き戻す。^self が「このブランチ自身の履歴」を指す。
neon branches restore production '^self@2026-08-24T03:00:00Z' \
  --preserve-under-name "production_before_restore_$(date -u +%Y%m%dT%H%M%SZ)" \
  --project-id "$NEON_PROJECT_ID"
```

API で叩く場合:
`POST /api/v2/projects/{project_id}/branches/{branch_id}/restore`
（`source_branch_id` 必須、`source_timestamp` / `source_lsn` /
`preserve_under_name` は任意）。

**Free プランでは `--preserve-under-name` で作った退避ブランチも 1 GB 枠を
食う。** 復旧確認が済んだら消す（Step 5）。

### Step 3 — アプリのリビジョンを DB に合わせる

DB を過去へ戻したなら、**その時点で動いていた Cloud Run revision へ戻す**。
新しいコードが古いスキーマを叩くと落ちる。手順は
[`production-rollback.md`](production-rollback.md)。

### Step 4 — 検証する

**`prisma migrate status` を整合性の証拠にしない。** 実測（2026-08-24、
Prisma 7.9.1）: 適用済み migration の SQL ファイルを書き換えても
`Database schema is up to date!` と表示して **exit 0** を返す。checksum を
検証しないので、履歴のずれをこれでは見つけられない。

使うのは次の 3 つ。

```sh
# 1. 構造が想定どおりか（before と比べる。差分ゼロで exit 0）
bun scripts/db-census.ts --url "$DIRECT_URL" --out "$OUT/census-after.json"
bun scripts/db-census.ts --diff "$OUT/census-before.json" "$OUT/census-after.json"

# 2. 失った監査対象操作の件数
psql "$DIRECT_URL" -At -c "SELECT max(sequence) FROM audit_logs;"
#    Step 1 の値との差がそのまま失った件数

# 3. 監査ログのハッシュ連鎖が切れていないか
#    /api/cron/audit-log-integrity が日次 04:30 JST に走る。復旧直後は
#    待たずに管理画面の整合性チェックから手動で叩く。
```

センサスは**同じ DB の before / after** で比べること。**PostgreSQL 17 以降は
NOT NULL 制約が `pg_constraint` に行として載る**ため、メジャーバージョンが違う
DB どうしを直接比べると constraints だけが数百件ずれる（`scripts/db-census.ts`
の冒頭 JSDoc に 2026-08-08 の実測: PG 16.11 対 PG 18.4 で 321 対 909）。
2026-08-24 時点では `docker-compose.yml` のローカルも本番 Neon も PG 18 なので
この差は出ないが、片方だけ上げた瞬間に出る。

そのうえで、アプリ側の入口を確認する:

- `PUBLIC_DOMAIN/api/live` が 200
- `ADMIN_DOMAIN/api/health` が 200（DB 到達性を見る唯一のエンドポイント）
- [`post-deploy-verification.md`](post-deploy-verification.md) の smoke

### Step 5 — 後始末

1. 退避ブランチ（`--preserve-under-name` で作ったもの）を、復旧確認後に削除する。
   Free の 1 GB 枠を食い続けるため。

   ```sh
   neon branches delete "<preserved-branch-name>" --project-id "$NEON_PROJECT_ID"
   ```

2. 失ったデータの範囲を、Step 1 と Step 4 の `max(sequence)` の差で記録する。
3. 何が引き金だったかを `docs/audits/` に日付つきで残す。

## 落とし穴

- **`prisma migrate status` は checksum を見ない**（上記、実測済み）。
- **`prisma migrate deploy` も履歴 drift を検知しない。** 復旧後に「とりあえず
  deploy を流して直す」をやらない。先に census で構造を確定させる。
- **領収書の連番は部分リストアに耐える設計になっている。**
  `src/shared/domain/receipts/serial.ts` はカウンタ表の値と「その年の発行済み
  最大値」の大きいほうを採るので、カウンタだけ巻き戻っても発行済み番号を
  再利用しない。復旧後に連番を手で直さないこと。
- **`audit_logs` / `refunds` / `terms_agreements` / `inquiry_status_history` は
  append-only trigger 付き**（`prisma/baseline/invariants.sql`）。復旧後に
  「不要な行を消す」ことは DB が拒否する。これは意図設計。
- **restore はブランチ上の全データベースが対象。** 1 テーブルだけ戻すことは
  できない。テーブル単位で戻したいなら、退避ブランチへ接続して該当行を
  `INSERT ... SELECT` で持ってくる（この経路は未検証）。

## リハーサル実測（2026-08-26）

本番プロジェクト `fancy-feather-97499415` で 1 回通した。**本番ブランチは
一切触っていない** — PITR で子ブランチを 1 本作っただけ。

### 手順と実測

| 手順                                                                                   | 実測                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Neon Console → Branches → New Branch                                                   | —                                                  |
| `Branch data and schema from a past point in time` を選び、3 時間前（18:00 JST）を指定 | —                                                  |
| Auto-delete `After 1 day`（既定のまま）                                                | —                                                  |
| Create を押してからブランチが使えるまで                                                | **1.12 秒**（Neon の "Branch forked in 1.12 sec"） |
| 復旧ブランチで最初の SQL が返るまで                                                    | **133 ms**                                         |
| Create から検証クエリの結果を得るまで（コンソール操作込み）                            | **約 76 秒**                                       |

**1.12 秒が復旧そのものの時間**で、76 秒との差はコンソールを操作していた時間。
障害中に人が同じ画面を辿るなら 76 秒側が現実的な見積りになる。

### 復旧ブランチと本番の突合

同じクエリを両方で流して一致を確認した。

|                                  | 復旧ブランチ | production |
| -------------------------------- | ------------ | ---------- |
| public のテーブル数              | 79           | 79         |
| 適用済み migration               | 11           | 11         |
| 未完了 migration                 | 0            | 0          |
| `spaces` / `pages` / `locations` | 3 / 11 / 3   | 3 / 11 / 3 |
| `reservations` / `customers`     | 0 / 0        | 0 / 0      |

### この演習が証明していないこと

**「過去へ巻き戻せる」ことは証明できていない。** 本番には現時点で取引データが
無く（`reservations` 0 / `customers` 0）、18:00 と現在で中身が変わらないため、
一致していても時間軸を戻した証拠にならない。証明するには**分岐点と現在で値が
違う行**が要る。実データが入ったあとに同じ演習をもう一度回すこと。

証明できたのは次の 3 つ:

- history window 内の任意の時点を指定してブランチを作れる
- 作られたブランチは **schema と migration 履歴が完全**（79 テーブル / 11 件 / 未完了 0）
- 所要時間は秒単位で、分単位の見積りは要らない

### コストと後片付け

復旧ブランチの Storage は **0**（copy-on-write。変更を書くまで消費しない）。
`Auto-delete: After 1 day` を既定のまま使えば**手動削除は不要**。演習で作った
`rto-drill-2026-08-26` は翌日 21:19 JST に自動失効する。

### 本番ブランチに対しては restore を実行しない

restore は上書きで、やり直しが効かない。測るときは必ず子ブランチを作る側で行う。
