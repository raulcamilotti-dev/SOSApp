# Estudo de Provisionamentos — Radul Platform

## 1. O Que São Provisões Contábeis

### 1.1 Definição (CPC 25 / IAS 37 / NBC TG 25)

Uma **provisão** é um passivo de prazo ou valor incerto. Diferente de uma conta a pagar (passivo certo), a provisão reconhece uma **obrigação presente** cujo valor exato ou data de liquidação ainda não são conhecidos com precisão, mas podem ser estimados de forma confiável.

> **CPC 25:** "Provisão é um passivo de prazo ou de valor incertos."
>
> **IAS 37:** "A provision is a liability of uncertain timing or amount."

### 1.2 Critérios de Reconhecimento

Para reconhecer uma provisão, **todos os 3 critérios** devem ser atendidos:

| #   | Critério                       | Descrição                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------- |
| 1   | **Obrigação presente**         | Existe uma obrigação legal ou construtiva como resultado de evento passado |
| 2   | **Saída provável de recursos** | É provável que será necessário desembolso para liquidar a obrigação        |
| 3   | **Estimativa confiável**       | O valor da obrigação pode ser estimado de forma confiável                  |

### 1.3 Provisão vs Conta a Pagar vs Contingência

| Conceito          | Certeza do valor | Certeza do prazo | Tratamento                             |
| ----------------- | ---------------- | ---------------- | -------------------------------------- |
| **Conta a Pagar** | Valor certo      | Prazo certo      | Registra no passivo circulante         |
| **Provisão**      | Valor estimado   | Prazo estimado   | Registra no passivo + despesa na DRE   |
| **Contingência**  | Valor incerto    | Prazo incerto    | Apenas divulga em notas (não registra) |

### 1.4 Por Que Provisões São Essenciais no DRE de Competência

O **regime de competência** exige que despesas sejam reconhecidas no período em que o fato gerador ocorre, **não quando o pagamento é feito**. Sem provisões:

- **13º salário**: A empresa paga em dezembro, mas o fato gerador é o trabalho de cada mês. Sem provisão, o DRE de janeiro a novembro mostra lucro inflado, e dezembro mostra prejuízo artificial.
- **Férias**: Cada mês trabalhado gera 1/12 do direito a férias. Sem provisão, a despesa só aparece quando o funcionário tira férias.
- **IRPJ/CSLL**: O imposto é devido sobre o lucro apurado mês a mês, mesmo que o pagamento seja trimestral ou anual.

**Resumo:** Provisões corrigem a distorção temporal do DRE, distribuindo despesas futuras certas (ou altamente prováveis) pelo período em que foram geradas.

---

## 2. Tipos de Provisões Relevantes para o SOSApp

### 2.1 Provisões Trabalhistas (RH)

#### 2.1.1 Provisão para 13º Salário

| Aspecto              | Detalhe                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| **Fato gerador**     | Cada mês trabalhado gera 1/12 do salário como obrigação                        |
| **Pagamento**        | 1ª parcela até 30/11, 2ª parcela até 20/12                                     |
| **Cálculo mensal**   | `salário_bruto / 12` por funcionário                                           |
| **Encargos**         | FGTS (8%) + INSS patronal (~28,8%) incide sobre o 13º                          |
| **Fórmula completa** | `(salário / 12) × (1 + 0,08 + 0,288)` ou simplificado `(salário / 12) × 1,368` |

**Exemplo prático:**

- Salário bruto: R$ 5.000,00
- Provisão mensal 13º: R$ 5.000 / 12 = R$ 416,67
- Encargos sobre 13º: R$ 416,67 × 0,368 = R$ 153,33
- **Total mensal por funcionário: R$ 570,00**

#### 2.1.2 Provisão para Férias

| Aspecto                      | Detalhe                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Fato gerador**             | Cada mês trabalhado gera 1/12 do direito a férias                         |
| **Adicional constitucional** | 1/3 sobre o valor das férias (art. 7º, XVII, CF)                          |
| **Pagamento**                | Quando o funcionário sai de férias (pode ser 12+ meses depois)            |
| **Cálculo mensal**           | `(salário_bruto / 12) × (1 + 1/3)` por funcionário                        |
| **Encargos**                 | FGTS (8%) + INSS patronal (~28,8%) incide sobre férias                    |
| **Fórmula completa**         | `(salário / 12) × (4/3) × (1 + 0,08 + 0,288)` ou `(salário / 12) × 1,824` |

