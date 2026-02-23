# 🌱 Seed de Dados Fictícios - Motor de Processos

Scripts para popular o banco de dados com dados de teste do Motor de Processos.

## 📦 O que será criado?

- **1 Workflow Template**: "Regularização de Imóveis - Padrão"
- **14 Workflow Steps**: Todas as etapas do processo de regularização
- **15 Transições**: Fluxo linear + transições especiais
- **8 Properties**: Imóveis em diferentes etapas do processo
- **7 Regras de Prazo**: Configurações de SLA por etapa
- **5 Prazos Ativos**: Incluindo prazos vencidos e escalonados
- **3 Logs de Processo**: Histórico de movimentações

## 🚀 Como Usar

### Opção 1: PowerShell (Windows)

```powershell
# Executar diretamente
.\scripts\run-seed.ps1

# Ou com psql manualmente
psql -U postgres -d sosapp -f scripts/seed_data.sql
```

### Opção 2: Bash (Linux/Mac)

```bash
# Dar permissão de execução
chmod +x scripts/run-seed.sh

# Executar
./scripts/run-seed.sh

# Ou com psql manualmente
psql -U postgres -d sosapp -f scripts/seed_data.sql
```

### Opção 3: Cliente PostgreSQL GUI

1. Abra seu cliente SQL (DBeaver, pgAdmin, etc.)
2. Conecte ao banco `sosapp`
3. Abra o arquivo `scripts/seed_data.sql`
4. Execute o script completo

## ⚙️ Configuração

### Variáveis de Ambiente (Opcional)

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=sosapp
export DB_USER=postgres
```

### Pré-requisitos

✅ PostgreSQL instalado e rodando
✅ Banco `sosapp` criado
✅ Migration do processo executada (`2026-02-11_process_engine.sql`)
✅ Pelo menos 1 tenant e 1 usuário no sistema

## 📊 Dados Criados

### Properties de Teste

| Título                                 | Cliente                 | Etapa Atual    |
| -------------------------------------- | ----------------------- | -------------- |
| Lote 15 - Quadra B - Jardim das Flores | João Silva Santos       | Qualificação   |
| Casa 45 - Rua das Acácias              | Maria Oliveira Costa    | Contato        |
| Apartamento 302 - Ed. Solar dos Ventos | Carlos Eduardo Ferreira | Questionário   |
| Terreno Rural - 5.000m²                | Ana Paula Rodrigues     | Contrato       |
| Sala Comercial 18 - Shopping           | Roberto Almeida Ltda    | Docs Faltantes |
| Galpão Industrial 3                    | Indústria XYZ S/A       | Protocolo      |
| Chácara 8 - Condomínio Vale Verde      | Família Silva           | Andamento      |
| Conjunto Comercial - Salas 201 a 205   | Construtora ABC         | Decisão        |

### Prazos de Teste

| Property          | Etapa          | Status                   | Vencimento    |
| ----------------- | -------------- | ------------------------ | ------------- |
| Lote 15           | Qualificação   | Pendente                 | Em 1 dia ⏰   |
| Apartamento 302   | Questionário   | **VENCIDO**              | Há 1 dia ⚠️   |
| Sala Comercial    | Docs Faltantes | **VENCIDO + ESCALONADO** | Há 3 dias 🚨  |
| Galpão Industrial | Protocolo      | Pendente                 | Em 5 dias ✅  |
| Chácara 8         | Andamento      | Pendente                 | Em 10 dias ✅ |

## 🎯 Testando os Dados

### 1. Kanban de Processos

```
Acesse: /Administrador/kanban-processos
```

Você verá:

- 8 colunas (etapas com imóveis)
- 1 imóvel em cada etapa
- Cores diferentes por etapa
- Contador de imóveis por coluna

**Teste:**

- Long press em um card para mover entre etapas
- Verifique que apenas transições válidas são permitidas

### 2. Gestor de Prazos

```
Acesse: /Administrador/gestor-prazos-processos
```

Você verá:

- 5 prazos listados
- 1 pendente (verde)
- 1 vencido (vermelho)
- 1 vencido e escalonado (vermelho + badge)
- Contadores de dias restantes

**Teste:**

- Filtros: Todos / Pendentes / Vencidos / Escalonados
- Marcar prazo como concluído
- Escalonar prazo vencido

### 3. Inicializar Template

```
Acesse: /Administrador/inicializar-workflow
```

**Teste:**

- Se já executou o seed, verá mensagem "Template já existe"
- Caso contrário, crie o template padrão

## 🔄 Executar Novamente

O script é **idempotente**:

- Se o template já existe, reutiliza
- Se as etapas já existem, não recria
- Properties sempre serão criadas novamente

Para limpar e recriar tudo:

```sql
-- ATENÇÃO: Isso apaga TODOS os dados de processo!
DELETE FROM process_logs WHERE tenant_id = 'seu-tenant-id';
DELETE FROM process_deadlines WHERE tenant_id = 'seu-tenant-id';
DELETE FROM deadline_rules WHERE tenant_id = 'seu-tenant-id';
DELETE FROM workflow_step_transitions WHERE tenant_id = 'seu-tenant-id';
DELETE FROM properties WHERE template_id IS NOT NULL;
DELETE FROM workflow_steps WHERE template_id = 'template-id';
DELETE FROM workflow_templates WHERE name = 'Regularização de Imóveis - Padrão';

-- Agora execute o seed novamente
```

## ❓ Troubleshooting

### Erro: "Nenhum tenant encontrado"

```sql
-- Criar tenant de teste
INSERT INTO tenants (id, name, created_at)
VALUES (gen_random_uuid(), 'Empresa Teste', CURRENT_TIMESTAMP);
```

### Erro: "Nenhum usuário encontrado"

```sql
-- Criar usuário de teste
INSERT INTO users (id, tenant_id, cpf, email, full_name, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  '12345678900',
  'teste@teste.com',
  'Usuário Teste',
  CURRENT_TIMESTAMP
);
```

### Erro: "relation properties does not exist"

Execute primeiro a migration do processo:

```bash
psql -U postgres -d sosapp -f scripts/migrations/2026-02-11_process_engine.sql
```

## 📝 Notas

- O script usa o **primeiro tenant** encontrado no banco
- O script usa o **primeiro usuário** encontrado no banco
- Os IDs são gerados automaticamente (UUID)
- As datas são relativas ao momento da execução

## 🎨 Cores das Etapas

Cada etapa tem uma cor única para facilitar visualização no Kanban:

1. Qualificação → 🔵 Azul Índigo (#6366f1)
2. Contato → 🟣 Roxo (#8b5cf6)
3. Indicação → 🩷 Rosa (#ec4899)
4. Resumo → 🔴 Vermelho (#f43f5e)
5. Questionário → 🟠 Laranja (#f59e0b)
6. Procuração → 🟡 Amarelo (#eab308)
7. Contrato → 🟢 Lima (#84cc16)
8. Docs Entregues → 🟢 Verde (#22c55e)
9. Docs Faltantes → 🟢 Esmeralda (#10b981)
10. Protocolo → 🔵 Teal (#14b8a6)
11. Andamento → 🔵 Ciano (#06b6d4)
12. Decisão → 🔵 Azul Céu (#0ea5e9)
13. Recurso → 🔵 Azul (#3b82f6)
14. Registro Entregue → 🟢 Verde (#22c55e) ✓ TERMINAL

---

**Criado em**: 2026-02-11  
**Autor**: GitHub Copilot  
**Versão**: 1.0.0
