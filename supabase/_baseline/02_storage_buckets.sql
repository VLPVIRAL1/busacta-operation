-- ============================================================
-- 02a · Storage buckets (13)
-- Inserts the bucket definitions. The storage schema itself already exists on
-- every Supabase project, so we only insert the bucket rows.
-- (The finance-only 'bank-statements' and 'vendor-avatars' buckets are
--  intentionally omitted — those modules were removed.)
-- ============================================================
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('avatars','avatars',true,2097152,'{image/png,image/jpeg,image/webp,image/gif}'::text[],false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('branding','branding',true,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('database-backups','database-backups',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('desktop-releases','desktop-releases',true,524288000,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('employee-docs','employee-docs',false,10485760,'{application/pdf,image/png,image/jpeg}'::text[],false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('esign-id-docs','esign-id-docs',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('esign-signatures','esign-signatures',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('esign-signed','esign-signed',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('esign-source','esign-source',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('note-images','note-images',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('organizer-uploads','organizer-uploads',false,null,null,false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('productivity-screenshots','productivity-screenshots',false,3145728,'{image/jpeg,image/png,image/webp}'::text[],false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,avif_autodetection) values ('task-attachments','task-attachments',false,null,null,false) on conflict (id) do nothing;
