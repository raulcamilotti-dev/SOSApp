# Script Bash para executar seed de dados fictícios no banco
# Autor: GitHub Copilot
# Data: 2026-02-11

#!/bin/bash

echo "========================================"
echo "SEED DE DADOS FICTÍCIOS - MOTOR DE PROCESSOS"
echo "========================================"
echo ""

# Parâmetros de conexão (ajustar conforme necessário)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-sosapp}"
DB_USER="${DB_USER:-postgres}"

echo "Configuração:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Verificar se psql está disponível
if ! command -v psql &> /dev/null; then
    echo "✗ psql não encontrado no PATH"
    echo "Instale o PostgreSQL Client"
    exit 1
fi

echo "✓ psql encontrado"

# Arquivo de seed
SEED_FILE="scripts/seed_data.sql"

if [ ! -f "$SEED_FILE" ]; then
    echo "✗ Arquivo $SEED_FILE não encontrado"
    exit 1
fi

echo "✓ Arquivo de seed encontrado"
echo ""

# Confirmar execução
echo "Este script irá criar:"
echo "  • 1 Workflow Template"
echo "  • 14 Workflow Steps (etapas)"
echo "  • 15 Transições entre etapas"
echo "  • 8 Properties (imóveis) de teste"
echo "  • 7 Regras de prazo"
echo "  • 5 Prazos ativos"
echo "  • 3 Logs de processo"
echo ""

read -p "Deseja continuar? (s/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Operação cancelada"
    exit 0
fi

echo ""
echo "Executando seed..."

# Executar seed
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✓ SEED EXECUTADO COM SUCESSO!"
    echo "========================================"
    echo ""
    echo "Próximos passos:"
    echo "  1. Inicie o app: npm start"
    echo "  2. Acesse: /Administrador/kanban-processos"
    echo "  3. Ou acesse: /Administrador/gestor-prazos-processos"
    echo ""
else
    echo ""
    echo "✗ Erro ao executar seed"
    exit 1
fi
