# TFLint config (Sprint 1 Item E — HCL static analysis in PR CI)
#
# Runs in .github/workflows/terraform.yml `validate` job after `terraform validate`.
# Catches GCP-specific anti-patterns that plain `terraform validate` misses
# (invalid enums, mistyped resource IDs, provider schema drift).
#
# Local run: `tflint --init && tflint --recursive --format=compact`
# See docs: https://github.com/terraform-linters/tflint-ruleset-google

# Built-in terraform rules — deprecated syntax, unused declarations,
# naming conventions, module structure. `recommended` preset is the
# curated core rule set (see tflint docs for rule list).
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# Google Cloud provider rules — invalid machine types / regions,
# deprecated resource fields, IAM binding vs member confusion, etc.
# Pinned; renovate/dependabot may bump via .github/renovate.json5 later.
plugin "google" {
  enabled = true
  version = "0.39.0"
  source  = "github.com/terraform-linters/tflint-ruleset-google"
}
