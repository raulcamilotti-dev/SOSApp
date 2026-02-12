-- Create process_document_requests table
CREATE TABLE IF NOT EXISTS public.process_document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_process_update_id UUID NOT NULL REFERENCES property_process_updates(id) ON DELETE CASCADE,
  property_id UUID NOT NULL,
  document_type VARCHAR(255) NOT NULL,
  description TEXT,
  is_fulfilled BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

-- Create index for property_process_update_id and property_id
CREATE INDEX IF NOT EXISTS idx_process_doc_req_process_update ON process_document_requests(property_process_update_id);
CREATE INDEX IF NOT EXISTS idx_process_doc_req_property ON process_document_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_process_doc_req_fulfilled ON process_document_requests(is_fulfilled);
CREATE INDEX IF NOT EXISTS idx_process_doc_req_deleted ON process_document_requests(deleted_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_process_document_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_document_requests_updated_at ON process_document_requests;
CREATE TRIGGER trigger_process_document_requests_updated_at
BEFORE UPDATE ON process_document_requests
FOR EACH ROW
EXECUTE FUNCTION update_process_document_requests_updated_at();

-- Create process_document_responses table to track uploaded files
CREATE TABLE IF NOT EXISTS public.process_document_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_request_id UUID NOT NULL REFERENCES process_document_requests(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  drive_file_id VARCHAR(255),
  drive_web_view_link TEXT,
  drive_web_content_link TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

-- Create index for document_request_id
CREATE INDEX IF NOT EXISTS idx_process_doc_resp_request ON process_document_responses(document_request_id);
CREATE INDEX IF NOT EXISTS idx_process_doc_resp_created ON process_document_responses(created_at);
