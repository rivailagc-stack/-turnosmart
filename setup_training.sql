create table if not exists public.maintenance_training (
  id text primary key,
  type text not null default 'training'
    check(type in('training','procedure','checklist')),
  title text not null,
  description text not null default '',
  machine text,
  category text not null default 'Geral',
  audience text not null default 'Todos da manutenção',
  frequency text not null default 'Quando necessário',
  responsible text not null default '',
  material_url text,
  steps text not null default '',
  status text not null default 'active'
    check(status in('draft','active','review','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_training_progress (
  id text primary key,
  training_id text not null
    references public.maintenance_training(id)
    on delete cascade,
  mechanic text not null,
  mechanic_label text not null default '',
  status text not null default 'completed',
  score numeric,
  notes text not null default '',
  completed_at timestamptz not null default now()
);

create table if not exists public.maintenance_visual_training (
  id text primary key,
  media_type text not null default 'image'
    check(media_type in('image','video')),
  title text not null,
  machine text,
  machine_type text not null default 'outros',
  problem_type text not null default '',
  category text not null default 'Geral',
  description text not null default '',
  steps text not null default '',
  safety text not null default '',
  validation text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  media_url text not null,
  ai_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_training_machine
  on public.maintenance_training(machine);

create index if not exists idx_training_status
  on public.maintenance_training(status);

create index if not exists idx_training_progress_training
  on public.maintenance_training_progress(training_id);

create index if not exists idx_training_progress_mechanic
  on public.maintenance_training_progress(mechanic);

create index if not exists idx_visual_training_machine
  on public.maintenance_visual_training(machine);

create index if not exists idx_visual_training_machine_type
  on public.maintenance_visual_training(machine_type);

create index if not exists idx_visual_training_problem_type
  on public.maintenance_visual_training(problem_type);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'training-media',
  'training-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.maintenance_training
  enable row level security;

alter table public.maintenance_training_progress
  enable row level security;

alter table public.maintenance_visual_training
  enable row level security;
