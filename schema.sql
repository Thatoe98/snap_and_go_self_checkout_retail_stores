create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  yolo_class_name text unique not null,
  display_name text not null,
  price numeric(10,2) not null check (price >= 0),
  stock_level integer not null default 0 check (stock_level >= 0)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  items_summary jsonb not null default '[]'::jsonb
);

insert into public.products (yolo_class_name, display_name, price, stock_level)
values
  ('singha_can', 'Singha Lemon Soda', 15.00, 40),
  ('lays_seaweed', 'Lays Seaweed', 30.00, 50),
  ('mama_tomyum', 'Mama Tom Yum Noodles', 12.00, 80),
  ('oreo_pack', 'Oreo Vanilla Pack', 25.00, 35),
  ('coke_zero', 'Coke Zero 325ml', 18.00, 60)
on conflict (yolo_class_name) do nothing;
