-- PRD Sections 3.1 and 3.2: matching, reconciliation, and layered coverage.

alter table public.policy_lines
  add column if not exists effective_limit_amount numeric(12,2);

update public.policy_lines
set effective_limit_amount = limit_amount
where effective_limit_amount is null;

alter table public.policy_lines
  alter column effective_limit_amount set not null;

alter table public.policy_lines
  add constraint policy_lines_effective_limit_check
  check (effective_limit_amount >= 0) not valid;

alter table public.policy_lines
  validate constraint policy_lines_effective_limit_check;

-- Tier 3 lookup. The calling API only accepts scores strictly greater than 90.
create or replace function public.find_vendor_fuzzy(p_normalized_name text)
returns table (vendor_id uuid, confidence_score numeric)
language sql
stable
as $$
  select
    v.vendor_id,
    round((similarity(v.normalized_name, p_normalized_name) * 100)::numeric, 2)
  from public.vendors v
  where similarity(v.normalized_name, p_normalized_name) > 0
  order by similarity(v.normalized_name, p_normalized_name) desc, v.created_at asc
  limit 1;
$$;

-- Treat review_queue_items as the pending_review queue. New reason types are
-- necessary for fuzzy matches and the explicit reconciliation outcomes.
alter table public.review_queue_items
  drop constraint if exists review_queue_items_type_check;

alter table public.review_queue_items
  add constraint review_queue_items_type_check check (
    review_type in (
      'LOW_CONFIDENCE_MATCH', 'ADDRESS_MISMATCH', 'FUZZY_MATCH',
      'CARRIER_SWITCH', 'POLICY_CONFLICT', 'MISSING_POLICY_DATA',
      'MANUAL_OVERRIDE'
    )
  );

create or replace view public.pending_review
with (security_invoker = true)
as
  select *
  from public.review_queue_items
  where status in ('PENDING', 'IN_REVIEW');

-- GL's effective limit includes every active Umbrella layer for its vendor.
-- Policy rows still preserve their own original limit_amount for auditability.
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

-- Backfill effective limits for policy lines that existed before this migration.
do $$
declare
  current_vendor_id uuid;
begin
  for current_vendor_id in select distinct vendor_id from public.policy_lines loop
    perform public.recalculate_vendor_effective_limits(current_vendor_id);
  end loop;
end;
$$;
