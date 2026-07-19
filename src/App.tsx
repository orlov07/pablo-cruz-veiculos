import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { siteImages } from "./assets";
import { isSupabaseConfigured } from "./supabaseClient";
import { createLead, fetchAvailableVehicles, submitTrade } from "./supabaseData";
import type { VehicleRow } from "./supabaseData";

type Category = "todos" | "picape" | "suv" | "sedan" | "hatch";

type Car = {
  id: string;
  nome: string;
  img: string;
  categoria: Exclude<Category, "todos">;
  categoriaLabel: string;
  detalhes: string;
  preco: number;
  badge: string;
  badgeRed?: boolean;
  tags: string[];
};

type Feedback = { type: "idle" | "sending" | "success" | "error"; msg?: string };

const whatsappNumber = "5532998577357";
const whatsappHuman = "(32) 99857-7357";
const financingRate = 0.019;

// Estoque de exemplo — usado como fallback enquanto o Supabase nao esta
// configurado ou nao ha veiculos cadastrados no CRM.
const fallbackCars: Car[] = [
  {
    id: "toro-ranch",
    nome: "Fiat Toro Ranch 4x4 Diesel",
    img: siteImages.toroRanch,
    categoria: "picape",
    categoriaLabel: "Picape",
    detalhes: "78.000 km · Diesel",
    preco: 129000,
    badge: "Top de linha",
    tags: ["Tracao 4x4", "Cambio automatico", "Couro Terra Cota", "Ar dual zone"]
  },
  {
    id: "jetta-gli",
    nome: "VW Jetta GLI 350 TSI",
    img: siteImages.jettaGli,
    categoria: "sedan",
    categoriaLabel: "Sedan",
    detalhes: "2020/2020 · 2.0 TSI automatico",
    preco: 149990,
    badge: "O mais novo",
    tags: ["Teto panoramico", "2.0 TSI", "Interior premium", "Tecnologia"]
  },
  {
    id: "toro-opening",
    nome: "Fiat Toro Opening Edition",
    img: siteImages.toroOpening,
    categoria: "picape",
    categoriaLabel: "Picape",
    detalhes: "2017 · 1.8 Flex automatico",
    preco: 80990,
    badge: "Unico dono",
    tags: ["Versatil", "Conservacao excelente", "Pronta para rodar", "Completa"]
  },
  {
    id: "duster",
    nome: "Renault Duster 1.6",
    img: siteImages.duster,
    categoria: "suv",
    categoriaLabel: "SUV",
    detalhes: "2019 · 1.6 Flex",
    preco: 64990,
    badge: "Novo demais",
    tags: ["SUV espacosa", "Bluetooth", "Rodas de liga", "Porta-malas amplo"]
  },
  {
    id: "onix",
    nome: "Chevrolet Onix 1.4",
    img: siteImages.onix,
    categoria: "hatch",
    categoriaLabel: "Hatch",
    detalhes: "2015/2015 · automatico",
    preco: 52500,
    badge: "Completo",
    tags: ["Cambio automatico", "Camera de re", "Direcao eletrica", "Multimidia"]
  },
  {
    id: "mobi",
    nome: "Fiat Mobi Like",
    img: siteImages.mobi,
    categoria: "hatch",
    categoriaLabel: "Hatch",
    detalhes: "2022 · 22.000 km",
    preco: 50999,
    badge: "IPVA pago",
    tags: ["Unico dono", "Economico", "Baixa manutencao", "Revisoes em dia"]
  },
  {
    id: "linea",
    nome: "Fiat Linea 1.8 Essence",
    img: siteImages.linea,
    categoria: "sedan",
    categoriaLabel: "Sedan",
    detalhes: "2015 · 1.8 Flex",
    preco: 29900,
    badge: "Abaixo da FIPE",
    badgeRed: true,
    tags: ["Financia 100%", "Ideal app", "Familia grande", "Direcao hidraulica"]
  },
  {
    id: "palio",
    nome: "Fiat Palio",
    img: siteImages.palio,
    categoria: "hatch",
    categoriaLabel: "Hatch",
    detalhes: "2016 · baixa quilometragem",
    preco: 28900,
    badge: "Abaixo da FIPE",
    badgeRed: true,
    tags: ["Baixa KM", "Muito conservado", "Economico", "Documentacao em dia"]
  }
];

