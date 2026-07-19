// Camada de acesso a dados do CRM sobre o Supabase.
// Faz o mapeamento entre as linhas do banco (snake_case: categoria, created_at, lead_nome)
// e os tipos usados pela UI (cat, createdAt, leadNome) para nao mexer no restante do App.
import { supabase } from "./supabaseClient";
import type {
  Database,
  FollowUp,
  Lead,
  LeadOrigin,
  StageId,
  Trade,
  TradeStatus,
  Vehicle,
  VehicleCategory,
  VehicleStatus
} from "./types";

// ---- Tipos das linhas no banco ----
type LeadRow = {
  id: string;
  nome: string;
  telefone: string | null;
  veiculo: string | null;
  origem: string | null;
  valor: number | null;
  stage: string | null;
  obs: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type VehicleRow = {
  id: string;
  marca: string;
  modelo: string;
  ano: string | null;
  categoria: string | null;
  km: string | null;
  cor: string | null;
  preco: number | null;
  status: string | null;
  foto: string | null;
  obs: string | null;
  created_at: string;
};

type TradeRow = {
  id: string;
  cliente: string;
  telefone: string | null;
  veiculo: string | null;
  ano: string | null;
  km: string | null;
  valor: number | null;
  status: string | null;
  obs: string | null;
  lead_id: string | null;
  created_at: string;
};

type FollowUpRow = {
  id: string;
  titulo: string;
  lead_nome: string | null;
  lead_id: string | null;
  data: string;
  done: boolean | null;
  created_at: string;
};

// ---- Row -> App ----
export const rowToLead = (row: LeadRow): Lead => ({
  id: row.id,
  nome: row.nome,
  telefone: row.telefone ?? "",
  origem: (row.origem ?? "site") as LeadOrigin,
  veiculo: row.veiculo ?? "",
  valor: Number(row.valor ?? 0),
  stage: (row.stage ?? "novo") as StageId,
  obs: row.obs ?? "",
  meta: row.meta,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const rowToVehicle = (row: VehicleRow): Vehicle => ({
  id: row.id,
  marca: row.marca,
  modelo: row.modelo,
  ano: row.ano ?? "",
  cat: (row.categoria ?? "Picape") as VehicleCategory,
  km: row.km ?? "",
  cor: row.cor ?? "",
  preco: Number(row.preco ?? 0),
  status: (row.status ?? "disp") as VehicleStatus,
  foto: row.foto ?? "",
  obs: row.obs ?? ""
});

export const rowToTrade = (row: TradeRow): Trade => ({
  id: row.id,
  cliente: row.cliente,
  telefone: row.telefone ?? "",
  veiculo: row.veiculo ?? "",
  ano: row.ano ?? "",
  km: row.km ?? "",
  valor: Number(row.valor ?? 0),
  status: (row.status ?? "avaliando") as TradeStatus,
  obs: row.obs ?? "",
  createdAt: row.created_at
});

export const rowToFollowUp = (row: FollowUpRow): FollowUp => ({
  id: row.id,
  titulo: row.titulo,
  leadNome: row.lead_nome ?? "",
  data: row.data,
  done: Boolean(row.done)
});

// ---- App draft -> Row (payload para insert/update) ----
type LeadDraft = Omit<Lead, "id" | "createdAt" | "updatedAt">;
type VehicleDraft = Omit<Vehicle, "id">;
type TradeDraft = Omit<Trade, "id" | "createdAt">;
type FollowUpDraft = Omit<FollowUp, "id" | "done"> & { done?: boolean };

const leadToRow = (draft: LeadDraft) => ({
  nome: draft.nome,
  telefone: draft.telefone,
  origem: draft.origem,
  veiculo: draft.veiculo,
  valor: draft.valor,
  stage: draft.stage,
  obs: draft.obs,
  meta: draft.meta ?? null
});

const vehicleToRow = (draft: VehicleDraft) => ({
  marca: draft.marca,
  modelo: draft.modelo,
  ano: draft.ano,
  categoria: draft.cat,
  km: draft.km,
  cor: draft.cor,
  preco: draft.preco,
  status: draft.status,
  foto: draft.foto,
  obs: draft.obs
});

const tradeToRow = (draft: TradeDraft) => ({
  cliente: draft.cliente,
  telefone: draft.telefone,
  veiculo: draft.veiculo,
  ano: draft.ano,
  km: draft.km,
  valor: draft.valor,
  status: draft.status,
  obs: draft.obs
});

const followUpToRow = (draft: FollowUpDraft) => ({
  titulo: draft.titulo,
  lead_nome: draft.leadNome,
  data: draft.data,
  ...(draft.done === undefined ? {} : { done: draft.done })
});

// ---- Leitura inicial ----
export const fetchDatabase = async (): Promise<Database> => {
  const [leads, veiculos, trocas, followups] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("veiculos").select("*").order("created_at", { ascending: false }),
    supabase.from("trocas").select("*").order("created_at", { ascending: false }),
    supabase.from("followups").select("*").order("data", { ascending: true })
  ]);
  if (leads.error) throw leads.error;
  if (veiculos.error) throw veiculos.error;
  if (trocas.error) throw trocas.error;
  if (followups.error) throw followups.error;
  return {
    leads: (leads.data as LeadRow[]).map(rowToLead),
    veiculos: (veiculos.data as VehicleRow[]).map(rowToVehicle),
    trocas: (trocas.data as TradeRow[]).map(rowToTrade),
    followups: (followups.data as FollowUpRow[]).map(rowToFollowUp)
  };
};

// ---- Leads ----
export const insertLead = async (draft: LeadDraft): Promise<Lead> => {
  const { data, error } = await supabase.from("leads").insert(leadToRow(draft)).select().single();
  if (error) throw error;
  return rowToLead(data as LeadRow);
};

export const updateLead = async (id: string, draft: Partial<LeadDraft>): Promise<Lead> => {
  const { data, error } = await supabase
    .from("leads")
    .update(leadToRow(draft as LeadDraft))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToLead(data as LeadRow);
};

export const updateLeadStage = async (id: string, stage: StageId): Promise<Lead> => {
  const { data, error } = await supabase.from("leads").update({ stage }).eq("id", id).select().single();
  if (error) throw error;
  return rowToLead(data as LeadRow);
};

export const deleteLead = async (id: string): Promise<void> => {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
};

// ---- Veiculos ----
export const insertVehicle = async (draft: VehicleDraft): Promise<Vehicle> => {
  const { data, error } = await supabase.from("veiculos").insert(vehicleToRow(draft)).select().single();
  if (error) throw error;
  return rowToVehicle(data as VehicleRow);
};

export const updateVehicle = async (id: string, draft: VehicleDraft): Promise<Vehicle> => {
  const { data, error } = await supabase
    .from("veiculos")
    .update(vehicleToRow(draft))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToVehicle(data as VehicleRow);
};

export const deleteVehicle = async (id: string): Promise<void> => {
  const { error } = await supabase.from("veiculos").delete().eq("id", id);
  if (error) throw error;
};

// ---- Trocas ----
export const insertTrade = async (draft: TradeDraft): Promise<Trade> => {
  const { data, error } = await supabase.from("trocas").insert(tradeToRow(draft)).select().single();
  if (error) throw error;
  return rowToTrade(data as TradeRow);
};

export const updateTrade = async (id: string, draft: TradeDraft): Promise<Trade> => {
  const { data, error } = await supabase
    .from("trocas")
    .update(tradeToRow(draft))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToTrade(data as TradeRow);
};

export const deleteTrade = async (id: string): Promise<void> => {
  const { error } = await supabase.from("trocas").delete().eq("id", id);
  if (error) throw error;
};

// ---- Follow-ups ----
export const insertFollowUp = async (draft: FollowUpDraft): Promise<FollowUp> => {
  const { data, error } = await supabase.from("followups").insert(followUpToRow(draft)).select().single();
  if (error) throw error;
  return rowToFollowUp(data as FollowUpRow);
};

export const updateFollowUp = async (id: string, draft: FollowUpDraft): Promise<FollowUp> => {
  const { data, error } = await supabase
    .from("followups")
    .update(followUpToRow(draft))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToFollowUp(data as FollowUpRow);
};

export const toggleFollowUpDone = async (id: string, done: boolean): Promise<FollowUp> => {
  const { data, error } = await supabase.from("followups").update({ done }).eq("id", id).select().single();
  if (error) throw error;
  return rowToFollowUp(data as FollowUpRow);
};

export const deleteFollowUp = async (id: string): Promise<void> => {
  const { error } = await supabase.from("followups").delete().eq("id", id);
  if (error) throw error;
};

// ---- Restauracao de backup JSON (upsert mantendo ids) ----
export const restoreDatabase = async (db: Database): Promise<void> => {
  if (db.leads.length) {
    const { error } = await supabase.from("leads").upsert(
      db.leads.map((lead) => ({ id: lead.id, ...leadToRow(lead), created_at: lead.createdAt, updated_at: lead.updatedAt }))
    );
    if (error) throw error;
  }
  if (db.veiculos.length) {
    const { error } = await supabase
      .from("veiculos")
      .upsert(db.veiculos.map((vehicle) => ({ id: vehicle.id, ...vehicleToRow(vehicle) })));
    if (error) throw error;
  }
  if (db.trocas.length) {
    const { error } = await supabase
      .from("trocas")
      .upsert(db.trocas.map((trade) => ({ id: trade.id, ...tradeToRow(trade), created_at: trade.createdAt })));
    if (error) throw error;
  }
  if (db.followups.length) {
    const { error } = await supabase
      .from("followups")
      .upsert(db.followups.map((followup) => ({ id: followup.id, ...followUpToRow({ ...followup }) })));
    if (error) throw error;
  }
};

// Reexporta os mapeadores usados no realtime.
export type { LeadRow, VehicleRow, TradeRow, FollowUpRow };
