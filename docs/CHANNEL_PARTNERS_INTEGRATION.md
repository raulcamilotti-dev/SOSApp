# Guia de Integração — Channel Partners

Este documento detalha como integrar o sistema de **Channel Partners** (parceiros de canal) no fluxo de registro e billing do Radul Platform.

---

## 1. Visão Geral

O sistema de channel partners permite que contadores, consultorias, agências e outros profissionais indiquem novos tenants e recebam comissões recorrentes sobre os pagamentos mensais.

**Fluxo End-to-End:**

```
1. Channel Partner cadastrado → recebe código único (ex: CONTADOR-JOAO-2026)
2. Partner compartilha link: https://app.radul.com.br/registro?ref=CONTADOR-JOAO-2026
3. Novo tenant se registra via link
4. Sistema captura o código e cria registro em channel_partner_referrals
5. Tenant faz primeiro pagamento → referral.status = 'pending' → 'active'
6. Cron mensal calcula comissões (calculateMonthlyCommissions)
7. Admin revisa e marca comissões como pagas
8. Partner visualiza métricas no dashboard
```

---

## 2. Passo 1: Executar Migration

Execute a migration SQL para criar as tabelas:

```bash
psql -h <host> -U <user> -d <database> -f migrations/add-channel-partners.sql
```

**Tabelas criadas:**

- `channel_partners` — cadastro de parceiros
- `channel_partner_referrals` — indicações de tenants
- `channel_partner_commissions` — snapshots mensais de comissões

**Views criadas:**

- `channel_partner_dashboard` — métricas agregadas por partner
- `channel_commissions_summary` — totais globais mensais

---

## 3. Passo 2: Integrar no Fluxo de Registro

### 3.1. Modificar Tela de Registro (`app/(auth)/registro.tsx`)

Adicione a captura de referral code **após** a criação bem-sucedida do tenant:

```typescript
import { captureReferralOnRegistration } from "@/services/referral-tracking";

// No componente de registro, após criar o tenant com sucesso:
async function handleRegister(formData: RegisterData) {
  try {
    // 1. Criar tenant (lógica existente)
    const newTenant = await createTenant(formData);

    // 2. Capturar código de indicação (se houver)
    // ⚠️ NÃO bloqueia registro se falhar — apenas tenta
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      await captureReferralOnRegistration(newTenant.id, urlParams);
    }

    // 3. Continuar fluxo normal (redirect, login, etc.)
    router.push("/");
  } catch (error) {
    // Tratar erro
  }
}
```

**Importante:**

- A chamada a `captureReferralOnRegistration` **não deve travar o registro** se falhar
- A função já trata erros internamente com try/catch
- Registra logs no console para debugging

### 3.2. Exibir Badge de Indicação (Opcional)

Na página de registro, você pode exibir um badge informando que o usuário chegou via indicação:

```typescript
import { getReferralCodeFromUrl } from "@/services/referral-tracking";

export default function RegisterScreen() {
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    setRefCode(getReferralCodeFromUrl());
  }, []);

  return (
    <View>
      {refCode && (
        <View style={styles.refBadge}>
          <Text>✅ Indicado por parceiro {refCode}</Text>
        </View>
      )}

      {/* Form de registro */}
    </View>
  );
}
```

---

## 4. Passo 3: Atualizar Referral ao Primeiro Pagamento

Quando um tenant faz o **primeiro pagamento**, o referral deve ser ativado.

### 4.1. No Serviço de Billing

Modifique a função que processa pagamentos (ex: `services/saas-billing.ts` ou handler de webhook de pagamento):

```typescript
import {
  getReferralByTenantId,
  updateReferralStatus,
} from "@/services/channel-partners";

async function handlePaymentSuccess(tenantId: string, paymentData: any) {
  try {
    // 1. Processar pagamento (lógica existente)
    await processPayment(tenantId, paymentData);

    // 2. Ativar referral (se existir e estiver pendente)
    const referral = await getReferralByTenantId(tenantId);
    if (referral && referral.status === "pending") {
      await updateReferralStatus(referral.id, "active");
      console.log(`[ChannelPartner] Referral activated: ${referral.id}`);
    }
  } catch (error) {
    console.error("Error in payment handler:", error);
    throw error;
  }
}
```

