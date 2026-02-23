import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";

export interface DocumentRequest {
  id: string;
  property_process_update_id: string;
  document_type: string;
  description?: string | null;
  is_fulfilled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface DocumentResponse {
  id: string;
  document_request_id: string;
  file_name: string;
  mime_type: string;
  drive_file_id: string;
  drive_web_view_link?: string | null;
  file_data?: string | null;
  storage_type?: "drive" | "database" | "both";
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateDocumentRequestPayload {
  property_process_update_id?: string;
  process_update_id?: string;
  service_order_id?: string;
  property_id?: string;
  document_type: string;
  description?: string;
}

export interface CreateDocumentResponsePayload {
  document_request_id: string;
  file_name: string;
  mime_type: string;
  drive_file_id: string;
  drive_web_view_link?: string;
  file_data?: string;
  storage_type?: "drive" | "database" | "both";
}

export async function listDocumentRequests(
  propertyProcessUpdateId: string,
): Promise<DocumentRequest[]> {
  const normalizedUpdateId = String(propertyProcessUpdateId);
  console.log("[doc-trace][service] listDocumentRequests:start", {
    property_process_update_id: normalizedUpdateId,
  });

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_document_requests",
    ...buildSearchParams([
      { field: "property_process_update_id", value: normalizedUpdateId },
    ]),
  });
  const rows = normalizeCrudList<DocumentRequest>(response.data).filter(
    (row) => !row.deleted_at,
  );

  console.log("[doc-trace][service] listDocumentRequests:ok", {
    property_process_update_id: normalizedUpdateId,
    rows_count: rows.length,
    request_ids: rows.map((row) => row.id),
    request_update_ids: rows.map((row) => row.property_process_update_id),
  });

  return rows;
}

export async function createDocumentRequest(
  payload: CreateDocumentRequestPayload,
): Promise<DocumentRequest> {
  const normalizedPayload: Record<string, unknown> = {
    document_type: payload.document_type,
    description: payload.description ?? undefined,
  };

  // Support both property-based and service-order-based flows
  if (payload.property_process_update_id) {
    normalizedPayload.property_process_update_id = String(
      payload.property_process_update_id,
    );
    normalizedPayload.process_update_id = String(
      payload.property_process_update_id,
    );
  }
  if (payload.process_update_id) {
    normalizedPayload.process_update_id = String(payload.process_update_id);
  }
  if (payload.service_order_id) {
    normalizedPayload.service_order_id = String(payload.service_order_id);
  }
  if (payload.property_id) {
    normalizedPayload.property_id = String(payload.property_id);
  }

  console.log("[doc-trace][service] createDocumentRequest:start", {
    property_process_update_id: normalizedPayload.property_process_update_id,
    process_update_id: normalizedPayload.process_update_id,
    service_order_id: normalizedPayload.service_order_id,
    document_type: normalizedPayload.document_type,
  });

  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_document_requests",
    payload: normalizedPayload,
  });
  const created = normalizeCrudOne<DocumentRequest>(response.data);
  if (!created) {
    throw new Error("Resposta inválida ao criar solicitação de documento");
  }

  console.log("[doc-trace][service] createDocumentRequest:ok", {
    created_request_id: created.id,
    created_update_id: created.property_process_update_id,
    created_document_type: created.document_type,
  });

  return created;
}

export async function updateDocumentRequest(
  id: string,
  payload: Partial<CreateDocumentRequestPayload> & { is_fulfilled?: boolean },
): Promise<DocumentRequest> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "process_document_requests",
    payload: { id, ...payload },
  });
  const updated = normalizeCrudOne<DocumentRequest>(response.data);
  if (!updated) {
    throw new Error("Resposta inválida ao atualizar solicitação de documento");
  }
  return updated;
}

export async function deleteDocumentRequest(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "process_document_requests",
    payload: { id, deleted_at: new Date().toISOString() },
  });
}

export async function listDocumentResponses(
  documentRequestId: string,
): Promise<DocumentResponse[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_document_responses",
    ...buildSearchParams([
      { field: "document_request_id", value: documentRequestId },
    ]),
  });
  return normalizeCrudList<DocumentResponse>(response.data).filter(
    (row) => !row.deleted_at,
  );
}

export async function createDocumentResponse(
  payload: CreateDocumentResponsePayload,
): Promise<DocumentResponse> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_document_responses",
    payload,
  });
  const created = normalizeCrudOne<DocumentResponse>(response.data);
  if (!created) {
    throw new Error("Resposta inválida ao criar resposta de documento");
  }
  return created;
}

export async function deleteDocumentResponse(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "process_document_responses",
    payload: { id, deleted_at: new Date().toISOString() },
  });
}
