create table if not exists public.koc_brand_assignments (
    id uuid primary key default gen_random_uuid(),
    koc_id text not null,
    brand_name text not null,
    staff_name text not null,
    assigned_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint koc_brand_assignments_unique unique (koc_id, brand_name)
);

create index if not exists idx_koc_brand_assignments_koc_brand
    on public.koc_brand_assignments (koc_id, brand_name);

create index if not exists idx_koc_brand_assignments_updated_at
    on public.koc_brand_assignments (updated_at desc);

alter table public.koc_brand_assignments disable row level security;

grant select, insert, update, delete on public.koc_brand_assignments to anon;
grant select, insert, update, delete on public.koc_brand_assignments to authenticated;
