create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  service text not null,
  start_date date not null,
  end_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  note text not null default 'Subscription Service',
  issued_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

alter table public.invoices enable row level security;

create policy "Users can read their own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

create policy "Users can create their own invoices"
  on public.invoices for insert
  with check (auth.uid() = user_id);

create index if not exists invoices_user_created_at_idx
  on public.invoices (user_id, created_at desc);
