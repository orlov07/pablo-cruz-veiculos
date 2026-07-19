// Acesso ao Supabase pelo site publico (usa SOMENTE a anon key).
// Permissoes (RLS): pode LER estoque disponivel/reservado e INSERIR leads/trocas.
// Nunca le a base de leads.
import { supabase } from "./supabaseClient";

export type VehicleRow = {
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
};

// Estoque exibido no site: disponivel ou reservado, mais recentes primeiro.
export const fetchAvailableVehicles = async (): Promise<VehicleRow[]> => {
  const { data, error } = await supabase
    .from("veiculos")
    .select("id, marca, modelo, ano, categoria, km, cor, preco, status, foto")
    .in("status", ["disp", "res"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VehicleRow[];
};

export type NewLead = {
  nome: string;
  telefone: string;
  veiculo?: string;
  valor?: number;
  origem?: string;
  stage?: string;
  obs?: string;
  meta?: Record<string, unknown>;
};

// Insere um lead. Nao usa .select() de proposito: o anon nao pode LER leads (RLS).
export const createLead = async (lead: NewLead): Promise<void> => {
  const { error } = await supabase
    .from("leads")
    .insert({ origem: "site", stage: "novo", ...lead });
  if (error) throw error;
};

// Pedido de troca: cria a troca + um lead vinculado, via funcao no banco.
export const submitTrade = async (payload: {
  cliente: string;
  telefone: string;
  veiculo: string;
  ano: string;
  km: string;
}): Promise<void> => {
  const { error } = await supabase.rpc("submit_trade", {
    p_cliente: payload.cliente,
    p_telefone: payload.telefone,
    p_veiculo: payload.veiculo,
    p_ano: payload.ano,
    p_km: payload.km
  });
  if (error) throw error;
};
