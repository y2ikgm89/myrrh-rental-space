# Cloud Run の所有者を Terraform 一本にする

## なぜ必要か

`google_cloud_run_v2_service` は **clean な drift と template の update を両立できない。**
`lifecycle.ignore_changes` は差分を無視するだけでなく **prior state の値を plan に固定して
送信させる**ため、`template[0].revision` を ignore すると env 変更が

    Error 409: Revision named '...' with different configuration already exists.

で落ちる（2026-08-27 の本番デプロイが実際にこれで落ちた）。ignore を外すと update は
通るが、API が返す revision 名が state に入る一方 config は空のままなので

    Plan: 0 to add, 1 to change, 0 to destroy.
      - revision = "myrrh-rental-space-01028-wer" -> null

が**恒久的に残る**。`terraform-drift.yml` は drift を検知すると Issue を開き、drift の
無い run が来るまで閉じないので、**毎晩コメントが積み続ける**（実際に #2756 で発生中）。

上流は未解決:

- https://github.com/hashicorp/terraform-provider-google/issues/14569（409、open）
- https://github.com/hashicorp/terraform-provider-google/issues/17218（恒久 drift）

v1 の `autogenerate_revision_name` に相当するものが v2 に無いことが原因。
**Google 公式にもこの構成（Terraform が service を持ち、CI が image を差し替える）
に対する推奨は存在しない**（"Migrating Terraform resources stably to Cloud Run API
version 2" にも記載なし）。

## 根本原因

**Cloud Build と Terraform が同じ resource を二重管理している。** 所有者が 2 つある限り
どちらかが必ず嘘をつく。所有者を 1 つにするしかない。

## 方針: Terraform を唯一の所有者にする

`cloudbuild.yaml` の `deploy-public` / `deploy-cron` / `deploy-admin`（`gcloud run
services update --image`）を廃止し、image tag を変数で Terraform に渡す。

### revision 名は「template の内容」から決定的に導く

所有者を 1 つにしても、`revision` を宣言しない限り drift は消えない（config が null で
API が名前を返すため）。したがって **`revision` を明示する**。

素朴に image tag だけから導くと、**同じ tag のまま env を変えたときに「同名・別内容」に
なって 409 が再発する**。これを避けるため、**template に入る値すべてを 1 つの local に
集約し、その local のハッシュを名前に使う**:

```hcl
locals {
  public_template = {
    image_tag = var.image_tag
    env       = local.cloud_run_public_env
    cpu       = "1"
    memory    = "512Mi"
    # …template に入るものは全てここに置く
  }
}

resource "google_cloud_run_v2_service" "public" {
  template {
    revision = "${var.service_name}-${substr(sha256(jsonencode(local.public_template)), 0, 8)}"
    # 以降、template 内は local.public_template からしか読まない
  }
}
```

**この形の肝は「template block が local 以外を参照しない」こと。** そうであれば
ハッシュは定義上 template 全体を覆う。参照漏れがあるとその項目の変更が 409 になるので、
**gate で「template block 内の参照が local.<surface>_template に限られる」ことを固定する。**

### apply は 2 回に分ける

image は apply 時点で**実在していなければ create/update が落ちる**（2026-08-27 に
`:placeholder` で実証済み）。一方 IAM は build より前に無いと push できない。よって:

| 順  | job                                        | image_tag に渡す値                          |
| --- | ------------------------------------------ | ------------------------------------------- |
| 1   | Terraform Apply (IAM prereq)               | **現在デプロイ済みの tag**（live から読む） |
| 2   | Cloud Build（build + push + migrate のみ） | —                                           |
| 3   | Terraform Apply (services)                 | `$SHORT_SHA`                                |

1 は service に対しては no-op になる。3 で初めて image が動く。

### 併せて消えるもの

`traffic` の `ignore_changes` は「terraform-apply が deploy より**前**に走るので、pin 中の
修正デプロイで壊れた LATEST に戻る」ための回避だった（`cloud_run_public.tf`）。
apply が build の**後**に来ればこの障害窓自体が無くなるので、**ignore を外せる**。
`--to-latest` も不要になる。

## 段階

| PR  | 内容                                                                                | 検証                                                      |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `local.cloud_run_<surface>_template` の導入（挙動不変・値は現行と同じ）             | drift plan の差分が**増えない**（revision の 1 件のまま） |
| 2   | template block が local しか参照しないことの gate                                   | 変異検査                                                  |
| 3   | deploy workflow に apply #3 を追加（cloudbuild の deploy step はまだ残す）          | 実 deploy で 2 重適用が無害なことを確認                   |
| 4   | cloudbuild の deploy step 3 つを削除、`ignore_changes` から image と traffic を外す | 実 deploy                                                 |
| 5   | `revision` を明示、`ignore_changes` から revision を外す                            | drift plan が `No changes`                                |

