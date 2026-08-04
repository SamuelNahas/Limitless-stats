-- Limitless Stats — schema inicial Supabase/PostgreSQL
-- Aplique com `supabase db push` ou pelo SQL Editor do projeto gratuito.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.formats (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  game text not null default 'pokemon-tcg',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default extensions.gen_random_uuid(),
  format_id uuid not null references public.formats(id),
  slug text not null,
  name text not null,
  collection_code text,
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (format_id, slug),
  unique (id, format_id)
);

create unique index seasons_one_current_per_format on public.seasons(format_id) where is_current;

create table public.archetypes (
  id uuid primary key default extensions.gen_random_uuid(),
  format_id uuid not null references public.formats(id),
  slug text not null,
  name text not null,
  visual_key text,
  hero_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (format_id, slug),
  unique (id, format_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Treinador' check (char_length(display_name) between 1 and 60),
  public_alias text check (public_alias is null or char_length(public_alias) between 1 and 40),
  avatar_url text,
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Campo_Grande',
  tie_rule text not null default 'half' check (tie_rule in ('ignore','loss','half','third','win')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_decklists (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null default extensions.gen_random_uuid(),
  format_id uuid not null references public.formats(id),
  format_slug text not null default 'standard',
  season_id uuid,
  archetype_id uuid,
  parent_decklist_id uuid,
  name text not null,
  source text not null default 'ptcgl_text' check (source in ('ptcgl_text','manual')),
  raw_text text not null check (octet_length(raw_text) <= 50000),
  canonical_hash bytea,
  parser_version smallint not null default 1,
  parse_status text not null default 'pending' check (parse_status in ('pending','valid','invalid','partial')),
  parse_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_errors) = 'array'),
  card_count smallint not null default 0 check (card_count between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, format_id),
  unique (user_id, client_request_id),
  foreign key (season_id, format_id) references public.seasons(id, format_id),
  foreign key (archetype_id, format_id) references public.archetypes(id, format_id),
  foreign key (parent_decklist_id, user_id) references public.user_decklists(id, user_id)
);

create table public.user_decklist_cards (
  decklist_id uuid not null,
  user_id uuid not null,
  line_no smallint not null check (line_no > 0),
  category text not null check (category in ('pokemon','trainer','energy','unknown')),
  raw_name text not null,
  set_code text,
  collector_number text,
  quantity smallint not null check (quantity between 1 and 60),
  resolved_card_key text,
  primary key (decklist_id, line_no),
  foreign key (decklist_id, user_id) references public.user_decklists(id, user_id) on delete cascade
);

create table public.journal_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null default extensions.gen_random_uuid(),
  format_id uuid not null references public.formats(id),
  format_slug text not null default 'standard',
  season_id uuid,
  decklist_id uuid,
  own_archetype_id uuid,
  own_archetype_slug text,
  own_archetype_label text,
  era_slug text not null default 'standard-pitch-black',
  name text not null,
  tournament_date date not null,
  environment text not null default 'online' check (environment in ('online','in_person')),
  platform text not null default 'ptcgl',
  match_structure text not null default 'bo1' check (match_structure in ('bo1','bo3','mixed')),
  status text not null default 'draft' check (status in ('draft','completed')),
  expected_rounds smallint check (expected_rounds is null or expected_rounds > 0),
  placement smallint check (placement is null or placement > 0),
  participant_count integer check (participant_count is null or participant_count > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  unique (user_id, client_request_id),
  unique (id, user_id, format_id),
  foreign key (season_id, format_id) references public.seasons(id, format_id),
  foreign key (own_archetype_id, format_id) references public.archetypes(id, format_id),
  foreign key (decklist_id, user_id, format_id) references public.user_decklists(id, user_id, format_id),
  check (placement is null or participant_count is null or placement <= participant_count)
);

create table public.journal_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  client_request_id uuid not null default extensions.gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  format_id uuid not null,
  phase text not null default 'swiss' check (phase in ('swiss','top_cut','other')),
  round_number smallint not null check (round_number > 0),
  match_structure text not null default 'bo1' check (match_structure in ('bo1','bo3')),
  opponent_archetype_id uuid,
  opponent_archetype_slug text,
  opponent_archetype_label text,
  opponent_name text,
  result text not null default 'unreported' check (result in ('win','loss','tie','bye','unreported')),
  game_wins smallint not null default 0,
  game_losses smallint not null default 0,
  game_ties smallint not null default 0,
  went_first text not null default 'unknown' check (went_first in ('first','second','unknown')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, phase, round_number),
  unique (user_id, client_request_id),
  foreign key (event_id, user_id, format_id) references public.journal_events(id, user_id, format_id) on delete cascade,
  foreign key (opponent_archetype_id, format_id) references public.archetypes(id, format_id),
  check (game_wins >= 0 and game_losses >= 0 and game_ties >= 0),
  check (game_wins + game_losses + game_ties <= 9)
);

