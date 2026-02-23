import { createNotification } from "./notifications";

/**
 * Ativa notificações para eventos específicos no sistema
 * Este arquivo centraliza o disparo de notificações
 */

export async function notifyNewProcess(
  userId: string,
  processTitle: string,
  propertyAddress?: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "new_process",
      title: "Novo Processo",
      message: `Um novo processo foi criado: ${processTitle}${
        propertyAddress ? ` - ${propertyAddress}` : ""
      }`,
      related_table: "properties",
      data: {
        processTitle,
        propertyAddress,
      },
    });
  } catch (error) {
    console.error("Erro ao notificar novo processo:", error);
  }
}

export async function notifyProcessUpdate(
  userId: string,
  processTitle: string,
  updateTitle: string,
  updateMessage: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "process_update",
      title: `Atualização: ${updateTitle}`,
      message: updateMessage,
      related_table: "property_process_updates",
      data: {
        processTitle,
        updateTitle,
      },
    });
  } catch (error) {
    console.error("Erro ao notificar atualização de processo:", error);
  }
}

export async function notifyDocumentRequested(
  userId: string,
  documentType: string,
  processTitle: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "document_requested",
      title: "Documento Solicitado",
      message: `Um ${documentType} foi solicitado para o processo: ${processTitle}`,
      related_table: "process_document_requests",
      data: {
        documentType,
        processTitle,
      },
    });
  } catch (error) {
    console.error("Erro ao notificar solicitação de documento:", error);
  }
}

export async function notifyDocumentFulfilled(
  userId: string,
  documentType: string,
  processTitle: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "document_fulfilled",
      title: "Documento Recebido",
      message: `O ${documentType} foi recebido para o processo: ${processTitle}`,
      related_table: "process_document_responses",
      data: {
        documentType,
        processTitle,
      },
    });
  } catch (error) {
    console.error("Erro ao notificar documento recebido:", error);
  }
}

export async function notifyAppointmentScheduled(
  userId: string,
  appointmentDate: string,
  appointmentType: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "appointment_scheduled",
      title: "Agendamento Confirmado",
      message: `Sua consulta de ${appointmentType} foi agendada para ${appointmentDate}`,
      related_table: "appointments",
      data: {
        appointmentDate,
        appointmentType,
      },
    });
  } catch (error) {
    console.error("Erro ao notificar agendamento:", error);
  }
}

export async function notifyAppointmentReminder(
  userId: string,
  appointmentDate: string,
  appointmentType: string,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "appointment_reminder",
      title: "Lembrete de Consulta",
      message: `Lembrete: você tem uma consulta de ${appointmentType} em ${appointmentDate}`,
      related_table: "appointments",
      data: {
        appointmentDate,
        appointmentType,
      },
    });
  } catch (error) {
    console.error("Erro ao enviar lembrete de consulta:", error);
  }
}

export async function notifyGeneralAlert(
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>,
) {
  try {
    await createNotification({
      user_id: userId,
      type: "general_alert",
      title,
      message,
      data,
    });
  } catch (error) {
    console.error("Erro ao enviar alerta geral:", error);
  }
}
