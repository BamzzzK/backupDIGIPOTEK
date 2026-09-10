import { createClient } from '@supabase/supabase-js';
// Publishable key is intentionally public. Authorization is enforced by database RLS.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://zdrxokjfukumkledmrzh.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iVSfhb46DaIXrbojA3cEBg_M_TMCAMS';
export const supabase = createClient(url, key);
