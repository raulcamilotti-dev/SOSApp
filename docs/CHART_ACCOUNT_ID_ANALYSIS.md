# Análise: `chart_account_id` nos Fluxos Financeiros

## Resumo Executivo

O `chart_account_id` (Plano de Contas) foi adicionado como FK opcional em **3 tabelas** (`bank_transactions`, `accounts_receivable`, `accounts_payable`), mas **NÃO** em `invoices` ou `payments`. De **todos os fluxos automatizados** que criam registros financeiros, **apenas 1** (bank reconciliation) seta o `chart_account_id` programaticamente — e mesmo assim via seleção manual do usuário. **Todos os outros fluxos omitem completamente o campo.**

---

## 1. Schema: Onde `chart_account_id` Existe

**Migration:** `migrations/add-chart-of-accounts.sql` (linhas 33-41)

```sql
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);
```

| Tabela                | Tem `chart_account_id`? | Tem `category` (text)? |
|-----------------------|:-----------------------:|:----------------------:|
| `accounts_receivable` | ✅ UUID FK              | ✅ text livre          |
| `accounts_payable`    | ✅ UUID FK              | ✅ text livre          |
| `bank_transactions`   | ✅ UUID FK              | ❌                     |
| `invoices`            | ❌                      | ❌                     |
| `payments`            | ❌                      | ❌                     |

---

## 2. Todas as Referências a `chart_account_id` no Codebase

**12 ocorrências no total** — nenhuma em `sales.ts`, `saas-billing.ts`, `purchases.ts`, `marketplace-checkout.ts`, `contracts.ts`, ou `payment-gateway.ts`.

| Arquivo | Linha | Contexto |
|---------|------:|----------|
| `migrations/add-chart-of-accounts.sql` | 33, 35, 38, 41 | DDL: cria coluna nas 3 tabelas |
| `services/bank-reconciliation.ts` | 509, 520, 532, 560 | **Único lugar que seta programaticamente** |
| `app/.../ConciliadorBancario.tsx` | 321 | Passa seleção do user para `createEntryFromTransaction` |
| `app/.../ContasAReceber.tsx` | 223 | Campo reference no formulário manual |
| `app/.../ContasAPagar.tsx` | 270 | Campo reference no formulário manual |
| `app/.../extrato-bancario.tsx` | 118 | Campo reference no formulário manual |

---

## 3. Pontos de Criação: `accounts_receivable`

### 3.1 — POS Sale (`services/sales.ts` ~linha 600)
- **Trigger:** Venda no PDV com checkout
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ❌ NÃO SETA
- **Tipo:** AR automático vinculado a sale + invoice
- **Conta sugerida:** `1.1.01` (Receita de Serviços) ou `1.1.02` (Receita de Produtos) — depende do `sale_type`

### 3.2 — SaaS Subscribe (`services/saas-billing.ts` ~linha 822)
- **Trigger:** Tenant assina um plano
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ✅ `SaaS - Plano ${tier.label}` (DINÂMICO)
- **Tipo:** `service_fee`, recorrência `monthly`
- **Conta sugerida:** `1.1.04` (Mensalidades)

### 3.3 — SaaS Extra Clients (`services/saas-billing.ts` ~linha 976)
- **Trigger:** Tenant compra clientes extras
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ✅ `SaaS - Clientes Extra` (HARDCODED)
- **Tipo:** `service_fee`, recorrência `none`
- **Conta sugerida:** `1.1.04` (Mensalidades)

### 3.4 — SaaS Monthly Billing (`services/saas-billing.ts` ~linha 1314)
- **Trigger:** `generateNextMonthBilling()` após confirmação de pagamento
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ✅ DINÂMICO (`SaaS - Plano ${planLabel}` ou `SaaS - Clientes Extra`)
- **Tipo:** `service_fee`, recorrência `monthly`, vinculado via `recurrence_parent_id`
- **Conta sugerida:** `1.1.04` (Mensalidades)

### 3.5 — Bank Reconciliation (`services/bank-reconciliation.ts` ~linha 528)
- **Trigger:** Usuário cria lançamento a partir de transação bancária (crédito)
- **`chart_account_id`:** ✅ **SETA** (dinâmico, via seleção do usuário no modal)
- **`category`:** ❌ NÃO SETA
- **Tipo:** dinâmico conforme seleção do user, status `paid`
- **Observação:** **Único fluxo automatizado que inclui `chart_account_id`**