**PR 1 の検証基準の訂正（2026-08-28）。** 当初この表は PR 1 の基準を「drift plan が `No changes`」と書いていたが誤り。`revision` の恒久差分は PR 5 まで残るので PR 1 で `No changes` にはならない。正しい基準は**差分が増えないこと**。

`image_tag` 変数も PR 1 では入れない。image はまだ `ignore_changes` の対象で、変数を作っても未使用になるだけ。image の所有権を移す PR 4 で導入する。

**PR 5 まで通って初めて drift が clean になる。** 途中で止めると今より悪くなる箇所は無い
（各 PR は単体で挙動不変か、より正しい状態）。

## 危険なところ

- **検証は本番 deploy を回すしかない。** staging が無い。PR 3 と 4 は deploy 1 回ずつ要る。
- 2026-08-27 に **3 回連続で deploy を壊した経路**そのものを触る。1 PR ずつ、間に deploy を
  挟んで進めること。まとめて出さない。
- `local.<surface>_template` への集約漏れは **その項目を変えた将来の誰か**が 409 を踏む形で
  現れる。gate（PR 2）を先に入れてから PR 5 へ進む。

## やらない選択肢と、その理由

| 案                                 | なぜ採らないか                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `revision` を再び ignore する      | drift は消えるが env 変更のたびに deploy が 409 で落ちる。今回のプロジェクトだけで env を 3 つ足しており「稀」とは言えない |
| drift 検知側で当該差分を除外する   | 免除の入口を増やす。CLAUDE.md が明示的に禁じている                                                                         |
| image tag だけで revision 名を作る | 同じ tag で env を変えると「同名・別内容」で 409 が再発する                                                                |

## 段階分割は成立しない（2026-08-28 の検証結果）

**PR 3 に着手して分かった。PR 3 / 4 / 5 は分けて入れられない。** どれも単独では
無意味か危険で、3 つ同時に入れるしかない。つまりこれは「5 つの小さな PR」ではなく
**deploy 経路への 1 回の大きな変更**である。

| 単独で入れた場合                                               | 帰結                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 3（apply を build の後ろへ）                                | Terraform が `revision -> null` の差分で revision を作り、**canary 検証を経ていない revision へ traffic が移る**。`.github/workflows/deploy-production.yml` の「Verify canary revision before promoting」が無効化される |
| PR 4（Terraform が image を所有、apply は前のまま）            | apply 時点で image が存在しない。2026-08-27 の `:placeholder` と同じ失敗                                                                                                                                                |
| PR 5（`revision` を明示、cloudbuild は revision を作り続ける） | 宣言した名前と実際の自動採番名が食い違い、apply のたびに revision を作ろうとする                                                                                                                                        |

### 計画が見落としていたもの

1. **canary / promote との衝突。** public は `--no-traffic --tag=canary` で出して
   GHA が canary URL を検証してから `--to-latest` で昇格する。Terraform が後から
   revision を作ると、この検証を迂回して traffic が移る。
2. **migrate job。** `terraform/cloud_run_migrate_job.tf` も同じ二重管理
   （image は Cloud Build、Terraform は `ignore_changes`）。所有者を一本化するなら
   ここも含める必要があるが、計画は Cloud Run service 3 つしか見ていなかった。
3. **deploy workflow に結合した gate が 8 本ある。** `deploy-plan-artifact-no-binary`
   は plan artifact の中身を検査し、`terraform-detailed-exitcode` は
   `terraform_wrapper: false` を固定している。job を reusable workflow へ切り出すと
   これらの読む先が全て変わる。**安全 gate の大量書き換えはミスが紛れ込む場所。**

### 改めての評価

- **得られるもの**: drift の Issue が静かになる。費用も機能も変わらない
- **払うもの**: canary / promote・image 所有権・migrate job・gate 8 本を巻き込む
  **1 回の atomic な変更**と、それを検証する本番 deploy。staging は無い
- **背景**: この deploy 経路は 2026-08-27 に 3 回連続で壊れている

**PR 1 / 2 はここで止めても何も悪くしていない。** template の集約と gate は単体で
有効で、将来この作業を再開するときの土台としてそのまま使える。drift の状況は
着手前と同じ（Issue が開いたまま、実害は通知ノイズのみ）。

### 再開するなら

3/4/5 を 1 つの PR にまとめ、**本番 deploy を 1 回で通す前提**で設計し直すこと。
分割して安全に進む道は無い。その際は migrate job と gate 8 本を最初から範囲に含める。
