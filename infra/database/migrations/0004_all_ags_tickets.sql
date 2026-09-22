UPDATE assignments
SET
  scenario_ids = '["ags-01-1","ags-01-2","ags-01-3","ags-02-1","ags-02-2","ags-02-3","ags-03-1","ags-03-2","ags-03-3","ags-04-1","ags-04-2","ags-04-3","ags-05-1","ags-05-2","ags-05-3","ags-06-1","ags-06-2","ags-06-3","ags-07-1","ags-07-2","ags-07-3","ags-08-1","ags-08-2","ags-08-3","ags-09-1","ags-09-2","ags-09-3","ags-10-1","ags-10-2","ags-10-3","ags-11-1","ags-11-2","ags-11-3","ags-12-1","ags-12-2","ags-12-3","ags-13-1","ags-13-2","ags-13-3","ags-14-1","ags-14-2","ags-14-3","ags-15-1","ags-15-2","ags-15-3","ags-16-1","ags-16-2","ags-16-3","ags-17-1","ags-17-2","ags-17-3","ags-18-1","ags-18-2","ags-18-3","ags-19-1","ags-19-2","ags-19-3","ags-20-1","ags-20-2","ags-20-3","ags-21-1","ags-21-2","ags-21-3","ags-22-1","ags-22-2","ags-22-3","ags-23-1","ags-23-2","ags-23-3","ags-24-1","ags-24-2","ags-24-3","ags-25-1","ags-25-2","ags-25-3","ags-26-1","ags-26-2","ags-26-3","ags-27-1","ags-27-2","ags-27-3","ags-28-1","ags-28-2","ags-28-3","ags-29-1","ags-29-2","ags-29-3","ags-30-1","ags-30-2","ags-30-3","ags-31-1","ags-31-2","ags-31-3","ags-32-1","ags-32-2","ags-32-3"]'::jsonb,
  updated_at = now()
WHERE id = 'default'
  AND jsonb_array_length(scenario_ids) <= 8;