**Exemplo prático:**

- Salário bruto: R$ 5.000,00
- Provisão mensal férias: R$ 5.000 / 12 × 4/3 = R$ 555,56
- Encargos sobre férias: R$ 555,56 × 0,368 = R$ 204,44
- **Total mensal por funcionário: R$ 760,00**

#### 2.1.3 Provisão para FGTS

| Aspecto          | Detalhe                                                     |
| ---------------- | ----------------------------------------------------------- |
| **Fato gerador** | Cada mês de trabalho gera obrigação de 8% sobre remuneração |
| **Pagamento**    | Até o 7º dia útil do mês seguinte                           |
| **Cálculo**      | `salário_bruto × 0,08`                                      |

> **Nota:** O FGTS sobre o salário mensal já aparece como despesa no mês correto por ser pago no mês seguinte. Porém, o FGTS sobre 13º e férias precisa ser provisionado junto com essas rubricas. Na fórmula acima, já está incluído.

#### 2.1.4 Resumo — Provisão Total Trabalhista por Funcionário/Mês

| Rubrica                 | Fórmula            | % do salário | Exemplo (R$ 5.000) |
| ----------------------- | ------------------ | ------------ | ------------------ |
| 13º + encargos          | `(sal/12) × 1,368` | 11,4%        | R$ 570,00          |
| Férias + 1/3 + encargos | `(sal/12) × 1,824` | 15,2%        | R$ 760,00          |
| **Total**               | —                  | **~26,6%**   | **R$ 1.330,00**    |

> **Para 10 funcionários com salário médio de R$ 3.000:** provisão mensal de ~R$ 7.980,00 em despesas que, sem provisão, não aparecem no DRE até o pagamento efetivo.

### 2.2 Provisões Tributárias

#### 2.2.1 Provisão para IRPJ (Imposto de Renda Pessoa Jurídica)

| Aspecto             | Detalhe                                                             |
| ------------------- | ------------------------------------------------------------------- |
| **Base de cálculo** | Lucro Real, Presumido ou Simples (depende do regime)                |
| **Alíquota**        | 15% sobre lucro + adicional de 10% sobre excedente de R$ 20.000/mês |
| **Apuração**        | Trimestral (mar, jun, set, dez) ou mensal com ajuste anual          |
| **Pagamento**       | Último dia útil do mês seguinte ao trimestre                        |

**Cálculo simplificado (Lucro Presumido — serviços):**

- Receita bruta mensal: R$ 100.000
- Presunção de lucro (serviços): 32% → R$ 32.000
- IRPJ: 15% × R$ 32.000 = R$ 4.800
- Adicional (se > R$ 20.000): 10% × R$ 12.000 = R$ 1.200
- **Provisão mensal IRPJ: R$ 6.000**

**Cálculo simplificado (Lucro Real):**

- Lucro contábil mensal: R$ 50.000
- IRPJ: 15% × R$ 50.000 = R$ 7.500
- Adicional: 10% × R$ 30.000 = R$ 3.000
- **Provisão mensal IRPJ: R$ 10.500**

#### 2.2.2 Provisão para CSLL (Contribuição Social sobre o Lucro Líquido)

| Aspecto             | Detalhe                                      |
| ------------------- | -------------------------------------------- |
| **Base de cálculo** | Mesma base do IRPJ (Lucro Real ou Presumido) |
| **Alíquota**        | 9% para a maioria das empresas               |
| **Apuração**        | Trimestral ou mensal (acompanha o IRPJ)      |

**Cálculo simplificado (Lucro Presumido — serviços):**

- Receita bruta mensal: R$ 100.000
- Presunção (serviços): 32% → R$ 32.000
- **Provisão mensal CSLL: 9% × R$ 32.000 = R$ 2.880**

#### 2.2.3 Resumo — Provisões Tributárias por Regime

