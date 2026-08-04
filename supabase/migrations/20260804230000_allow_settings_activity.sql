-- Keep the audit log useful beyond backup operations.
ALTER TABLE public.data_activity
  DROP CONSTRAINT IF EXISTS data_activity_action_check;

ALTER TABLE public.data_activity
  ADD CONSTRAINT data_activity_action_check
  CHECK (action IN ('backup', 'export', 'import', 'delete', 'setting'));
