# 🔧 Alternativas para Executar o Seed (sem psql)

## ❌ Problema

`psql` não está instalado ou não está no PATH do Windows.

## ✅ Soluções

### Opção 1: Instalar PostgreSQL Client

1. **Download**: https://www.postgresql.org/download/windows/
2. Durante instalação, marque **"Command Line Tools"**
3. Adicione ao PATH: `C:\Program Files\PostgreSQL\16\bin`
4. Reinicie o terminal
5. Execute: `psql -U postgres -d sosapp -f scripts/seed_data.sql`

---

### Opção 2: DBeaver (Recomendado para quem não quer instalar psql)

1. **Baixe DBeaver**: https://dbeaver.io/download/
2. Conecte ao banco `sosapp`
3. Clique com botão direito → **SQL Editor** → **Open SQL Script**
4. Selecione o arquivo `scripts/seed_data.sql`
5. Clique em **Execute** (▶️) ou pressione `Ctrl+Enter`

---

### Opção 3: pgAdmin

1. Abra **pgAdmin**
2. Conecte ao servidor PostgreSQL
3. Navegue até: **Databases** → **sosapp**
4. Clique com botão direito em **sosapp** → **Query Tool**
5. Clique no ícone de **Open File** (📂)
6. Selecione `scripts/seed_data.sql`
7. Clique em **Execute** (▶️) ou pressione `F5`

---

### Opção 4: VS Code + PostgreSQL Extension

1. Instale a extensão: **PostgreSQL** (by Chris Kolkman)
2. Conecte ao banco `sosapp`
3. Abra o arquivo `scripts/seed_data.sql`
4. Clique com botão direito → **Run Query**

---

### Opção 5: Node.js Script (execute diretamente)

Crie um arquivo `scripts/run-seed.js`:

```javascript
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function runSeed() {
  const client = new Client({
    host: "localhost",
    port: 5432,
    database: "sosapp",
    user: "postgres",
    password: process.env.DB_PASSWORD || "sua-senha", // MUDE AQUI
  });

  try {
    await client.connect();
    console.log("✓ Conectado ao banco");

    const sql = fs.readFileSync(path.join(__dirname, "seed_data.sql"), "utf8");

    await client.query(sql);
    console.log("✓ Seed executado com sucesso!");
  } catch (err) {
    console.error("✗ Erro:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();
```

Execute:

```bash
npm install pg
node scripts/run-seed.js
```

---

### Opção 6: Docker (se estiver usando PostgreSQL via Docker)

```bash
docker exec -i nome-do-container psql -U postgres -d sosapp < scripts/seed_data.sql
```

Ou copie o arquivo para dentro do container:

```bash
docker cp scripts/seed_data.sql nome-do-container:/tmp/seed.sql
docker exec -it nome-do-container psql -U postgres -d sosapp -f /tmp/seed.sql
```

---

### Opção 7: Copiar e Colar Manual

1. Abra o arquivo `scripts/seed_data.sql` no VS Code
2. Selecione TODO o conteúdo (`Ctrl+A`)
3. Copie (`Ctrl+C`)
4. Abra seu cliente SQL favorito (DBeaver, pgAdmin, etc.)
5. Cole o conteúdo no Query Editor
6. Execute

---

## 🎯 Qual escolher?

| Opção             | Dificuldade    | Recomendado Para     |
| ----------------- | -------------- | -------------------- |
| **DBeaver**       | ⭐ Fácil       | Quem quer GUI visual |
| **pgAdmin**       | ⭐⭐ Média     | Quem já usa pgAdmin  |
| **Node.js**       | ⭐⭐ Média     | Desenvolvedores      |
| **Instalar psql** | ⭐⭐⭐ Difícil | Quem quer CLI        |
| **Copiar/Colar**  | ⭐ Fácil       | Emergência rápida    |

---

## 📌 Próximos Passos

Depois de executar o seed com sucesso, você verá:

```
NOTICE:  Usando tenant: uuid-do-tenant
NOTICE:  Usando user: uuid-do-user
NOTICE:  Template criado: uuid-do-template
NOTICE:  14 etapas criadas
NOTICE:  Transições criadas
NOTICE:  8 properties criadas
NOTICE:  7 regras de prazo criadas
NOTICE:  5 prazos ativos criados
NOTICE:  3 logs de processo criados
NOTICE:  ========================================
NOTICE:  DADOS FICTÍCIOS CRIADOS COM SUCESSO!
NOTICE:  ========================================
```

Então acesse:

- 📊 **Kanban**: `/Administrador/kanban-processos`
- ⏰ **Prazos**: `/Administrador/gestor-prazos-processos`