| Regime               | IRPJ aprox.                              | CSLL aprox.                        | Frequência de pagamento |
| -------------------- | ---------------------------------------- | ---------------------------------- | ----------------------- |
| **Simples Nacional** | Incluído no DAS (não separa)             | Incluído no DAS                    | Mensal                  |
| **Lucro Presumido**  | ~4,8% a 7,2% da receita bruta (serviços) | ~2,88% da receita bruta (serviços) | Trimestral              |
| **Lucro Real**       | 15% + 10% adicional sobre lucro contábil | 9% sobre lucro contábil            | Trimestral ou mensal    |

> **Nota para Simples Nacional:** Empresas no Simples pagam um DAS unificado mensal que já inclui IRPJ, CSLL, PIS, COFINS, INSS patronal, ISS e ICMS. Neste caso, a provisão tributária é mais simples: basta provisionar o valor do DAS com base na faixa de faturamento. Muitos tenants da Radul serão Simples Nacional.

### 2.3 Outras Provisões Possíveis (Fase Futura)

| Provisão                                 | Quando usar                               | Complexidade |
| ---------------------------------------- | ----------------------------------------- | ------------ |
| PIS/COFINS                               | Lucro Real com apuração não-cumulativa    | Média        |
| ISS retido                               | Serviços com retenção na fonte            | Baixa        |
| Provisão para devedores duvidosos (PDD)  | % de inadimplência sobre contas a receber | Média        |
| Provisão para contingências trabalhistas | Ações judiciais em andamento              | Alta         |
| Provisão para garantias                  | Produtos com garantia                     | Média        |

> **Recomendação:** Iniciar com 13º, férias, IRPJ e CSLL. As demais podem ser adicionadas futuramente como expansão natural.

---

## 3. Análise do Estado Atual do SOSApp

### 3.1 DRE Atual — Estrutura

O DRE hoje segue este fluxo:

```
Faturamento (receita bruta de vendas)
(−) Deduções sobre vendas (custo dos produtos/serviços)
(−) Impostos (tax_amount das vendas)
(=) Margem Bruta
(−) Despesas (accounts_payable por competência)
(=) Lucro
```

**Interfaces TypeScript:**

```typescript
interface DreSummaryRow {
  period: string; // "2026-01"
  faturamento: number;
  deducoes: number;
  impostos: number;
  margemBruta: number;
  despesas: number; // ← soma do accounts_payable do mês
  lucro: number; // ← margemBruta - despesas
}
```

**Como despesas são carregadas:**

```typescript
// Busca accounts_payable do ano
const apRes = await api.post(CRUD_ENDPOINT, {
  action: "list",
  table: "accounts_payable",
  // filtros: tenant_id, status != cancelled, due_date entre jan-dez
});

// Agrupa por mês usando competence_date (fallback: due_date)
for (const ap of apEntries) {
  const dt = String(ap.competence_date ?? ap.due_date ?? "");
  const period = dt.slice(0, 7);
  const amt = Number(ap.amount ?? 0);
  expenseByMonth.set(period, (expenseByMonth.get(period) ?? 0) + amt);
}
```

**Cálculo final:**

```typescript
const margemBruta = faturamento - deducoes - impostos;
const lucro = margemBruta - despesas;
```

### 3.2 Plano de Contas Atual

O plano de contas tem 3 grupos com tipos `"revenue" | "cost" | "expense"`:

```
1 — Receitas (revenue)
  1.1 Operacionais (Serviços, Produtos, Honorários, Mensalidades, Comissões)
  1.2 Financeiras (Juros Recebidos, Rendimentos)
  1.3 Outras Receitas
  1.4 Receitas de Vendas (PDV, Online, Marketplace, Atacado, Descontos, Devoluções, Frete)

2 — Custos (cost)
  2.1 Operacionais (CMV, Custo do Serviço, Pagamento Parceiros, Comissões, Frete)

3 — Despesas (expense)
  3.1 Administrativas (Aluguel, Condomínio, Energia, Água, Telefone, Material)
  3.2 Pessoal (Salários, Pró-labore, Encargos Sociais, Benefícios)
  3.3 Tributárias (Federais, Estaduais, Municipais, Taxas)
  3.4 Financeiras (Juros/Multas, Tarifas Bancárias, Empréstimos)
  3.5 Comerciais (Marketing, Software, Viagens, Fornecedores)
  3.6 Outras (Transferências, Retiradas, Outras)
```

**Gaps identificados:**

