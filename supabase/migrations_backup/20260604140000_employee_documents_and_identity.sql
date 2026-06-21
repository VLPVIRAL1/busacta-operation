-- ── Identity fields on profiles ───────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date    date,
  ADD COLUMN IF NOT EXISTS aadhar_number text,
  ADD COLUMN IF NOT EXISTS pan_number    text;

-- ── Employee documents table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type     text        NOT NULL CHECK (doc_type IN ('aadhar', 'pan', 'other')),
  file_name    text        NOT NULL,
  file_url     text        NOT NULL,
  file_size    bigint,
  uploaded_by  uuid        REFERENCES profiles(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, doc_type)
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_employee_documents"
  ON employee_documents FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK(current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_documents"
  ON employee_documents FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- ── Private storage bucket for employee docs ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-docs', 'employee-docs', false, 10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "hr_manage_employee_docs_storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'employee-docs' AND current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK (bucket_id = 'employee-docs' AND current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_docs_storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
