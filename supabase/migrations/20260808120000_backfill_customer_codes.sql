-- Backfill missing customer codes for customers created before the code feature.
-- Existing C-xxxx codes are preserved; missing ones continue from the highest one.
WITH max_existing AS (
  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), '')::int), 0) AS mx
  FROM public.customers
  WHERE code ~ '^C-[0-9]+$'
),
numbered AS (
  SELECT c.id,
         'C-' || LPAD((mx + ROW_NUMBER() OVER (ORDER BY c.created_at, c.id))::text, 4, '0') AS new_code
  FROM public.customers c, max_existing mx
  WHERE c.code IS NULL OR btrim(c.code) = ''
)
UPDATE public.customers c
SET code = n.new_code
FROM numbered n
WHERE c.id = n.id;
