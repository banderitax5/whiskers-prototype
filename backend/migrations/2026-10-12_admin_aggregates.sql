-- Phase 1 foundation hardening: exact-count aggregates for the admin dashboard.
-- additive only; the backend falls back to capped row scans until this is applied.
-- owner must run this by hand; the app never executes DDL itself.

-- dashboard top-line counts (fixes the 1000-row cap on totalSales)
create or replace function public.admin_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'totalUsers',    (select count(*) from profiles where role = 'user'),
    'totalProducts', (select count(*) from product),
    'totalOrders',   (select count(*) from orders),
    'pendingOrders', (select count(*) from orders where status = 'Pending'),
    'totalSales',    (select coalesce(sum(total_amount), 0) from orders where status <> 'Cancelled'),
    'totalProfit',   (select coalesce(sum(profit), 0) from sales),
    'totalRevenue',  (select coalesce(sum(amount), 0) from payment)
  );
$$;

-- top products by quantity inside a date window (fixes the all-time
-- order_details scan in /sales-analytics)
create or replace function public.admin_top_products(since timestamptz, lim integer default 10)
returns table (prod_id uuid, quantity bigint, revenue numeric)
language sql
stable
security definer
set search_path = public
as $$
  select od.prod_id,
         sum(od.quantity)::bigint as quantity,
         round(sum(od.subtotal)::numeric, 2) as revenue
  from order_details od
  join orders o on o.order_id = od.order_id
  where od.prod_id is not null
    and o.created_at >= since
    and o.status <> 'Cancelled'
  group by od.prod_id
  order by quantity desc
  limit lim;
$$;

-- per-customer order counts and lifetime spend (fixes the 10x1000-row walk
-- in /customers)
create or replace function public.admin_order_stats()
returns table (user_id uuid, orders_count bigint, total_spent numeric)
language sql
stable
security definer
set search_path = public
as $$
  select o.id as user_id,
         count(*) as orders_count,
         round(sum(o.total_amount)::numeric, 2) as total_spent
  from orders o
  where o.status <> 'Cancelled'
  group by o.id;
$$;

-- the only caller is the backend with the service_role key; do not let
-- anon/authenticated clients invoke these (they would bypass RLS)
revoke execute on function public.admin_stats() from public, anon, authenticated;
revoke execute on function public.admin_top_products(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.admin_order_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;
grant execute on function public.admin_top_products(timestamptz, integer) to service_role;
grant execute on function public.admin_order_stats() to service_role;

-- rollback (run only if you need to undo):
-- drop function if exists public.admin_stats();
-- drop function if exists public.admin_top_products(timestamptz, integer);
-- drop function if exists public.admin_order_stats();
