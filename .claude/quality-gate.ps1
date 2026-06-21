# quality-gate.ps1 — Stop hook: auto-trigger /code-review, /security-review, /verify
# when source files were modified this turn.
#
# Loop-prevention: a sentinel file .claude/.review-active is created before the
# review cycle fires. The next Stop invocation (after the skills finish) sees the
# sentinel, deletes it, and exits 0 so Claude actually stops.

$repo     = 'E:\Shared Documents\Application Development\BusAcTa Operations'
$sentinel = Join-Path $repo '.claude\.review-active'

# --- If we're completing a review cycle, clear sentinel and let Claude stop ---
if (Test-Path $sentinel) {
    Remove-Item $sentinel -Force -ErrorAction SilentlyContinue
    exit 0
}

# --- Check for modified source files (unstaged or staged, vs HEAD) ---
$changed = & git -C $repo diff HEAD --name-only 2>$null |
           Where-Object { $_ -match '\.(ts|tsx|js|jsx|sql)$' }

if (-not $changed) {
    exit 0
}

# --- Mark review cycle active, then ask Claude to run the three skills ---
New-Item $sentinel -ItemType File -Force | Out-Null

@{
    decision = 'block'
    reason   = 'Source files were modified this turn. Please run /code-review, then /security-review, then /verify on the changes before finishing.'
} | ConvertTo-Json -Compress
