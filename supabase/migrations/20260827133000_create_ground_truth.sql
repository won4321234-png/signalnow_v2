create table if not exists public.ground_truth (
  intersection_id text primary key,
  layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_ground_truth_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ground_truth_set_updated_at on public.ground_truth;
create trigger ground_truth_set_updated_at
before update on public.ground_truth
for each row
execute function public.set_ground_truth_updated_at();

alter table public.ground_truth enable row level security;

drop policy if exists "service role can manage ground truth" on public.ground_truth;
create policy "service role can manage ground truth"
on public.ground_truth
for all
to service_role
using (true)
with check (true);
