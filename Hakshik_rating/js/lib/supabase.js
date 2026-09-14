import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // 익명 세션을 기기에 남겨둬야 다음에 PIN 없이 들어온다
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'hakshik.auth',
      },
    })
  : null;
