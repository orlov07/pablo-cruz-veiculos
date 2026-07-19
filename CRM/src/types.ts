export type StageId = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido";
export type RouteId = "painel" | "leads" | "estoque" | "trocas" | "agenda";
export type VehicleCategory = "Picape" | "SUV" | "Sedan" | "Hatch";
export type VehicleStatus = "disp" | "res" | "vend";
export type TradeStatus = "avaliando" | "aprovado" | "recusado";
export type LeadOrigin = "site" | "whatsapp" | "indicacao" | "passagem";

export type Lead = {
  id: string;
  nome: string;
  telefone: string;
  origem: LeadOrigin;
  veiculo: string;
  valor: number;
  stage: StageId;
  obs: string;
  meta?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type Vehicle = {
  id: string;
  marca: string;
  modelo: string;
  ano: string;
  cat: VehicleCategory;
  km: string;
  cor: string;
  preco: number;
  status: VehicleStatus;
  foto: string;
  obs: string;
};

export type Trade = {
  id: string;
  cliente: string;
  telefone: string;
  veiculo: string;
  ano: string;
  km: string;
  valor: number;
  status: TradeStatus;
  obs: string;
  createdAt: string;
};

export type FollowUp = {
  id: string;
  titulo: string;
  leadNome: string;
  data: string;
  done: boolean;
};

export type Database = {
  leads: Lead[];
  veiculos: Vehicle[];
  trocas: Trade[];
  followups: FollowUp[];
};
