-- Tables ---------------------------------------------------------------------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our list',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (list_id, user_id)
);

create table public.list_invites (
  list_id uuid not null references public.lists (id) on delete cascade,
  email text not null check (email = lower(email)),
  primary key (list_id, email)
);

create table public.sections (
  id uuid primary key,
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null default '',
  position text not null,
  store_sort boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.items (
  id uuid primary key,
  list_id uuid not null references public.lists (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  text text not null default '',
  position text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_store text,
  category text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index items_list_id_idx on public.items (list_id);
create index sections_list_id_idx on public.sections (list_id);

create table public.store_orders (
  list_id uuid not null references public.lists (id) on delete cascade,
  store_id text not null,
  scores jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (list_id, store_id)
);

create table public.category_cache (
  text_key text primary key,
  category text not null,
  created_at timestamptz not null default now()
);

-- Row triggers ---------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.keep_deleted() returns trigger
language plpgsql as $$
begin
  if old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;

create trigger sections_touch before insert or update on public.sections
  for each row execute function public.touch_updated_at();
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_updated_at();
create trigger store_orders_touch before insert or update on public.store_orders
  for each row execute function public.touch_updated_at();

create trigger sections_keep_deleted before update on public.sections
  for each row execute function public.keep_deleted();
create trigger items_keep_deleted before update on public.items
  for each row execute function public.keep_deleted();

-- Functions ------------------------------------------------------------------

create function public.is_member(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = l and m.user_id = auth.uid()
  );
$$;

create function public.accept_invites() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
begin
  if me is null or mail is null then
    raise exception 'not signed in';
  end if;
  insert into public.list_members (list_id, user_id)
    select i.list_id, me from public.list_invites i where i.email = mail
    on conflict do nothing;
  delete from public.list_invites i where i.email = mail;
end $$;

create function public.bootstrap() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- One at a time per user, so two tabs cannot both create a first list.
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform public.accept_invites();

  select m.list_id into found
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.user_id = me
  order by (l.created_by = me), l.created_at
  limit 1;
  if found is not null then
    return found;
  end if;

  insert into public.lists (created_by) values (me) returning id into found;
  insert into public.list_members (list_id, user_id) values (found, me);
  insert into public.sections (id, list_id, title, position, store_sort)
    values (gen_random_uuid(), found, 'Grocery List', 'a0', true);
  return found;
end $$;

create function public.list_people(l uuid) returns table (email text, pending boolean)
language sql stable security definer set search_path = '' as $$
  select u.email::text, false
  from public.list_members m
  join auth.users u on u.id = m.user_id
  where m.list_id = l and public.is_member(l)
  union all
  select i.email, true
  from public.list_invites i
  where i.list_id = l and public.is_member(l);
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.accept_invites() from public, anon;
revoke execute on function public.bootstrap() from public, anon;
revoke execute on function public.list_people(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.bootstrap() to authenticated;
grant execute on function public.list_people(uuid) to authenticated;

-- Access rules ---------------------------------------------------------------

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.sections enable row level security;
alter table public.items enable row level security;
alter table public.store_orders enable row level security;
alter table public.category_cache enable row level security;

-- Supabase grants table access to anon by default. Close it, so a request
-- sent without a session gets an error rather than an empty result that the
-- app could mistake for "the list is empty".
revoke all
  on public.lists, public.list_members, public.list_invites,
     public.sections, public.items, public.store_orders
  from anon;

grant select on public.lists, public.list_members to authenticated;
grant select, insert, update, delete
  on public.list_invites, public.sections, public.items, public.store_orders
  to authenticated;
revoke all on public.category_cache from anon, authenticated;
grant all on public.category_cache to service_role;

create policy lists_select on public.lists
  for select to authenticated using (public.is_member(id));

create policy list_members_select on public.list_members
  for select to authenticated using (public.is_member(list_id));

create policy list_invites_all on public.list_invites
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy sections_all on public.sections
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy items_all on public.items
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy store_orders_all on public.store_orders
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

-- Realtime -------------------------------------------------------------------

alter publication supabase_realtime
  add table public.sections, public.items, public.store_orders;
