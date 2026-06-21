
insert into storage.buckets (id, name, public)
values ('desktop-releases', 'desktop-releases', true)
on conflict (id) do update set public = true;

-- Public read
create policy "Desktop releases are publicly readable"
on storage.objects for select
using (bucket_id = 'desktop-releases');

-- Admin-only writes
create policy "Admins can upload desktop releases"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'desktop-releases'
  and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
);

create policy "Admins can update desktop releases"
on storage.objects for update
to authenticated
using (
  bucket_id = 'desktop-releases'
  and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
);

create policy "Admins can delete desktop releases"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'desktop-releases'
  and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
);
