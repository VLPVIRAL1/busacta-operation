
insert into storage.buckets (id, name, public) values ('database-backups','database-backups', false)
on conflict (id) do nothing;

create policy "admins read backups"
on storage.objects for select to authenticated
using (
  bucket_id = 'database-backups'
  and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
);
