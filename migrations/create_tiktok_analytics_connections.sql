-- Analytics connections table (separate from orders to avoid token conflicts)
create table if not exists public.tiktok_analytics_connections (
    id uuid primary key default gen_random_uuid(),
    connection_type text not null default 'analytics',
    open_id text,
    shop_id text,
    shop_cipher text,
    seller_name text,
    seller_base_region text,
    user_type integer,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    raw_response jsonb,
    last_auth_code text,
    state text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_tiktok_analytics_conn_open_id
    on public.tiktok_analytics_connections (open_id)
    where open_id is not null;

create unique index if not exists idx_tiktok_analytics_conn_shop_id
    on public.tiktok_analytics_connections (shop_id)
    where shop_id is not null;

alter table public.tiktok_analytics_connections disable row level security;

grant select, insert, update, delete on public.tiktok_analytics_connections to anon;
grant select, insert, update, delete on public.tiktok_analytics_connections to authenticated;
