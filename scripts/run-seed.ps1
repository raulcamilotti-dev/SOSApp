# Script para executar seed de dados fictícios no banco
# Autor: GitHub Copilot
# Data: 2026-02-11

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SEED DE DADOS FICTÍCIOS - MOTOR DE PROCESSOS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Parâmetros de conexão (ajustar conforme necessário)
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "sosapp"
$DB_USER = "postgres"

Write-Host "Configuração:" -ForegroundColor Yellow
Write-Host "  Host: $DB_HOST" -ForegroundColor Gray
Write-Host "  Port: $DB_PORT" -ForegroundColor Gray
Write-Host "  Database: $DB_NAME" -ForegroundColor Gray
Write-Host "  User: $DB_USER" -ForegroundColor Gray
Write-Host ""

# Verificar se psql está disponível
try {
    $null = Get-Command psql -ErrorAction Stop
    Write-Host "✓ psql encontrado" -ForegroundColor Green
} catch {
    Write-Host "✗ psql não encontrado no PATH" -ForegroundColor Red
    Write-Host "Instale o PostgreSQL Client ou adicione ao PATH" -ForegroundColor Red
    exit 1
}

# Arquivo de seed
$SEED_FILE = "scripts/seed_data.sql"

if (-not (Test-Path $SEED_FILE)) {
    Write-Host "✗ Arquivo $SEED_FILE não encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Arquivo de seed encontrado" -ForegroundColor Green
Write-Host ""

# Confirmar execução
Write-Host "Este script irá criar:" -ForegroundColor Yellow
Write-Host "  • 1 Workflow Template" -ForegroundColor White
Write-Host "  • 14 Workflow Steps (etapas)" -ForegroundColor White
Write-Host "  • 15 Transições entre etapas" -ForegroundColor White
Write-Host "  • 8 Properties (imóveis) de teste" -ForegroundColor White
Write-Host "  • 7 Regras de prazo" -ForegroundColor White
Write-Host "  • 5 Prazos ativos" -ForegroundColor White
Write-Host "  • 3 Logs de processo" -ForegroundColor White
Write-Host ""

$confirmation = Read-Host "Deseja continuar? (s/n)"
if ($confirmation -ne 's' -and $confirmation -ne 'S') {
    Write-Host "Operação cancelada" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Executando seed..." -ForegroundColor Cyan

# Executar seed
$env:PGPASSWORD = Read-Host "Digite a senha do PostgreSQL" -AsSecureString | ConvertFrom-SecureString

try {
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $SEED_FILE
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✓ SEED EXECUTADO COM SUCESSO!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Próximos passos:" -ForegroundColor Yellow
        Write-Host "  1. Inicie o app: npm start" -ForegroundColor White
        Write-Host "  2. Acesse: /Administrador/kanban-processos" -ForegroundColor White
        Write-Host "  3. Ou acesse: /Administrador/gestor-prazos-processos" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "✗ Erro ao executar seed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Erro: $_" -ForegroundColor Red
    exit 1
}