create table public.profile_share_links (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  label text,
  scopes text[] not null default array['summary']::text[] check (scopes <@ array['summary','events','decklists']::text[]),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index journal_events_user_date on public.journal_events(user_id, tournament_date desc);
create index journal_rounds_user_opponent on public.journal_rounds(user_id, opponent_archetype_id);
create index decklists_user_created on public.user_decklists(user_id, created_at desc);

create or replace function private.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger decklists_set_updated_at before update on public.user_decklists
for each row execute function private.set_updated_at();
create trigger journal_events_set_updated_at before update on public.journal_events
for each row execute function private.set_updated_at();
create trigger journal_rounds_set_updated_at before update on public.journal_rounds
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''),'Treinador'), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

alter table public.formats enable row level security;
alter table public.seasons enable row level security;
alter table public.archetypes enable row level security;
alter table public.profiles enable row level security;
alter table public.user_decklists enable row level security;
alter table public.user_decklist_cards enable row level security;
alter table public.journal_events enable row level security;
alter table public.journal_rounds enable row level security;
alter table public.profile_share_links enable row level security;

create policy formats_public_read on public.formats for select to anon, authenticated using (is_active);
create policy seasons_public_read on public.seasons for select to anon, authenticated using (true);
create policy archetypes_public_read on public.archetypes for select to anon, authenticated using (is_active);
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy decklists_owner on public.user_decklists for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy decklist_cards_owner on public.user_decklist_cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journal_events_owner on public.journal_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journal_rounds_owner on public.journal_rounds for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy share_links_owner on public.profile_share_links for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.user_decklists, public.user_decklist_cards, public.journal_events, public.journal_rounds, public.profile_share_links from anon;
grant select on public.formats, public.seasons, public.archetypes to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_decklists, public.user_decklist_cards, public.journal_events, public.journal_rounds, public.profile_share_links to authenticated;

create view public.journal_matchup_stats with (security_invoker = true) as
select e.user_id, e.format_id, e.season_id,
  e.own_archetype_id, e.own_archetype_slug,
  r.opponent_archetype_id, r.opponent_archetype_slug,
  count(*) filter (where r.result = 'win')::integer as wins,
  count(*) filter (where r.result = 'loss')::integer as losses,
  count(*) filter (where r.result = 'tie')::integer as ties,
  count(*) filter (where r.result in ('win','loss','tie'))::integer as matches
from public.journal_events e join public.journal_rounds r on r.event_id = e.id and r.user_id = e.user_id
where e.status = 'completed'
group by e.user_id, e.format_id, e.season_id,
  e.own_archetype_id, e.own_archetype_slug,
  r.opponent_archetype_id, r.opponent_archetype_slug;
grant select on public.journal_matchup_stats to authenticated;