- ❌ Não existem contas de provisão (ex: "Provisão p/ 13º", "Provisão p/ Férias")
- ❌ O tipo `ChartAccount.type` não suporta `"provision"` — só `"revenue" | "cost" | "expense"`
- ❌ Grupo 3.2 (Pessoal) tem "Salários" e "Encargos Sociais" mas não tem provisões trabalhistas
- ❌ Grupo 3.3 (Tributárias) tem "Impostos Federais" mas não tem provisões tributárias

### 3.3 Tabela `accounts_payable` — Schema Relevante

```sql
CREATE TABLE accounts_payable (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  description text NOT NULL DEFAULT '',
  type account_entry_type NOT NULL DEFAULT 'expense',  -- expense, tax, transfer, other
  category text,                    -- free-text: "Aluguel", "Software", "Impostos"
  amount numeric(12,2),
  status account_entry_status,      -- pending, paid, overdue, cancelled
  due_date date,
  competence_date date,             -- ← usado pelo DRE para regime de competência
  tags text[],                      -- flexible tagging
  notes text,
  -- ... (partner_id, payment fields, etc.)
);
```

### 3.4 O Que NÃO Existe Hoje

| Item                               | Status                                            |
| ---------------------------------- | ------------------------------------------------- |
| Tabela `provisions` ou `provisoes` | ❌ Não existe                                     |
| Serviço `services/provisions.ts`   | ❌ Não existe                                     |
| Tela de gestão de provisões        | ❌ Não existe                                     |
| Contas contábeis de provisão       | ❌ Não existe no DEFAULT_ACCOUNTS                 |
| Tipo "provision" no ChartAccount   | ❌ Não existe no type union                       |
| Linha de provisões no DRE          | ❌ Não existe (vai direto de despesas para lucro) |
| Cálculo automático de provisões    | ❌ Não existe                                     |
| Reversão de provisão ao pagar      | ❌ Não existe                                     |

---

## 4. Proposta de Implementação

### 4.1 Princípio #1: Não Impactar o Existente

A implementação DEVE seguir estes princípios:

1. **Aditiva, não modificativa** — Adicionar novas tabelas/contas/linhas, não alterar as existentes
2. **Opt-in** — Provisões só aparecem se o tenant configurar (módulo ou flag)
3. **Backward-compatible** — DRE sem provisões continua funcionando exatamente igual
4. **Provisões como `accounts_payable` com tipo especial** — OU tabela separada (ver opções abaixo)

### 4.2 Decisão Arquitetural: Tabela Separada vs Reutilizar `accounts_payable`

#### Opção A: Reutilizar `accounts_payable` com `type = 'provision'`

| Prós                           | Contras                                                |
| ------------------------------ | ------------------------------------------------------ |
| Sem migration para nova tabela | Poluição semântica (provisão ≠ conta a pagar)          |
| DRE já lê accounts_payable     | Tela de Contas a Pagar mostraria provisões             |
| Menos código novo              | Campo `status` não faz sentido (provisão não é "paga") |
| Relatórios existentes capturam | Reversão complica (deletar AP ou criar crédito?)       |

#### Opção B: Tabela separada `provisions` (RECOMENDADA ✅)

| Prós                                       | Contras                        |
| ------------------------------------------ | ------------------------------ |
| Separação semântica clara                  | Nova tabela + migration        |
| Status próprio (ativa, revertida, parcial) | DRE precisa de query adicional |
| Reversão limpa (update status)             | Novo service file              |
| Não poluir Contas a Pagar                  | Nova tela CrudScreen           |
| Histórico de provisão isolado              | —                              |

**Recomendação: Opção B** — A separação é mais limpa e alinhada com o CPC 25, que trata provisões como categoria distinta de passivos. Além disso, provisões têm ciclo de vida diferente (criação → acumulação → reversão parcial/total), que não se encaixa bem no workflow de AP (pending → paid).

### 4.3 Schema Proposto — Tabela `provisions`

