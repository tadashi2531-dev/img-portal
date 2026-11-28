import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase.ts";

export type CompanySettings = {
  companyName: string;
  trade: string;
  address: string;
  phone: string;
  email: string;
  emails: string[];
};

const empty: CompanySettings = { companyName: "", trade: "", address: "", phone: "", email: "", emails: [] };

export function primaryEmail(settings: Pick<CompanySettings, "email" | "emails">): string {
  return settings.emails.find((item) => item.trim())?.trim() || settings.email.trim();
}

const CompanyContext = createContext<{ settings: CompanySettings; reload: () => Promise<void> }>({
  settings: empty,
  reload: async () => undefined,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(empty);

  async function reload() {
    const { data, error } = await supabase
      .from("company_settings")
      .select("company_name, trade, address, phone, email, emails")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return;
    const row = data as {
      company_name: string;
      trade: string;
      address: string;
      phone: string;
      email: string;
      emails: string[] | null;
    };
    const emails = (Array.isArray(row.emails) ? row.emails : [])
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item !== "");
    const list = emails.length > 0 ? emails : row.email?.trim() ? [row.email.trim()] : [];
    setSettings({
      companyName: row.company_name ?? "",
      trade: row.trade ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: list[0] ?? "",
      emails: list,
    });
  }

  useEffect(() => {
    void reload();
  }, []);

  const value = useMemo(() => ({ settings, reload }), [settings]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  return useContext(CompanyContext);
}
