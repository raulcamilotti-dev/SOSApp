export type CrudHelpContent = {
  title: string;
  whatIs: string;
  whatItDoes: string[];
  connections: string[];
  objectives: string[];
};

type CrudHelpInput = {
  tableName?: string;
  title: string;
  subtitle?: string;
  helpKey?: string;
};

const normalizeKey = (value: string | undefined | null): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
};

const titleToKey = (title: string): string => {
  return normalizeKey(title)
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const buildDefaultHelp = (input: CrudHelpInput): CrudHelpContent => {
  const table = input.tableName ? ` (${input.tableName})` : "";
  const subtitle = input.subtitle
    ? ` Contexto atual: ${input.subtitle}.`
    : "";

  return {
    title: input.title,
    whatIs: `Esta tela gerencia os registros de ${input.title}${table}.${subtitle}`,
    whatItDoes: [
      "Lista registros existentes com busca e filtros.",
      "Permite criar, editar e excluir registros conforme permissao.",
      "Mostra detalhes principais para consulta rapida no dia a dia.",
    ],
    connections: [
      "Conecta com os modulos que dependem desses dados para operacao.",
      "Usa regras de tenant da sessao para separar dados por empresa.",
      "Pode alimentar relatorios, processos e automacoes vinculadas.",
    ],
    objectives: [
      "Padronizar cadastro e manutencao dos dados.",
      "Evitar retrabalho e erros de preenchimento.",
      "Dar visibilidade para a equipe sobre status e informacoes-chave.",
    ],
  };
};

const HELP_BY_KEY: Record<string, CrudHelpContent> = {
  suppliers: {
    title: "Fornecedores",
    whatIs:
      "Tela de cadastro e manutencao dos fornecedores usados pela operacao.",
    whatItDoes: [
      "Armazena dados fiscais e de contato de fornecedores.",
      "Permite controlar status ativo/inativo e observacoes comerciais.",
      "Padroniza base para compras e contas a pagar.",
    ],
    connections: [
      "Compras e solicitacoes de compra.",
      "Contas a pagar e classificacao financeira.",
      "Estoque e entrada de produtos/servicos adquiridos.",
    ],
    objectives: [
      "Garantir base confiavel para abastecimento.",
      "Reduzir erros de faturamento e documentos fiscais.",
      "Apoiar negociacao e historico de relacionamento.",
    ],
  },
  customers: {
    title: "Clientes",
    whatIs: "Tela principal de cadastro de clientes e empresas atendidas.",
    whatItDoes: [
      "Centraliza dados cadastrais, contato e informacoes de relacionamento.",
      "Permite busca rapida e manutencao dos registros.",
      "Serve como base para processos, contratos, vendas e financeiro.",
    ],
    connections: [
      "CRM, vendas, processos e atendimento.",
      "Contratos, faturamento e contas a receber.",
      "Portal do cliente e historico operacional.",
    ],
    objectives: [
      "Manter visao unica do cliente no tenant.",
      "Melhorar qualidade do atendimento e acompanhamento.",
      "Sustentar fluxo comercial e operacional com dados corretos.",
    ],
  },
  user_tenants: {
    title: "Vinculos Usuario-Tenant",
    whatIs:
      "Tela que define em quais tenants um usuario pode atuar e trocar sessao.",
    whatItDoes: [
      "Controla vinculo ativo entre usuario, tenant, role e parceiro.",
      "Permite ativar/inativar acessos sem excluir historico.",
      "Define base de permissao para acesso multi-tenant.",
    ],
    connections: [
      "Autenticacao e troca de tenant na sessao.",
      "Roles, permissoes e matriz de acesso.",
      "Registros operacionais com escopo por tenant.",
    ],
    objectives: [
      "Garantir seguranca e segregacao correta de dados.",
      "Evitar acessos indevidos entre empresas.",
      "Facilitar administracao de usuarios em ambientes multi-tenant.",
    ],
  },
  roles: {
    title: "Roles",
    whatIs: "Tela de perfis de acesso do tenant.",
    whatItDoes: [
      "Define papeis padrao e papeis personalizados.",
      "Organiza niveis de acesso por funcao.",
      "Serve de base para atribuicao de permissoes.",
    ],
    connections: [
      "Permissoes e matriz de permissoes.",
      "Vinculos usuario-tenant.",
      "Controle de acesso por tela e acao.",
    ],
    objectives: [
      "Padronizar governanca de acesso.",
      "Acelerar onboarding de novos usuarios.",
      "Reduzir risco operacional e de seguranca.",
    ],
  },
  role_permissions: {
    title: "Permissoes por Role",
    whatIs:
      "Tela para configurar as permissoes atribuidas a cada role do tenant.",
    whatItDoes: [
      "Permite incluir ou remover permissoes de forma granular.",
      "Aplica regras de leitura, escrita e acoes especiais.",
      "Reflete o que cada role pode fazer no sistema.",
    ],
    connections: [
      "Roles e matriz de permissoes.",
      "Menus, telas e acoes do CRUD.",
      "Autorizacao em APIs e fluxo de sessao.",
    ],
    objectives: [
      "Controlar acesso com clareza e previsibilidade.",
      "Evitar excesso de privilegios.",
      "Apoiar compliance e auditoria de acesso.",
    ],
  },
  partners: {
    title: "Parceiros",
    whatIs:
      "Tela de gestao de parceiros para colaboracao interna e externa.",
    whatItDoes: [
      "Cadastra parceiros e dados operacionais/comerciais.",
      "Permite acompanhar disponibilidade e status.",
      "Organiza participacao dos parceiros em fluxos de servico.",
    ],
    connections: [
      "Comissionamento e ganhos de parceiros.",
      "Vinculos de usuario e papeis operacionais.",
      "Execucao de servicos e cadeia de atendimento.",
    ],
    objectives: [
      "Escalar capacidade operacional com rede de parceiros.",
      "Manter padrao de qualidade e SLA.",
      "Dar transparencia para operacao e repasses.",
    ],
  },
  accounts_payable: {
    title: "Contas a Pagar",
    whatIs: "Tela de obrigacoes financeiras de saida do tenant.",
    whatItDoes: [
      "Registra titulos, vencimentos, status e historico de pagamento.",
      "Permite classificar despesas por plano de contas.",
      "Apoia previsao financeira e conciliacao.",
    ],
    connections: [
      "Fornecedores e compras.",
      "Plano de contas e DRE por competencia.",
      "Contas bancarias e extrato.",
    ],
    objectives: [
      "Controlar compromissos financeiros com previsibilidade.",
      "Evitar atrasos, juros e inconsistencias.",
      "Gerar base confiavel para analise gerencial.",
    ],
  },
  accounts_receivable: {
    title: "Contas a Receber",
    whatIs: "Tela de direitos financeiros de entrada do tenant.",
    whatItDoes: [
      "Registra titulos de recebimento e seus status.",
      "Permite acompanhar inadimplencia e baixas.",
      "Suporta classificacao por centro/plano de contas.",
    ],
    connections: [
      "Clientes, contratos e faturamento.",
      "DRE por competencia e indicadores de receita.",
      "Contas bancarias e conciliacao de recebiveis.",
    ],
    objectives: [
      "Aumentar previsibilidade de caixa e receita.",
      "Reduzir atrasos e perdas de recebimento.",
      "Dar visibilidade para cobranca e negociacao.",
    ],
  },
  invoices: {
    title: "Faturas",
    whatIs:
      "Tela de faturas emitidas para clientes, com base para emissao fiscal.",
    whatItDoes: [
      "Controla ciclo da fatura: emissao, status e pagamento.",
      "Agrupa dados financeiros e comerciais da cobranca.",
      "Prepara dados para integracao de emissao de documentos fiscais.",
    ],
    connections: [
      "Clientes, vendas e contratos.",
      "Contas a receber e conciliacao financeira.",
      "Integracoes fiscais (NFS-e, NF-e e cupons quando aplicavel).",
    ],
    objectives: [
      "Concentrar faturamento em fluxo unico e rastreavel.",
      "Reduzir retrabalho na emissao fiscal.",
      "Garantir consistencia entre operacao, financeiro e fiscal.",
    ],
  },
  price_lists: {
    title: "Tabelas de Preco",
    whatIs: "Tela para definir regras de preco por cliente e contexto.",
    whatItDoes: [
      "Cria tabelas com prioridade e periodo de vigencia.",
      "Permite regras por item e por categoria.",
      "Vincula clientes para precificacao personalizada.",
    ],
    connections: [
      "Servicos/produtos e categorias.",
      "Clientes e vendas.",
      "Faturamento e margem de contribuicao.",
    ],
    objectives: [
      "Padronizar politica comercial por segmento.",
      "Acelerar proposta, venda e faturamento.",
      "Controlar margem e regras especiais de negociacao.",
    ],
  },
};

export const getCrudHelpContent = (
  input: CrudHelpInput,
): CrudHelpContent | null => {
  const candidates = [
    normalizeKey(input.helpKey),
    normalizeKey(input.tableName),
    titleToKey(input.title),
  ].filter(Boolean);

  for (const key of candidates) {
    const direct = HELP_BY_KEY[key];
    if (direct) return direct;
  }

  if (!input.title && !input.tableName) return null;
  return buildDefaultHelp(input);
};