```sql
CREATE TABLE IF NOT EXISTS provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Identificação
  description TEXT NOT NULL,
  provision_type TEXT NOT NULL CHECK (provision_type IN (
    'thirteenth_salary',   -- 13º salário
    'vacation',            -- Férias + 1/3
    'fgts',                -- FGTS (sobre 13º e férias)
    'inss_employer',       -- INSS patronal (sobre 13º e férias)
    'irpj',                -- IRPJ
    'csll',                -- CSLL
    'pis_cofins',          -- PIS/COFINS
    'iss',                 -- ISS
    'bad_debt',            -- PDD (provisão para devedores duvidosos)
    'warranty',            -- Garantias
    'contingency',         -- Contingências
    'other'                -- Outras
  )),
  category TEXT NOT NULL CHECK (category IN (
    'labor',       -- Trabalhista (13º, férias, FGTS, INSS)
    'tax',         -- Tributária (IRPJ, CSLL, PIS, COFINS, ISS)
    'operational', -- Operacional (PDD, garantias)
    'other'        -- Outras
  )),

  -- Período de competência
  competence_month TEXT NOT NULL,  -- "2026-01", "2026-02", etc.
  reference_year INTEGER NOT NULL, -- ano fiscal

  -- Valores
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,        -- valor provisionado
  amount_reversed NUMERIC(12,2) NOT NULL DEFAULT 0, -- valor já revertido
  amount_remaining NUMERIC(12,2) GENERATED ALWAYS AS (amount - amount_reversed) STORED,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',           -- provisão vigente
    'partially_reversed', -- parcialmente revertida
    'fully_reversed',   -- totalmente revertida
    'cancelled'         -- cancelada (erro)
  )),

  -- Vínculo com pagamento efetivo (quando a provisão se concretiza)
  realized_ap_id UUID REFERENCES accounts_payable(id),  -- AP que realizou esta provisão
  realized_at TIMESTAMPTZ,

  -- Cálculo automático (metadados)
  calculation_basis TEXT,      -- "manual", "automatic", "formula"
  calculation_params JSONB,    -- { "salary": 5000, "employees": 3, "rate": 0.0833 }
  chart_account_id UUID REFERENCES chart_of_accounts(id),

  -- Audit
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provisions_tenant_month
  ON provisions (tenant_id, competence_month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisions_tenant_category
  ON provisions (tenant_id, category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisions_tenant_type
  ON provisions (tenant_id, provision_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisions_tenant_status
  ON provisions (tenant_id, status)
  WHERE deleted_at IS NULL;
```

### 4.4 Tabela de Reversões (Histórico)

```sql
CREATE TABLE IF NOT EXISTS provision_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provision_id UUID NOT NULL REFERENCES provisions(id),

  amount NUMERIC(12,2) NOT NULL,          -- valor revertido
  reversal_type TEXT NOT NULL CHECK (reversal_type IN (
    'payment',    -- Revertido porque o pagamento real foi feito (AP criado)
    'adjustment', -- Ajuste de valor (recálculo)
    'cancellation' -- Cancelamento (provisão indevida)
  )),

  -- Vínculo com o pagamento real
  accounts_payable_id UUID REFERENCES accounts_payable(id),
  description TEXT,

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.5 Novas Contas no Plano de Contas

Adicionar ao `DEFAULT_ACCOUNTS` em `chart-of-accounts.ts`:

```
3 — Despesas (expense) [existente]
  ...
  3.7 Provisões Trabalhistas (expense) [NOVO]
    3.7.1 Provisão para 13º Salário
    3.7.2 Provisão para Férias
    3.7.3 Provisão para Encargos s/ 13º e Férias
  3.8 Provisões Tributárias (expense) [NOVO]
    3.8.1 Provisão para IRPJ
    3.8.2 Provisão para CSLL
    3.8.3 Provisão para PIS/COFINS
    3.8.4 Provisão para ISS
  3.9 Outras Provisões (expense) [NOVO]
    3.9.1 Provisão para Devedores Duvidosos
    3.9.2 Provisão para Contingências
    3.9.3 Outras Provisões
