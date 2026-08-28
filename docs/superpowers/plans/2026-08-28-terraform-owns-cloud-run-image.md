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

| PR  | 内容                                                                                | 検証                                    |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | `image_tag` 変数と `local.<surface>_template` の導入（挙動不変・値は現行と同じ）    | drift plan が `No changes`              |
| 2   | template block が local しか参照しないことの gate                                   | 変異検査                                |
| 3   | deploy workflow に apply #3 を追加（cloudbuild の deploy step はまだ残す）          | 実 deploy で 2 重適用が無害なことを確認 |
| 4   | cloudbuild の deploy step 3 つを削除、`ignore_changes` から image と traffic を外す | 実 deploy                               |
| 5   | `revision` を明示、`ignore_changes` から revision を外す                            | drift plan が `No changes`              |

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