### 3.6 — Marketplace Checkout (`services/marketplace-checkout.ts` ~linha 625)
- **Trigger:** Compra no marketplace é finalizada
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ❌ NÃO SETA
- **Tipo:** `invoice`, via batch API `/marketplace/create-order-records`
- **Conta sugerida:** `1.1.02` (Receita de Produtos) ou `1.1.01` (Receita de Serviços)

### 3.7 — CRUD Manual (`app/.../ContasAReceber.tsx` linha 223)
- **Trigger:** Usuário cria AR manualmente pelo CrudScreen
- **`chart_account_id`:** ✅ Campo `reference` para `chart_of_accounts` (somente `is_leaf`)
- **`category`:** ✅ Campo text no form
- **Observação:** Depende do preenchimento manual pelo operador

---

## 4. Pontos de Criação: `accounts_payable`

### 4.1 — Bank Reconciliation (`services/bank-reconciliation.ts` ~linha 556)
- **Trigger:** Usuário cria lançamento a partir de transação bancária (débito)
- **`chart_account_id`:** ✅ **SETA** (dinâmico, via seleção do usuário)
- **`category`:** ❌ NÃO SETA
- **Tipo:** dinâmico, status `paid`
- **Observação:** Mesmo padrão do AR na bank reconciliation

### 4.2 — Purchase Order (`services/purchases.ts` ~linha 459)
- **Trigger:** Pedido de compra aprovado, cria AP (suporta parcelas)
- **`chart_account_id`:** ❌ NÃO SETA
- **`category`:** ✅ `Compras / Mercadoria` (HARDCODED)
- **Tipo:** `expense`, recorrência `none`
- **Conta sugerida:** `2.1.01` (Custo de Mercadoria Vendida)

### 4.3 — CRUD Manual (`app/.../ContasAPagar.tsx` linha 270)
- **Trigger:** Usuário cria AP manualmente pelo CrudScreen (suporta parcelas)
- **`chart_account_id`:** ✅ Campo `reference` para `chart_of_accounts` (somente `is_leaf`)
- **`category`:** ✅ Campo text no form
- **Observação:** Tem split em parcelas (installment); cada parcela recebe o mesmo `chart_account_id`

---

## 5. Pontos de Criação: `invoices`

> **NOTA:** A tabela `invoices` **NÃO TEM** coluna `chart_account_id`. Nenhum mapeamento contábil direto.

| Origem | Arquivo | ~Linha | `chart_account_id` | `category` |
|--------|---------|-------:|--------------------|------------|
| POS Sale | `services/sales.ts` | 555 | N/A (coluna não existe) | ❌ |
| SaaS Subscribe | `services/saas-billing.ts` | 795 | N/A | ❌ |
| SaaS Extra Clients | `services/saas-billing.ts` | 950 | N/A | ❌ |
| SaaS Monthly | `services/saas-billing.ts` | 1285 | N/A | ❌ |
| Contract Billing | `services/contracts.ts` | 900 | N/A | ❌ |
| Marketplace | `services/marketplace-checkout.ts` | 597 | N/A | ❌ |

---

## 6. Pontos de Criação: `payments`

> **NOTA:** A tabela `payments` **NÃO TEM** coluna `chart_account_id`.

| Origem | Arquivo | `chart_account_id` |
|--------|---------|-------------------|
| POS Sale (single/split) | `services/sales.ts` ~linha 628 | N/A (coluna não existe) |
| Payment Gateway | `services/payment-gateway.ts` ~linha 260 | N/A |
| Asaas Webhook | `workers/asaas/src/index.ts` | Apenas UPDATE, nunca cria |

---

## 7. Pontos de Criação: `bank_transactions`

| Origem | Arquivo | `chart_account_id` |
|--------|---------|-------------------|
| Import OFX | `app/.../ConciliadorBancario.tsx` (import batch) | ❌ Transações importadas sem conta |
| CRUD Manual | `app/.../extrato-bancario.tsx` linha 118 | ✅ Campo reference (seleção manual) |

---

## 8. Mapa DEFAULT_ACCOUNTS → Fluxos

Plano de contas completo de `services/chart-of-accounts.ts`:

### RECEITAS (type: `revenue`)

| Código | Nome | Fluxo(s) que deveria usar | Status |
|--------|------|---------------------------|--------|
| `1.1.01` | Receita de Serviços | POS Sale (serviços), Marketplace (serviços) | ❌ Não setado |
| `1.1.02` | Receita de Produtos | POS Sale (produtos), Marketplace (produtos) | ❌ Não setado |
| `1.1.03` | Honorários | Template Advocacia / Consultoria | ❌ Não setado |
| `1.1.04` | Mensalidades | SaaS Billing (subscribe, renewal, extras) | ❌ Não setado |
| `1.1.05` | Comissões Recebidas | Channel Partners (referral commissions) | ❌ Não setado |
| `1.2.01` | Juros Recebidos | (raro) | — |
| `1.2.02` | Rendimentos de Aplicação | (raro) | — |
| `1.3.01` | Transferências Recebidas | Bank reconciliation (crédito genérico) | ✅ Via seleção manual |
| `1.3.02` | Outras Receitas | Catch-all | — |

### CUSTOS (type: `cost`)

| Código | Nome | Fluxo(s) que deveria usar | Status |
|--------|------|---------------------------|--------|
| `2.1.01` | Custo de Mercadoria Vendida | Purchases / Pedidos de compra | ❌ Não setado |
| `2.1.02` | Custo de Serviço Prestado | (quando terceiriza serviço) | — |
| `2.1.03` | Pagamento a Parceiros | Partner Earnings | ❌ Não setado |
| `2.1.04` | Comissões Pagas | Channel Partner payouts | ❌ Não setado |

### DESPESAS (type: `expense`) — 25 contas folha

| Código | Nome | Subgrupo |
|--------|------|----------|
| `3.1.01`–`3.1.06` | Aluguel, Condomínio, Energia, Água, Telefone, Material | Administrativas |
| `3.2.01`–`3.2.04` | Salários, Pró-labore, Encargos, Benefícios | Pessoal |
| `3.3.01`–`3.3.04` | Impostos Fed/Est/Mun, Taxas | Tributárias |
| `3.4.01`–`3.4.03` | Juros/Multas, Tarifas, Empréstimos | Financeiras |
| `3.5.01`–`3.5.04` | Marketing, Software, Viagens, Fornecedores | Comerciais |
| `3.6.01`–`3.6.03` | Transferências, Retiradas, Outras Despesas | Outras |

---

## 9. O Campo `category` (text) vs `chart_account_id` (FK)

Atualmente, alguns fluxos preenchem `category` (campo text livre) mas **nunca** o `chart_account_id` correspondente:

| Fluxo | `category` valor | `chart_account_id` sugerido |
|-------|------------------|-----------------------------|
| SaaS Subscribe | `SaaS - Plano ${tier.label}` | `1.1.04` Mensalidades |
| SaaS Extras | `SaaS - Clientes Extra` | `1.1.04` Mensalidades |
| SaaS Monthly | `SaaS - Plano ${planLabel}` | `1.1.04` Mensalidades |
| Purchases | `Compras / Mercadoria` | `2.1.01` CMV |
| POS Sale | *(nenhum)* | `1.1.01` ou `1.1.02` |
| Marketplace | *(nenhum)* | `1.1.01` ou `1.1.02` |
| Contract Billing | *(nenhum)* | `1.1.01` Receita de Serviços |

**Problema:** `category` é texto livre sem normalização — não permite DRE automatizado, filtros contábeis, ou drill-down por plano de contas.

---

## 10. Diagnóstico Final

### O que funciona:
1. **CRUD manual** (ContasAReceber, ContasAPagar, extrato-bancario): Operador seleciona conta do plano via reference picker
2. **Bank reconciliation**: Operador seleciona conta ao criar lançamento de transação importada

### O que NÃO funciona:
1. **0 de 6 fluxos de AR** setam `chart_account_id` automaticamente
2. **0 de 2 fluxos de AP** setam `chart_account_id` automaticamente
3. **0 de 6 fluxos de Invoice** têm sequer a coluna na tabela
4. **0 fluxos de Payment** têm a coluna
5. **OFX Import**: transações entram sem conta — só é classificado se operador usa o conciliador

