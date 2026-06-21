
-- Widen esign storage access so the `employee` role can also upload/read
-- envelope sources and signed PDFs (currently only admin/super_admin/
-- finance_manager could, which silently blocked the wizard's Step-2 upload
-- for normal staff users).
drop policy if exists "esign_storage_read"   on storage.objects;
drop policy if exists "esign_storage_write"  on storage.objects;
drop policy if exists "esign_storage_update" on storage.objects;
drop policy if exists "esign_storage_delete" on storage.objects;

create policy "esign_storage_read"
on storage.objects for select
to authenticated
using (
  bucket_id = any (array['esign-source','esign-signed','esign-signatures'])
  and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'finance_manager'::app_role)
    or public.has_role(auth.uid(), 'employee'::app_role)
  )
);

create policy "esign_storage_write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = any (array['esign-source','esign-signed','esign-signatures'])
  and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'finance_manager'::app_role)
    or public.has_role(auth.uid(), 'employee'::app_role)
  )
);

create policy "esign_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = any (array['esign-source','esign-signed','esign-signatures'])
  and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'finance_manager'::app_role)
    or public.has_role(auth.uid(), 'employee'::app_role)
  )
);

create policy "esign_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = any (array['esign-source','esign-signed','esign-signatures'])
  and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'finance_manager'::app_role)
    or public.has_role(auth.uid(), 'employee'::app_role)
  )
);
