import { api } from "./api";

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
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateDocumentRequestPayload {
  property_process_update_id: string;
  document_type: string;
  description?: string;
}

export interface CreateDocumentResponsePayload {
  document_request_id: string;
  file_name: string;
  mime_type: string;
  drive_file_id: string;
  drive_web_view_link?: string;
}

export async function listDocumentRequests(
  propertyProcessUpdateId: string,
): Promise<DocumentRequest[]> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "list",
      table: "process_document_requests",
      tenant_id: "",
      filters: {
        property_process_update_id: propertyProcessUpdateId,
      },
    },
  );
  return response.data.data || [];
}

export async function createDocumentRequest(
  payload: CreateDocumentRequestPayload,
): Promise<DocumentRequest> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "create",
      table: "process_document_requests",
      payload,
    },
  );
  return response.data.data;
}

export async function updateDocumentRequest(
  id: string,
  payload: Partial<CreateDocumentRequestPayload> & { is_fulfilled?: boolean },
): Promise<DocumentRequest> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "update",
      table: "process_document_requests",
      id,
      payload,
    },
  );
  return response.data.data;
}

export async function deleteDocumentRequest(id: string): Promise<void> {
  await api.post("https://n8n.sosescritura.com.br/webhook/api_crud", {
    action: "delete",
    table: "process_document_requests",
    id,
  });
}

export async function listDocumentResponses(
  documentRequestId: string,
): Promise<DocumentResponse[]> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "list",
      table: "process_document_responses",
      tenant_id: "",
      filters: {
        document_request_id: documentRequestId,
      },
    },
  );
  return response.data.data || [];
}

export async function createDocumentResponse(
  payload: CreateDocumentResponsePayload,
): Promise<DocumentResponse> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "create",
      table: "process_document_responses",
      payload,
    },
  );
  return response.data.data;
}

export async function deleteDocumentResponse(id: string): Promise<void> {
  await api.post("https://n8n.sosescritura.com.br/webhook/api_crud", {
    action: "delete",
    table: "process_document_responses",
    id,
  });
}
