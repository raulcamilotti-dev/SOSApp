param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$PsqlPath = "psql"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationPath = Join-Path $root "migrations\add-channel-partners.sql"

if (!(Test-Path $migrationPath)) {
  Write-Error "Migration file not found: $migrationPath"
  exit 1
}

Write-Host "Running migration: $migrationPath"
& $PsqlPath $DatabaseUrl -f $migrationPath

if ($LASTEXITCODE -ne 0) {
  Write-Error "Migration failed. Exit code: $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Migration completed successfully."
