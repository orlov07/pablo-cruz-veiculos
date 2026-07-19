import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { WA_NUM, categories, createEmptyDatabase, origins, stages, today } from "./data";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  deleteFollowUp,
  deleteLead,
  deleteTrade,
  deleteVehicle,
  fetchDatabase,
  insertFollowUp,
  insertLead,
  insertTrade,
  insertVehicle,
  restoreDatabase,
  rowToFollowUp,
  rowToLead,
  rowToTrade,
  rowToVehicle,
  toggleFollowUpDone,
  updateFollowUp,
  updateLead,
  updateLeadStage,
  updateTrade,
  updateVehicle
} from "./supabaseData";
import type { FollowUpRow, LeadRow, TradeRow, VehicleRow } from "./supabaseData";
import type {
  Database,
  FollowUp,
  Lead,
  LeadOrigin,
  RouteId,
  StageId,
  Trade,
  TradeStatus,
  Vehicle,
  VehicleCategory,
  VehicleStatus
} from "./types";

type ModalState =
  | { type: "lead"; item?: Lead }
  | { type: "vehicle"; item?: Vehicle }
  | { type: "trade"; item?: Trade }
  | { type: "followup"; item?: FollowUp }
  | null;

const routeMeta: Record<RouteId, { title: string; subtitle: string }> = {
  painel: {
    title: "Painel",
    subtitle: "Visao geral com indicadores, follow-ups e funil de vendas."
  },
  leads: {
    title: "Leads",
    subtitle: "Arraste os cards entre as etapas e acompanhe o funil comercial."
  },
  estoque: {
    title: "Estoque",
    subtitle: "Cadastre, filtre e edite os veiculos da loja."
  },
  trocas: {
    title: "Trocas",
    subtitle: "Controle as avaliacoes de usados para negociacao."
  },
  agenda: {
    title: "Agenda",
    subtitle: "Retornos pendentes para nao perder nenhum cliente."
  }
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const waLink = (phone: string, message: string) => {
  let digits = phone.replace(/\D/g, "");
  if (!digits) digits = WA_NUM;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
const relativeDate = (dateText: string) => {
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const target = new Date(`${dateText}T00:00:00`);
  const diff = Math.round((target.getTime() - todayDate.getTime()) / 86400000);
  if (diff < 0) return { label: "Atrasado", className: "late" };
  if (diff === 0) return { label: "Hoje", className: "today" };
  if (diff === 1) return { label: "Amanha", className: "" };
  return { label: target.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }), className: "" };
};
export function CrmApp() {
  const [db, setDb] = useState<Database>(() => createEmptyDatabase());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const localLeadIds = useRef<Set<string>>(new Set());
  const [route, setRoute] = useState<RouteId>("painel");
  const [leadSearch, setLeadSearch] = useState("");
  const deferredLeadSearch = useDeferredValue(leadSearch);
  const [vehicleFilter, setVehicleFilter] = useState<"Todos" | VehicleCategory>("Todos");
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const [leadDraft, setLeadDraft] = useState({ nome: "", telefone: "", origem: "site" as LeadOrigin, veiculo: "", valor: 0, stage: "novo" as StageId, obs: "" });
  const [vehicleDraft, setVehicleDraft] = useState({ marca: "", modelo: "", ano: "", cat: "Picape" as VehicleCategory, km: "", cor: "", preco: 0, status: "disp" as VehicleStatus, foto: "", obs: "" });
  const [tradeDraft, setTradeDraft] = useState({ cliente: "", telefone: "", veiculo: "", ano: "", km: "", valor: 0, status: "avaliando" as TradeStatus, obs: "" });
  const [followupDraft, setFollowupDraft] = useState({ titulo: "", leadNome: "", data: today });
  const importRef = useRef<HTMLInputElement | null>(null);

  // Sessao de autenticacao (Supabase Auth).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Leitura inicial dos dados quando ha sessao.
  useEffect(() => {
    if (!session) {
      setDb(createEmptyDatabase());
      return;
    }
    let active = true;
    setLoadingData(true);
    fetchDatabase()
      .then((data) => {
        if (!active) return;
        data.leads.forEach((lead) => localLeadIds.current.add(lead.id));
        setDb(data);
      })
      .catch((error) => {
        console.error("[CRM] Falha ao carregar dados:", error);
        if (active) setToast("Erro ao carregar os dados.");
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  // Realtime: novos leads (do site) e mudancas em todas as tabelas.
  useEffect(() => {
    if (!session) return undefined;
    const channel = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as { id: string }).id;
          setDb((current) => ({ ...current, leads: current.leads.filter((lead) => lead.id !== removedId) }));
          return;
        }
        const lead = rowToLead(payload.new as LeadRow);
        const isKnown = localLeadIds.current.has(lead.id);
        localLeadIds.current.add(lead.id);
        setDb((current) => {
          const exists = current.leads.some((item) => item.id === lead.id);
          return exists
            ? { ...current, leads: current.leads.map((item) => (item.id === lead.id ? lead : item)) }
            : { ...current, leads: [lead, ...current.leads] };
        });
        if (payload.eventType === "INSERT" && !isKnown && lead.origem === "site") {
          setToast("Novo lead recebido do site 🚗");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "veiculos" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as { id: string }).id;
          setDb((current) => ({ ...current, veiculos: current.veiculos.filter((v) => v.id !== removedId) }));
          return;
        }
        const vehicle = rowToVehicle(payload.new as VehicleRow);
        setDb((current) => {
          const exists = current.veiculos.some((item) => item.id === vehicle.id);
          return exists
            ? { ...current, veiculos: current.veiculos.map((item) => (item.id === vehicle.id ? vehicle : item)) }
            : { ...current, veiculos: [vehicle, ...current.veiculos] };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trocas" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as { id: string }).id;
          setDb((current) => ({ ...current, trocas: current.trocas.filter((t) => t.id !== removedId) }));
          return;
        }
        const trade = rowToTrade(payload.new as TradeRow);
        setDb((current) => {
          const exists = current.trocas.some((item) => item.id === trade.id);
          return exists
            ? { ...current, trocas: current.trocas.map((item) => (item.id === trade.id ? trade : item)) }
            : { ...current, trocas: [trade, ...current.trocas] };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as { id: string }).id;
          setDb((current) => ({ ...current, followups: current.followups.filter((f) => f.id !== removedId) }));
          return;
        }
        const followup = rowToFollowUp(payload.new as FollowUpRow);
        setDb((current) => {
          const exists = current.followups.some((item) => item.id === followup.id);
          return exists
            ? { ...current, followups: current.followups.map((item) => (item.id === followup.id ? followup : item)) }
            : { ...current, followups: [...current.followups, followup] };
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setLoginError("Supabase nao configurado. Preencha o arquivo .env (veja INTEGRACAO.md).");
      return;
    }
    setLoginBusy(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword
    });
    setLoginBusy(false);
    if (error) {
      setLoginError("E-mail ou senha invalidos.");
      return;
    }
    setLoginPassword("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localLeadIds.current.clear();
    setToast("Sessao encerrada.");
  };

  const overdueCount = db.followups.filter((followup) => {
    const comparison = new Date(`${followup.data}T00:00:00`);
    const current = new Date();
    current.setHours(23, 59, 59, 999);
    return !followup.done && comparison <= current;
  }).length;

  const openLeadModal = (item?: Lead) => {
    setLeadDraft({ nome: item?.nome ?? "", telefone: item?.telefone ?? "", origem: item?.origem ?? "site", veiculo: item?.veiculo ?? "", valor: item?.valor ?? 0, stage: item?.stage ?? "novo", obs: item?.obs ?? "" });
    setModal({ type: "lead", item });
  };
  const openVehicleModal = (item?: Vehicle) => {
    setVehicleDraft({ marca: item?.marca ?? "", modelo: item?.modelo ?? "", ano: item?.ano ?? "", cat: item?.cat ?? "Picape", km: item?.km ?? "", cor: item?.cor ?? "", preco: item?.preco ?? 0, status: item?.status ?? "disp", foto: item?.foto ?? "", obs: item?.obs ?? "" });
    setModal({ type: "vehicle", item });
  };
  const openTradeModal = (item?: Trade) => {
    setTradeDraft({ cliente: item?.cliente ?? "", telefone: item?.telefone ?? "", veiculo: item?.veiculo ?? "", ano: item?.ano ?? "", km: item?.km ?? "", valor: item?.valor ?? 0, status: item?.status ?? "avaliando", obs: item?.obs ?? "" });
    setModal({ type: "trade", item });
  };
  const openFollowUpModal = (item?: FollowUp) => {
    setFollowupDraft({ titulo: item?.titulo ?? "", leadNome: item?.leadNome ?? "", data: item?.data ?? today });
    setModal({ type: "followup", item });
  };
  const closeModal = () => setModal(null);

  const saveLead = async () => {
    if (!leadDraft.nome.trim()) { setToast("Informe o nome do cliente."); return; }
    const payload = { ...leadDraft, nome: leadDraft.nome.trim(), meta: null };
    try {
      if (modal?.type === "lead" && modal.item) {
        const updated = await updateLead(modal.item.id, payload);
        setDb((current) => ({ ...current, leads: current.leads.map((lead) => lead.id === updated.id ? updated : lead) }));
        setToast("Lead atualizado.");
      } else {
        const created = await insertLead(payload);
        localLeadIds.current.add(created.id);
        setDb((current) => current.leads.some((lead) => lead.id === created.id) ? current : { ...current, leads: [created, ...current.leads] });
        setToast("Lead adicionado.");
      }
      closeModal();
    } catch (error) {
      console.error("[CRM] Falha ao salvar lead:", error);
      setToast("Erro ao salvar o lead.");
    }
  };
  const saveVehicle = async () => {
    if (!vehicleDraft.marca.trim() || !vehicleDraft.modelo.trim()) { setToast("Informe marca e modelo."); return; }
    const payload = { ...vehicleDraft, marca: vehicleDraft.marca.trim(), modelo: vehicleDraft.modelo.trim() };
    try {
      if (modal?.type === "vehicle" && modal.item) {
        const updated = await updateVehicle(modal.item.id, payload);
        setDb((current) => ({ ...current, veiculos: current.veiculos.map((vehicle) => vehicle.id === updated.id ? updated : vehicle) }));
        setToast("Veiculo atualizado.");
      } else {
        const created = await insertVehicle(payload);
        setDb((current) => current.veiculos.some((vehicle) => vehicle.id === created.id) ? current : { ...current, veiculos: [created, ...current.veiculos] });
        setToast("Veiculo cadastrado.");
      }
      closeModal();
    } catch (error) {
      console.error("[CRM] Falha ao salvar veiculo:", error);
      setToast("Erro ao salvar o veiculo.");
    }
  };
  const saveTrade = async () => {
    if (!tradeDraft.cliente.trim()) { setToast("Informe o cliente."); return; }
    const payload = { ...tradeDraft, cliente: tradeDraft.cliente.trim() };
    try {
      if (modal?.type === "trade" && modal.item) {
        const updated = await updateTrade(modal.item.id, payload);
        setDb((current) => ({ ...current, trocas: current.trocas.map((trade) => trade.id === updated.id ? updated : trade) }));
        setToast("Avaliacao atualizada.");
      } else {
        const created = await insertTrade(payload);
        setDb((current) => current.trocas.some((trade) => trade.id === created.id) ? current : { ...current, trocas: [created, ...current.trocas] });
        setToast("Avaliacao registrada.");
      }
      closeModal();
    } catch (error) {
      console.error("[CRM] Falha ao salvar troca:", error);
      setToast("Erro ao salvar a avaliacao.");
    }
  };
  const saveFollowup = async () => {
    if (!followupDraft.titulo.trim()) { setToast("Descreva a tarefa."); return; }
    const payload = { ...followupDraft, titulo: followupDraft.titulo.trim() };
    try {
      if (modal?.type === "followup" && modal.item) {
        const updated = await updateFollowUp(modal.item.id, { ...payload, done: modal.item.done });
        setDb((current) => ({ ...current, followups: current.followups.map((followup) => followup.id === updated.id ? updated : followup) }));
        setToast("Tarefa atualizada.");
      } else {
        const created = await insertFollowUp({ ...payload, done: false });
        setDb((current) => current.followups.some((followup) => followup.id === created.id) ? current : { ...current, followups: [...current.followups, created] });
        setToast("Tarefa criada.");
      }
      closeModal();
    } catch (error) {
      console.error("[CRM] Falha ao salvar tarefa:", error);
      setToast("Erro ao salvar a tarefa.");
    }
  };

  const deleteCurrentModalItem = async () => {
    if (!modal?.item) return;
    const target = modal;
    try {
      if (target.type === "lead" && target.item) { await deleteLead(target.item.id); setDb((current) => ({ ...current, leads: current.leads.filter((lead) => lead.id !== target.item?.id) })); }
      else if (target.type === "vehicle" && target.item) { await deleteVehicle(target.item.id); setDb((current) => ({ ...current, veiculos: current.veiculos.filter((vehicle) => vehicle.id !== target.item?.id) })); }
      else if (target.type === "trade" && target.item) { await deleteTrade(target.item.id); setDb((current) => ({ ...current, trocas: current.trocas.filter((trade) => trade.id !== target.item?.id) })); }
      else if (target.type === "followup" && target.item) { await deleteFollowUp(target.item.id); setDb((current) => ({ ...current, followups: current.followups.filter((followup) => followup.id !== target.item?.id) })); }
      setToast("Registro excluido.");
      closeModal();
    } catch (error) {
      console.error("[CRM] Falha ao excluir registro:", error);
      setToast("Erro ao excluir o registro.");
    }
  };

  const moveLeadStage = async (leadId: string, stage: StageId, stageLabel: string) => {
    const previous = db.leads.find((lead) => lead.id === leadId);
    setDb((current) => ({ ...current, leads: current.leads.map((lead) => lead.id === leadId ? { ...lead, stage } : lead) }));
    try {
      await updateLeadStage(leadId, stage);
      setToast(`Lead movido para ${stageLabel}.`);
    } catch (error) {
      console.error("[CRM] Falha ao mover lead:", error);
      if (previous) setDb((current) => ({ ...current, leads: current.leads.map((lead) => lead.id === leadId ? previous : lead) }));
      setToast("Erro ao mover o lead.");
    }
  };

  const toggleFollowup = async (followup: FollowUp) => {
    const next = !followup.done;
    setDb((current) => ({ ...current, followups: current.followups.map((item) => item.id === followup.id ? { ...item, done: next } : item) }));
    try {
      await toggleFollowUpDone(followup.id, next);
    } catch (error) {
      console.error("[CRM] Falha ao atualizar tarefa:", error);
      setDb((current) => ({ ...current, followups: current.followups.map((item) => item.id === followup.id ? { ...item, done: followup.done } : item) }));
      setToast("Erro ao atualizar a tarefa.");
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `crm-pablo-cruz-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setToast("Backup baixado.");
  };

  const importData = async (file: File) => {
    let parsed: Partial<Database>;
    try {
      parsed = JSON.parse(await file.text()) as Partial<Database>;
      if (!parsed.leads || !parsed.veiculos) throw new Error("invalid");
    } catch {
      setToast("Arquivo invalido.");
      return;
    }
    const restored: Database = {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      veiculos: Array.isArray(parsed.veiculos) ? parsed.veiculos : [],
      trocas: Array.isArray(parsed.trocas) ? parsed.trocas : [],
      followups: Array.isArray(parsed.followups) ? parsed.followups : []
    };
    try {
      await restoreDatabase(restored);
      const fresh = await fetchDatabase();
      fresh.leads.forEach((lead) => localLeadIds.current.add(lead.id));
      setDb(fresh);
      setToast("Backup restaurado.");
    } catch (error) {
      console.error("[CRM] Falha ao restaurar backup:", error);
      setToast("Erro ao restaurar o backup.");
    }
  };

  const routeAction = () => {
    if (route === "leads") return <button className="crm-btn crm-btn-accent" onClick={() => openLeadModal()} type="button">Novo lead</button>;
    if (route === "estoque") return <button className="crm-btn crm-btn-accent" onClick={() => openVehicleModal()} type="button">Novo veiculo</button>;
    if (route === "trocas") return <button className="crm-btn crm-btn-accent" onClick={() => openTradeModal()} type="button">Nova troca</button>;
    if (route === "agenda") return <button className="crm-btn crm-btn-accent" onClick={() => openFollowUpModal()} type="button">Nova tarefa</button>;
    return <button className="crm-btn crm-btn-accent" onClick={() => openLeadModal()} type="button">Novo lead</button>;
  };

  const activeLeads = db.leads.filter((lead) => lead.stage !== "ganho" && lead.stage !== "perdido");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const newThisMonth = db.leads.filter((lead) => new Date(lead.createdAt).getTime() >= monthStart).length;
  const wonLeads = db.leads.filter((lead) => lead.stage === "ganho");
  const lostLeads = db.leads.filter((lead) => lead.stage === "perdido");
  const wonValueMonth = wonLeads.filter((lead) => new Date(lead.updatedAt).getTime() >= monthStart).reduce((total, lead) => total + lead.valor, 0);
  const closed = wonLeads.length + lostLeads.length;
  const conversionRate = closed ? Math.round((wonLeads.length / closed) * 100) : 0;
  const filteredLeads = db.leads.filter((lead) => {
    const query = deferredLeadSearch.trim().toLowerCase();
    if (!query) return true;
    return lead.nome.toLowerCase().includes(query) || lead.veiculo.toLowerCase().includes(query);
  });
  const filteredVehicles = db.veiculos.filter((vehicle) => vehicleFilter === "Todos" || vehicle.cat === vehicleFilter);
  const sortedFollowups = [...db.followups].sort((left, right) => Number(left.done) - Number(right.done) || left.data.localeCompare(right.data));

  if (!authReady) {
    return (
      <div className="crm-auth">
        <div className="crm-auth-card"><p className="crm-auth-loading">Carregando...</p></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="crm-auth">
        <form className="crm-auth-card" onSubmit={handleLogin}>
          <div className="crm-brand crm-auth-brand">
            <div className="crm-brand-mark">PC</div>
            <div><strong>Pablo Cruz</strong><span>CRM Veiculos</span></div>
          </div>
          <h1>Acesso restrito</h1>
          <p className="crm-auth-sub">Entre com o e-mail e a senha da equipe.</p>
          <label><span>E-mail</span><input autoComplete="username" onChange={(event) => setLoginEmail(event.target.value)} type="email" value={loginEmail} /></label>
          <label><span>Senha</span><input autoComplete="current-password" onChange={(event) => setLoginPassword(event.target.value)} type="password" value={loginPassword} /></label>
          {loginError ? <p className="crm-auth-error">{loginError}</p> : null}
          <button className="crm-btn crm-btn-accent" disabled={loginBusy} type="submit">{loginBusy ? "Entrando..." : "Entrar"}</button>
          {!isSupabaseConfigured ? <p className="crm-auth-warn">Supabase nao configurado. Veja INTEGRACAO.md.</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <div className="crm-brand-mark">PC</div>
          <div><strong>Pablo Cruz</strong><span>CRM Veiculos</span></div>
        </div>
        <nav className="crm-nav">
          {(["painel", "leads", "estoque", "trocas", "agenda"] as RouteId[]).map((item) => (
            <button className={route === item ? "is-active" : ""} key={item} onClick={() => startTransition(() => setRoute(item))} type="button">
              <span>{routeMeta[item].title}</span>
              {item === "agenda" && overdueCount > 0 ? <small>{overdueCount}</small> : null}
            </button>
          ))}
        </nav>
        <div className="crm-side-actions">
          <button className="crm-btn crm-btn-ghost" onClick={exportData} type="button">Backup dos dados</button>
          <button className="crm-btn crm-btn-ghost" onClick={() => importRef.current?.click()} type="button">Restaurar backup</button>
          <a className="crm-btn crm-btn-link" href="/SITE/index.html">Abrir site</a>
          <button className="crm-btn crm-btn-ghost" onClick={() => void handleLogout()} type="button">Sair</button>
        </div>
      </aside>

      <main className="crm-main">
        <header className="crm-topbar">
          <div><h1>{routeMeta[route].title}</h1><p>{routeMeta[route].subtitle}</p></div>
          <div className="crm-topbar-actions">{loadingData ? <span className="crm-sync-pill">Sincronizando...</span> : null}{routeAction()}</div>
        </header>

        <section className="crm-content">
          {route === "painel" ? (
            <>
              <div className="kpi-grid">
                <article className="kpi-card"><span>Leads ativos</span><strong>{activeLeads.length}</strong><small>+{newThisMonth} novos no mes</small></article>
                <article className="kpi-card"><span>Conversao</span><strong>{conversionRate}%</strong><small>{wonLeads.length} ganhos · {lostLeads.length} perdidos</small></article>
                <article className="kpi-card"><span>Negocios em aberto</span><strong>{brl(activeLeads.reduce((sum, lead) => sum + lead.valor, 0))}</strong><small>valor total em negociacao</small></article>
                <article className="kpi-card"><span>Vendido no mes</span><strong>{brl(wonValueMonth)}</strong><small>{db.veiculos.filter((vehicle) => vehicle.status === "disp").length} no estoque</small></article>
              </div>
              <div className="panel-grid">
                <section className="panel">
                  <div className="panel-header"><h2>Funil de vendas</h2><span>{brl(wonValueMonth)} vendidos no mes</span></div>
                  <div className="funnel-list">
                    {stages.map((stage) => {
                      const count = db.leads.filter((lead) => lead.stage === stage.id).length;
                      const maxCount = Math.max(1, ...stages.map((item) => db.leads.filter((lead) => lead.stage === item.id).length));
                      return (
                        <div className="funnel-row" key={stage.id}>
                          <strong>{stage.label}</strong>
                          <div className="funnel-bar"><div className="funnel-fill" style={{ width: `${(count / maxCount) * 100}%`, background: stage.color }} /></div>
                          <span>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header"><h2>Proximos follow-ups</h2><button className="crm-btn crm-btn-ghost" onClick={() => setRoute("agenda")} type="button">Ver tudo</button></div>
                  <div className="agenda-list">
                    {sortedFollowups.filter((item) => !item.done).slice(0, 5).map((followup) => {
                      const status = relativeDate(followup.data);
                      return (
                        <button className="agenda-item" key={followup.id} onClick={() => openFollowUpModal(followup)} type="button">
                          <div><strong>{followup.titulo}</strong><span>{followup.leadNome || "Sem cliente vinculado"}</span></div>
                          <small className={status.className}>{status.label}</small>
                        </button>
                      );
                    })}
                    {!sortedFollowups.filter((item) => !item.done).length ? <p className="empty-note">Nenhuma tarefa pendente.</p> : null}
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {route === "leads" ? (
            <>
              <div className="toolbar"><input onChange={(event) => startTransition(() => setLeadSearch(event.target.value))} placeholder="Buscar por cliente ou veiculo..." value={leadSearch} /></div>
              <div className="kanban-grid">
                {stages.map((stage) => {
                  const items = filteredLeads.filter((lead) => lead.stage === stage.id);
                  return (
                    <section className="kanban-column" key={stage.id}>
                      <header><div className="stage-head"><span className="stage-dot" style={{ background: stage.color }} /><strong>{stage.label}</strong></div><small>{items.length}</small></header>
                      <div className="kanban-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={() => {
                        if (!dragLeadId) return;
                        const movingId = dragLeadId;
                        setDragLeadId(null);
                        void moveLeadStage(movingId, stage.id, stage.label);
                      }}>
                        {items.map((lead) => {
                          const origin = origins[lead.origem];
                          return (
                            <article className="lead-card" draggable key={lead.id} onClick={() => openLeadModal(lead)} onDragEnd={() => setDragLeadId(null)} onDragStart={() => setDragLeadId(lead.id)}>
                              <strong>{lead.nome}</strong>
                              <p>{lead.veiculo || "Sem veiculo definido"}</p>
                              <div className="lead-card-footer">
                                <span>{lead.valor ? brl(lead.valor) : "Sem valor"}</span>
                                <div className="lead-actions">
                                  <small className={origin.className}>{origin.label}</small>
                                  <a href={waLink(lead.telefone, `Ola ${lead.nome.split(" ")[0]}! Aqui e da Pablo Cruz Veiculos sobre o ${lead.veiculo || "veiculo"} do seu interesse.`)} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">WhatsApp</a>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                        {!items.length ? <div className="empty-state">Sem leads aqui.</div> : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          ) : null}

          {route === "estoque" ? (
            <>
              <div className="toolbar chips">
                {(["Todos", ...categories] as const).map((category) => (
                  <button className={vehicleFilter === category ? "is-active" : ""} key={category} onClick={() => setVehicleFilter(category)} type="button">{category}</button>
                ))}
              </div>
              <div className="vehicle-grid">
                {filteredVehicles.map((vehicle) => (
                  <article className="vehicle-card" key={vehicle.id}>
                    <div className="vehicle-visual" style={vehicle.foto ? { backgroundImage: `url(${vehicle.foto})` } : undefined}>
                      <span className={`status-pill status-${vehicle.status}`}>{vehicle.status}</span>
                      <small>{vehicle.cat}</small>
                    </div>
                    <div className="vehicle-body">
                      <strong>{vehicle.marca} {vehicle.modelo}</strong>
                      <p>{vehicle.ano} · {vehicle.km || "KM nao informado"} · {vehicle.cor || "Cor nao informada"}</p>
                      <h3>{brl(vehicle.preco)}</h3>
                      <div className="vehicle-actions">
                        <button className="crm-btn crm-btn-ghost" onClick={() => openVehicleModal(vehicle)} type="button">Editar</button>
                        <a className="crm-btn crm-btn-success" href={waLink("", `Ola! Tenho interesse no ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}. Ainda esta disponivel?`)} target="_blank" rel="noreferrer">Divulgar</a>
                      </div>
                    </div>
                  </article>
                ))}
                {!filteredVehicles.length ? <div className="empty-state wide">Nenhum veiculo cadastrado nesse filtro.</div> : null}
              </div>
            </>
          ) : null}

          {route === "trocas" ? (
            <div className="table-card">
              <div className="table-head"><strong>{db.trocas.length} avaliacoes registradas</strong></div>
              <div className="table-list">
                {db.trocas.map((trade) => (
                  <button className="table-row" key={trade.id} onClick={() => openTradeModal(trade)} type="button">
                    <div><strong>{trade.cliente}</strong><span>{trade.telefone || "Sem telefone"}</span></div>
                    <div><strong>{trade.veiculo || "Veiculo nao informado"}</strong><span>{trade.ano || "Ano?"} · {trade.km || "KM?"}</span></div>
                    <div><strong>{brl(trade.valor)}</strong><span className={`pill-${trade.status}`}>{trade.status}</span></div>
                  </button>
                ))}
                {!db.trocas.length ? <div className="empty-state wide">Nenhuma avaliacao cadastrada.</div> : null}
              </div>
            </div>
          ) : null}

          {route === "agenda" ? (
            <div className="agenda-board">
              {sortedFollowups.map((followup) => {
                const status = relativeDate(followup.data);
                return (
                  <article className={`agenda-card${followup.done ? " is-done" : ""}`} key={followup.id}>
                    <button className={`check${followup.done ? " is-on" : ""}`} onClick={() => void toggleFollowup(followup)} type="button" />
                    <div className="agenda-body" onClick={() => openFollowUpModal(followup)} role="button" tabIndex={0}>
                      <strong>{followup.titulo}</strong><span>{followup.leadNome || "Sem cliente vinculado"}</span>
                    </div>
                    <small className={status.className}>{status.label}</small>
                  </article>
                );
              })}
              {!sortedFollowups.length ? <div className="empty-state wide">Agenda vazia.</div> : null}
            </div>
          ) : null}
        </section>
      </main>

      {modal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{modal.type === "lead" ? (modal.item ? "Editar lead" : "Novo lead") : modal.type === "vehicle" ? (modal.item ? "Editar veiculo" : "Novo veiculo") : modal.type === "trade" ? (modal.item ? "Editar troca" : "Nova troca") : modal.item ? "Editar tarefa" : "Nova tarefa"}</h2>
              <button className="crm-btn crm-btn-ghost" onClick={closeModal} type="button">Fechar</button>
            </div>
            <div className="modal-body">
              {modal.type === "lead" ? (
                <>
                  <label><span>Nome do cliente</span><input onChange={(event) => setLeadDraft((current) => ({ ...current, nome: event.target.value }))} value={leadDraft.nome} /></label>
                  <div className="form-grid">
                    <label><span>Telefone</span><input onChange={(event) => setLeadDraft((current) => ({ ...current, telefone: event.target.value }))} value={leadDraft.telefone} /></label>
                    <label><span>Origem</span><select onChange={(event) => setLeadDraft((current) => ({ ...current, origem: event.target.value as LeadOrigin }))} value={leadDraft.origem}>{Object.entries(origins).map(([key, origin]) => <option key={key} value={key}>{origin.label}</option>)}</select></label>
                  </div>
                  <label><span>Veiculo de interesse</span><input onChange={(event) => setLeadDraft((current) => ({ ...current, veiculo: event.target.value }))} value={leadDraft.veiculo} /></label>
                  <div className="form-grid">
                    <label><span>Valor do negocio</span><input min={0} onChange={(event) => setLeadDraft((current) => ({ ...current, valor: Number(event.target.value) || 0 }))} type="number" value={leadDraft.valor} /></label>
                    <label><span>Etapa</span><select onChange={(event) => setLeadDraft((current) => ({ ...current, stage: event.target.value as StageId }))} value={leadDraft.stage}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                  </div>
                  <label><span>Observacoes</span><textarea onChange={(event) => setLeadDraft((current) => ({ ...current, obs: event.target.value }))} rows={4} value={leadDraft.obs} /></label>
                </>
              ) : null}
              {modal.type === "vehicle" ? (
                <>
                  <div className="form-grid">
                    <label><span>Marca</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, marca: event.target.value }))} value={vehicleDraft.marca} /></label>
                    <label><span>Modelo</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, modelo: event.target.value }))} value={vehicleDraft.modelo} /></label>
                  </div>
                  <div className="form-grid">
                    <label><span>Ano</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, ano: event.target.value }))} value={vehicleDraft.ano} /></label>
                    <label><span>Categoria</span><select onChange={(event) => setVehicleDraft((current) => ({ ...current, cat: event.target.value as VehicleCategory }))} value={vehicleDraft.cat}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                  </div>
                  <div className="form-grid">
                    <label><span>KM</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, km: event.target.value }))} value={vehicleDraft.km} /></label>
                    <label><span>Cor</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, cor: event.target.value }))} value={vehicleDraft.cor} /></label>
                  </div>
                  <div className="form-grid">
                    <label><span>Preco</span><input min={0} onChange={(event) => setVehicleDraft((current) => ({ ...current, preco: Number(event.target.value) || 0 }))} type="number" value={vehicleDraft.preco} /></label>
                    <label><span>Status</span><select onChange={(event) => setVehicleDraft((current) => ({ ...current, status: event.target.value as VehicleStatus }))} value={vehicleDraft.status}><option value="disp">Disponivel</option><option value="res">Reservado</option><option value="vend">Vendido</option></select></label>
                  </div>
                  <label><span>Foto por URL</span><input onChange={(event) => setVehicleDraft((current) => ({ ...current, foto: event.target.value }))} value={vehicleDraft.foto} /></label>
                  <label><span>Observacoes</span><textarea onChange={(event) => setVehicleDraft((current) => ({ ...current, obs: event.target.value }))} rows={4} value={vehicleDraft.obs} /></label>
                </>
              ) : null}
              {modal.type === "trade" ? (
                <>
                  <div className="form-grid">
                    <label><span>Cliente</span><input onChange={(event) => setTradeDraft((current) => ({ ...current, cliente: event.target.value }))} value={tradeDraft.cliente} /></label>
                    <label><span>Telefone</span><input onChange={(event) => setTradeDraft((current) => ({ ...current, telefone: event.target.value }))} value={tradeDraft.telefone} /></label>
                  </div>
                  <label><span>Veiculo na troca</span><input onChange={(event) => setTradeDraft((current) => ({ ...current, veiculo: event.target.value }))} value={tradeDraft.veiculo} /></label>
                  <div className="form-grid">
                    <label><span>Ano</span><input onChange={(event) => setTradeDraft((current) => ({ ...current, ano: event.target.value }))} value={tradeDraft.ano} /></label>
                    <label><span>KM</span><input onChange={(event) => setTradeDraft((current) => ({ ...current, km: event.target.value }))} value={tradeDraft.km} /></label>
                  </div>
                  <div className="form-grid">
                    <label><span>Valor avaliado</span><input min={0} onChange={(event) => setTradeDraft((current) => ({ ...current, valor: Number(event.target.value) || 0 }))} type="number" value={tradeDraft.valor} /></label>
                    <label><span>Status</span><select onChange={(event) => setTradeDraft((current) => ({ ...current, status: event.target.value as TradeStatus }))} value={tradeDraft.status}><option value="avaliando">Avaliando</option><option value="aprovado">Aprovado</option><option value="recusado">Recusado</option></select></label>
                  </div>
                  <label><span>Observacoes</span><textarea onChange={(event) => setTradeDraft((current) => ({ ...current, obs: event.target.value }))} rows={4} value={tradeDraft.obs} /></label>
                </>
              ) : null}
              {modal.type === "followup" ? (
                <>
                  <label><span>Tarefa</span><input onChange={(event) => setFollowupDraft((current) => ({ ...current, titulo: event.target.value }))} value={followupDraft.titulo} /></label>
                  <div className="form-grid">
                    <label><span>Cliente</span><input onChange={(event) => setFollowupDraft((current) => ({ ...current, leadNome: event.target.value }))} value={followupDraft.leadNome} /></label>
                    <label><span>Data</span><input onChange={(event) => setFollowupDraft((current) => ({ ...current, data: event.target.value }))} type="date" value={followupDraft.data} /></label>
                  </div>
                </>
              ) : null}
            </div>
            <div className="modal-actions">
              {modal.item ? <button className="crm-btn crm-btn-danger" onClick={deleteCurrentModalItem} type="button">Excluir</button> : <span />}
              <div className="modal-actions-right">
                <button className="crm-btn crm-btn-ghost" onClick={closeModal} type="button">Cancelar</button>
                <button className="crm-btn crm-btn-accent" onClick={modal.type === "lead" ? saveLead : modal.type === "vehicle" ? saveVehicle : modal.type === "trade" ? saveTrade : saveFollowup} type="button">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
      <input accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ""; }} ref={importRef} type="file" />
    </div>
  );
}
