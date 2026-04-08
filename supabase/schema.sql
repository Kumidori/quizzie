create extension if not exists pgcrypto;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_player_id uuid,
  phase text not null check (phase in ('lobby', 'category-selection', 'answering', 'round-reveal', 'game-over')),
  total_rounds integer not null default 6,
  current_round_number integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  score integer not null default 0,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_number integer not null,
  chooser_player_id uuid not null,
  category_choices jsonb not null default '[]'::jsonb,
  selected_category_id text,
  selected_category_title text,
  questions jsonb not null default '[]'::jsonb,
  round_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, round_number)
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);
