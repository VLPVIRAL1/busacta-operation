-- ============================================================
-- 02b · Storage object policies (33)
-- Applied to storage.objects. Uses DROP IF EXISTS + CREATE for idempotency.
-- ============================================================

drop policy if exists "Admins can delete desktop releases" on storage.objects;
create policy "Admins can delete desktop releases" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = 'desktop-releases'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

drop policy if exists "Admins can update desktop releases" on storage.objects;
create policy "Admins can update desktop releases" on storage.objects as permissive
  for update to authenticated
  using ((bucket_id = 'desktop-releases'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

drop policy if exists "Admins can upload desktop releases" on storage.objects;
create policy "Admins can upload desktop releases" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = 'desktop-releases'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

drop policy if exists "Admins delete branding files" on storage.objects;
create policy "Admins delete branding files" on storage.objects as permissive
  for delete to public
  using ((bucket_id = 'branding'::text) AND has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins insert branding files" on storage.objects;
create policy "Admins insert branding files" on storage.objects as permissive
  for insert to public
  with check ((bucket_id = 'branding'::text) AND has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins update branding files" on storage.objects;
create policy "Admins update branding files" on storage.objects as permissive
  for update to public
  using ((bucket_id = 'branding'::text) AND has_role(auth.uid(), 'admin'::app_role))
  with check ((bucket_id = 'branding'::text) AND has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Avatar read scoped" on storage.objects;
create policy "Avatar read scoped" on storage.objects as permissive
  for select to public
  using ((bucket_id = 'avatars'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_internal_user_id(auth.uid())));

drop policy if exists "Clients read attachment files via visible messages" on storage.objects;
create policy "Clients read attachment files via visible messages" on storage.objects as permissive
  for select to public
  using ((bucket_id = 'task-attachments'::text) AND (EXISTS ( SELECT 1
   FROM ((((task_attachments ta
     JOIN task_messages m ON ((m.id = ta.message_id)))
     JOIN tasks t ON ((t.id = m.task_id)))
     JOIN client_entities ce ON ((ce.id = t.entity_id)))
     JOIN projects p ON ((p.id = ce.project_id)))
  WHERE ((ta.storage_path = objects.name) AND (m.is_client_visible = true) AND (m.deleted_at IS NULL) AND user_can_access_firm(p.firm_id)))));

drop policy if exists "Clients read shared task attachment objects" on storage.objects;
create policy "Clients read shared task attachment objects" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'task-attachments'::text) AND (EXISTS ( SELECT 1
   FROM (((task_attachments a
     JOIN tasks t ON ((t.id = a.task_id)))
     JOIN client_entities ce ON ((ce.id = t.entity_id)))
     JOIN projects p ON ((p.id = ce.project_id)))
  WHERE ((a.storage_path = objects.name) AND (a.is_client_visible = true) AND (a.archived_at IS NULL) AND user_can_access_firm(p.firm_id)))));

drop policy if exists "Desktop releases are publicly readable" on storage.objects;
create policy "Desktop releases are publicly readable" on storage.objects as permissive
  for select to public
  using ((bucket_id = 'desktop-releases'::text));

drop policy if exists "Internal manage task attachment files" on storage.objects;
create policy "Internal manage task attachment files" on storage.objects as permissive
  for all to authenticated
  using ((bucket_id = 'task-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)))
  with check ((bucket_id = 'task-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)));

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = 'avatars'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role) OR has_capability(auth.uid(), 'people.manage'::text)));

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects as permissive
  for update to authenticated
  using ((bucket_id = 'avatars'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role) OR has_capability(auth.uid(), 'people.manage'::text)));

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = 'avatars'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role) OR has_capability(auth.uid(), 'people.manage'::text)));

drop policy if exists "admins read backups" on storage.objects;
create policy "admins read backups" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'database-backups'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

drop policy if exists "employee_read_own_docs_storage" on storage.objects;
create policy "employee_read_own_docs_storage" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'employee-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

