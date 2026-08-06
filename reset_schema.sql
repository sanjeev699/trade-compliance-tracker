-- WARNING: This will drop your existing tables and their data.
-- Since the current schema is corrupted/missing columns, a reset is required.
drop table if exists public.audit_logs cascade;
drop table if exists public.review_queue_items cascade;
drop table if exists public.policy_lines cascade;
drop table if exists public.project_lineups cascade;
drop table if exists public.documents cascade;
drop table if exists public.projects cascade;
drop table if exists public.vendors cascade;

drop sequence if exists public.vendor_sc_id_seq cascade;

-- Apply PRD Section 6.2: Operational Risk & Compliance data foundation.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1. Vendor master
create sequence if not exists public.vendor_sc_id_seq start 1000;

create table if not exists public.vendors (
  vendor_id uuid primary key default gen_random_uuid(),
  sc_id varchar(50) unique,
  company_name varchar(255) not null,
  normalized_name varchar(255) not null,
  tax_id_ein varchar(20) unique,
  primary_email varchar(255) not null,
  trade_specialty varchar(100) not null default 'Unclassified',
  address_street varchar(255),
  address_zip varchar(20),
  emr_score numeric(3,2) check (emr_score is null or emr_score between 0 and 9.99),
  osha_file_url text,
  w9_status varchar(30) not null default 'PENDING',
  w9_file_url text,
  msa_status varchar(30) not null default 'PENDING',
  msa_file_url text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint vendors_w9_status_check check (w9_status in ('PENDING', 'VERIFIED', 'REJECTED')),
  constraint vendors_msa_status_check check (msa_status in ('PENDING', 'VERIFIED', 'REJECTED'))
);

create or replace function public.set_vendor_sc_id()
returns trigger as $$
begin
  if new.sc_id is null then
    new.sc_id := 'VND-' || nextval('public.vendor_sc_id_seq');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists vendors_set_sc_id on public.vendors;
create trigger vendors_set_sc_id
before insert on public.vendors
for each row execute function public.set_vendor_sc_id();

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

-- Supporting source-document record.
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
  description_of_operations text,
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

-- 4. Policy lines
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
  addl_insr boolean not null default false,
  subr_wvd boolean not null default false,
  employers_liability_ea_acc numeric(12,2) check (employers_liability_ea_acc >= 0),
  employers_liability_disease_ea_emp numeric(12,2) check (employers_liability_disease_ea_emp >= 0),
  employers_liability_disease_policy_limit numeric(12,2) check (employers_liability_disease_policy_limit >= 0),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint policy_lines_coverage_type_check check (
    coverage_type in ('GL', 'AUTO', 'WORKERS_COMP', 'UMBRELLA')
  ),
  constraint policy_lines_dates_check check (effective_date <= expiration_date)
);

create index if not exists policy_lines_policy_naic_idx
  on public.policy_lines (policy_number, naic_code);
create index if not exists policy_lines_vendor_coverage_active_idx
  on public.policy_lines (vendor_id, coverage_type, expiration_date)
  where is_active;
create unique index if not exists policy_lines_active_policy_key
  on public.policy_lines (vendor_id, policy_number, naic_code, coverage_type)
  where is_active;

-- Supporting human review queue
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

-- Centralized Audit Trail
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(vendor_id) on delete cascade,
  actor_name varchar(255) not null,
  actor_role varchar(100) not null,
  action_type varchar(50) not null default 'DOCS_SAFETY_UPDATE',
  action_details text not null,
  manager_note text not null,
  created_at timestamptz not null default current_timestamp
);

create index if not exists audit_logs_vendor_idx on public.audit_logs(vendor_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.vendors enable row level security;
alter table public.policy_lines enable row level security;
alter table public.projects enable row level security;
alter table public.project_lineups enable row level security;
alter table public.documents enable row level security;
alter table public.review_queue_items enable row level security;
alter table public.audit_logs enable row level security;

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

-- Apply PRD Sections 3.1 and 3.2: matching, reconciliation, and layered coverage.
alter table public.policy_lines add column if not exists effective_limit_amount numeric(12,2);
update public.policy_lines set effective_limit_amount = limit_amount where effective_limit_amount is null;
alter table public.policy_lines alter column effective_limit_amount set not null;
alter table public.policy_lines add constraint policy_lines_effective_limit_check check (effective_limit_amount >= 0) not valid;
alter table public.policy_lines validate constraint policy_lines_effective_limit_check;

create or replace function public.find_vendor_fuzzy(p_normalized_name text)
returns table (vendor_id uuid, confidence_score numeric)
language sql stable
as $$
  select
    v.vendor_id,
    round((similarity(v.normalized_name, p_normalized_name) * 100)::numeric, 2)
  from public.vendors v
  where similarity(v.normalized_name, p_normalized_name) > 0
  order by similarity(v.normalized_name, p_normalized_name) desc, v.created_at asc
  limit 1;
$$;

alter table public.review_queue_items drop constraint if exists review_queue_items_type_check;
alter table public.review_queue_items add constraint review_queue_items_type_check check (
  review_type in (
    'LOW_CONFIDENCE_MATCH', 'ADDRESS_MISMATCH', 'FUZZY_MATCH',
    'CARRIER_SWITCH', 'POLICY_CONFLICT', 'MISSING_POLICY_DATA',
    'MANUAL_OVERRIDE'
  )
);

create or replace view public.pending_review with (security_invoker = true) as
  select * from public.review_queue_items where status in ('PENDING', 'IN_REVIEW');

create or replace function public.recalculate_vendor_effective_limits(p_vendor_id uuid)
returns void
language plpgsql
as $$
declare
  umbrella_total numeric(12,2);
begin
  select coalesce(sum(limit_amount), 0)
  into umbrella_total
  from public.policy_lines
  where vendor_id = p_vendor_id
    and coverage_type = 'UMBRELLA'
    and is_active = true;

  update public.policy_lines
  set effective_limit_amount = case
    when coverage_type = 'GL' and is_active then limit_amount + umbrella_total
    else limit_amount
  end
  where vendor_id = p_vendor_id;
end;
$$;

create or replace function public.refresh_effective_limits_after_policy_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_vendor_effective_limits(old.vendor_id);
    return old;
  end if;

  perform public.recalculate_vendor_effective_limits(new.vendor_id);
  if tg_op = 'UPDATE' and old.vendor_id is distinct from new.vendor_id then
    perform public.recalculate_vendor_effective_limits(old.vendor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists policy_lines_refresh_effective_limits on public.policy_lines;
create trigger policy_lines_refresh_effective_limits
after insert or delete or update of vendor_id, coverage_type, limit_amount, is_active
on public.policy_lines
for each row execute function public.refresh_effective_limits_after_policy_change();

-- End of script

