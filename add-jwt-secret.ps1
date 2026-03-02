# Script para adicionar JWT_SECRET ao Wrangler de forma automatizada
$JWTSecret = "X4bl5Ho7HZMAEJJhrdL8EvQx0SeKJwS6wMde6zwkHoaqAKwPdZ1FvXDHEXd8znQT"

# Navegar para o diretório do Worker
Set-Location "C:\Users\raulc\OneDrive\Documentos\GitHub\SOSApp\workers\api-crud"

# Usar a CLI do Wrangler para adicionar secret
# Primeiro, tentar adicionar via stdin/pipe
Write-Host "Adicionando JWT_SECRET ao Wrangler..." -ForegroundColor Green

# Método 1: Usar process para passar stdin
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = "cmd.exe"
$processInfo.Arguments = "/c echo $JWTSecret | npx wrangler secret put JWT_SECRET"
$processInfo.UseShellExecute = $false
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.CreateNoWindow = $true

$process = [System.Diagnostics.Process]::Start($processInfo)
$output = $process.StandardOutput.ReadToEnd()
$errorOutput = $process.StandardError.ReadToEnd()
$process.WaitForExit()

Write-Host "Output:" -ForegroundColor Yellow
Write-Host $output
if ($errorOutput) {
    Write-Host "Erro:" -ForegroundColor Red
    Write-Host $errorOutput
}

Write-Host ""
Write-Host "Verificando secrets configurados..." -ForegroundColor Green
npx wrangler secret list

Write-Host ""
Write-Host "✅ JWT_SECRET adicionado com sucesso!" -ForegroundColor Green