drop policy if exists "esign_id_docs_manager_delete" on storage.objects;
create policy "esign_id_docs_manager_delete" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = 'esign-id-docs'::text) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_id_docs_manager_read" on storage.objects;
create policy "esign_id_docs_manager_read" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'esign-id-docs'::text) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_id_docs_manager_update" on storage.objects;
create policy "esign_id_docs_manager_update" on storage.objects as permissive
  for update to authenticated
  using ((bucket_id = 'esign-id-docs'::text) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_id_docs_manager_write" on storage.objects;
create policy "esign_id_docs_manager_write" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = 'esign-id-docs'::text) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_storage_delete" on storage.objects;
create policy "esign_storage_delete" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = ANY (ARRAY['esign-source'::text, 'esign-signed'::text, 'esign-signatures'::text])) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_storage_read" on storage.objects;
create policy "esign_storage_read" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = ANY (ARRAY['esign-source'::text, 'esign-signed'::text, 'esign-signatures'::text])) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_storage_update" on storage.objects;
create policy "esign_storage_update" on storage.objects as permissive
  for update to authenticated
  using ((bucket_id = ANY (ARRAY['esign-source'::text, 'esign-signed'::text, 'esign-signatures'::text])) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "esign_storage_write" on storage.objects;
create policy "esign_storage_write" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = ANY (ARRAY['esign-source'::text, 'esign-signed'::text, 'esign-signatures'::text])) AND can_view_esign_id_doc(((storage.foldername(name))[1])::uuid));

drop policy if exists "hr_manage_employee_docs_storage" on storage.objects;
create policy "hr_manage_employee_docs_storage" on storage.objects as permissive
  for all to authenticated
  using ((bucket_id = 'employee-docs'::text) AND (current_user_role() = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role, 'hr_manager'::app_role])))
  with check ((bucket_id = 'employee-docs'::text) AND (current_user_role() = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role, 'hr_manager'::app_role])));

drop policy if exists "note-images authed delete" on storage.objects;
create policy "note-images authed delete" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = 'note-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "note-images authed update" on storage.objects;
create policy "note-images authed update" on storage.objects as permissive
  for update to authenticated
  using ((bucket_id = 'note-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "note-images owner insert" on storage.objects;
create policy "note-images owner insert" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = 'note-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "note-images owner read" on storage.objects;
create policy "note-images owner read" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'note-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "organizer uploads assignee read" on storage.objects;
create policy "organizer uploads assignee read" on storage.objects as permissive
  for select to authenticated
  using ((bucket_id = 'organizer-uploads'::text) AND (EXISTS ( SELECT 1
   FROM organizer_deployments d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND ((d.assignee_profile_id = auth.uid()) OR can_manage_organizer(auth.uid()))))));

drop policy if exists "organizer uploads assignee write" on storage.objects;
create policy "organizer uploads assignee write" on storage.objects as permissive
  for insert to authenticated
  with check ((bucket_id = 'organizer-uploads'::text) AND (EXISTS ( SELECT 1
   FROM organizer_deployments d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.assignee_profile_id = auth.uid()) AND (d.status = ANY (ARRAY['not_started'::organizer_deployment_status, 'in_progress'::organizer_deployment_status, 'returned'::organizer_deployment_status]))))));

drop policy if exists "organizer uploads delete own" on storage.objects;
create policy "organizer uploads delete own" on storage.objects as permissive
  for delete to authenticated
  using ((bucket_id = 'organizer-uploads'::text) AND (EXISTS ( SELECT 1
   FROM organizer_deployments d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (((d.assignee_profile_id = auth.uid()) AND (d.status = ANY (ARRAY['not_started'::organizer_deployment_status, 'in_progress'::organizer_deployment_status, 'returned'::organizer_deployment_status]))) OR can_manage_organizer(auth.uid()))))));

drop policy if exists "productivity_screenshots_select_own" on storage.objects;
create policy "productivity_screenshots_select_own" on storage.objects as permissive
  for select to public
  using ((bucket_id = 'productivity-screenshots'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role)));
