# assemble.ps1 — Run this AFTER producing 01_public.sql via:
#   $env:SUPABASE_DB_PASSWORD = "<your-db-password>"
#   supabase db dump --linked -s public -f supabase/_baseline/01_public.sql
#
# Usage (from repo root):
#   powershell -File supabase/_baseline/assemble.ps1

$root    = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$srcDir  = Join-Path $root "supabase\_baseline"
$outFile = Join-Path $root "supabase\migrations\00000000000000_baseline_schema.sql"

$blocks = @(
  "00_extensions.sql",
  "01_public.sql",
  "02_storage_buckets.sql",
  "02b_storage_policies.sql",
  "03_cron.sql"
)

foreach ($b in $blocks) {
  $path = Join-Path $srcDir $b
  if (-not (Test-Path $path)) {
    Write-Error "Missing: $path — run supabase db dump first (see comment at top of this file)."
    exit 1
  }
}

$header = @"
-- ============================================================
-- BusAcTa Operations — Baseline Schema
-- Generated: $(Get-Date -Format "yyyy-MM-dd")
-- Supabase project: mkqsrxpfgxovxaabtpld
--
-- Apply to a fresh Supabase project to recreate the full schema
-- in a single step. Idempotent for storage policies; all other
-- objects are created fresh (assumes empty public schema).
--
-- Sections:
--   1. Extensions
--   2. Public schema  (tables, types, functions, RLS policies, grants)
--   3. Storage buckets
--   4. Storage object policies
--   5. Cron jobs  ⚠ update URLs + app.cron_secret for each environment
-- ============================================================

"@

$header | Set-Content -Encoding utf8 $outFile

foreach ($b in $blocks) {
  $path = Join-Path $srcDir $b
  "`n" | Add-Content -Encoding utf8 $outFile
  Get-Content $path -Raw | Add-Content -Encoding utf8 $outFile
  Write-Host "  + $b"
}

$size = (Get-Item $outFile).Length
Write-Host ""
Write-Host "Baseline written to: $outFile"
Write-Host "  Size: $([math]::Round($size / 1KB, 1)) KB"
