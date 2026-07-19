import type { Database, LeadOrigin, StageId, VehicleCategory } from "./types";

export const WA_NUM = "5532998577357";
export const DB_KEY = "pcv_crm_v2";
export const today = new Date().toISOString().slice(0, 10);

export const stages: { id: StageId; label: string; color: string }[] = [
  { id: "novo", label: "Novo lead", color: "#f59e0b" },
  { id: "contato", label: "Contato feito", color: "#0ea5e9" },
  { id: "proposta", label: "Proposta", color: "#14b8a6" },
  { id: "negociacao", label: "Negociacao", color: "#f97316" },
  { id: "ganho", label: "Vendido", color: "#22c55e" },
  { id: "perdido", label: "Perdido", color: "#ef4444" }
];

export const origins: Record<LeadOrigin, { label: string; className: string }> = {
  site: { label: "Site", className: "tag-site" },
  whatsapp: { label: "WhatsApp", className: "tag-whatsapp" },
  indicacao: { label: "Indicacao", className: "tag-referral" },
  passagem: { label: "Passagem", className: "tag-walkin" }
};

export const categories: VehicleCategory[] = ["Picape", "SUV", "Sedan", "Hatch"];

export const createEmptyDatabase = (): Database => ({
  leads: [],
  veiculos: [],
  trocas: [],
  followups: []
});