**Quando chamar:**

- No callback de sucesso do gateway de pagamento (MercadoPago, Stripe, PIX)
- Após confirmar que o pagamento foi aprovado/compensado
- NO primeiro pagamento do tenant (não em renovações)

---

## 5. Passo 4: Cálculo Mensal de Comissões

### 5.1. Criar Cron Job

O cálculo de comissões deve rodar **automaticamente todo dia 1º de cada mês**. Opções:

**Opção A: N8N Workflow (Recomendado)**

1. Abra N8N: https://n8n.sosescritura.com.br
2. Crie novo workflow "Channel Partner Monthly Commissions"
3. Trigger: CRON — `0 0 1 * *` (executa às 00:00 do dia 1)
4. HTTP Request:
   ```
   POST https://sos-api-crud.raulcamilotti-c44.workers.dev/webhook/calculate_commissions
   Headers: X-Api-Key: <sua_chave>
   Body: { "month_reference": "{{ $now.format('YYYY-MM') }}" }
   ```
5. Ative o workflow

**Opção B: Cloudflare Worker Scheduled** (se preferir)

```typescript
// workers/api-crud/src/scheduled.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    if (event.cron === "0 0 1 * *") {
      // Primeiro dia de cada mês
      const { calculateMonthlyCommissions } =
        await import("./services/channel-partners");
      const result = await calculateMonthlyCommissions();
      console.log(
        `[Cron] Created ${result.created} commissions, total: R$${result.total_amount}`,
      );
    }
  },
};
```

**Opção C: Manual via Admin Screen**
Adicione um botão na tela de dashboard para admins executarem manualmente:

```typescript
// No channel-partner-dashboard.tsx
import { calculateMonthlyCommissions } from "@/services/channel-partners";

function ChannelPartnerDashboardScreen() {
  const [calculating, setCalculating] = useState(false);

  const handleCalculateCommissions = async () => {
    if (!confirm("Calcular comissões deste mês?")) return;

    setCalculating(true);
    try {
      const result = await calculateMonthlyCommissions();
      Alert.alert(
        "Comissões Calculadas",
        `${result.created} comissões criadas. Total: ${formatCurrency(result.total_amount)}`
      );
      loadData(); // Recarregar dashboard
    } catch (error) {
      Alert.alert("Erro", getApiErrorMessage(error));
    } finally {
      setCalculating(false);
    }
  };

  return (
    <View>
      {/* Dashboard content */}

      <TouchableOpacity onPress={handleCalculateCommissions} disabled={calculating}>
        <Text>🔄 {calculating ? "Calculando..." : "Calcular Comissões Mês Atual"}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 5.2. O que a Função Faz

`calculateMonthlyCommissions()` executa:

1. Busca todos os referrals com status='active'
2. Para cada referral, lê o plano atual do tenant (de `config.billing.current_plan`)
3. Calcula comissão: `plan_amount * (commission_rate/100)`
4. Cria registro em `channel_partner_commissions` com status='pending'
5. Atualiza métricas do referral: `total_months_paid++`, `total_commission_earned += amount`

**Importante:**

- Não cria duplicatas (constraint UNIQUE em `referral_id + month_reference`)
- Se tenant não tem plano ou plano = 'free', não gera comissão
- Comissões ficam com status='pending' até admin marcar como pago

---

## 6. Passo 5: Marcar Comissões como Pagas

Quando o admin transferir o pagamento para o channel partner, deve marcar a comissão como paga.

### 6.1. Na Tela de Dashboard

Adicione ação nos cards de comissões pendentes:

```typescript
import { markCommissionAsPaid } from "@/services/channel-partners";

