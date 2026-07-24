-- PRD 4.1.2: the EMR bucket is a manual container. The score is entered by the
-- Risk Manager and only counts once it has been explicitly verified.
alter table public.vendors
  add column if not exists emr_verified boolean not null default false;

-- Tab 1 global search covers company name, trade, and EIN.
create index if not exists vendors_trade_specialty_idx
  on public.vendors (trade_specialty);
create index if not exists vendors_tax_id_ein_idx
  on public.vendors (tax_id_ein);
