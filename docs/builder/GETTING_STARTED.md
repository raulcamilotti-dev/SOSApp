# Criando Seu Primeiro Pack — Guia Prático

> Versão 1.0 · Fevereiro 2026
> Pré-requisito: leia a [Especificação Completa](./PACK_SPECIFICATION.md) para referência dos campos.

---

## Índice

1. [O que é um Pack?](#o-que-é-um-pack)
2. [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
3. [Estrutura de Arquivos](#estrutura-de-arquivos)
4. [Passo 1 — Planeje seu Vertical](#passo-1--planeje-seu-vertical)
5. [Passo 2 — Metadata e Módulos](#passo-2--metadata-e-módulos)
6. [Passo 3 — Categorias de Serviço](#passo-3--categorias-de-serviço)
7. [Passo 4 — Workflows e Etapas](#passo-4--workflows-e-etapas)
8. [Passo 5 — Tipos de Serviço](#passo-5--tipos-de-serviço)
9. [Passo 6 — Transições e Regras](#passo-6--transições-e-regras)
10. [Passo 7 — Roles e Permissões](#passo-7--roles-e-permissões)
11. [Passo 8 — Formulários, Tasks e Documentos](#passo-8--formulários-tasks-e-documentos)
12. [Passo 9 — Custom Fields (Opcional)](#passo-9--custom-fields-opcional)
13. [Passo 10 — Validação e Teste](#passo-10--validação-e-teste)
14. [Registro no Catálogo](#registro-no-catálogo)
15. [Checklist Final](#checklist-final)
16. [Exemplos de Verticals](#exemplos-de-verticals)
17. [Erros Comuns](#erros-comuns)
18. [Próximos Passos](#próximos-passos)

---

## O que é um Pack?

Um Pack é um **arquivo TypeScript que exporta um objeto JSON** com toda a configuração de um vertical de negócio. Quando um tenant ativa o pack, o sistema cria automaticamente categorias, tipos de serviço, workflows, roles, documentos e tudo mais — em segundos.

```
Sem pack:    Tenant configura tudo manualmente (horas/dias)
Com pack:    Tenant escolhe "Pet Shop" → tudo pronto em 10 segundos
```

**Você NÃO precisa:**

- Escrever código React/frontend
- Criar telas ou componentes
- Modificar o banco de dados
- Fazer deploy

**Você SÓ precisa:**

- Criar um arquivo `.ts` com a estrutura correta
- Registrá-lo no catálogo (`data/template-packs/index.ts`)

---

## Ambiente de Desenvolvimento

### Pré-requisitos

```bash
# Node.js 18+ e npm
node --version  # v18.x ou superior

# Clone do repositório
git clone <repo-url>
cd SOSApp
npm install
```

### Arquivos importantes

| Arquivo                              | O que faz                                 |
| ------------------------------------ | ----------------------------------------- |
| `data/template-packs/types.ts`       | Tipos TypeScript — todas as interfaces    |
| `data/template-packs/index.ts`       | Catálogo de packs registrados             |
| `data/template-packs/padrao.ts`      | Pack de referência — comece copiando este |
| `services/template-packs.ts`         | Engine que aplica o pack no banco         |
| `docs/builder/PACK_SPECIFICATION.md` | Referência completa de todos os campos    |

### Dica: TypeScript é seu amigo

O TypeScript valida a estrutura **em tempo real** enquanto você edita. Se algum campo obrigatório estiver faltando ou com tipo errado, o editor avisará imediatamente.

```typescript
// O tipo TemplatePack garante que você não esqueça nada
import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  // TypeScript vai reclamar se faltar qualquer campo obrigatório ✅
};
```

---

## Estrutura de Arquivos

```
data/template-packs/
├── types.ts           ← Tipos (NÃO modifique)
├── index.ts           ← Catálogo (adicione seu pack aqui)
├── padrao.ts          ← Pack Padrão (shell mínimo — aplicado no onboarding)
├── petshop.ts         ← Exemplo simples ★☆☆
├── clinica.ts         ← Exemplo médio ★★☆
├── imobiliaria.ts     ← Exemplo avançado ★★★
└── meu-pack.ts        ← ✨ Seu novo pack aqui!
```

---

## Passo 1 — Planeje seu Vertical

Antes de escrever código, responda estas perguntas:

### 1.1 Quais são os serviços que a empresa oferece?

Liste todos os serviços agrupados por categoria.

**Exemplo — Pet Shop:**

| Categoria   | Serviços                              |
| ----------- | ------------------------------------- |
| Estética    | Banho, Tosa, Banho & Tosa, Hidratação |
| Veterinária | Consulta, Vacinação, Exames, Cirurgia |
| Hospedagem  | Day Care, Hotel Pet                   |
| Comercial   | Venda de Produtos, Assinatura Mensal  |

### 1.2 Qual é o fluxo de trabalho de cada serviço?

Desenhe as etapas que cada serviço percorre do início ao fim.

**Exemplo — Banho & Tosa:**

```
Agendamento → Recepção → Execução → Secagem/Finalização → Entrega
```

**Exemplo — Consulta Veterinária:**

```
Agendamento → Triagem → Consulta → Exames (se necessário) → Retorno → Alta
```

### 1.3 Quais papéis (roles) existem na empresa?

| Role          | O que faz                         |
| ------------- | --------------------------------- |
| Administrador | Gerencia tudo, acessa relatórios  |
| Tosador       | Recebe trabalhos de banho/tosa    |
| Veterinário   | Realiza consultas e procedimentos |
| Recepcionista | Agenda, recebe pets, entrega      |
| Atendente     | Vendas de produtos na loja        |

### 1.4 Quais módulos serão necessários?

Marque os módulos que fazem sentido para o vertical:

- [x] `core` — sempre ativo
- [x] `financial` — se cobra por serviços
- [x] `partners` — se tem profissionais externos
- [x] `documents` — se gera documentos (receitas, laudos)
- [ ] `crm` — se precisa de pipeline de vendas
- [x] `products` — se vende produtos
- [ ] `stock` — se controla estoque
- [ ] `pdv` — se tem ponto de venda
- [ ] `ai_automation` — se usa agentes de IA
- [ ] `onr_cartorio` — só para empresas que protocolam em cartório
- [ ] `bi_analytics` — se precisa de dashboards avançados

---

## Passo 2 — Metadata e Módulos

Crie o arquivo do pack e comece pela metadata:

```typescript
// data/template-packs/pet-shop.ts

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  metadata: {
    key: "pet_shop", // snake_case, único no catálogo
    name: "Pet Shop & Veterinária", // nome para exibição
    description:
      "Pack completo para pet shops, clínicas veterinárias, " +
      "banho e tosa, hotel pet e day care.",
    icon: "paw-outline", // ícone Ionicons
    color: "#f59e0b", // cor hex do card
    version: "1.0.0", // sempre semver X.Y.Z
  },

  tenant_config: {
    specialty: "veterinario", // identificador do segmento
    agent_type: "atendimento", // tipo de IA
    agent_name: "Luna", // nome do agente de IA
    show_price: true, // mostrar preços no portal
    allow_payment: true, // permitir pagamentos online
  },

  modules: [
    "core", // sempre incluir
    "financial", // faturamento, cobranças
    "partners", // parceiros (veterinários externos)
    "documents", // receitas, laudos, carteira de vacinação
    "products", // produtos pet na loja
  ],

  // ... seções seguintes
};

export default pack;
```

### Regras para `metadata.key`

- ✅ `"pet_shop"` — snake_case, descritivo
- ✅ `"clinica_odontologica"` — pode ter mais de uma palavra
- ❌ `"PetShop"` — não use camelCase
- ❌ `"pet shop"` — não use espaços
- ❌ `"pet-shop"` — não use hífens

### Como escolher o ícone

Todos os ícones disponíveis estão no [catálogo Ionicons](https://ionic.io/ionicons). Use a versão `outline` para consistência:

```
paw-outline         → pet shop, veterinária
medkit-outline      → clínica, saúde
home-outline        → imobiliária
car-outline         → autopeças, oficina
school-outline      → escola, educação
restaurant-outline  → restaurante, food
cut-outline         → barbearia, salão
fitness-outline     → academia, esportes
```

---

## Passo 3 — Categorias de Serviço

Categorias agrupam os tipos de serviço no menu. Pense nelas como "departamentos".

```typescript
service_categories: [
  {
    ref_key: "cat_estetica",
    name: "Estética Animal",
    description: "Banho, tosa e cuidados estéticos",
    color: "#3b82f6",
    icon: "water-outline",
    sort_order: 1,
    is_active: true,
  },
  {
    ref_key: "cat_veterinaria",
    name: "Veterinária",
    description: "Consultas, exames e procedimentos clínicos",
    color: "#ef4444",
    icon: "medkit-outline",
    sort_order: 2,
    is_active: true,
  },
  {
    ref_key: "cat_hospedagem",
    name: "Hospedagem",
    description: "Day care e hotel para pets",
    color: "#8b5cf6",
    icon: "bed-outline",
    sort_order: 3,
    is_active: true,
  },
],
```

### Convenções de ref_key

| Prefixo | Entidade           | Exemplo               |
| ------- | ------------------ | --------------------- |
| `cat_`  | Categoria          | `cat_estetica`        |
| `type_` | Tipo de serviço    | `type_banho_tosa`     |
| `wf_`   | Workflow template  | `wf_atendimento`      |
| `step_` | Workflow step      | `step_agendamento`    |
| `role_` | Role               | `role_veterinario`    |
| `doc_`  | Document template  | `doc_receita`         |
| `form_` | Step form          | `form_triagem`        |
| `task_` | Step task template | `task_preparar_sala`  |
| `dr_`   | Deadline rule      | `dr_retorno_48h`      |
| `svc_`  | Service            | `svc_consulta_geral`  |
| `cf_`   | Custom field       | `cf_raca_animal`      |
| `ocr_`  | OCR config         | `ocr_carteira_vacina` |

---

## Passo 4 — Workflows e Etapas

O workflow define as etapas pelas quais um serviço passa. Cada tipo de serviço aponta para **um** workflow.

### Anatomia de um workflow

```
Template: "Atendimento Veterinário"
├── Step 1: Agendamento        (initial)
├── Step 2: Triagem
├── Step 3: Consulta
├── Step 4: Exames/Procedimentos
├── Step 5: Retorno
└── Step 6: Alta               (terminal ✅)
```

### Código

```typescript
workflow_templates: [
  {
    ref_key: "wf_atendimento_vet",
    name: "Atendimento Veterinário",
    description: "Fluxo completo de consulta veterinária",
    service_type_ref: "type_consulta_vet",  // vínculo bidirecional

    steps: [
      {
        ref_key: "step_agendamento_vet",
        name: "Agendamento",
        step_order: 1,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_triagem",
        name: "Triagem",
        step_order: 2,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_consulta",
        name: "Consulta",
        step_order: 3,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_exames",
        name: "Exames / Procedimentos",
        step_order: 4,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_retorno_vet",
        name: "Retorno",
        step_order: 5,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_alta",
        name: "Alta",
        step_order: 6,
        is_terminal: true,   // ← marca como etapa final
        ocr_enabled: false,
        has_protocol: false,
      },
    ],

    transitions: [
      // Fluxo linear: cada etapa avança para a próxima
      {
        from_step_ref: "step_agendamento_vet",
        to_step_ref: "step_triagem",
      },
      {
        from_step_ref: "step_triagem",
        to_step_ref: "step_consulta",
      },
      {
        from_step_ref: "step_consulta",
        to_step_ref: "step_exames",
      },
      {
        from_step_ref: "step_exames",
        to_step_ref: "step_retorno_vet",
      },
      {
        from_step_ref: "step_retorno_vet",
        to_step_ref: "step_alta",
      },
      // Atalho: pular exames se não necessário
      {
        from_step_ref: "step_consulta",
        to_step_ref: "step_retorno_vet",
      },
      // Voltar da triagem para consulta anterior
      {
        from_step_ref: "step_triagem",
        to_step_ref: "step_agendamento_vet",
      },
    ],
  },

  // Workflow simples para banho & tosa (3 etapas)
  {
    ref_key: "wf_banho_tosa",
    name: "Banho & Tosa",
    description: "Fluxo rápido para serviços de estética",
    service_type_ref: "type_banho_tosa",

    steps: [
      {
        ref_key: "step_recepcao_pet",
        name: "Recepção do Pet",
        step_order: 1,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_execucao_estetica",
        name: "Execução",
        step_order: 2,
        is_terminal: false,
        ocr_enabled: false,
        has_protocol: false,
      },
      {
        ref_key: "step_entrega_pet",
        name: "Entrega",
        step_order: 3,
        is_terminal: true,
        ocr_enabled: false,
        has_protocol: false,
      },
    ],

    transitions: [
      { from_step_ref: "step_recepcao_pet", to_step_ref: "step_execucao_estetica" },
      { from_step_ref: "step_execucao_estetica", to_step_ref: "step_entrega_pet" },
    ],
  },
],
```

### Padrões comuns de workflow

```
Linear simples (3 etapas):
  Início → Execução → Conclusão

Linear com preparação (5 etapas):
  Entrada → Preparação → Execução → Revisão → Conclusão

Com bifurcação:
  Entrada → Análise → { se aprovado: Execução }
                       { se reprovado: Conclusão }
  Execução → Conclusão

Cíclico (permite retorno):
  Fluxo linear + transições de volta para etapas anteriores
```

> **Dica:** Comece com workflows lineares simples. Você pode adicionar transições alternativas (atalhos, retornos) depois.

---

## Passo 5 — Tipos de Serviço

Tipos de serviço são os itens que o cliente contrata. Cada tipo pertence a uma categoria e usa um workflow.

```typescript
service_types: [
  {
    ref_key: "type_banho_tosa",
    name: "Banho & Tosa",
    description: "Banho com shampoo premium e tosa higiênica ou na máquina",
    icon: "water-outline",
    color: "#3b82f6",
    is_active: true,
    category_ref: "cat_estetica",         // → aponta para service_categories
    workflow_ref: "wf_banho_tosa",        // → aponta para workflow_templates
  },
  {
    ref_key: "type_consulta_vet",
    name: "Consulta Veterinária",
    description: "Consulta clínica geral com veterinário",
    icon: "medkit-outline",
    color: "#ef4444",
    is_active: true,
    category_ref: "cat_veterinaria",
    workflow_ref: "wf_atendimento_vet",
  },
  {
    ref_key: "type_vacinacao",
    name: "Vacinação",
    description: "Aplicação de vacinas com registro em carteira",
    icon: "fitness-outline",
    color: "#10b981",
    is_active: true,
    category_ref: "cat_veterinaria",
    workflow_ref: "wf_atendimento_vet",   // mesmo workflow, processo parecido
  },
  {
    ref_key: "type_daycare",
    name: "Day Care",
    description: "Creche para pets durante o dia",
    icon: "sunny-outline",
    color: "#8b5cf6",
    is_active: true,
    category_ref: "cat_hospedagem",
    workflow_ref: "wf_banho_tosa",        // workflow simples (recepção → ? → entrega)
  },
],
```

### Vínculo bidirecional: service_type ↔ workflow

Cada `service_type` aponta para um `workflow_template` via `workflow_ref`, e cada `workflow_template` pode apontar de volta via `service_type_ref`. Isso permite que o sistema saiba qual workflow usar quando o cliente contrata um serviço.

```
service_type (type_consulta_vet)
      │
      └── workflow_ref: "wf_atendimento_vet"
              │
              └── service_type_ref: "type_consulta_vet"
```

> **Nota:** Vários tipos de serviço podem compartilhar o mesmo workflow. Ex: "Consulta" e "Vacinação" usam o mesmo workflow "Atendimento Veterinário".

---

## Passo 6 — Transições e Regras

### Transições (já definidas nos steps)

As transições estão **dentro** do `workflow_templates[].transitions`. Cada transição define de qual step para qual step o processo pode avançar.

### Deadline Rules (prazos)

Deadline rules definem SLAs para etapas específicas. São opcionais mas recomendadas para processos com prazo.

```typescript
deadline_rules: [
  {
    ref_key: "dr_triagem_4h",
    name: "Triagem em 4 horas",
    description: "Paciente deve ser triado em até 4 horas após agendamento",
    step_ref: "step_triagem",       // → aponta para workflow_steps
    hours: 4,
    priority: "high",
    notify_before_hours: 1,         // avisa 1h antes de vencer
  },
  {
    ref_key: "dr_retorno_48h",
    name: "Retorno em 48 horas",
    description: "Resultado dos exames deve ser comunicado em até 48h",
    step_ref: "step_retorno_vet",
    hours: 48,
    priority: "medium",
    notify_before_hours: 12,
  },
],
```

### Step Task Templates (tarefas automáticas)

Tarefas são criadas automaticamente quando o processo chega em uma etapa. Útil para checklists obrigatórios.

```typescript
step_task_templates: [
  {
    ref_key: "task_verificar_vacinas",
    name: "Verificar carteira de vacinação",
    description: "Conferir se as vacinas estão em dia",
    step_ref: "step_triagem",
    assigned_role_ref: "role_veterinario",   // → quem deve executar
    is_required: true,                       // obrigatória para avançar
    sort_order: 1,
  },
  {
    ref_key: "task_pesar_animal",
    name: "Pesar o animal",
    description: "Registrar peso para dosagem de medicamentos",
    step_ref: "step_triagem",
    assigned_role_ref: "role_veterinario",
    is_required: true,
    sort_order: 2,
  },
  {
    ref_key: "task_preparar_area",
    name: "Preparar área de banho",
    description: "Separar shampoo, toalhas e secar",
    step_ref: "step_execucao_estetica",
    assigned_role_ref: "role_tosador",
    is_required: false,
    sort_order: 1,
  },
],
```

---

## Passo 7 — Roles e Permissões

Roles definem quem pode fazer o que no sistema. Cada role recebe um conjunto de permissões.

```typescript
roles: [
  {
    ref_key: "role_admin_pet",
    name: "Administrador Pet Shop",
    description: "Acesso total ao sistema",
    is_system: false,
    permissions: [
      "manage_customers", "view_customers",
      "manage_service_orders", "view_service_orders",
      "manage_service_types", "view_service_types",
      "manage_workflows", "view_workflows",
      "manage_partners", "view_partners",
      "manage_invoices", "view_invoices",
      "manage_documents", "view_documents",
      "view_dashboard", "manage_settings",
      "manage_users", "view_users",
      "manage_roles", "view_roles",
    ],
  },
  {
    ref_key: "role_veterinario",
    name: "Veterinário",
    description: "Acesso a consultas e prontuários",
    is_system: false,
    permissions: [
      "view_customers",
      "manage_service_orders", "view_service_orders",
      "view_service_types",
      "view_workflows",
      "manage_documents", "view_documents",
    ],
  },
  {
    ref_key: "role_tosador",
    name: "Tosador / Banhista",
    description: "Acesso aos serviços de estética",
    is_system: false,
    permissions: [
      "view_customers",
      "view_service_orders",
      "view_service_types",
      "view_workflows",
    ],
  },
  {
    ref_key: "role_recepcionista",
    name: "Recepcionista",
    description: "Agendamento e atendimento ao cliente",
    is_system: false,
    permissions: [
      "manage_customers", "view_customers",
      "manage_service_orders", "view_service_orders",
      "view_service_types",
      "view_workflows",
      "view_invoices",
    ],
  },
],
```

### Permissões disponíveis

Veja a lista completa no [PACK_SPECIFICATION.md → PackRole](./PACK_SPECIFICATION.md#packrole). As mais comuns:

| Permissão               | O que permite                   |
| ----------------------- | ------------------------------- |
| `manage_customers`      | Criar/editar/excluir clientes   |
| `view_customers`        | Ver lista de clientes           |
| `manage_service_orders` | Criar/editar ordens de serviço  |
| `view_service_orders`   | Ver ordens de serviço           |
| `manage_invoices`       | Criar/editar faturas            |
| `view_invoices`         | Ver faturas                     |
| `manage_documents`      | Criar/editar documentos         |
| `view_documents`        | Ver documentos                  |
| `manage_partners`       | Gerenciar parceiros             |
| `manage_users`          | Gerenciar usuários              |
| `manage_roles`          | Gerenciar roles/permissões      |
| `manage_settings`       | Alterar configurações do tenant |
| `view_dashboard`        | Ver dashboard e relatórios      |

---

## Passo 8 — Formulários, Tasks e Documentos

### Step Forms (formulários por etapa)

Formulários aparecem quando o operador está em uma etapa específica do workflow. Use para coletar dados estruturados.

```typescript
step_forms: [
  {
    ref_key: "form_triagem_pet",
    name: "Ficha de Triagem",
    description: "Dados coletados na triagem do animal",
    step_ref: "step_triagem",
    schema: {
      fields: [
        { key: "peso", label: "Peso (kg)", type: "number", required: true },
        { key: "temperatura", label: "Temperatura (°C)", type: "number", required: true },
        {
          key: "sintomas",
          label: "Sintomas relatados",
          type: "multiline",
          required: false,
        },
        {
          key: "urgencia",
          label: "Nível de urgência",
          type: "select",
          options: ["Baixo", "Médio", "Alto", "Emergência"],
          required: true,
        },
      ],
    },
    sort_order: 1,
  },
  {
    ref_key: "form_recepcao_estetica",
    name: "Check-in Estética",
    description: "Dados de entrada para banho e tosa",
    step_ref: "step_recepcao_pet",
    schema: {
      fields: [
        {
          key: "tipo_pelagem",
          label: "Tipo de pelagem",
          type: "select",
          options: ["Curta", "Média", "Longa", "Dupla camada"],
          required: true,
        },
        {
          key: "observacoes_pele",
          label: "Observações de pele",
          type: "multiline",
          required: false,
        },
        {
          key: "tosa_tipo",
          label: "Tipo de tosa",
          type: "select",
          options: ["Higiênica", "Na máquina", "Na tesoura", "Raça"],
          required: false,
        },
      ],
    },
    sort_order: 1,
  },
],
```

### Document Templates (modelos de documento)

Documentos são gerados a partir de templates HTML com variáveis que são preenchidas automaticamente.

```typescript
document_templates: [
  {
    ref_key: "doc_receita_vet",
    name: "Receita Veterinária",
    description: "Prescrição de medicamentos",
    content: `
      <h1>Receita Veterinária</h1>
      <p><strong>Paciente:</strong> {{customer_name}}</p>
      <p><strong>Pet:</strong> {{pet_name}}</p>
      <p><strong>Data:</strong> {{date}}</p>
      <hr/>
      <h2>Prescrição</h2>
      <p>{{prescription}}</p>
      <hr/>
      <p><strong>Veterinário:</strong> {{partner_name}}</p>
      <p><strong>CRMV:</strong> {{partner_crmv}}</p>
    `,
    is_active: true,
    category: "medical",
  },
  {
    ref_key: "doc_carteira_vacina",
    name: "Carteira de Vacinação",
    description: "Registro de vacinas aplicadas no pet",
    content: `
      <h1>Carteira de Vacinação</h1>
      <p><strong>Tutor:</strong> {{customer_name}}</p>
      <p><strong>Pet:</strong> {{pet_name}}</p>
      <table>
        <tr><th>Vacina</th><th>Data</th><th>Lote</th><th>Veterinário</th></tr>
        {{#vaccines}}
        <tr><td>{{name}}</td><td>{{date}}</td><td>{{lot}}</td><td>{{vet}}</td></tr>
        {{/vaccines}}
      </table>
    `,
    is_active: true,
    category: "medical",
  },
],
```

### Services (serviços pré-cadastrados)

A lista `services` define serviços prontos para uso que o tenant já terá ao ativar o pack.

```typescript
services: [
  {
    ref_key: "svc_banho_p",
    name: "Banho Pequeno Porte",
    description: "Banho para cães até 10kg",
    type_ref: "type_banho_tosa",        // → tipo de serviço
    estimated_price: 50.0,
    estimated_duration_minutes: 60,
    is_active: true,
  },
  {
    ref_key: "svc_banho_m",
    name: "Banho Médio Porte",
    description: "Banho para cães de 10 a 25kg",
    type_ref: "type_banho_tosa",
    estimated_price: 70.0,
    estimated_duration_minutes: 90,
    is_active: true,
  },
  {
    ref_key: "svc_consulta_geral",
    name: "Consulta Geral",
    description: "Consulta clínica geral com veterinário",
    type_ref: "type_consulta_vet",
    estimated_price: 120.0,
    estimated_duration_minutes: 30,
    is_active: true,
  },
],
```

---

## Passo 9 — Custom Fields (Opcional)

Custom fields adicionam campos extras a tabelas existentes — sem modificar o banco de dados. Perfeito para dados específicos do vertical.

```typescript
custom_fields: [
  {
    ref_key: "cf_raca",
    target_table: "customers",           // em qual tabela aparece
    field_key: "raca_animal",            // nome do campo (snake_case)
    field_type: "select",                // tipo do campo
    label: "Raça do Animal",
    description: "Raça do pet principal do cliente",
    is_required: false,
    sort_order: 1,
    options: {
      choices: [
        "Golden Retriever", "Labrador", "Poodle", "Bulldog",
        "Pastor Alemão", "Shih Tzu", "Yorkshire", "Pitbull",
        "SRD (Sem Raça Definida)", "Outro",
      ],
    },
  },
  {
    ref_key: "cf_porte",
    target_table: "customers",
    field_key: "porte_animal",
    field_type: "select",
    label: "Porte",
    is_required: false,
    sort_order: 2,
    options: {
      choices: ["Mini (até 5kg)", "Pequeno (5-10kg)", "Médio (10-25kg)", "Grande (25-45kg)", "Gigante (45kg+)"],
    },
  },
  {
    ref_key: "cf_alergias",
    target_table: "customers",
    field_key: "alergias_conhecidas",
    field_type: "text",
    label: "Alergias Conhecidas",
    description: "Alergias a produtos ou medicamentos",
    is_required: false,
    sort_order: 3,
  },
  {
    ref_key: "cf_chip",
    target_table: "customers",
    field_key: "numero_microchip",
    field_type: "text",
    label: "Nº do Microchip",
    is_required: false,
    sort_order: 4,
  },
],
```

### Tipos de custom field disponíveis

| Tipo        | Descrição                       | Quando usar                     |
| ----------- | ------------------------------- | ------------------------------- |
| `text`      | Texto livre                     | Campos curtos (nome, código)    |
| `multiline` | Texto multilinha                | Observações, descrições         |
| `number`    | Número                          | Peso, quantidade                |
| `currency`  | Valor monetário (R$)            | Preços, custos                  |
| `date`      | Data                            | Datas de nascimento, vencimento |
| `boolean`   | Sim/Não                         | Flags, checkboxes               |
| `select`    | Lista de opções (escolha única) | Categorias, tipos               |
| `reference` | Vínculo com outra tabela        | Relacionamentos                 |

---

## Passo 10 — Validação e Teste

### Validação automática

Use o validador do pack para verificar erros antes de aplicar:

```bash
# Validar um pack
npx ts-node scripts/validate-pack.ts data/template-packs/pet-shop.ts
```

O validador verifica:

- ✅ Todos os `ref_key` são únicos dentro de cada tipo
- ✅ Todas as cross-references (`category_ref`, `workflow_ref`, etc.) apontam para entidades existentes
- ✅ Campos obrigatórios estão preenchidos
- ✅ Transições apontam para steps do mesmo template
- ✅ Deadline rules e tasks apontam para steps válidos

### Verificação manual no TypeScript

O TypeScript já valida o formato automaticamente. Se o editor mostrar erros, corrija antes de prosseguir.

```bash
# Verificar tipos
npx tsc --noEmit
```

### Testando no ambiente local

1. **Registre o pack** no catálogo (próxima seção)
2. **Inicie o app** com `npm start`
3. **Crie um tenant de teste** ou use um existente
4. **Abra:** Administrador → Template Packs
5. **Aplique** o seu pack
6. **Verifique** que categorias, tipos, workflows e roles foram criados

> **Importante:** `applyTemplatePack()` é **aditivo** — ele não apaga dados existentes. Se aplicar o pack duas vezes, os registros serão duplicados. Para limpar, use `clearPackData()` antes.

---

## Registro no Catálogo

Após criar o pack, registre-o em `data/template-packs/index.ts`:

```typescript
// data/template-packs/index.ts

import type { TemplatePack } from "./types";
import padrao from "./padrao";
import petshop from "./petshop";
import clinica from "./clinica";
import imobiliaria from "./imobiliaria";
import meuPack from "./meu-pack"; // ← ADICIONE O SEU

export const PACKS: Record<string, TemplatePack> = {
  padrao,
  petshop,
  clinica,
  imobiliaria,
  meu_pack: meuPack, // ← REGISTRE COM A MESMA KEY da metadata
};
```

Após registrar, o pack aparecerá automaticamente na tela de seleção de template pack (Administrador → Template Packs).

---

## Checklist Final

Antes de submeter seu pack, verifique:

### Estrutura

- [ ] Arquivo `.ts` em `data/template-packs/`
- [ ] `export default pack` no final do arquivo
- [ ] Importa `type { TemplatePack } from "./types"`
- [ ] Registrado em `index.ts` com a mesma key da metadata

### Metadata

- [ ] `key` é snake_case, único, sem espaços ou acentos
- [ ] `name` é descritivo e claro
- [ ] `description` tem 1-2 frases explicando o vertical
- [ ] `icon` é um nome válido de Ionicons (com `-outline`)
- [ ] `color` é um hex válido (`#xxxxxx`)
- [ ] `version` segue semver (`X.Y.Z`)

### Conteúdo

- [ ] Pelo menos 1 categoria de serviço
- [ ] Pelo menos 1 tipo de serviço
- [ ] Pelo menos 1 workflow com 3+ etapas
- [ ] Pelo menos 2 roles (admin + operador)
- [ ] Transições cobrem o fluxo completo (início → fim)
- [ ] Pelo menos 1 step terminal (`is_terminal: true`) por workflow

> **Nota:** O pack `padrao` é uma exceção — ele é o shell mínimo aplicado no onboarding e não contém categorias nem tipos. Packs de marketplace ADICIONAM conteúdo (categorias, tipos, serviços) por cima do padrao. Nunca substituem.

- [ ] Módulos fazem sentido para o vertical

### Cross-references

- [ ] Todo `category_ref` aponta para um `service_categories[].ref_key`
- [ ] Todo `workflow_ref` aponta para um `workflow_templates[].ref_key`
- [ ] Todo `service_type_ref` aponta para um `service_types[].ref_key`
- [ ] Todo `step_ref` aponta para um step existente
- [ ] Todo `assigned_role_ref` aponta para um `roles[].ref_key`
- [ ] Todo `type_ref` aponta para um `service_types[].ref_key`

### Validação

- [ ] `npx tsc --noEmit` passa sem erros
- [ ] Validador do pack passa sem warnings
- [ ] Pack foi aplicado com sucesso em um tenant de teste

---

## Exemplos de Verticals

### Pet Shop & Veterinária

Exemplo completo demonstrado ao longo deste guia. Categorias: Estética, Veterinária, Hospedagem. Workflows: Banho & Tosa (3 etapas), Atendimento Veterinário (6 etapas). Custom fields: raça, porte, alergias, microchip.

### Clínica de Saúde

```
Categorias:  Consultas, Exames, Procedimentos, Retornos
Workflows:   Consulta (5 etapas), Procedimento (7 etapas), Exame (4 etapas)
Roles:       Médico, Enfermeiro, Recepcionista, Admin
Forms:       Anamnese, Prescrição, Evolução
Documents:   Atestado, Receita, Laudo, Encaminhamento
Módulos:     core, financial, documents, partners
Custom:      CRM (conselho), especialidade, convênio
```

### Imobiliária

```
Categorias:  Vendas, Locação, Administração, Jurídico
Workflows:   Venda (8 etapas), Locação (6 etapas), Vistoria (4 etapas)
Roles:       Corretor, Gerente, Jurídico, Admin
Forms:       Ficha do imóvel, Proposta, Checklist vistoria
Documents:   Contrato de venda, Contrato de locação, Laudo de vistoria
Módulos:     core, financial, documents, crm, partners
Custom:      CRECI, tipo do imóvel, metragem, valor do condomínio
```

---

## Erros Comuns

### ❌ ref_key duplicado

```
Erro: Duplicate ref_key "step_inicio" found in workflow_steps
```

**Solução:** Use ref_keys únicos. Adicione contexto: `step_inicio_banho`, `step_inicio_consulta`.

### ❌ Cross-reference inválida

```
Erro: service_type "type_exame" references category_ref "cat_exames" which does not exist
```

**Solução:** Verifique que o `ref_key` da categoria existe exatamente como referenciado. Typos são a causa mais comum.

### ❌ Workflow sem step terminal

```
Erro: Workflow "wf_atendimento" has no terminal step
```

**Solução:** Pelo menos um step do workflow deve ter `is_terminal: true`.

### ❌ Transição referencia step de outro template

```
Erro: Transition from_step_ref "step_inicio" does not belong to template "wf_banho"
```

**Solução:** Transições só podem conectar steps do **mesmo** workflow template.

### ❌ Módulo desconhecido

```
Erro: Unknown module key "inventario"
```

**Solução:** Use apenas módulos válidos. Veja a lista completa no [PACK_SPECIFICATION.md](./PACK_SPECIFICATION.md#modules).

### ❌ Pack duplica dados ao ser aplicado novamente

**Isso é esperado.** O `applyTemplatePack()` é aditivo. Para reaplicar:

```typescript
import { clearPackData, applyTemplatePack } from "@/services/template-packs";

// 1. Limpa dados do pack anterior
await clearPackData(tenantId, "pet_shop");

// 2. Aplica o pack novamente
await applyTemplatePack(tenantId, petShopPack);
```

---

## Próximos Passos

Após criar seu pack com sucesso:

1. **Teste com um tenant real** — Crie uma conta de teste e aplique o pack como um cliente faria
2. **Peça feedback** — Mostre para alguém do segmento e ajuste categorias/workflows
3. **Refine os formulários** — Formulários bons reduzem perguntas do operador
4. **Adicione documentos** — Templates de documentos são o diferencial para o usuário final
5. **Considere custom fields** — Campos específicos do vertical enriquecem o CrudScreen
6. **Crie um Agent Pack** — Se o vertical usa IA para atendimento, veja o [PACK_SPECIFICATION.md → AgentTemplatePack](./PACK_SPECIFICATION.md#agenttemplatepack--estrutura-completa)

---

_Guia criado em Fevereiro 2026 · Baseado na Radul Platform v1.0_
