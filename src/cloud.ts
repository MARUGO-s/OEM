import { createClient } from "@supabase/supabase-js";

// Public configuration. Authorization is enforced on the server, not by this key.
export const SUPABASE_URL = "https://hjhkccbktkscwtgzxjfq.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_TY46n8sbGaESoL7RAzoYbg_i-d8Cwqr";
export const isCloud =
  import.meta.env.PROD || import.meta.env.VITE_STORAGE_MODE === "supabase";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "kotonoha-oem-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