const categoryMap: Record<string, Exclude<Category, "todos">> = {
  Picape: "picape",
  SUV: "suv",
  Sedan: "sedan",
  Hatch: "hatch"
};

const vehicleToCar = (vehicle: VehicleRow): Car => {
  const label = vehicle.categoria ?? "";
  const detalhes = [vehicle.ano, vehicle.km, vehicle.cor].filter(Boolean).join(" · ");
  const tags = [vehicle.cor, vehicle.km, vehicle.ano].filter((tag): tag is string => Boolean(tag));
  return {
    id: vehicle.id,
    nome: `${vehicle.marca} ${vehicle.modelo}`.trim(),
    img: vehicle.foto || siteImages.toroRanch,
    categoria: categoryMap[label] ?? "hatch",
    categoriaLabel: label || "Veiculo",
    detalhes: detalhes || "Consulte os detalhes",
    preco: Number(vehicle.preco ?? 0),
    badge: vehicle.status === "res" ? "Reservado" : "Disponivel",
    badgeRed: vehicle.status === "res",
    tags: tags.slice(0, 4)
  };
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });

const whatsappLink = (message: string) =>
  `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

const isValidName = (value: string) => value.trim().length >= 2;
const isValidPhone = (value: string) => value.replace(/\D/g, "").length >= 8;

const filterOptions: { value: Category; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "picape", label: "Picapes" },
  { value: "suv", label: "SUV" },
  { value: "sedan", label: "Sedan" },
  { value: "hatch", label: "Hatch" }
];

export function SiteApp() {
  const [cars, setCars] = useState<Car[]>(fallbackCars);
  const [activeFilter, setActiveFilter] = useState<Category>("todos");
  const [selectedCarId, setSelectedCarId] = useState(fallbackCars[0]?.id ?? "");
  const [entryPercent, setEntryPercent] = useState(20);
  const [installments, setInstallments] = useState(48);
  const [isNavSolid, setIsNavSolid] = useState(false);

  // Formularios
  const [contact, setContact] = useState({ nome: "", telefone: "", mensagem: "" });
  const [contactFb, setContactFb] = useState<Feedback>({ type: "idle" });
  const [trade, setTrade] = useState({ cliente: "", telefone: "", veiculo: "", ano: "", km: "" });
  const [tradeFb, setTradeFb] = useState<Feedback>({ type: "idle" });
  const [finance, setFinance] = useState({ nome: "", telefone: "" });
  const [financeFb, setFinanceFb] = useState<Feedback>({ type: "idle" });
  const [interestCar, setInterestCar] = useState<Car | null>(null);
  const [interest, setInterest] = useState({ nome: "", telefone: "" });
  const [interestFb, setInterestFb] = useState<Feedback>({ type: "idle" });

  useEffect(() => {
    const onScroll = () => setIsNavSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Estoque dinamico: le do Supabase; mantem o fallback se nao houver dados.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    fetchAvailableVehicles()
      .then((rows) => {
        if (!active || rows.length === 0) return;
        const mapped = rows.map(vehicleToCar);
        setCars(mapped);
        setSelectedCarId((current) => (mapped.some((car) => car.id === current) ? current : mapped[0].id));
      })
      .catch((error) => {
        console.error("[Site] Falha ao carregar estoque do Supabase:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredCars = useMemo(
    () => cars.filter((car) => activeFilter === "todos" || car.categoria === activeFilter),
    [cars, activeFilter]
  );

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? cars[0];
  const entryValue = selectedCar ? selectedCar.preco * (entryPercent / 100) : 0;
  const financedValue = selectedCar ? selectedCar.preco - entryValue : 0;
  const installmentValue =
    financedValue > 0
      ? (financedValue * financingRate) / (1 - Math.pow(1 + financingRate, -installments))
      : 0;

  // Registra clique no WhatsApp (rastreio leve, nao bloqueia a abertura).
  const trackWhatsApp = (veiculo: string, valor = 0) => {
    if (!isSupabaseConfigured) return;
    void createLead({ nome: "Contato via WhatsApp", telefone: "", veiculo, valor, origem: "whatsapp" }).catch(
      (error) => console.error("[Site] Falha ao registrar clique de WhatsApp:", error)
    );
  };

  const submitContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidName(contact.nome) || !isValidPhone(contact.telefone)) {
      setContactFb({ type: "error", msg: "Informe nome e um telefone valido." });
      return;
    }
    setContactFb({ type: "sending" });
    try {
      await createLead({ nome: contact.nome.trim(), telefone: contact.telefone.trim(), obs: contact.mensagem.trim() });
      setContactFb({ type: "success", msg: "Recebemos seu contato! Em breve retornamos." });
      setContact({ nome: "", telefone: "", mensagem: "" });
    } catch (error) {
      console.error("[Site] Falha ao enviar contato:", error);
      setContactFb({ type: "error", msg: "Nao foi possivel enviar. Fale com a gente no WhatsApp." });
    }
  };

  const submitTradeForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidName(trade.cliente) || !isValidPhone(trade.telefone)) {
      setTradeFb({ type: "error", msg: "Informe nome e um telefone valido." });
      return;
    }
    setTradeFb({ type: "sending" });
    try {
      await submitTrade({
        cliente: trade.cliente.trim(),
        telefone: trade.telefone.trim(),
        veiculo: trade.veiculo.trim(),
        ano: trade.ano.trim(),
        km: trade.km.trim()
      });
      setTradeFb({ type: "success", msg: "Pedido de avaliacao enviado! Em breve retornamos." });
      setTrade({ cliente: "", telefone: "", veiculo: "", ano: "", km: "" });
    } catch (error) {
      console.error("[Site] Falha ao enviar troca:", error);
      setTradeFb({ type: "error", msg: "Nao foi possivel enviar. Fale com a gente no WhatsApp." });
    }
  };

  const submitFinance = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCar) return;
    if (!isValidName(finance.nome) || !isValidPhone(finance.telefone)) {
      setFinanceFb({ type: "error", msg: "Informe nome e um telefone valido para a analise." });
      return;
    }
    setFinanceFb({ type: "sending" });
    const message = `Ola Pablo! Simulei o ${selectedCar.nome} no site: entrada de ${formatCurrency(entryValue)} e ${installments}x de aproximadamente ${formatCurrency(installmentValue)}. Quero fazer a analise.`;
    try {
      await createLead({
        nome: finance.nome.trim(),
        telefone: finance.telefone.trim(),
        veiculo: selectedCar.nome,
        valor: selectedCar.preco,
        stage: "proposta",
        obs: "Simulacao de financiamento pelo site",
        meta: {
          entrada: Math.round(entryValue),
          entrada_percent: entryPercent,
          parcelas: installments,
          valor_parcela: Math.round(installmentValue)
        }
      });
      setFinanceFb({ type: "success", msg: "Simulacao enviada! Vamos te chamar para a analise." });
    } catch (error) {
      console.error("[Site] Falha ao enviar simulacao:", error);
      setFinanceFb({ type: "error", msg: "Enviaremos pelo WhatsApp. Abrindo a conversa..." });
    } finally {
      // Abre o WhatsApp como caminho imediato, mesmo se o insert falhar.
      window.open(whatsappLink(message), "_blank", "noopener");
    }
  };

  const openInterest = (car: Car) => {
    setInterestCar(car);
    setInterest({ nome: "", telefone: "" });
    setInterestFb({ type: "idle" });
  };

  const submitInterest = async (event: FormEvent) => {
    event.preventDefault();
    if (!interestCar) return;
    if (!isValidName(interest.nome) || !isValidPhone(interest.telefone)) {
      setInterestFb({ type: "error", msg: "Informe nome e um telefone valido." });
      return;
    }
    setInterestFb({ type: "sending" });
    try {
      await createLead({
        nome: interest.nome.trim(),
        telefone: interest.telefone.trim(),
        veiculo: interestCar.nome,
        valor: interestCar.preco
      });
      setInterestFb({ type: "success", msg: "Recebemos seu interesse! Em breve retornamos." });
    } catch (error) {
      console.error("[Site] Falha ao registrar interesse:", error);
      setInterestFb({ type: "error", msg: "Nao foi possivel enviar. Fale com a gente no WhatsApp." });
    }
  };

  return (
    <div className="site-shell">
      <nav className={`site-nav${isNavSolid ? " is-solid" : ""}`}>
        <div className="container nav-row">
          <a className="brand" href="#topo">
            <span>Pablo Cruz</span>
            <small>Compra, venda e financiamento</small>
          </a>
          <div className="nav-links">
            <a href="#estoque">Estoque</a>
            <a href="#financiamento">Financiamento</a>
            <a href="#troca">Troca</a>
            <a href="#contato">Contato</a>
          </div>
          <a
            className="btn btn-primary"
            href={whatsappLink("Ola Pablo! Vim pelo site e quero mais informacoes.")}
            target="_blank"
            rel="noreferrer"
          >
            Falar no WhatsApp
          </a>
        </div>
      </nav>

      <header className="hero" id="topo">
        <div className="hero-backdrop" />
        <div className="container hero-content">
          <span className="kicker">Quem conhece, indica</span>
          <h1>
            Seu proximo carro <em>esta aqui</em>
          </h1>
          <p>
            Compra, venda, troca e financiamento com atendimento direto, proposta rapida e
            negociacao do jeito certo.
          </p>
          <div className="hero-actions">
            <a className="btn btn-gold" href="#estoque">
              Ver estoque
            </a>
            <a className="btn btn-outline" href="#financiamento">
              Simular financiamento
            </a>
          </div>
        </div>
        <div className="hero-strip">
          <div>
            <strong>100%</strong>
            <span>Financiamento</span>
          </div>
          <div>
            <strong>Troca</strong>
            <span>Seu usado na negociacao</span>
          </div>
          <div>
            <strong>Revisados</strong>
            <span>Prontos para rodar</span>
          </div>
          <div>
            <strong>{whatsappHuman}</strong>
            <span>WhatsApp direto</span>
          </div>
        </div>
      </header>

      <section className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>Vendo</span>
          <span>Troco</span>
          <span>Financio</span>
          <span>Melhores condicoes</span>
          <span>Atendimento personalizado</span>
          <span>Vendo</span>
          <span>Troco</span>
          <span>Financio</span>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <span className="eyebrow">Por que Pablo Cruz</span>
          <h2>Negocio seguro, do inicio ao fim</h2>
          <p className="section-copy">
            Estrutura moderna na tecnologia e atendimento direto no relacionamento.
          </p>
          <div className="pillar-grid">
            {[
              ["Credibilidade", "Transparencia real em cada negociacao."],
              ["Preco certo", "Condicoes competitivas e proposta objetiva."],
              ["Atendimento", "Resposta rapida e alinhada com sua necessidade."],
              ["Confianca", "Relacionamento que gera recompra e indicacao."]
            ].map(([title, copy]) => (
              <article className="pillar-card" key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-stock" id="estoque">
        <div className="container">
          <span className="eyebrow">Estoque</span>
          <h2>Veiculos prontos para rodar</h2>
          <p className="section-copy">
            Todos revisados, com procedencia e contato direto por WhatsApp.
          </p>
          <div className="chip-row">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={`chip${option.value === activeFilter ? " is-active" : ""}`}
                onClick={() => setActiveFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="car-grid">
            {filteredCars.map((car) => (
              <article className="car-card" key={car.id}>
                <div className="car-photo">
                  <img alt={car.nome} loading="lazy" src={car.img} />
                  <span className={`badge${car.badgeRed ? " is-alert" : ""}`}>{car.badge}</span>
                </div>
                <div className="car-body">
                  <div className="car-category">{car.categoriaLabel}</div>
                  <h3>{car.nome}</h3>
                  <div className="car-meta">{car.detalhes}</div>
                  <div className="tag-row">
                    {car.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="car-footer">
                    <div className="price-block">
                      <small>A vista</small>
                      <strong>{formatCurrency(car.preco)}</strong>
                    </div>
                    <div className="car-actions">
                      <button className="btn btn-gold" onClick={() => openInterest(car)} type="button">
                        Tenho interesse
                      </button>
                      <a
                        className="btn btn-whatsapp"
                        href={whatsappLink(
                          `Ola Pablo! Vi o ${car.nome} por ${formatCurrency(car.preco)} no site e quero mais informacoes.`
                        )}
                        onClick={() => trackWhatsApp(car.nome, car.preco)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {filteredCars.length === 0 ? (
              <p className="section-copy">Nenhum veiculo nessa categoria no momento. Fale com a gente no WhatsApp.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" id="financiamento">
        <div className="container finance-grid">
          <div>
            <span className="eyebrow">Financiamento</span>
            <h2>Facilitamos para voce</h2>
            <p className="section-copy">
              Simulacao instantanea, entrada ajustavel e conversa direta para fechar a melhor
              condicao.
            </p>
            <div className="steps">
              {[
                ["Escolha o veiculo", "Selecione o carro ideal no estoque."],
                ["Envie seus dados", "Analise rapida direto no WhatsApp."],
                ["Aprovou, rodou", "Documentacao em dia e entrega objetiva."]
              ].map(([title, copy], index) => (
                <div className="step" key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <form className="simulator" onSubmit={submitFinance}>
            <h3>Simule sua parcela</h3>
            <label className="field">
              <span>Veiculo</span>
              <select
                onChange={(event) => setSelectedCarId(event.target.value)}
                value={selectedCar?.id ?? ""}
              >
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.nome} - {formatCurrency(car.preco)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Entrada: {formatCurrency(entryValue)} ({entryPercent}%)</span>
              <input
                max={90}
                min={0}
                onChange={(event) => setEntryPercent(Number(event.target.value))}
                step={5}
                type="range"
                value={entryPercent}
              />
            </label>
            <label className="field">
              <span>Parcelas: {installments}x</span>
              <input
                max={60}
                min={12}
                onChange={(event) => setInstallments(Number(event.target.value))}
                step={12}
                type="range"
                value={installments}
              />
            </label>
            <div className="sim-result">
              <small>Parcela estimada</small>
              <strong>{formatCurrency(installmentValue)}</strong>
              <span>
                {selectedCar?.nome} · entrada de {formatCurrency(entryValue)} · {installments}x
              </span>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Seu nome</span>
                <input
                  onChange={(event) => setFinance((current) => ({ ...current, nome: event.target.value }))}
                  type="text"
                  value={finance.nome}
                />
              </label>
              <label className="field">
                <span>Seu WhatsApp</span>
                <input
                  onChange={(event) => setFinance((current) => ({ ...current, telefone: event.target.value }))}
                  type="tel"
                  value={finance.telefone}
                />
              </label>
            </div>
            <button className="btn btn-whatsapp btn-full" disabled={financeFb.type === "sending"} type="submit">
              {financeFb.type === "sending" ? "Enviando..." : "Quero essa condicao"}
            </button>
            {financeFb.msg ? (
              <p className={`form-feedback is-${financeFb.type}`}>{financeFb.msg}</p>
            ) : null}
            <p className="helper">
              Simulacao ilustrativa. Condicoes finais dependem da analise de credito.
            </p>
          </form>
        </div>
      </section>

      <section className="section section-trade" id="troca">
        <div className="container trade-grid">
          <div>
            <span className="eyebrow">Troca</span>
            <h2>Seu usado vale mais aqui</h2>
            <div className="timeline">
              {[
                ["Envie os dados do seu carro", "Preencha o formulario ao lado ou mande no WhatsApp."],
                ["Avaliacao rapida", "Proposta objetiva no mesmo dia."],
                ["Troque com diferenca facilitada", "Complemento com financiamento se precisar."]
              ].map(([title, copy]) => (
                <div className="timeline-item" key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </div>
          <form className="trade-card" onSubmit={submitTradeForm}>
            <h3>Avaliar meu carro</h3>
            <div className="field-grid">
              <label className="field">
                <span>Seu nome</span>
                <input
                  onChange={(event) => setTrade((current) => ({ ...current, cliente: event.target.value }))}
                  type="text"
                  value={trade.cliente}
                />
              </label>
              <label className="field">
                <span>Seu WhatsApp</span>
                <input
                  onChange={(event) => setTrade((current) => ({ ...current, telefone: event.target.value }))}
                  type="tel"
                  value={trade.telefone}
                />
              </label>
            </div>
            <label className="field">
              <span>Seu carro (marca e modelo)</span>
              <input
                onChange={(event) => setTrade((current) => ({ ...current, veiculo: event.target.value }))}
                type="text"
                value={trade.veiculo}
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Ano</span>
                <input
                  onChange={(event) => setTrade((current) => ({ ...current, ano: event.target.value }))}
                  type="text"
                  value={trade.ano}
                />
              </label>
              <label className="field">
                <span>KM</span>
                <input
                  onChange={(event) => setTrade((current) => ({ ...current, km: event.target.value }))}
                  type="text"
                  value={trade.km}
                />
              </label>
            </div>
            <button className="btn btn-gold btn-full" disabled={tradeFb.type === "sending"} type="submit">
              {tradeFb.type === "sending" ? "Enviando..." : "Avaliar meu carro agora"}
            </button>
            {tradeFb.msg ? <p className={`form-feedback is-${tradeFb.type}`}>{tradeFb.msg}</p> : null}
            {tradeFb.type === "success" ? (
              <a
                className="btn btn-whatsapp btn-full"
                href={whatsappLink("Ola Pablo! Acabei de pedir a avaliacao do meu carro pelo site.")}
                target="_blank"
                rel="noreferrer"
              >
                Falar no WhatsApp agora
              </a>
            ) : null}
          </form>
        </div>
      </section>

      <section className="cta" id="contato">
        <div className="container cta-inner">
          <span className="eyebrow center">Fale agora</span>
          <h2>
            Vendo, troco e <em>financio</em>
          </h2>
          <p>
            Atendimento direto com o Pablo, com resposta rapida e foco total em fechar o carro
            certo para o cliente.
          </p>
          <strong>{whatsappHuman}</strong>
          <form className="contact-card" onSubmit={submitContact}>
            <div className="field-grid">
              <label className="field">
                <span>Seu nome</span>
                <input
                  onChange={(event) => setContact((current) => ({ ...current, nome: event.target.value }))}
                  type="text"
                  value={contact.nome}
                />
              </label>
              <label className="field">
                <span>Seu WhatsApp</span>
                <input
                  onChange={(event) => setContact((current) => ({ ...current, telefone: event.target.value }))}
                  type="tel"
                  value={contact.telefone}
                />
              </label>
            </div>
            <label className="field">
              <span>Mensagem (opcional)</span>
              <textarea
                onChange={(event) => setContact((current) => ({ ...current, mensagem: event.target.value }))}
                rows={3}
                value={contact.mensagem}
              />
            </label>
            <button className="btn btn-gold btn-full" disabled={contactFb.type === "sending"} type="submit">
              {contactFb.type === "sending" ? "Enviando..." : "Enviar contato"}
            </button>
            {contactFb.msg ? <p className={`form-feedback is-${contactFb.type}`}>{contactFb.msg}</p> : null}
          </form>
          <a
            className="btn btn-whatsapp"
            href={whatsappLink("Ola Pablo! Vim pelo site e quero agendar uma visita.")}
            target="_blank"
            rel="noreferrer"
          >
            Chamar no WhatsApp
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-row">
          <p>© 2026 Pablo Cruz Veiculos</p>
          <a href="/CRM/index.html">Abrir CRM</a>
        </div>
      </footer>

      {interestCar ? (
        <div className="site-modal-backdrop" onClick={() => setInterestCar(null)}>
          <form className="site-modal" onClick={(event) => event.stopPropagation()} onSubmit={submitInterest}>
            <div className="site-modal-head">
              <div>
                <span className="eyebrow">Tenho interesse</span>
                <h3>{interestCar.nome}</h3>
                <p className="car-meta">{formatCurrency(interestCar.preco)} · {interestCar.detalhes}</p>
              </div>
              <button className="site-modal-close" onClick={() => setInterestCar(null)} type="button">
                ✕
              </button>
            </div>
            {interestFb.type === "success" ? (
              <>
                <p className="form-feedback is-success">{interestFb.msg}</p>
                <a
                  className="btn btn-whatsapp btn-full"
                  href={whatsappLink(
                    `Ola Pablo! Tenho interesse no ${interestCar.nome} por ${formatCurrency(interestCar.preco)}.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Falar no WhatsApp agora
                </a>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Seu nome</span>
                  <input
                    onChange={(event) => setInterest((current) => ({ ...current, nome: event.target.value }))}
                    type="text"
                    value={interest.nome}
                  />
                </label>
                <label className="field">
                  <span>Seu WhatsApp</span>
                  <input
                    onChange={(event) => setInterest((current) => ({ ...current, telefone: event.target.value }))}
                    type="tel"
                    value={interest.telefone}
                  />
                </label>
                {interestFb.msg ? <p className={`form-feedback is-${interestFb.type}`}>{interestFb.msg}</p> : null}
                <button className="btn btn-gold btn-full" disabled={interestFb.type === "sending"} type="submit">
                  {interestFb.type === "sending" ? "Enviando..." : "Quero esse carro"}
                </button>
                <p className="helper">Ou fale direto no WhatsApp {whatsappHuman}.</p>
              </>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
}
