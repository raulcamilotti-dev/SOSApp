const axios = require("axios");
const API_KEY = process.env.SOS_API_KEY;
if (!API_KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const CRUD = process.env.EXPO_PUBLIC_API_BASE_URL
  ? `${process.env.EXPO_PUBLIC_API_BASE_URL}/api_crud`
  : "https://n8n.sosescritura.com.br/webhook/api_crud";
const tenantId =
  process.env.RADUL_TENANT_ID || "0bc867c7-082b-4d6f-a240-405f01b2941e";
const headers = { "X-Api-Key": API_KEY };
const blogPosts = [
  {
    tenant_id: tenantId,
    page_type: "blog_post",
    title: "Como a automação de processos pode transformar seu negócio",
    slug: "automacao-processos-transformar-negocio",
    excerpt:
      "Descubra como empresas de serviços estão reduzindo custos em até 40% e aumentando a satisfação dos clientes com automação inteligente de processos operacionais.",
    content: [
      "# Como a automação de processos pode transformar seu negócio",
      "",
      "No cenário competitivo atual, empresas de serviços que não automatizam seus processos ficam para trás. A boa notícia? Nunca foi tão acessível começar.",
      "",
      "## O problema: processos manuais custam caro",
      "",
      "Empresas que ainda dependem de planilhas, e-mails e controles manuais enfrentam:",
      "",
      "- **Retrabalho constante** — informações duplicadas e desatualizadas",
      "- **Atrasos nos prazos** — sem alertas automáticos, deadlines passam despercebidos",
      "- **Falta de visibilidade** — gestores não sabem o status real das operações",
      "- **Clientes insatisfeitos** — sem portal de acompanhamento, o cliente liga toda hora",
      "",
      "## A solução: plataforma de operações integrada",
      "",
      "Uma plataforma como o Radul centraliza tudo em um só lugar:",
      "",
      "### 1. Workflow automático",
      "",
      "Cada tipo de serviço tem seu próprio fluxo de etapas. Quando um processo avança, tarefas são criadas automaticamente, prazos são definidos e notificações são enviadas.",
      "",
      "### 2. Portal do cliente",
      "",
      "Seu cliente acompanha o andamento em tempo real, sem precisar ligar. Transparência gera confiança.",
      "",
      "### 3. Kanban visual",
      "",
      "Veja todos os processos em um quadro visual. Identifique gargalos instantaneamente e redistribua a carga de trabalho.",
      "",
      "### 4. Financeiro integrado",
      "",
      "Faturas, contas a receber e inadimplência — tudo conectado aos processos. Sem surpresas no fim do mês.",
      "",
      "## Resultados reais",
      "",
      '> "Reduzimos o tempo médio de atendimento de 15 dias para 4 dias. Os clientes perceberam a diferença imediatamente." — Maria, gestora de escritório de advocacia',
      "",
      "Empresas que adotam automação de processos reportam:",
      "",
      "- **40% de redução** em custos operacionais",
      "- **60% menos** ligações de clientes perguntando status",
      "- **3x mais rápido** na conclusão de processos",
      "",
      "## Como começar",
      "",
      "O primeiro passo é mapear seus processos atuais. Quais são as etapas? Onde estão os gargalos? Quem é responsável por cada fase?",
      "",
      "Com o Radul, você configura tudo isso em minutos — sem precisar de desenvolvedores.",
      "",
      "---",
      "",
      "**Pronto para transformar sua operação?** Preencha o formulário abaixo e nossa equipe entrará em contato.",
    ].join("\n"),
    featured_image_url:
      "https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&h=400&fit=crop",
    meta_title: "Automação de Processos para Empresas de Serviços | Radul",
    meta_description:
      "Saiba como a automação de processos reduz custos em 40% e triplica a velocidade de entrega.",
    author_name: "Raul Costa",
    status: "published",
    published_at: "2026-02-18T10:00:00Z",
    category: "Dicas",
    tags: JSON.stringify(["automação", "processos", "produtividade", "gestão"]),
    template_key: "standard",
    is_featured: true,
    reading_time_min: 4,
    view_count: 127,
  },
  {
    tenant_id: tenantId,
    page_type: "blog_post",
    title: "5 sinais de que sua empresa precisa de um sistema de gestão",
    slug: "5-sinais-empresa-precisa-sistema-gestao",
    excerpt:
      "Planilhas não escalam. Se você se identifica com 3 ou mais desses sinais, está na hora de profissionalizar sua operação.",
    content: [
      "# 5 sinais de que sua empresa precisa de um sistema de gestão",
      "",
      "Muitos empreendedores começam com planilhas e WhatsApp. Funciona no início, mas chega um ponto em que o crescimento exige mais.",
      "",
      "## 1. Você perde prazos com frequência",
      "",
      "Se deadlines passam despercebidos e clientes precisam cobrar, é sinal de que falta um sistema de alertas e acompanhamento automático.",
      "",
      "## 2. Não sabe quanto vai faturar este mês",
      "",
      "Sem um financeiro integrado, previsibilidade de receita é impossível. Você só descobre o resultado no fim do mês.",
      "",
      "## 3. Clientes ligam para perguntar o status",
      "",
      'Se seu telefone toca toda hora com "como está meu processo?", você precisa de um portal de acompanhamento.',
      "",
      "## 4. Informações ficam em vários lugares",
      "",
      "Um pouco no e-mail, outro no WhatsApp, dados na planilha, documentos no Drive. Informação fragmentada = erros.",
      "",
      "## 5. Você é o gargalo",
      "",
      "Se tudo depende de você para avançar, sua empresa não escala. Delegar com segurança exige processos claros e rastreáveis.",
      "",
      "---",
      "",
      "## A solução",
      "",
      "Um sistema de gestão operacional como o Radul resolve todos esses problemas em uma única plataforma:",
      "",
      "- Workflows automáticos com prazos e alertas",
      "- Portal do cliente em tempo real",
      "- Dashboard financeiro integrado",
      "- Kanban visual para toda a equipe",
      "- Tudo configurável sem código",
      "",
      "**Se você se identificou com 3 ou mais sinais, é hora de agir.**",
    ].join("\n"),
    featured_image_url:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop",
    meta_title: "5 Sinais de que Sua Empresa Precisa de um Sistema | Radul",
    meta_description:
      "Descubra os 5 sinais claros de que sua empresa precisa investir em um sistema de gestão operacional.",
    author_name: "Raul Costa",
    status: "published",
    published_at: "2026-02-15T14:00:00Z",
    category: "Dicas",
    tags: JSON.stringify(["gestão", "crescimento", "produtividade"]),
    template_key: "standard",
    is_featured: false,
    reading_time_min: 3,
    view_count: 84,
  },
  {
    tenant_id: tenantId,
    page_type: "blog_post",
    title: "Radul lança módulo de CRM integrado com automação de marketing",
    slug: "radul-lanca-crm-integrado-automacao",
    excerpt:
      "Novo módulo de CRM com pipeline visual, formulários de captação, lead scoring e campanhas — tudo integrado à operação.",
    content: [
      "# Radul lança módulo de CRM integrado",
      "",
      "Temos o prazer de anunciar o lançamento do nosso módulo de CRM, totalmente integrado à plataforma de operações.",
      "",
      "## O que há de novo",
      "",
      "### Pipeline visual (Kanban)",
      "",
      "Acompanhe seus leads em um quadro visual com etapas customizáveis. Mova leads entre etapas com facilidade.",
      "",
      "### Formulários de captação",
      "",
      "Crie formulários públicos personalizados e compartilhe via link ou WhatsApp. Cada submissão vira um lead automaticamente.",
      "",
      "### Lead scoring",
      "",
      "Pontuação automática baseada em regras configuráveis. Priorize os leads mais quentes.",
      "",
      "### Campanhas de marketing",
      "",
      "Registre campanhas, vincule leads e acompanhe o ROI de cada canal.",
      "",
      "### Blog e Landing Pages",
      "",
      "Publique conteúdo diretamente na plataforma, com CTA integrado aos formulários de captação.",
      "",
      "## Por que isso importa",
      "",
      "Antes, CRM e operação viviam em mundos separados. Agora, quando um lead vira cliente, o processo operacional começa automaticamente — sem retrabalho.",
      "",
      "> A jornada completa: captação → qualificação → proposta → contrato → operação → entrega → faturamento.",
      "",
      "Tudo em uma plataforma.",
      "",
      "---",
      "",
      "**Quer testar?** O módulo de CRM já está disponível para todos os planos.",
    ].join("\n"),
    featured_image_url:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop",
    author_name: "Equipe Radul",
    status: "published",
    published_at: "2026-02-20T09:00:00Z",
    category: "Atualizações",
    tags: JSON.stringify(["CRM", "novidades", "marketing", "lançamento"]),
    template_key: "standard",
    is_featured: true,
    reading_time_min: 3,
    view_count: 203,
  },
];

const landingPage = {
  tenant_id: tenantId,
  page_type: "landing_page",
  title: "Plataforma de Operações para Empresas de Serviços",
  slug: "plataforma-operacoes",
  excerpt:
    "Automatize processos, encante clientes e escale sua operação. Tudo em uma plataforma configurável, sem código.",
  content: [
    "# Sua operação no piloto automático",
    "",
    "O Radul é a plataforma de operações que empresas de serviços usam para automatizar processos, acompanhar entregas e encantar clientes.",
    "",
    "## Tudo que você precisa em um só lugar",
    "",
    "### Workflows inteligentes",
    "",
    "Configure fluxos de trabalho com etapas, prazos, tarefas e notificações automáticas. Cada tipo de serviço tem seu próprio workflow — e você cria em minutos.",
    "",
    "### Kanban visual",
    "",
    "Veja todos os processos em um quadro visual. Identifique gargalos, redistribua trabalho e garanta que nada fique parado.",
    "",
    "### Portal do cliente",
    "",
    "Seu cliente acompanha o andamento em tempo real por um link exclusivo. Sem ligações, sem e-mails de cobrança. Transparência total.",
    "",
    "### CRM integrado",
    "",
    "Capte leads com formulários públicos, qualifique com lead scoring e converta em clientes — tudo dentro da mesma plataforma.",
    "",
    "### Financeiro completo",
    "",
    "Faturas, contas a receber, inadimplência, fechamento contábil. Integrado aos processos para você ter controle total da receita.",
    "",
    "### Multi-tenant e parceiros",
    "",
    "Gerencie múltiplas unidades, parceiros operadores e equipes. Cada um vê apenas o que precisa — RBAC completo.",
    "",
    "---",
    "",
    "## Planos a partir de R$ 0",
    "",
    "- **Grátis** — até 20 clientes, usuários ilimitados",
    "- **Starter** — até 100 clientes, R$ 99/mês",
    "- **Growth** — até 500 clientes, R$ 249/mês",
    "- **Scale** — até 2.000 clientes, R$ 499/mês",
    "- **Enterprise** — sem limites, sob consulta",
    "",
    "---",
    "",
    "## Comece agora",
    "",
    "Preencha o formulário abaixo para criar sua conta gratuita ou agendar uma demonstração com nossa equipe.",
  ].join("\n"),
  featured_image_url:
    "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200&h=600&fit=crop",
  meta_title: "Radul — Plataforma de Operações para Empresas de Serviços",
  meta_description:
    "Automatize processos, encante clientes e escale sua operação com o Radul. Planos a partir de R$ 0. Comece agora.",
  author_name: "Radul",
  status: "published",
  published_at: "2026-02-10T08:00:00Z",
  category: "Produto",
  tags: JSON.stringify(["plataforma", "SaaS", "operações"]),
  cta_text: "Criar conta gratuita",
  cta_url: "https://app.radul.com.br/registro",
  template_key: "hero",
  is_featured: false,
  sort_order: 1,
  reading_time_min: 3,
  view_count: 412,
};

async function seed() {
  console.log("=== Inserindo blog posts ===");
  for (const p of blogPosts) {
    try {
      const r = await axios.post(
        CRUD,
        {
          action: "create",
          table: "content_pages",
          payload: p,
        },
        { headers },
      );
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      console.log("OK blog:", p.slug, "→ id:", row?.id?.substring(0, 8));
    } catch (e) {
      console.error("ERR:", p.slug, e.response?.data || e.message);
    }
  }

  console.log("\n=== Inserindo landing page ===");
  try {
    const r = await axios.post(
      CRUD,
      {
        action: "create",
        table: "content_pages",
        payload: landingPage,
      },
      { headers },
    );
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    console.log("OK LP:", landingPage.slug, "→ id:", row?.id?.substring(0, 8));
  } catch (e) {
    console.error("ERR LP:", landingPage.slug, e.response?.data || e.message);
  }

  console.log("\n=== Verificando ===");
  try {
    const r = await axios.post(
      CRUD,
      {
        action: "list",
        table: "content_pages",
        search_field1: "tenant_id",
        search_value1: tenantId,
        search_operator1: "equal",
        sort_column: "published_at DESC",
      },
      { headers },
    );
    const items = Array.isArray(r.data) ? r.data : [];
    console.log(`Total: ${items.length} páginas`);
    items.forEach((i) =>
      console.log(`  [${i.page_type}] ${i.title} (${i.status}) slug=${i.slug}`),
    );
  } catch (e) {
    console.error("ERR list:", e.message);
  }

  console.log("\nDone! Acesse:");
  console.log("  Blog: /blog/radul");
  console.log("  LP:   /lp/radul/plataforma-operacoes");
}

seed();
