param(
    [string]$SqlScript = "scripts\add-admin-user.sql",
    [string]$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    [string]$DbHost = $env:DB_HOST,
    [string]$DbPort = $env:DB_PORT,
    [string]$DbName = $env:DB_NAME,
    [string]$DbUser = $env:DB_USER,
    [string]$DbPassword = $env:DB_PASSWORD
)

if (-not $DbHost) { $DbHost = "localhost" }
if (-not $DbPort) { $DbPort = "5432" }

if (-not $DbName -or -not $DbUser) {
    Write-Host "Missing required DB config. Set DB_NAME and DB_USER (params or env vars)." -ForegroundColor Red
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  `$env:DB_HOST='localhost'" -ForegroundColor Gray
    Write-Host "  `$env:DB_PORT='5432'" -ForegroundColor Gray
    Write-Host "  `$env:DB_NAME='sos-escrituras'" -ForegroundColor Gray
    Write-Host "  `$env:DB_USER='postgres'" -ForegroundColor Gray
    Write-Host "  `$env:DB_PASSWORD='your_password'" -ForegroundColor Gray
    exit 1
}

if (-not $DbPassword) {
    $securePwd = Read-Host "Digite a senha do PostgreSQL" -AsSecureString
    $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
    try {
        $DbPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if (-not (Test-Path $PsqlPath)) {
    Write-Host "psql not found at: $PsqlPath" -ForegroundColor Red
    exit 1
}

Write-Host "Connecting to PostgreSQL..." -ForegroundColor Cyan
Write-Host "Host: $DbHost"
Write-Host "Database: $DbName"

$env:PGPASSWORD = $DbPassword

Write-Host ""
Write-Host "Executing SQL setup..." -ForegroundColor Yellow

& $PsqlPath -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $SqlScript

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Success! SQL executed." -ForegroundColor Green

    if ($SqlScript -like "*add-admin-user.sql") {
        Write-Host ""
        Write-Host "Verifying user..." -ForegroundColor Cyan
        Write-Host ""
        & $PsqlPath -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT u.cpf, r.nome as role FROM usuarios u LEFT JOIN user_tenants ut ON u.id_usuario = ut.id_usuario LEFT JOIN roles r ON ut.id_role = r.id_role WHERE u.cpf = '07745448999';"
    }
} else {
    Write-Host ""
    Write-Host "Error running setup" -ForegroundColor Red
}

Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done." -ForegroundColor Gray
