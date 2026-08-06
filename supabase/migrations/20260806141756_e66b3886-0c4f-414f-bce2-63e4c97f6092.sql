CREATE POLICY "own backups read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own backups insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own backups update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'backups' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own backups delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND (storage.foldername(name))[1] = auth.uid()::text);