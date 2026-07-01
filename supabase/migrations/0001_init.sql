-- Event Scout schema
-- Core tables: sources (recurring orgs to re-crawl), events (the database), contacts (enrichment)

create extension if not exists "pgcrypto";

create type opportunity_status as enum ('open', 'closed', 'unknown', 'watch');
create type visibility_tier as enum ('A', 'B', 'C');
create type org_type as enum (
  'conference',
  'speaker_bureau',
  'association_portfolio',
  'expo_circuit',
  'corporate_event',
  'other'
);

-- Recurring sources to re-crawl (Becker's, Small Business Expo, BookThinkers, etc.)
create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  org_type org_type not null default 'other',
  sector text,
  notes text,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  event_name text not null,
  opportunity_type text,
  event_start date,
  event_end date,
  date_notes text,
  city text,
  state_country text,
  venue_format text,
  status opportunity_status not null default 'unknown',
  cfp_deadline date,
  audience_reach text,
  potential_cost text,
  why_it_matters text,
  best_client_fit text,
  booking_path text,
  source_url text,
  visibility_tier visibility_tier,
  source_id uuid references sources(id) on delete set null,
  discovered_via text not null default 'manual', -- 'manual' | 'agent_search' | 'firecrawl' | 'api'
  discovery_query text,
  raw_extract jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_name, event_start, source_url)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text,
  title text,
  email text,
  phone text,
  linkedin_url text,
  confidence text, -- 'high' | 'medium' | 'low'
  source_url text,
  found_via text not null default 'agent_search',
  created_at timestamptz not null default now()
);

create index events_sector_idx on events (sector);
create index events_tier_idx on events (visibility_tier);
create index events_status_idx on events (status);
create index events_event_start_idx on events (event_start);
create index events_cfp_deadline_idx on events (cfp_deadline);
create index contacts_event_id_idx on contacts (event_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger events_set_updated_at
  before update on events
  for each row
  execute function set_updated_at();
