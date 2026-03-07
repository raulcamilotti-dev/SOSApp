import {
    createNotification,
    type CreateNotificationPayload,
} from "./notifications";

/**
 * Ativa notificações para eventos específicos no sistema.
 * Este arquivo centraliza o disparo de notificações.
 *
 * Fix B5: All dispatchers use `dispatchWithRetry` — 1 automatic retry
 * with 2s delay on failure, so transient network errors don't silently
 * drop notifications.
 */

const RETRY_DELAY_MS = 2000;

async function dispatchWithRetry(
  payload: CreateNotificationPayload,
  label: string,
): Promise<void> {
  try {
    await createNotification(payload);
  } catch (firstError) {
    // 1 automatic retry after a short delay
    try {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      await createNotification(payload);
    } catch (retryError) {
      console.error(`[Notification] ${label} falhou após retry:`, retryError);
    }
  }
}

export async function notifyNewProcess(
  userId: string,
  processTitle: string,
  propertyAddress?: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "new_process",
      title: "Novo Processo",
      message: `Um novo processo foi criado: ${processTitle}${
        propertyAddress ? ` - ${propertyAddress}` : ""
      }`,
      related_table: "properties",
      data: { processTitle, propertyAddress },
    },
    "notifyNewProcess",
  );
}

export async function notifyProcessUpdate(
  userId: string,
  processTitle: string,
  updateTitle: string,
  updateMessage: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "process_update",
      title: `Atualização: ${updateTitle}`,
      message: updateMessage,
      related_table: "process_updates",
      data: { processTitle, updateTitle },
    },
    "notifyProcessUpdate",
  );
}

export async function notifyDocumentRequested(
  userId: string,
  documentType: string,
  processTitle: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "document_requested",
      title: "Documento Solicitado",
      message: `Um ${documentType} foi solicitado para o processo: ${processTitle}`,
      related_table: "process_document_requests",
      data: { documentType, processTitle },
    },
    "notifyDocumentRequested",
  );
}

export async function notifyDocumentFulfilled(
  userId: string,
  documentType: string,
  processTitle: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "document_fulfilled",
      title: "Documento Recebido",
      message: `O ${documentType} foi recebido para o processo: ${processTitle}`,
      related_table: "process_document_responses",
      data: { documentType, processTitle },
    },
    "notifyDocumentFulfilled",
  );
}

export async function notifyAppointmentScheduled(
  userId: string,
  appointmentDate: string,
  appointmentType: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "appointment_scheduled",
      title: "Agendamento Confirmado",
      message: `Sua consulta de ${appointmentType} foi agendada para ${appointmentDate}`,
      related_table: "service_appointments",
      data: { appointmentDate, appointmentType },
    },
    "notifyAppointmentScheduled",
  );
}

export async function notifyAppointmentReminder(
  userId: string,
  appointmentDate: string,
  appointmentType: string,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "appointment_reminder",
      title: "Lembrete de Consulta",
      message: `Lembrete: você tem uma consulta de ${appointmentType} em ${appointmentDate}`,
      related_table: "service_appointments",
      data: { appointmentDate, appointmentType },
    },
    "notifyAppointmentReminder",
  );
}

export async function notifyGeneralAlert(
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>,
) {
  await dispatchWithRetry(
    {
      user_id: userId,
      type: "general_alert",
      title,
      message,
      data,
    },
    "notifyGeneralAlert",
  );
}