function CommissionRow({ commission }: { commission: ChannelPartnerCommission }) {
  const handleMarkAsPaid = async () => {
    Alert.prompt(
      "Confirmar Pagamento",
      "Informe a referência da transferência PIX",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async (pixReference) => {
            try {
              await markCommissionAsPaid(commission.id, {
                paidAmount: commission.commission_amount,
                paymentMethod: "pix",
                pixReference: pixReference || undefined,
              });
              Alert.alert("Sucesso", "Comissão marcada como paga");
              loadData(); // Recarregar
            } catch (error) {
              Alert.alert("Erro", getApiErrorMessage(error));
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.commissionRow}>
      <Text>{commission.month_reference}</Text>
      <Text>{formatCurrency(commission.commission_amount)}</Text>

      {commission.status === "pending" && (
        <TouchableOpacity onPress={handleMarkAsPaid}>
          <Text>✅ Marcar como Pago</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

**Campos atualizados:**

- `status` → 'paid'
- `paid_at` → timestamp atual
- `paid_amount` → valor efetivamente pago (pode ser diferente se houver ajuste)
- `payment_method` → 'pix', 'ted', 'boleto', etc.
- `payment_reference` → código da transferência

**Também atualiza:**

- `channel_partner_referrals.total_commission_paid += paid_amount`

---

## 7. Passo 6: Adicionar Navegação

### 7.1. No Menu Admin

Adicione as rotas ao menu administrativo (ex: `core/navigation/admin-menu.ts` ou similar):

```typescript
const adminMenuItems = [
  // ... itens existentes

  {
    label: "Parceiros de Canal",
    icon: "users",
    path: "/Administrador/channel-partners",
    permission: "admin",
  },
  {
    label: "Dashboard de Parcerias",
    icon: "trending-up",
    path: "/Administrador/channel-partner-dashboard",
    permission: "admin",
  },
];
```

### 7.2. Verificar Routing

As telas já existem em:

- `app/(app)/Administrador/channel-partners.tsx` — CRUD de parceiros
- `app/(app)/Administrador/channel-partner-dashboard.tsx` — Performance e comissões

O Expo Router deve reconhecer automaticamente com file-based routing.

---

## 8. Fluxo de Uso End-to-End

### 8.1. Admin Cadastra Channel Partner

1. Admin acessa **Administrador → Parceiros de Canal**
2. Clica em "+ Adicionar"
3. Preenche formulário:
   - Tipo: Contador
   - Nome: João Silva
   - Email: joao@contabilidade.com
   - Telefone: (11) 98765-4321
   - Empresa: Contabilidade Silva
   - Taxa de comissão: 20% (padrão)
   - Chave PIX: joao@contabilidade.com
4. Sistema auto-gera código: `CONTADOR-JOAO-2026`
5. Admin clica em "📋 Copiar Link de Indicação"
   - Link gerado: `https://app.radul.com.br/registro?ref=CONTADOR-JOAO-2026`
6. Admin envia link para o parceiro via email/WhatsApp

### 8.2. Parceiro Compartilha Link

João Silva compartilha o link em:

- Email para clientes
- Post em redes sociais
- Assinatura de email
- Materiais de divulgação

Pode adicionar UTM params para rastreamento:

```
https://app.radul.com.br/registro?ref=CONTADOR-JOAO-2026&utm_source=email&utm_campaign=jan2026
```

### 8.3. Tenant se Registra

1. Cliente clica no link do parceiro
2. Página de registro exibe badge: "✅ Indicado por parceiro CONTADOR-JOAO-2026"
3. Cliente preenche formulário e cria conta
4. Sistema:
   - Cria tenant
   - Captura código de indicação
   - Cria registro em `channel_partner_referrals` com status='pending'
5. Cliente usa o sistema normalmente (trial gratuito ou não)

### 8.4. Primeiro Pagamento

1. Tenant escolhe plano Starter (R$ 99/mês) e faz pagamento
2. Webhook de pagamento aprovado chama `updateReferralStatus(referralId, 'active')`
3. Referral agora está `status='active'` com `first_payment_at = now()`

### 8.5. Cálculo Mensal de Comissão

1. Dia 1º de cada mês, cron executa `calculateMonthlyCommissions()`
2. Sistema:
   - Vê que tenant está em plano Starter (R$ 99)
   - Calcula comissão: R$ 99 × 20% = R$ 19,80
   - Cria registro em `channel_partner_commissions`:
     ```
     month_reference: "2026-02"
     referral_id: <id>
     channel_partner_id: <id>
     plan_name: "starter"
     plan_amount: 99.00
     commission_rate: 20.00
     commission_amount: 19.80
     status: "pending"
     ```
   - Atualiza `channel_partner_referrals`:
     ```
     total_months_paid: 1
     total_commission_earned: 19.80
     ```

### 8.6. Pagamento ao Parceiro

1. Admin acessa **Dashboard de Parcerias**
2. Vê comissão pendente de R$ 19,80 para João Silva
3. Faz transferência PIX para a chave cadastrada
4. Marca comissão como paga, informando código da transferência
5. Sistema atualiza:
   - `commission.status = 'paid'`
   - `commission.paid_at = now()`
   - `referral.total_commission_paid = 19.80`

### 8.7. Parceiro Visualiza Ganhos

João Silva pode acessar o dashboard (se implementar portal do parceiro) e ver:

- Total de indicações: 1
- Indicações ativas: 1
- Total ganho: R$ 19,80
- Total pago: R$ 19,80
- MRR estimado: R$ 19,80/mês (enquanto tenant mantiver plano)

---

## 9. Cenários Avançados

### 9.1. Tenant Faz Upgrade de Plano

```typescript
// Quando tenant altera de Starter → Growth
const oldPlan = "starter"; // R$ 99
const newPlan = "growth"; // R$ 249

// No próximo cálculo mensal, comissão será:
// R$ 249 × 20% = R$ 49,80 (automaticamente reflete o plano atual)
```

**Comportamento:**

- `calculateMonthlyCommissions()` sempre lê o plano ATUAL do tenant
- Snapshots mensais capturam o plano vigente naquele mês
- Histórico de comissões mostra evolução ao longo do tempo

### 9.2. Tenant Cancela Assinatura

```typescript
// Quando tenant cancela
await updateReferralStatus(referralId, "churned");
```

**Efeitos:**

- Referral.status = 'churned'
- `calculateMonthlyCommissions()` ignora referrals com status != 'active'
- Nenhuma nova comissão é gerada
- Total ganho e total pago permanecem inalterados (histórico)

### 9.3. Channel Partner Inativado

```typescript
// Admin desativa parceiro
await updateChannelPartner(partnerId, { status: "inactive" });
```

**Efeitos:**

- Novos tenants NÃO podem usar o código (verificação em `captureReferralOnRegistration`)
- Referrals ATIVOS continuam gerando comissões (não afeta tenants existentes)
- Admin pode reativar depois se necessário

### 9.4. Múltiplas Indicações do Mesmo Parceiro

João Silva indica 5 tenants diferentes:

- Tenant A (Starter R$ 99) → comissão R$ 19,80/mês
- Tenant B (Growth R$ 249) → comissão R$ 49,80/mês
- Tenant C (Free) → sem comissão
- Tenant D (Scale R$ 499) → comissão R$ 99,80/mês
- Tenant E (Growth R$ 249) → comissão R$ 49,80/mês

**Total MRR do parceiro:** R$ 219,20/mês

### 9.5. Tenant Tenta se Cadastrar com 2 Códigos Diferentes

```
Registro com: ?ref=CONTADOR-JOAO-2026
```

O sistema cria referral para João Silva.

Se o mesmo tenant tentar registrar novamente com outro código, **a constraint UNIQUE em `tenant_id`** impede duplicatas. O primeiro parceiro que indicou mantém o crédito.

---

## 10. Métricas e KPIs

### 10.1. Dashboard Global (Admin)

**Métricas exibidas em `channel-partner-dashboard.tsx`:**

- **Parceiros Ativos:** Total de channel partners com status='active'
- **Tenants Indicados:** Total de referrals criados
- **Tenants Pagantes:** Referrals com status='active' (fazendo pagamentos)
- **Comissão Total Gerada:** Soma de `total_commission_earned` de todos os referrals
- **Comissão Paga:** Soma de `total_commission_paid`
- **Pendente de Pagamento:** Soma das comissões com status='pending'

**Lista por parceiro:**

- Nome do parceiro
- Código de indicação
- Taxa de comissão
- Total de indicações
- Indicações ativas
- Total ganho
- Total pago
- Pendente
- MRR estimado (comissão mensal recorrente)

### 10.2. Views Pré-Calculadas

A migration cria 2 views otimizadas:

**`channel_partner_dashboard`:**

```sql
SELECT
  cp.id,
  cp.contact_name,
  COUNT(DISTINCT cpr.id) as total_referrals,
  COUNT(DISTINCT CASE WHEN cpr.status = 'active' THEN cpr.id END) as active_referrals,
  SUM(cpr.total_commission_earned) as total_earned,
  SUM(cpr.total_commission_paid) as total_paid
FROM channel_partners cp
LEFT JOIN channel_partner_referrals cpr ON cp.id = cpr.channel_partner_id
GROUP BY cp.id;
```

**`channel_commissions_summary`:**

```sql
SELECT
  month_reference,
  COUNT(DISTINCT channel_partner_id) as active_partners,
  SUM(commission_amount) as total_commission,
  SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END) as paid_commission,
  SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END) as pending_commission
FROM channel_partner_commissions
GROUP BY month_reference
ORDER BY month_reference DESC;
```

Use essas views para dashboards analíticos e relatórios gerenciais.

---

## 11. Checklist de Testes

Após integração, execute estes testes:

### ✅ Teste 1: Cadastro de Channel Partner

- [ ] Admin cria channel partner
- [ ] Código de indicação é gerado automaticamente
- [ ] Código é único (não repete)
- [ ] Link de indicação é copiável
- [ ] Dados do parceiro são salvos corretamente

### ✅ Teste 2: Captura de Indicação

- [ ] Abrir link com `?ref=CODIGO` em navegador incógnito
- [ ] Registrar novo tenant
- [ ] Verificar que registro em `channel_partner_referrals` foi criado
- [ ] Referral tem status='pending'
- [ ] UTM params foram capturados (se enviados)

### ✅ Teste 3: Ativação ao Primeiro Pagamento

- [ ] Tenant indicado faz primeiro pagamento
- [ ] Verificar que referral.status mudou para 'active'
- [ ] Campo `first_payment_at` foi preenchido

### ✅ Teste 4: Cálculo de Comissões

- [ ] Executar `calculateMonthlyCommissions()` manualmente
- [ ] Verificar criação de registro em `channel_partner_commissions`
- [ ] Verificar valor calculado: `plan_amount * (commission_rate/100)`
- [ ] Comissão tem status='pending'
- [ ] Métricas do referral foram atualizadas

### ✅ Teste 5: Pagamento de Comissão

- [ ] Admin marca comissão como paga
- [ ] Status muda para 'paid'
- [ ] Campo `paid_at` é preenchido
- [ ] `total_commission_paid` do referral é atualizado

### ✅ Teste 6: Dashboard

- [ ] Abrir dashboard de channel partners
- [ ] Verificar métricas globais corretas
- [ ] Verificar lista de parceiros com dados corretos
- [ ] MRR estimado está calculado

### ✅ Teste 7: Cenários de Erro

- [ ] Registrar tenant SEM código de indicação → deve funcionar normalmente
- [ ] Registrar com código INVÁLIDO → deve ignorar e continuar registro
- [ ] Registrar com código de parceiro INATIVO → deve ignorar
- [ ] Tentar criar referral DUPLICADO para mesmo tenant → deve falhar (constraint UNIQUE)

### ✅ Teste 8: Upgrade/Downgrade

- [ ] Tenant indicado faz upgrade de plano
- [ ] Próxima comissão reflete novo valor
- [ ] Histórico mostra evolução dos planos

### ✅ Teste 9: Churn

- [ ] Tenant indicado cancela assinatura
- [ ] Referral.status muda para 'churned'
- [ ] Próximo cálculo mensal NÃO gera comissão para esse tenant

---

## 12. Troubleshooting

### Problema: Referral não foi criado no registro

**Possíveis causas:**

1. Código de indicação não estava na URL
2. Código na URL não existe no banco
3. Channel partner está inativo
4. Erro na função `captureReferralOnRegistration` (check console logs)

**Como verificar:**

```sql
-- Ver todos os channel partners ativos
SELECT referral_code, status FROM channel_partners WHERE status = 'active';

-- Ver referrals criados hoje
SELECT * FROM channel_partner_referrals WHERE created_at::date = CURRENT_DATE;
```

### Problema: Comissão não foi calculada

**Possíveis causas:**

1. Cron não rodou
2. Referral não está com status='active'
3. Tenant não tem plano configurado em `config.billing.current_plan`
4. Tenant está em plano gratuito

**Como verificar:**

```sql
-- Ver referrals ativos e seus tenants
SELECT
  cpr.id,
  t.company_name,
  cpr.status,
  t.config->'billing'->>'current_plan' as plan
FROM channel_partner_referrals cpr
JOIN tenants t ON cpr.tenant_id = t.id
WHERE cpr.status = 'active';

-- Rodar cálculo manualmente
SELECT * FROM calculate_monthly_commissions('2026-02');
```

### Problema: Comissão foi calculada com valor errado

**Possíveis causas:**

1. Taxa de comissão do partner está diferente de 20%
2. Plano do tenant mudou mas snapshot capturou o anterior
3. PLAN_PRICES em `channel-partners.ts` está desatualizado

**Como verificar:**

```sql
SELECT
  c.month_reference,
  c.plan_name,
  c.plan_amount,
  c.commission_rate,
  c.commission_amount,
  (c.plan_amount * c.commission_rate / 100) as expected_amount
FROM channel_partner_commissions c
WHERE c.id = '<commission_id>';
```

---

## 13. Próximos Passos (Futuras Melhorias)

### 🔮 Fase 1: Portal do Parceiro

- Criar área logada para channel partners visualizarem suas próprias métricas
- Dashboard personalizado com:
  - Total de indicações
  - Total ganho vs pago
  - Histórico de comissões mensais
  - Link de indicação pronto para copiar
  - Material de divulgação (imagens, banners)

### 🔮 Fase 2: Gamificação

- Rankings de parceiros (top performers do mês)
- Metas e bônus (ex: 10+ indicações ativas = +5% comissão)
- Badges e conquistas

### 🔮 Fase 3: Automação de Pagamentos

- Integração com API de PIX para pagamento automático
- Geração de recibos de comissão em PDF
- Envio automático de comprovantes por email

### 🔮 Fase 4: Analytics Avançado

- Funil de conversão (clicks → registros → pagamentos)
- Análise de UTM params (qual canal converte melhor)
- Taxa de churn por parceiro
- LTV (lifetime value) médio dos tenants indicados

### 🔮 Fase 5: Multi-Tier Commissions

- Níveis de parceiros (Bronze, Prata, Ouro, Diamante)
- Taxa de comissão progressiva por performance
- Bônus por volume (ex: >20 tenants ativos = 25% comissão)

---

## 14. Contatos e Suporte

**Desenvolvedor Responsável:** Raul Camilotti  
**Email:** (adicionar email de contato)  
**Documentação Técnica:** Este arquivo + código em `services/channel-partners.ts`

**Tabelas no Banco:**

- `channel_partners`
- `channel_partner_referrals`
- `channel_partner_commissions`

**Views:**

- `channel_partner_dashboard`
- `channel_commissions_summary`

**Serviços:**

- `services/channel-partners.ts` — Funções de negócio
- `services/referral-tracking.ts` — Captura de indicação no registro

**Telas:**

- `app/(app)/Administrador/channel-partners.tsx` — CRUD de parceiros
- `app/(app)/Administrador/channel-partner-dashboard.tsx` — Performance e comissões

---

**Versão:** 1.0  
**Data:** 2026-02-16  
**Status:** Pronto para integração
