create extension if not exists pgcrypto;

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  cv_file_name text,
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

create table if not exists search_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references user_profiles(id) on delete set null,
  status text not null default 'completed',
  is_paid boolean not null default false,
  matched_category text,
  matched_region text,
  matched_bucket_id text,
  matched_bucket_title text,
  matched_explanation text,
  free_offers jsonb not null default '[]'::jsonb,
  premium_offers jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists free_usage_limits (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  week_key text not null,
  report_id uuid references search_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(email, week_key)
);

create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references user_profiles(id) on delete set null,
  report_id uuid references search_reports(id) on delete set null,
  status text not null,
  query_summary text,
  error_message text,
  raw_response text,
  created_at timestamptz not null default now()
);

create table if not exists offer_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references search_reports(id) on delete cascade,
  offer_id text not null,
  feedback_type text not null check (feedback_type in ('relevant','not_relevant','expired','already_applied','wrong_country','wrong_role','too_senior','not_a_real_internship')),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists cached_bucket_opportunities (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  category text,
  region text,
  title text not null,
  company text not null,
  location text,
  country text,
  city text,
  url text not null,
  source text,
  deadline text,
  published_date text,
  description_summary text,
  requirements_summary text,
  compensation text,
  language_requirements text[] default '{}',
  raw_source_snippet text,
  match_score integer default 85,
  quality_score integer default 85,
  probability_of_interview integer default 50,
  why_it_matches jsonb default '[]'::jsonb,
  risks jsonb default '[]'::jsonb,
  application_angle text,
  linkedin_message text,
  cover_letter_hook text,
  is_live_verified boolean default false,
  verified_at timestamptz,
  expires_at timestamptz,
  refresh_run_id text,
  raw_sources jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_profiles_email_idx on user_profiles(email);
create index if not exists search_reports_profile_id_idx on search_reports(profile_id);
create index if not exists free_usage_limits_email_week_idx on free_usage_limits(email, week_key);
create index if not exists offer_feedback_report_id_idx on offer_feedback(report_id);
create index if not exists search_logs_report_id_idx on search_logs(report_id);
create index if not exists cached_bucket_opportunities_bucket_id_idx on cached_bucket_opportunities(bucket_id);
create index if not exists cached_bucket_opportunities_category_idx on cached_bucket_opportunities(category);
create index if not exists cached_bucket_opportunities_region_idx on cached_bucket_opportunities(region);
create index if not exists cached_bucket_opportunities_verified_at_idx on cached_bucket_opportunities(verified_at desc);
create index if not exists cached_bucket_opportunities_quality_score_idx on cached_bucket_opportunities(quality_score desc);
