create table if not exists public.task_notes (
    id text primary key,
    title text not null,
    description text,
    image_src text,
    requested_date date,
    deadline date,
    progress integer not null default 0,
    status text not null default 'Mới',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_task_notes_updated_at
    on public.task_notes (updated_at desc);

alter table public.task_notes disable row level security;

grant select, insert, update, delete on public.task_notes to anon;
grant select, insert, update, delete on public.task_notes to authenticated;
