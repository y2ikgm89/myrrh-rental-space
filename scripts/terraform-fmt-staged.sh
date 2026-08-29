#!/usr/bin/env bash
# Lefthook pre-commit: staged な *.tf を terraform fmt にかける。
#
# **lefthook.yml へ直書きしない。** lefthook は `run` を
# `sh -c "<script>"` とダブルクォートで包むので、スクリプト中のダブルクォートが
# そこで引数を切ってしまい `syntax error: unexpected end of file` になる
# （check-commit-msg.sh がファイルに切り出してあるのと同じ理由）。
#
# terraform CLI 未 install の dev 環境では graceful degrade (skip)。
# CI (`terraform fmt -check -recursive`) が最終防衛線として残る。
set -euo pipefail

if [ "$#" -eq 0 ]; then
  exit 0
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "[lefthook] terraform CLI not found — skipping fmt (CI will catch)"
  exit 0
fi

# `terraform fmt [options] [target...]` は target を複数取れる（公式 CLI docs）。
terraform fmt "$@"
