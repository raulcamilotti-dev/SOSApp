param(
    [string]$SqlScript = "scripts\add-admin-user.sql",
    [string]$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
)

$DbHost = "easypanel.sosescritura.com.br"
$DbPort = "5433"
$DbName = "sos-escrituras"
$DbUser = "postgres"
$DbPassword = "rVnF5WSmo7ZWq4"

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
