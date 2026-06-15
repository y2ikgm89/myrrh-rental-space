#!/bin/sh
# Resilient `bun install --frozen-lockfile` for CI / Docker (cold-cache) builds.
#
# Root cause this guards against:
#   Bun 1.3.13 introduced *streaming* tarball extraction — package tarballs are
#   extracted while they are still downloading (download and extraction are
#   coupled), instead of buffering the whole .tgz first.
#   https://bun.com/blog/bun-v1.3.13
#   On a cold cache, a transient network short-read while downloading a LARGE
#   tarball aborts extraction with "Fail extracting tarball" and fails the whole
#   frozen install. The biggest tarball in this tree is @prisma/studio-core
#   (~39 MB unpacked), pulled in by prisma 7.x and required even by
#   `prisma generate`, so it cannot be omitted. The failure is network-only:
#   the identical image + lockfile installs cleanly on retry and locally.
#
#   We cannot patch Bun's extractor and cannot move off 1.3.13 — 1.3.14+ enables
#   `[run] noOrphans`, which breaks Lexical's dynamic-import path (see
#   bunfig.toml). So the install itself is made resilient: bounded retries, and
#   on retry a cleared download cache + reduced network concurrency so the large
#   tarball gets a stable, uncontended stream instead of competing with 48
#   concurrent downloads.
#
# Override the attempt count with BUN_INSTALL_ATTEMPTS (default 3). A genuine,
# non-transient failure still fails the build loudly after the last attempt.

attempts="${BUN_INSTALL_ATTEMPTS:-3}"
i=1
while [ "$i" -le "$attempts" ]; do
  if [ "$i" -eq 1 ]; then
    bun install --frozen-lockfile
  else
    echo ">>> bun-ci-install: retry ${i}/${attempts} — clearing cache + --network-concurrency 4" >&2
    bun pm cache rm || true
    bun install --frozen-lockfile --network-concurrency 4
  fi
  status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  echo ">>> bun-ci-install: attempt ${i}/${attempts} failed (exit ${status})" >&2
  i=$((i + 1))
done
echo ">>> bun-ci-install: bun install --frozen-lockfile failed after ${attempts} attempts" >&2
exit 1