### Consequência:
- **DRE é impreciso** — não consegue mapear toda receita/custo/despesa automaticamente
- **Export contábil é incompleto** — registros sem plano de contas precisam de intervenção manual
- **Conciliação bancária** é o único caminho que classifica, mas depende de ação do operador

---

## 11. Recomendação de Implementação

### Estratégia: Resolução automática `context → chart_account_id`

Criar uma função `resolveChartAccountId(tenantId, context)` que mapeia o contexto de negócio para a conta contábil correta:

```typescript
// services/chart-of-accounts.ts (proposta)

interface ChartAccountContext {
  /** Tipo de fluxo: "sale", "saas", "purchase", "partner_earning", etc. */
  flow: string;
  /** Subtipo opcional: "service", "product", "subscription", etc. */
  subtype?: string;
  /** Category text (fallback para matching) */
  category?: string;
}

const FLOW_TO_ACCOUNT_CODE: Record<string, string> = {
  // AR (Receitas)
  "sale:service":           "1.1.01",  // Receita de Serviços
  "sale:product":           "1.1.02",  // Receita de Produtos
  "sale:default":           "1.1.01",  // Fallback
  "saas:subscription":      "1.1.04",  // Mensalidades
  "saas:extra_clients":     "1.1.04",  // Mensalidades
  "marketplace:service":    "1.1.01",  // Receita de Serviços
  "marketplace:product":    "1.1.02",  // Receita de Produtos
  "contract:billing":       "1.1.01",  // Receita de Serviços
  "channel_partner:commission": "1.1.05", // Comissões Recebidas

  // AP (Custos)
  "purchase:merchandise":   "2.1.01",  // Custo de Mercadoria Vendida
  "purchase:service":       "2.1.02",  // Custo de Serviço Prestado
  "partner:earning":        "2.1.03",  // Pagamento a Parceiros
  "partner:commission":     "2.1.04",  // Comissões Pagas
};

async function resolveChartAccountId(
  tenantId: string,
  context: ChartAccountContext
): Promise<string | undefined> {
  const key = context.subtype
    ? `${context.flow}:${context.subtype}`
    : `${context.flow}:default`;
  
  const code = FLOW_TO_ACCOUNT_CODE[key]
    ?? FLOW_TO_ACCOUNT_CODE[`${context.flow}:default`];
  
  if (!code) return undefined;

  // Look up the tenant's chart_of_accounts by code
  const accounts = await loadLeafAccounts(tenantId);
  const match = accounts.find(a => a.code === code && a.is_active);
  return match?.id;
}
```

### Onde aplicar:

| Arquivo | Função | Contexto para `resolveChartAccountId` |
|---------|--------|---------------------------------------|
| `services/sales.ts` | `createSale()` | `{ flow: "sale", subtype: sale_type }` |
| `services/saas-billing.ts` | `subscribeToPlan()` | `{ flow: "saas", subtype: "subscription" }` |
| `services/saas-billing.ts` | `purchaseExtraClients()` | `{ flow: "saas", subtype: "extra_clients" }` |
| `services/saas-billing.ts` | `generateNextMonthBilling()` | `{ flow: "saas", subtype: noteType }` |
| `services/purchases.ts` | AP creation | `{ flow: "purchase", subtype: "merchandise" }` |
| `services/marketplace-checkout.ts` | arPayload | `{ flow: "marketplace", subtype: item_type }` |
| `services/contracts.ts` | `generateContractInvoice()` | `{ flow: "contract", subtype: "billing" }` |

### Prioridade de aplicação:
1. **ALTA:** `sales.ts` (volume alto), `saas-billing.ts` (receita recorrente)
2. **MÉDIA:** `purchases.ts` (custos), `marketplace-checkout.ts`
3. **BAIXA:** `contracts.ts` (billing esporádico)

### Consideração: `invoices` e `payments`
- A migration **não adicionou** `chart_account_id` nestas tabelas
- **Invoices** são derivados de AR/AP — a classificação contábil deveria estar no AR/AP correspondente
- **Payments** são confirmações de pagamento — herdam a classificação do AR/AP/Invoice pai
- **Recomendação:** Não adicionar FK nessas tabelas — o drill-down contábil se faz via AR/AP

---

*Documento gerado em análise automatizada do codebase — Fevereiro 2026*