```

> **Nota:** As provisões são despesas no sentido contábil (reduzem o resultado). O tipo `"expense"` no ChartAccount funciona. NÃO é necessário criar um novo tipo `"provision"` — basta que as contas estejam em subgrupos separados (3.7, 3.8, 3.9) para que o DRE consiga segregar.

### 4.6 Impacto no DRE

#### DRE Atual:

```
Faturamento
(−) Deduções sobre vendas
(−) Impostos
(=) Margem Bruta
(−) Despesas operacionais          ← accounts_payable
(=) Lucro Líquido
```

#### DRE Proposto:

```
Faturamento
(−) Deduções sobre vendas
(−) Impostos
(=) Margem Bruta
(−) Despesas operacionais          ← accounts_payable (sem provisões)
(−) Provisões trabalhistas         ← provisions WHERE category='labor'    [NOVO]
(−) Provisões tributárias          ← provisions WHERE category='tax'      [NOVO]
(=) Lucro Líquido (após provisões)
```

#### Mudanças no `DreSummaryRow`:

```typescript
interface DreSummaryRow {
  period: string;
  faturamento: number;
  deducoes: number;
  impostos: number;
  margemBruta: number;
  despesas: number;
  provisoesTrabalho: number; // ← NOVO
  provisoesTributarias: number; // ← NOVO
  lucro: number; // ← recalculado: margemBruta - despesas - provisões
}
```

#### Mudanças no cálculo:

```typescript
// ANTES:
const lucro = margemBruta - despesas;

// DEPOIS:
const lucro = margemBruta - despesas - provisoesTrabalho - provisoesTributarias;
```

#### Mudanças na renderização do resumo contábil:

```typescript
// Adicionar entre "(−) Despesas" e "(=) Lucro":
{ label: "(−) Provisões trabalhistas", value: -sr.provisoesTrabalho, color: "#f59e0b" },
{ label: "(−) Provisões tributárias", value: -sr.provisoesTributarias, color: "#f59e0b" },
```

### 4.7 Serviço `services/provisions.ts`

Funções principais:

```typescript
// CRUD básico
createProvision(tenantId, data)
updateProvision(id, data)
listProvisions(tenantId, filters)
deleteProvision(id)  // soft-delete

// Cálculos automáticos
calculateMonthlyLaborProvisions(tenantId, month, employees[])
calculateMonthlyTaxProvisions(tenantId, month, revenue, taxRegime)
generateMonthlyProvisions(tenantId, month)  // calcula e cria automaticamente

// Reversão
reverseProvision(provisionId, amount, type, apId?)
reverseProvisionsByPayment(apId)  // quando AP é pago, reverte provisão correspondente

// Consulta para DRE
getProvisionsByPeriod(tenantId, year)  // retorna Map<period, { labor, tax }>

// Totalização
getProvisionSummary(tenantId, year)  // totais por categoria e tipo
```

### 4.8 Tela CrudScreen — Provisões

Nova tela admin: `app/(app)/Administrador/provisoes.tsx`

```typescript
// Campos principais
const fields: CrudFieldConfig<Provision>[] = [
  { key: "description", label: "Descrição", type: "text", required: true },
  { key: "provision_type", label: "Tipo", type: "select", options: [...] },
  { key: "category", label: "Categoria", type: "select", options: [
    { label: "Trabalhista", value: "labor" },
    { label: "Tributária", value: "tax" },
    { label: "Operacional", value: "operational" },
    { label: "Outra", value: "other" },
  ]},
  { key: "competence_month", label: "Mês Competência", type: "text" },
  { key: "amount", label: "Valor", type: "currency" },
  { key: "status", label: "Status", type: "select", readOnly: true },
  { key: "amount_reversed", label: "Valor Revertido", type: "currency", readOnly: true },
  { key: "chart_account_id", label: "Conta Contábil", type: "reference",
    referenceTable: "chart_of_accounts", referenceLabelField: "name" },
];
```

### 4.9 Fluxo de Uso

#### Fluxo Manual:

```
1. Admin abre tela Provisões
2. Clica "+ Adicionar"
3. Seleciona tipo (13º, férias, IRPJ, etc.)
4. Informa mês de competência e valor
5. Salva → provisão aparece no DRE do mês
6. Quando o pagamento real acontece:
   a. Cria AP em Contas a Pagar
   b. Reverte a provisão (total ou parcial)
   c. DRE ajustado: provisão sai, despesa real entra
```

#### Fluxo Automático (fase futura):

```
1. Admin configura dados de folha (salários, nº funcionários)
2. Admin configura regime tributário (Simples, Presumido, Real)
3. Todo mês, sistema calcula automaticamente:
   - Provisão 13º = Σ(salários) / 12 × 1,368
   - Provisão férias = Σ(salários) / 12 × 1,824
   - Provisão IRPJ = f(regime, lucro)
   - Provisão CSLL = f(regime, lucro)
