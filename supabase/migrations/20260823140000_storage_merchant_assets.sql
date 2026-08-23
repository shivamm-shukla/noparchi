-- =============================================================================
-- Storage Bucket: merchant-assets
--
-- Holds merchant logos and public branding assets.
-- Public bucket so customer-facing checkout and ticket pages (/pay, /ticket)
-- can load merchant logos without authentication.
-- Upload, update, and deletion are restricted to authenticated merchant staff
-- with 'can_edit_settings' permission scoped to their merchant folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-assets',
  'merchant-assets',
  true,
  5242880, -- 5 MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Storage RLS Policies
-- -----------------------------------------------------------------------------

-- Public read for merchant assets
drop policy if exists "merchant_assets_public_read" on storage.objects;
create policy "merchant_assets_public_read"
on storage.objects for select
using (bucket_id = 'merchant-assets');

-- Staff with can_edit_settings can upload to their merchant's folder
drop policy if exists "merchant_assets_staff_insert" on storage.objects;
create policy "merchant_assets_staff_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);

-- Staff with can_edit_settings can update objects in their merchant's folder
drop policy if exists "merchant_assets_staff_update" on storage.objects;
create policy "merchant_assets_staff_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);

-- Staff with can_edit_settings can delete objects from their merchant's folder
drop policy if exists "merchant_assets_staff_delete" on storage.objects;
create policy "merchant_assets_staff_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);
