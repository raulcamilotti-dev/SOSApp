/* ================================================================== */
/*  Pack: Pet Shop & Veterinária (Simple Example)                      */
/*                                                                     */
/*  Demonstrates a SIMPLE vertical pack:                               */
/*  - 2 categories, 4 types, 2 workflows                              */
/*  - Pre-configured services with prices                              */
/*  - Domain-specific roles (Atendente, Veterinário)                   */
/*  - No forms, no deadlines, no custom fields                         */
/*                                                                     */
/*  Complexity: ★☆☆ (beginner-friendly)                                */
/* ================================================================== */

import type { TemplatePack } from "./types";

const pack: TemplatePack = {
  /* ─── Metadata ─── */

  metadata: {
    key: "petshop",
    name: "Pet Shop & Veterinária",
    description:
      "Pack para pet shops, clínicas veterinárias e hotéis pet. Inclui banho/tosa, consultas e vacinação com preços pré-configurados.",
    icon: "paw-outline",
    color: "#f59e0b",
    version: "1.0.0",
  },

  tenant_config: {
    specialty: "pet",
    agent_type: "atendente",
    agent_name: "PetBot",
    show_price: true,
    allow_payment: true,
  },

  modules: ["core", "financial"],

  /* ─── Categories ─── */

  service_categories: [
    {
      ref_key: "cat_estetica",
      name: "Estética Pet",
      description: "Banho, tosa e cuidados estéticos",
      color: "#f59e0b",
      icon: "cut-outline",
      sort_order: 1,
      is_active: true,
    },
    {
      ref_key: "cat_saude",
      name: "Saúde Animal",
      description: "Consultas veterinárias e vacinação",
      color: "#10b981",
      icon: "medkit-outline",
      sort_order: 2,
      is_active: true,
    },
  ],

  /* ─── Service Types ─── */

  service_types: [
    {
      ref_key: "tipo_banho_tosa",
      name: "Banho e Tosa",
      description: "Serviço completo de banho e tosa para cães e gatos",
      icon: "water-outline",
      color: "#3b82f6",
      is_active: true,
      category_ref: "cat_estetica",
      workflow_ref: "wf_servico_pet",
    },
    {
      ref_key: "tipo_banho",
      name: "Banho Simples",
      description: "Banho com shampoo e secagem",
      icon: "water-outline",
      color: "#06b6d4",
      is_active: true,
      category_ref: "cat_estetica",
      workflow_ref: "wf_servico_pet",
    },
    {
      ref_key: "tipo_consulta_vet",
      name: "Consulta Veterinária",
      description: "Atendimento clínico veterinário",
      icon: "medical-outline",
      color: "#10b981",
      is_active: true,
      category_ref: "cat_saude",
      workflow_ref: "wf_consulta_vet",
    },
    {
      ref_key: "tipo_vacina",
      name: "Vacinação",
      description: "Aplicação de vacinas",
      icon: "fitness-outline",
      color: "#8b5cf6",
      is_active: true,
      category_ref: "cat_saude",
      workflow_ref: "wf_consulta_vet",
    },
  ],

  /* ─── Workflows ─── */

  workflow_templates: [
    {
      ref_key: "wf_servico_pet",
      name: "Serviço Pet (Banho/Tosa)",
      steps: [
        {
          ref_key: "sp_s01",
          name: "Recebido",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "sp_s02",
          name: "Em Atendimento",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "sp_s03",
          name: "Pronto para Retirada",
          step_order: 3,
          is_terminal: false,
        },
        {
          ref_key: "sp_s04",
          name: "Entregue",
          step_order: 4,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "sp_s01",
          to_step_ref: "sp_s02",
          name: "Iniciar atendimento",
        },
        {
          from_step_ref: "sp_s02",
          to_step_ref: "sp_s03",
          name: "Finalizar serviço",
        },
        {
          from_step_ref: "sp_s03",
          to_step_ref: "sp_s04",
          name: "Confirmar retirada",
        },
      ],
    },
    {
      ref_key: "wf_consulta_vet",
      name: "Consulta Veterinária",
      steps: [
        {
          ref_key: "cv_s01",
          name: "Agendado",
          step_order: 1,
          is_terminal: false,
        },
        {
          ref_key: "cv_s02",
          name: "Em Consulta",
          step_order: 2,
          is_terminal: false,
        },
        {
          ref_key: "cv_s03",
          name: "Concluído",
          step_order: 3,
          is_terminal: true,
        },
      ],
      transitions: [
        {
          from_step_ref: "cv_s01",
          to_step_ref: "cv_s02",
          name: "Iniciar consulta",
        },
        {
          from_step_ref: "cv_s02",
          to_step_ref: "cv_s03",
          name: "Finalizar consulta",
        },
        {
          from_step_ref: "cv_s02",
          to_step_ref: "cv_s01",
          name: "Reagendar",
        },
      ],
    },
  ],

  /* ─── Empty sections (simple pack — no forms/deadlines/tasks) ─── */

  deadline_rules: [],
  step_task_templates: [],
  step_forms: [],
  document_templates: [],

  /* ─── Roles ─── */

  roles: [
    {
      ref_key: "role_admin",
      name: "admin",
      permissions: ["admin.full"],
    },
    {
      ref_key: "role_atendente",
      name: "Atendente",
      permissions: [
        "customer.read",
        "customer.write",
        "service.read",
        "service.request",
        "process_update.read",
        "process_update.write",
        "task.read",
        "task.write",
        "appointment.read",
        "appointment.write",
      ],
    },
    {
      ref_key: "role_veterinario",
      name: "Veterinário",
      permissions: [
        "customer.read",
        "service.read",
        "process_update.read",
        "process_update.write",
        "task.read",
        "task.write",
        "document.read",
        "document.write",
        "appointment.read",
        "appointment.write",
      ],
    },
    {
      ref_key: "role_client",
      name: "client",
      permissions: ["service.read", "process_update.read", "review.write"],
    },
  ],

  /* ─── Services Catalog ─── */

  services: [
    {
      name: "Banho e Tosa Completo",
      type_ref: "tipo_banho_tosa",
      is_active: true,
      item_kind: "service",
      sell_price: 80.0,
      duration_minutes: 90,
      requires_scheduling: true,
      description: "Banho com shampoo especial + tosa higiênica ou na máquina",
    },
    {
      name: "Banho Simples",
      type_ref: "tipo_banho",
      is_active: true,
      item_kind: "service",
      sell_price: 50.0,
      duration_minutes: 60,
      requires_scheduling: true,
      description: "Banho com shampoo neutro e secagem",
    },
    {
      name: "Consulta Clínica",
      type_ref: "tipo_consulta_vet",
      is_active: true,
      item_kind: "service",
      sell_price: 150.0,
      duration_minutes: 30,
      requires_scheduling: true,
      description: "Consulta veterinária com avaliação clínica completa",
    },
    {
      name: "Vacina V10",
      type_ref: "tipo_vacina",
      is_active: true,
      item_kind: "service",
      sell_price: 120.0,
      duration_minutes: 15,
      requires_scheduling: true,
      description: "Vacina polivalente V10 para cães",
    },
  ],
};

export default pack;