4. Provisões são criadas automaticamente
5. Ao pagar 13º em dezembro → reversão automática de 12 provisões
```

---

## 5. Análise de Riscos

### 5.1 Riscos Técnicos

| #   | Risco                                                                      | Impacto                            | Mitigação                                                             |
| --- | -------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| 1   | **DRE quebra** se provisões forem contadas duas vezes (como AP + provisão) | ALTO — mostra despesa duplicada    | Flag `is_provision` no AP ou tabela separada (escolhemos separada)    |
| 2   | **Reversão inconsistente** — provisão revertida mas AP não criado          | MÉDIO — DRE subestima despesas     | Função `reverseProvision()` deve ser atômica: reverte + cria AP       |
| 3   | **Meses sem provisão** — tenant esquece de lançar                          | BAIXO — DRE incompleto             | Alerta visual "Meses sem provisão" + automação futura                 |
| 4   | **Cálculo de encargos errado** — alíquotas variam por regime               | MÉDIO — provisão sub/superestimada | Começar com % configuráveis, não hardcoded                            |
| 5   | **Provisão em mês fechado** — altera DRE retroativamente                   | BAIXO — auditoria fica confusa     | Campo `competence_month` imutável após criação (ou log de alterações) |

### 5.2 Riscos de Produto

| #   | Risco                                                                        | Impacto                              | Mitigação                                                              |
| --- | ---------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| 1   | **Complexidade para o tenant** — provisão é conceito contábil avançado       | ALTO — tenant não sabe usar          | Interface simplificada + presets + tooltips explicativos               |
| 2   | **Tenant do Simples Nacional** — pode não precisar provisionar separadamente | MÉDIO — funcionalidade desnecessária | Módulo opt-in. Simples pode provisionar DAS como "provisão tributária" |
| 3   | **Tenant sem funcionários CLT** — provisões trabalhistas irrelevantes        | BAIXO — feature vira ruído           | Mostrar apenas categorias relevantes baseado em config                 |

### 5.3 O Que NÃO Impactamos

| Componente                     | Impacto                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `accounts_payable`             | ❌ ZERO — tabela não muda                                      |
| `accounts_receivable`          | ❌ ZERO — não é afetado                                        |
| `bank_transactions`            | ❌ ZERO — provisões não geram transação bancária               |
| `chart_of_accounts` tipo union | ❌ ZERO — provisões usam tipo `"expense"` existente            |
| Tela Contas a Pagar            | ❌ ZERO — funciona igual                                       |
| Tela Contas a Receber          | ❌ ZERO — funciona igual                                       |
| Tela Dashboard Financeiro      | ❌ ZERO — funciona igual                                       |
| `DRE.tsx` sem provisões        | ❌ ZERO — se não houver provisões, DRE mostra exatamente igual |

---

## 6. Cronograma Sugerido

### Fase 1 — Fundação (1-2 semanas)

| #   | Tarefa                                                 | Tipo     | Esforço |
| --- | ------------------------------------------------------ | -------- | ------- |
| 1.1 | Migration: tabela `provisions` + `provision_reversals` | Backend  | 2h      |
| 1.2 | Novas contas no DEFAULT_ACCOUNTS (3.7, 3.8, 3.9)       | Data     | 1h      |
| 1.3 | Service `services/provisions.ts` (CRUD + reversão)     | Backend  | 4h      |
| 1.4 | Tela CrudScreen `provisoes.tsx`                        | Frontend | 3h      |
| 1.5 | Registrar no módulo `financial` da navegação           | Config   | 30min   |

### Fase 2 — Integração com DRE (1 semana)

| #   | Tarefa                                               | Tipo     | Esforço |
| --- | ---------------------------------------------------- | -------- | ------- |
| 2.1 | Função `getProvisionsByPeriod()` no service          | Backend  | 2h      |
| 2.2 | Adicionar provisões ao `DreSummaryRow`               | Frontend | 2h      |
| 2.3 | Novas linhas no resumo contábil do DRE               | Frontend | 2h      |
| 2.4 | Atualizar `exportResumoDRE()` para incluir provisões | Backend  | 1h      |
| 2.5 | Testes manuais: DRE com e sem provisões              | QA       | 2h      |

### Fase 3 — Cálculo Automático (2 semanas — FUTURO)

| #   | Tarefa                                                           | Tipo     | Esforço |
| --- | ---------------------------------------------------------------- | -------- | ------- |
| 3.1 | Tela de configuração: dados de folha (salários, nº funcionários) | Frontend | 4h      |
| 3.2 | Tela de configuração: regime tributário + alíquotas              | Frontend | 3h      |
| 3.3 | Função `generateMonthlyProvisions()` — cálculo automático        | Backend  | 6h      |
| 3.4 | Botão "Gerar provisões do mês" na tela de provisões              | Frontend | 2h      |
| 3.5 | Reversão automática vinculada a AP                               | Backend  | 4h      |
| 3.6 | Dashboard de provisões (acumulado, revertido, pendente)          | Frontend | 4h      |

### Fase 4 — Automação Completa (FUTURO DISTANTE)

| #   | Tarefa                                                         | Tipo |
| --- | -------------------------------------------------------------- | ---- |
| 4.1 | Cron mensal via N8N: gerar provisões automaticamente no dia 1  |
| 4.2 | Integração com folha de pagamento (se houver)                  |
| 4.3 | Provisão para devedores duvidosos (PDD) baseada em aging de AR |
| 4.4 | Alertas de provisões não revertidas (possível dupla contagem)  |

---

## 7. Perguntas para Decisão

Antes de implementar, definir:

| #   | Pergunta                                                     | Opções                                       | Recomendação                                                                                |
| --- | ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Provisão será módulo separado ou parte do módulo financeiro? | Módulo `provisions` ou dentro de `financial` | Dentro de `financial` (menos complexidade)                                                  |
| 2   | Fase 1 (manual) ou pular direto para Fase 3 (automático)?    | Manual primeiro ou automático                | Manual primeiro (valida o conceito)                                                         |
| 3   | Provisões devem gerar `bank_transactions`?                   | Sim ou Não                                   | **Não** — provisão é contábil, não financeira. Só o pagamento real gera transação bancária. |
| 4   | Reversão de provisão ao pagar AP: automática ou manual?      | Automática (detectar link) ou manual         | Automática com override manual                                                              |
| 5   | Tenants no Simples Nacional podem provisionar?               | Sim (DAS) ou esconder feature                | Sim — provisionar o DAS como "provisão tributária"                                          |
| 6   | Permitir provisões retroativas?                              | Sim (inserir em mês passado) ou não          | Sim com alerta visual                                                                       |

---

## 8. Conclusão

### Viabilidade: ✅ ALTA

O SOSApp tem toda a infraestrutura necessária:

- ✅ DRE de competência já funciona com `competence_date`
- ✅ Plano de contas extensível (basta adicionar subgrupos 3.7, 3.8, 3.9)
- ✅ CrudScreen permite criar a tela em 3h
- ✅ Tabela separada não impacta nenhuma funcionalidade existente
- ✅ DRE pode adicionar 2 linhas de provisão sem quebrar layout

### Complexidade: MÉDIA

- Fase 1+2 (manual + DRE): ~20h de desenvolvimento
- Fase 3 (automático): ~23h adicionais
- Total: ~43h para a funcionalidade completa

### Risco: BAIXO (se implementation for aditiva)

- Zero alteração em tabelas existentes
- Zero alteração em telas existentes (exceto DRE, que ganha linhas condicionais)
- Provisões só aparecem se existirem registros na tabela `provisions`
- Sem provisões → DRE funciona exatamente como antes

### DNA Preservado: ✅

- Provisões = CrudScreen (consistente com o DNA do produto)
- Tabela + campos + tela = padrão SOSApp
- Módulo opt-in (tenant que não precisa não vê)
- Config no banco, não no código (alíquotas, salários são dados)

---

_Documento gerado em Fevereiro 2026 • Baseado em CPC 25 (IAS 37), NBC TG 25 (R1), e auditoria completa do módulo financeiro do SOSApp (DRE.tsx, chart-of-accounts.ts, accounts_payable schema, bank-transactions.ts)_
