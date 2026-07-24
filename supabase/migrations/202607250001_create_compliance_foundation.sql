-- PRD Section 6.2: Operational Risk & Compliance data foundation.
-- Apply through the Supabase CLI or the Supabase SQL editor before deploying
-- the application code that writes to these tables.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1. Vendor master
create table if not exists public.vendors (
  vendor_id uuid primary key default gen_random_uuid(),
  company_name varchar(255) not null,
  normalized_name varchar(255) not null,
  tax_id_ein varchar(20) unique,
  primary_email varchar(255) not null,
  trade_specialty varchar(100) not null default 'Unclassified',
  address_street varchar(255),
  address_zip varchar(20),
  emr_score numeric(3,2) check (emr_score is null or emr_score between 0 and 9.99),
  osha_file_url text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists vendors_normalized_name_idx
  on public.vendors (normalized_name);
create index if not exists vendors_company_address_idx
  on public.vendors (normalized_name, address_street, address_zip);
create index if not exists vendors_normalized_name_trgm_idx
  on public.vendors using gin (normalized_name gin_trgm_ops);

-- 2. Projects
create table if not exists public.projects (
  project_id uuid primary key default gen_random_uuid(),
  project_name varchar(255) not null,
  gatekeeper_access_token uuid not null unique default gen_random_uuid(),
  req_gl_limit numeric(12,2) not null default 1000000.00 check (req_gl_limit >= 0),
  req_umbrella_limit numeric(12,2) not null default 0.00 check (req_umbrella_limit >= 0),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists projects_name_idx on public.projects (project_name);

-- 3. Project/vendor lineup
create table if not exists public.project_lineups (
  lineup_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(project_id) on delete cascade,
  vendor_id uuid not null references public.vendors(vendor_id) on delete cascade,
  override_status varchar(50),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint project_lineups_project_vendor_key unique (project_id, vendor_id),
  constraint project_lineups_override_status_check check (
    override_status is null or override_status in ('APPROVED', 'DENIED', 'PENDING')
  )
);

create index if not exists project_lineups_vendor_idx on public.project_lineups (vendor_id);

-- Supporting source-document record.  It retains the original upload and the
-- extraction snapshot even when policy records are later superseded.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(vendor_id) on delete set null,
  company_name varchar(255) not null,
  doc_type varchar(100) not null default 'Certificate of Insurance',
  expiration_date date,
  policy_amount text,
  coverages jsonb not null default '[]'::jsonb,
  file_url text not null,
  original_filename varchar(500),
  mime_type varchar(100),
  checksum_sha256 varchar(64),
  extraction_status varchar(30) not null default 'EXTRACTED',
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  constraint documents_extraction_status_check check (
    extraction_status in ('PENDING', 'EXTRACTED', 'PROCESSED', 'REVIEW_REQUIRED', 'FAILED')
  )
);

create unique index if not exists documents_checksum_unique_idx
  on public.documents (checksum_sha256) where checksum_sha256 is not null;
create index if not exists documents_vendor_created_idx
  on public.documents (vendor_id, created_at desc);
create index if not exists documents_status_idx
  on public.documents (extraction_status, created_at desc);

-- 4. Policy lines. source_document_id provides the audit trail from an active
-- or archived policy record back to its uploaded ACORD document.
create table if not exists public.policy_lines (
  policy_id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(vendor_id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  policy_number varchar(100) not null,
  naic_code varchar(20) not null,
  coverage_type varchar(50) not null,
  limit_amount numeric(12,2) not null check (limit_amount >= 0),
  effective_date date not null,
  expiration_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint policy_lines_coverage_type_check check (
    coverage_type in ('GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA')
  ),
  constraint policy_lines_dates_check check (effective_date <= expiration_date)
);

-- Tier 1 ingestion anchor: policy number plus NAIC code.
create index if not exists policy_lines_policy_naic_idx
  on public.policy_lines (policy_number, naic_code);
create index if not exists policy_lines_vendor_coverage_active_idx
  on public.policy_lines (vendor_id, coverage_type, expiration_date)
  where is_active;
-- At most one active line represents a policy/coverage combination for a vendor.
create unique index if not exists policy_lines_active_policy_key
  on public.policy_lines (vendor_id, policy_number, naic_code, coverage_type)
  where is_active;

-- Supporting human review queue for uncertain matches, carrier switches,
-- conflicts, and manual exceptions.
create table if not exists public.review_queue_items (
  review_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  vendor_id uuid references public.vendors(vendor_id) on delete set null,
  review_type varchar(50) not null,
  status varchar(30) not null default 'PENDING',
  confidence_score numeric(5,2),
  details jsonb not null default '{}'::jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  constraint review_queue_items_type_check check (
    review_type in ('LOW_CONFIDENCE_MATCH', 'ADDRESS_MISMATCH', 'CARRIER_SWITCH', 'POLICY_CONFLICT', 'MISSING_POLICY_DATA', 'MANUAL_OVERRIDE')
  ),
  constraint review_queue_items_status_check check (
    status in ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')
  ),
  constraint review_queue_items_confidence_check check (
    confidence_score is null or confidence_score between 0 and 100
  ),
  constraint review_queue_items_resolved_at_check check (
    (status in ('RESOLVED', 'DISMISSED') and resolved_at is not null)
    or (status in ('PENDING', 'IN_REVIEW') and resolved_at is null)
  )
);

create index if not exists review_queue_items_open_idx
  on public.review_queue_items (status, created_at desc)
  where status in ('PENDING', 'IN_REVIEW');
create index if not exists review_queue_items_document_idx
  on public.review_queue_items (document_id);

-- The browser must not access the operational tables directly. The Next.js
-- server uses SUPABASE_SERVICE_ROLE_KEY for the current API routes; introduce
-- authenticated role policies when the PRD role architecture is implemented.
alter table public.vendors enable row level security;
alter table public.policy_lines enable row level security;
alter table public.projects enable row level security;
alter table public.project_lineups enable row level security;
alter table public.documents enable row level security;
alter table public.review_queue_items enable row level security;

-- Keep timestamps current without relying on application code.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$;

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at before update on public.vendors
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_lineups_set_updated_at on public.project_lineups;
create trigger project_lineups_set_updated_at before update on public.project_lineups
for each row execute function public.set_updated_at();

drop trigger if exists policy_lines_set_updated_at on public.policy_lines;
create trigger policy_lines_set_updated_at before update on public.policy_lines
for each row execute function public.set_updated_at();
