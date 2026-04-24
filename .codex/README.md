# Codex Project Configuration

This directory contains Codex-native project configuration. It does not depend on `.claude`.

- `config.toml`: project subagent concurrency limits.
- `agents/*.toml`: project custom agents. Filenames match each agent `name`; Codex only spawns them when explicitly asked.
- `rules/default.rules`: experimental command approval policy for commands requested outside the sandbox. Keep rules limited to `prefix_rule` entries with `pattern`, `decision`, `justification`, and `match` / `not_match` examples.
- `hooks.json`: intentionally empty. Codex hooks are experimental and currently disabled on Windows; validation is enforced through `AGENTS.md`, `lefthook`, and CI instead.

Do not put coding standards in `.codex/rules`; Codex rules are command approval rules.

## Local Tooling

- Prefer the user-installed ripgrep at `C:\Users\y2ikg\.local\bin\rg.exe`.
- Do not change ownership or ACLs under `C:\Program Files\WindowsApps` to make the Codex-bundled `rg.exe` executable from PowerShell; that directory is managed by Windows/MSIX app packaging.
- Verify with `Get-Command rg -All` and `rg --version`. If `rg` is unavailable, use PowerShell `Get-ChildItem -LiteralPath ... | Select-String ...` as the fallback.
