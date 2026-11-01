-- Moting Supabase Schema (matches src/lib/store/supabase.ts)
create table if not exists public.sessions (
  id text primary key,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text primary key,
  status text not null,
  company text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