create or replace function public.create_profile_share_link(p_label text default null, p_expires_at timestamptz default null)
returns table(link_id uuid, secret text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := extensions.gen_random_uuid();
  v_secret text;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiration must be in the future'; end if;
  if (select count(*) from public.profile_share_links where user_id = v_user_id and revoked_at is null and (expires_at is null or expires_at > now())) >= 10 then raise exception 'active share link limit reached'; end if;
  v_secret := rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  insert into public.profile_share_links (id,user_id,secret_hash,label,expires_at)
  values (v_id,v_user_id,extensions.digest(convert_to(v_secret,'UTF8'),'sha256'),nullif(trim(p_label),''),p_expires_at);
  return query select v_id,v_secret;
end;
$$;

-- Retorna somente agregados aprovados. Notas, e-mail, nome de oponente e lista bruta nunca são compartilhados.
create or replace function public.read_shared_profile(p_link_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_result jsonb;
begin
  select user_id into v_user_id from public.profile_share_links
  where id = p_link_id and secret_hash = extensions.digest(convert_to(p_secret,'UTF8'),'sha256')
    and revoked_at is null and (expires_at is null or expires_at > now());
  if v_user_id is null then return null; end if;
  select jsonb_build_object(
    'displayName', p.display_name,
    'tiePolicy', p.tie_rule,
    'events', (select count(*) from public.journal_events e where e.user_id=v_user_id),
    'wins', (select count(*) from public.journal_rounds r where r.user_id=v_user_id and r.result='win'),
    'losses', (select count(*) from public.journal_rounds r where r.user_id=v_user_id and r.result='loss'),
    'ties', (select count(*) from public.journal_rounds r where r.user_id=v_user_id and r.result='tie'),
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.deck_slug, 'name', d.deck_name,
        'wins', d.wins, 'losses', d.losses, 'ties', d.ties
      ) order by (d.wins+d.losses+d.ties) desc)
      from (
        select coalesce(e.own_archetype_slug,'custom') as deck_slug,
          coalesce(e.own_archetype_label,e.own_archetype_slug,'Deck customizado') as deck_name,
          count(*) filter (where r.result='win')::integer as wins,
          count(*) filter (where r.result='loss')::integer as losses,
          count(*) filter (where r.result='tie')::integer as ties
        from public.journal_events e join public.journal_rounds r on r.event_id=e.id and r.user_id=e.user_id
        where e.user_id=v_user_id and r.result in ('win','loss','tie')
        group by e.own_archetype_slug,e.own_archetype_label
      ) d
    ), '[]'::jsonb),
    'matchups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.deck_slug, 'name', m.deck_name,
        'wins', m.wins, 'losses', m.losses, 'ties', m.ties
      ) order by (m.wins+m.losses+m.ties) desc)
      from (
        select coalesce(r.opponent_archetype_slug,'custom') as deck_slug,
          coalesce(r.opponent_archetype_label,r.opponent_archetype_slug,'Deck customizado') as deck_name,
          count(*) filter (where r.result='win')::integer as wins,
          count(*) filter (where r.result='loss')::integer as losses,
          count(*) filter (where r.result='tie')::integer as ties
        from public.journal_rounds r
        where r.user_id=v_user_id and r.result in ('win','loss','tie')
        group by r.opponent_archetype_slug,r.opponent_archetype_label
      ) m
    ), '[]'::jsonb)
  ) into v_result
  from public.profiles p where p.id=v_user_id;
  return v_result;
end;
$$;

revoke all on function public.create_profile_share_link(text,timestamptz) from public;
revoke all on function public.read_shared_profile(uuid,text) from public;
grant execute on function public.create_profile_share_link(text,timestamptz) to authenticated;
grant execute on function public.read_shared_profile(uuid,text) to anon, authenticated;

insert into public.formats (slug,name) values ('standard','Standard') on conflict (slug) do nothing;
insert into public.seasons (format_id,slug,name,collection_code,starts_on,is_current)
select id,'standard-pitch-black','Pitch Black','PITCH_BLACK',date '2026-07-16',true from public.formats where slug='standard'
on conflict (format_id,slug) do nothing;
