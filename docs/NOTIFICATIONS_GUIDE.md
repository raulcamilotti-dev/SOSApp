# Sistema de Notificações - Guia Completo

## 📱 Visão Geral

Sistema completo de notificações multi-canal que permite enviar notificações aos usuários através de diferentes canais:

- 📱 **In-App**: Notificações dentro do aplicativo
- 📧 **Email**: Notificações por email
- 🤖 **Android**: Push notifications no Android
- 🍎 **iOS**: Push notifications no iOS

## 🗂️ Estrutura de Arquivos

### Banco de Dados

- `scripts/migrations/2026-02-11_notifications.sql` - Tabelas de notificações

### Serviços

- `services/notifications.ts` - CRUD de notificações e preferências
- `services/notification-events.ts` - Funções auxiliares para disparar notificações

### Telas

- `app/(app)/Notificacoes/index.tsx` - Visualização de notificações
- `app/(app)/Notificacoes/Preferencias.tsx` - Configuração de preferências
- `app/(app)/Notificacoes/_layout.tsx` - Layout de notificações

## 📊 Tipos de Notificações Disponíveis

1. **new_process** - Novo processo criado
2. **process_update** - Atualização de processo
3. **document_requested** - Documento solicitado
4. **document_received** - Documento recebido
5. **document_fulfilled** - Documento enviado pelo cliente
6. **process_status_changed** - Status do processo alterado
7. **appointment_scheduled** - Agendamento confirmado
8. **appointment_reminder** - Lembrete de consulta
9. **general_alert** - Alerta geral

## 🚀 Como Usar

### 1. Enviar uma Notificação Simples

```typescript
import { createNotification } from "@/services/notifications";

await createNotification({
  user_id: "uuid-do-usuario",
  type: "new_process",
  title: "Novo Processo",
  message: "Um novo processo foi criado para você",
  related_table: "properties",
  related_id: "uuid-propriedade",
  data: {
    processTitle: "Escrituração - Imóvel ABC",
  },
});
```

### 2. Usar Funções de Conveniência

```typescript
import {
  notifyNewProcess,
  notifyDocumentRequested,
} from "@/services/notification-events";

// Notificar novo processo
await notifyNewProcess(
  userId,
  "Escrituração - Imóvel ABC",
  "Rua das Flores, 123 - São Paulo, SP",
);

// Notificar solicitação de documento
await notifyDocumentRequested(userId, "RG", "Escrituração - Imóvel ABC");
```

### 3. Configurar Preferências de Notificação

```typescript
import { updateNotificationPreference } from "@/services/notifications";

// Ativar notificações de novo processo apenas por email e app
await updateNotificationPreference(userId, "new_process", {
  enabled: true,
  channels: ["in_app", "email"],
});

// Desativar notificações de lembretes
await updateNotificationPreference(userId, "appointment_reminder", {
  enabled: false,
  channels: [],
});
```

### 4. Listar Notificações do Usuário

```typescript
import {
  listNotifications,
  getUnreadNotificationCount,
} from "@/services/notifications";

// Listar últimas 50 notificações
const notifications = await listNotifications(userId, 50, 0);

// Contar notificações não lidas
const unreadCount = await getUnreadNotificationCount(userId);
```

### 5. Marcar Notificação como Lida

```typescript
import { markAsRead, markAllAsRead } from "@/services/notifications";

// Marcar uma notificação como lida
await markAsRead(notificationId);

// Marcar todas as notificações como lidas
await markAllAsRead(userId);
```

## 🔗 Integração nos Pontos-Chave

### Ao Criar um Novo Processo

No arquivo `app/(app)/Administrador/Lancamentos processos.tsx`:

```typescript
import { notifyNewProcess } from "@/services/notification-events";

// Após criar o processo
if (response.data?.id) {
  const property = properties.find((p) => p.id === selectedPropertyId);
  await notifyNewProcess(user.id, title, property?.address);
}
```

### Ao Solicitar Documentos

No arquivo `app/(app)/Administrador/Lancamentos processos.tsx`:

```typescript
import { notifyDocumentRequested } from "@/services/notification-events";

// Após solicitar documento
for (const docRequest of documentRequests) {
  await notifyDocumentRequested(client.user_id, docRequest.type, title);
}
```

### Ao Receber Documento

No arquivo `app/(app)/Servicos/Processo.tsx`:

```typescript
import { notifyDocumentFulfilled } from "@/services/notification-events";

// Após cliente enviar documento
await notifyDocumentFulfilled(
  lawyerId,
  notification.document_type,
  processTitle,
);
```

## 🎨 Telas de Notificação

### Acessar Notificações

1. Vá em **Configurações > Notificações**
2. Veja todas as notificações recebidas
3. Clique em uma notificação para ver detalhes
4. Clique em "⚙️ Preferências" para configurar

### Configurar Preferências

1. Na tela de Notificações, clique em **Preferências**
2. Para cada tipo de notificação:
   - Ative/desative toggle
   - Selecione canais desejados (In-App, Email, Android, iOS)
   - Salva automaticamente

## 📲 Canais de Entrega

### In-App

- Mostrado na tela de notificações
- Marcado como lido quando visualizado
- Permite deletar

### Email

- Enviado automaticamente quando habilitado
- Requer integração com servidor de email
- Ideal para notificações importantes

### Android/iOS

- Push notifications nativas
- Requer configuração de FCM (Firebase Cloud Messaging)
- Mostra até mesmo quando app fechado

## 🔐 Permissões

O acesso às notificações é restrito ao usuário proprietário. Cada usuário só pode:

- Ver suas próprias notificações
- Gerenciar suas próprias preferências
- Nenhum enpoint admin necessário

## 📝 Notas de Desenvolvimento

### Tipagem TypeScript

Todos os serviços são totalmente tipados:

```typescript
interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  data?: Record<string, any>;
  created_at: string;
  read_at?: string;
}

interface NotificationPreference {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  enabled: boolean;
  channels: NotificationChannel[];
}
```

### Tratamento de Erros

Todos os servi​ços usam try-catch:

```typescript
try {
  await notifyNewProcess(userId, title, address);
} catch (error) {
  console.error("Erro ao notificar:", error);
  // Falhar silenciosamente para não quebrar fluxo principal
}
```

## 🔄 Fluxo de Entrega

```
1. createNotification() → insere em notifications table
2. Verifica preferências do usuário
3. Cria registros em notification_deliveries para cada canal
4. N8n webhook ouve mudanças e envia pelos canais configurados
5. Atualiza status em notification_deliveries
```

## 🚧 Próximas Melhorias

- [ ] Webhooks n8n para enviar emails
- [ ] Integração Firebase para push notifications
- [ ] Notificações em tempo real via WebSocket
- [ ] Digest de notificações (resumo diário/semanal)
- [ ] Filtros avançados de notificações
- [ ] Template de notificações customizáveis
