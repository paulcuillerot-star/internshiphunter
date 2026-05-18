create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  email text not null,
  cv_file_url text,
  cv_text text,
  target_countries text[] default '{}',
  target_cities text[] default '{}',
  target_industries text[] default '{}',
  desired_roles text[] default '{}',
  internship_start_date text,
  internship_duration text,
  languages_spoken text[] default '{}',
  minimum_compensation text,
  companies_already_applied_to text[] default '{}',
  ideal_internship_description text,
  things_to_avoid text,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending',
  is_paid boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  title text not null,
  company text not null,
  location text,
  country text,
  city text,
  url text,
  source text,
  deadline text,
  published_date text,
  description_summary text,
  requirements_summary text,
  compensation text,
  language_requirements text[] default '{}',
  raw_source_snippet text,
  match_score integer,
  quality_score integer,
  probability_of_interview integer,
  why_it_matches text[] default '{}',
  risks text[] default '{}',
  application_angle text,
  linkedin_message text,
  cover_letter_hook text,
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  offer_id uuid references offers(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('relevant','not_relevant','expired','already_applied','wrong_country','wrong_role','too_senior','not_a_real_internship')),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  stripe_session_id text,
  status text not null,
  amount integer not null,
  currency text not null default 'eur',
  created_at timestamptz not null default now()
);

create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  report_id uuid references reports(id) on delete cascade,
  status text not null,
  query_summary text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);
