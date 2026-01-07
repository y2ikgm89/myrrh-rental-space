# Bug Report: Syntax error in [posttooluse-tampering-detector.sh](http://posttooluse-tampering-detector.sh)

## Summary

`posttooluse-tampering-detector.sh` causes a syntax error due to improper heredoc syntax with `|| true` on the same line.

## Environment

- **Plugin**: claude-code-harness
- **Version**: 2.6.39
- **OS**: WSL2 (Linux 6.6.87.2-microsoft-standard-WSL2)
- **Bash Version**: GNU bash 5.2.21(1)-release

## Error Message

```
PostToolUse:Edit hook blocking error:
/home/user/.claude/plugins/cache/claude-code-harness-marketplace/claude-code-harness/2.6.39/scripts/posttooluse-tampering-detector.sh: line 76: syntax error near unexpected token `||'
```

## Root Cause

Line 39 of `posttooluse-tampering-detector.sh` contains problematic heredoc syntax:

```bash
# Current (problematic)
eval "$(echo "$INPUT" | python3 - <<'PY' 2>/dev/null || true
import json, shlex, sys
...
PY
)"
```

The `|| true` placed on the same line as the heredoc delimiter `<<'PY'` causes ambiguous parsing in bash 5.x. The error is reported at line 76 (`return 1`) because bash detects the syntax error later during parsing.

## Affected Files

Only one file is affected:

- `scripts/posttooluse-tampering-detector.sh` (line 39)

Other scripts using similar heredoc patterns do NOT have this issue because they don't include `|| true` on the same line:

- `auto-test-runner.sh:23` - `<<'PY' 2>/dev/null` (OK)
- `skill-child-reminder.sh:27` - `<<'PY' 2>/dev/null` (OK)
- `pretooluse-guard.sh:103` - `<<'PY' 2>/dev/null` (OK)

## Suggested Fix

Move `|| true` after the heredoc closes:

```bash
# Option A: Move || true after the command substitution
eval "$(echo "$INPUT" | python3 - <<'PY' 2>/dev/null
import json, shlex, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
tool_name = data.get("tool_name") or ""
tool_input = data.get("tool_input") or {}
file_path = tool_input.get("file_path") or ""
old_string = tool_input.get("old_string") or ""
new_string = tool_input.get("new_string") or ""
content = tool_input.get("content") or ""
print(f"TOOL_NAME={shlex.quote(tool_name)}")
print(f"FILE_PATH={shlex.quote(file_path)}")
print(f"OLD_STRING={shlex.quote(old_string)}")
print(f"NEW_STRING={shlex.quote(new_string)}")
print(f"CONTENT={shlex.quote(content)}")
PY
)" || true
```

Or simply remove `|| true` since errors are already suppressed by `2>/dev/null`:

```bash
# Option B: Remove || true (simpler)
eval "$(echo "$INPUT" | python3 - <<'PY' 2>/dev/null
...
PY
)"
```

## Impact

- **Severity**: Low (file operations succeed despite the error)
- **User Experience**: Error messages appear after every Edit/Write operation
- **Affected Users**: All users with bash 5.x (Linux, WSL2, Mac with Homebrew bash)

## Steps to Reproduce

1. Install claude-code-harness plugin v2.6.39
2. Use Claude Code to edit any file
3. Observe the hook blocking error in the output

## Workaround

Users can temporarily work around this by:

1. Manually editing line 39 of the script
2. Disabling the hook in settings

---

**Reporter**: Claude Code user
**Date**: 2026-01-07