-- Service booking (paper scope §1.3.1.5 "schedule service" + use case "staff approve bookings")
-- Run ONCE in the Supabase SQL Editor. Safe to re-run (tables are IF NOT EXISTS;
-- the starter catalog only inserts when the table is empty).

create table if not exists services (
  service_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  duration_minutes int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  booking_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  service_id uuid references services (service_id) on delete set null,
  service_name text not null,
  preferred_date date not null,
  notes text not null default '',
  status text not null default 'Pending'
    check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on bookings (user_id);
create index if not exists bookings_status_idx on bookings (status);

-- Server-only access: the API reads these through the service role.
-- RLS enabled with no policies = PostgREST denies anon/authenticated clients.
alter table services enable row level security;
alter table bookings enable row level security;

-- starter catalog (only when empty)
insert into services (name, description, price, duration_minutes)
select * from (values
  ('Grooming - Basic', 'Bath, blow-dry, nail trim, and ear clean for dogs or cats', 350::numeric, 60),
  ('Grooming - Full', 'Full groom with haircut, bath, nail trim, and styling', 550::numeric, 90),
  ('Pet Consultation', 'Walk-in consult for health concerns and food recommendations', 200::numeric, 30),
  ('Vaccination', 'Routine vaccination administered by a licensed vet partner', 450::numeric, 30)
) as v(name, description, price, duration_minutes)
where not exists (select 1 from services);
