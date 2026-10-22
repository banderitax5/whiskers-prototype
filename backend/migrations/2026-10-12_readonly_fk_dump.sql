-- Phase 1 read-only diagnostic: dump every foreign key on order_details,
-- payment, and orders with its ON DELETE rule. answers the open question
-- about cascade behaviour so we stop guessing from application code alone.
-- SAFE TO RUN ANYWHERE — selects only, no writes.

select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema  as foreign_schema,
  ccu.table_name    as foreign_table,
  ccu.column_name   as foreign_column,
  rc.delete_rule,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema  = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.table_schema  = ccu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
 and tc.table_schema  = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in ('order_details', 'payment', 'orders')
order by tc.table_name, kcu.column_name;
