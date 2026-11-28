const DEFAULT_SUPABASE_URL = "https://unaeywdkcsoezhigeueh.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_U854OMBG15bD1j6zmYYHFw_O_2M9j7b";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
