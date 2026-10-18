import type { ActionConfig, CatalogItem, Incident, InterestRateEnvironment, MarketEvent, MatchPace, VentureConfig } from "./types.js";

export const STARTING_CASH = 3_000;
export const STARTING_MORALE = 60;
export const STARTING_TRUST = 60;
export const MAX_DAYS = 6;
export const MAX_WEEKS = MAX_DAYS;
export const MAX_VOLUNTARY_DEBT = 2_000;
export const MIN_OPERATING_RESERVE = 500;
export const RESIGNATION_MORALE_THRESHOLD = 35;
export const TURNOVER_REARM_MORALE = 50;
export const EBITDA_MULTIPLE = 4;
export const BUSINESS_WEEKS_PER_YEAR = 52;

export const INTEREST_RATE_ENVIRONMENTS: InterestRateEnvironment[] = [
  { id: "low", label: "Low-rate credit", weeklyRateBps: 150, description: "Borrowing costs 1.5% this simulated week. Expansion capital is relatively cheap." },
  { id: "normal", label: "Normal credit market", weeklyRateBps: 300, description: "Borrowing costs 3% this simulated week. Debt needs a clear operating payoff." },
  { id: "high", label: "Tight credit", weeklyRateBps: 500, description: "Borrowing costs 5% this simulated week. Interest can quickly erase thin margins." },
  { id: "spike", label: "Rate spike", weeklyRateBps: 700, description: "Borrowing costs 7% this simulated week. Leverage is unusually expensive." }
];

export const MATCH_PACE_MULTIPLIERS: Record<MatchPace, number> = {
  quick: 0.7,
  standard: 1,
  relaxed: 1.5
};

export const VENTURES: VentureConfig[] = [
  {
    id: "cafe", name: "Corner Café", emoji: "☕", tagline: "Turn morning routines into reliable revenue.", sector: "food",
    basePrice: 12, baseDemand: 100, capacity: 120, unitCost: 5, wages: 260, overhead: 240, unlockCost: 0,
    strengths: "High volume · visible customer trust"
  },
  {
    id: "online-shop", name: "Online Shop", emoji: "📦", tagline: "Balance product margins with fast-moving demand.", sector: "retail",
    basePrice: 30, baseDemand: 40, capacity: 48, unitCost: 15, wages: 180, overhead: 220, unlockCost: 0,
    strengths: "Flexible capacity · inventory pressure"
  },
  {
    id: "cleaning-service", name: "Cleaning Crew", emoji: "✨", tagline: "Build a dependable service team customers trust.", sector: "services",
    basePrice: 80, baseDemand: 15, capacity: 18, unitCost: 15, wages: 500, overhead: 275, unlockCost: 0,
    strengths: "Strong margins · staff dependent"
  },
  {
    id: "app-studio", name: "App Studio", emoji: "📱", tagline: "Ship digital products without losing your team.", sector: "digital",
    basePrice: 8, baseDemand: 150, capacity: 180, unitCost: 1, wages: 550, overhead: 300, unlockCost: 0,
    strengths: "Low unit cost · high fixed costs"
  },
  {
    id: "food-truck", name: "Food Truck", emoji: "🚚", tagline: "Take a nimble menu wherever demand appears.", sector: "food",
    basePrice: 15, baseDemand: 80, capacity: 96, unitCost: 6, wages: 300, overhead: 220, unlockCost: 60,
    strengths: "Responsive demand · supply exposure"
  },
  {
    id: "bike-repair", name: "Bike Repair", emoji: "🚲", tagline: "Convert skilled labor into loyal local customers.", sector: "services",
    basePrice: 60, baseDemand: 20, capacity: 24, unitCost: 12, wages: 520, overhead: 240, unlockCost: 60,
    strengths: "Low material cost · capacity constrained"
  },
  {
    id: "content-studio", name: "Content Studio", emoji: "🎬", tagline: "Price creative work while protecting your people.", sector: "digital",
    basePrice: 100, baseDemand: 12, capacity: 15, unitCost: 15, wages: 620, overhead: 200, unlockCost: 60,
    strengths: "Premium work · trust sensitive"
  },
  {
    id: "pop-up-boutique", name: "Pop-up Boutique", emoji: "🛍️", tagline: "Win attention with timely products and smart pricing.", sector: "retail",
    basePrice: 40, baseDemand: 30, capacity: 36, unitCost: 20, wages: 220, overhead: 180, unlockCost: 60,
    strengths: "Trend driven · margin decisions"
  }
];

export const ACTIONS: ActionConfig[] = [
  { id: "marketing", name: "Marketing push", emoji: "📣", description: "Spend $150 to attract 25% more attention this week.", cost: 150 },
  { id: "overtime", name: "Run overtime", emoji: "⏱️", description: "Spend $120 for 25% more capacity; morale falls 6.", cost: 120 },
  { id: "training", name: "Train the team", emoji: "🎓", description: "Spend $180; gain 10 morale and 5% capacity for two future weeks.", cost: 180 },
  { id: "quality", name: "Improve quality", emoji: "💎", description: "Spend $150 to gain 10 customer trust.", cost: 150 },
  { id: "cost_cut", name: "Cut costs", emoji: "✂️", description: "Save $120 now; lose 8 morale and 3 customer trust.", cost: -120 },
  { id: "hold", name: "Hold cash", emoji: "🏦", description: "Make no extra operating investment this week.", cost: 0 }
];

export const MARKET_EVENTS: MarketEvent[] = [
  { id: "steady", name: "Steady streets", emoji: "🌤️", description: "Demand and costs are holding steady.", demandMultiplier: 1, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1 },
  { id: "boom", name: "Consumer boom", emoji: "🎉", description: "Customers are ready to spend. Demand rises 18%.", demandMultiplier: 1.18, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1 },
  { id: "cautious", name: "Cautious wallets", emoji: "🌧️", description: "Households are spending 15% less today.", demandMultiplier: 0.85, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1 },
  { id: "supply", name: "Supply squeeze", emoji: "🚧", description: "Materials cost 15% more across the city.", demandMultiplier: 1, unitCostMultiplier: 1.15, wageMultiplier: 1, interestMultiplier: 1 },
  { id: "labor", name: "Tight labor market", emoji: "🧑‍💼", description: "Wage costs rise 15% for the week.", demandMultiplier: 1, unitCostMultiplier: 1, wageMultiplier: 1.15, interestMultiplier: 1 },
  { id: "festival", name: "City festival", emoji: "🎪", description: "Food and retail ventures get a burst of foot traffic.", demandMultiplier: 1.03, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1, sectorMultipliers: { food: 1.18, retail: 1.12 } },
  { id: "digital", name: "Online trend", emoji: "🔥", description: "Digital and retail attention surges.", demandMultiplier: 1.02, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1, sectorMultipliers: { digital: 1.18, retail: 1.1 } },
  { id: "rates", name: "Rate rise", emoji: "📈", description: "Credit markets tightened and this week's borrowing rate has spiked.", demandMultiplier: 0.98, unitCostMultiplier: 1, wageMultiplier: 1, interestMultiplier: 1.5 }
];

export const INCIDENTS: Incident[] = [
  {
    id: "pto", title: "PTO request", emoji: "🏖️", description: "A team member needs a personal day.", lesson: "Time off has a short-term cost, but predictable support protects retention and morale.",
    options: [
      { id: "approve", label: "Approve PTO", description: "$80 · capacity -8% · morale +8", effect: { cost: 80, capacityMultiplier: 0.92, moraleDelta: 8 } },
      { id: "cover", label: "Hire temp cover", description: "$160 · full capacity · morale +5", balanced: true, effect: { cost: 160, moraleDelta: 5 } },
      { id: "deny", label: "Deny the request", description: "$0 · morale -12 · trust -2", effect: { cost: 0, moraleDelta: -12, trustDelta: -2 } }
    ]
  },
  {
    id: "sick", title: "Sick shift", emoji: "🤒", description: "An employee wakes up too sick to work.", lesson: "Coverage choices change today’s capacity and tomorrow’s workforce stability.",
    options: [
      { id: "paid", label: "Offer paid sick leave", description: "$120 · capacity -10% · morale +6", balanced: true, effect: { cost: 120, capacityMultiplier: 0.9, moraleDelta: 6 } },
      { id: "temp", label: "Call in a temp", description: "$170 · full capacity · morale +2", effect: { cost: 170, moraleDelta: 2 } },
      { id: "unpaid", label: "Make it unpaid", description: "$0 · capacity -10% · morale -10", effect: { cost: 0, capacityMultiplier: 0.9, moraleDelta: -10 } }
    ]
  },
  {
    id: "supplier", title: "Supplier delay", emoji: "🚛", description: "A key delivery will not arrive on time.", lesson: "Resilience has a price: backups reduce risk but can narrow margins.",
    options: [
      { id: "rush", label: "Rush the shipment", description: "$180 · full capacity", effect: { cost: 180 } },
      { id: "alternate", label: "Use a backup supplier", description: "$100 · capacity -5%", balanced: true, effect: { cost: 100, capacityMultiplier: 0.95 } },
      { id: "wait", label: "Wait it out", description: "$0 · capacity -20%", effect: { cost: 0, capacityMultiplier: 0.8 } }
    ]
  },
  {
    id: "review", title: "Unhappy customer", emoji: "⭐", description: "A poor review is gaining attention.", lesson: "Service recovery costs money now and can restore future demand.",
    options: [
      { id: "refund", label: "Refund and follow up", description: "$90 · trust +8", effect: { cost: 90, trustDelta: 8 } },
      { id: "reply", label: "Respond thoughtfully", description: "$20 · trust +4", balanced: true, effect: { cost: 20, trustDelta: 4 } },
      { id: "ignore", label: "Ignore it", description: "$0 · trust -8", effect: { cost: 0, trustDelta: -8 } }
    ]
  },
  {
    id: "equipment", title: "Equipment trouble", emoji: "🛠️", description: "A critical tool starts failing mid-day.", lesson: "Maintenance decisions trade cash today for capacity and reliability.",
    options: [
      { id: "repair", label: "Repair properly", description: "$200 · capacity -5%", effect: { cost: 200, capacityMultiplier: 0.95 } },
      { id: "patch", label: "Use a temporary fix", description: "$80 · capacity -15%", balanced: true, effect: { cost: 80, capacityMultiplier: 0.85 } },
      { id: "defer", label: "Defer maintenance", description: "$0 · capacity -30% · trust -5", effect: { cost: 0, capacityMultiplier: 0.7, trustDelta: -5 } }
    ]
  },
  {
    id: "large-order", title: "Surprise large order", emoji: "📋", description: "A new customer wants more than you planned.", lesson: "Revenue opportunities only help when capacity and service quality can support them.",
    options: [
      { id: "accept", label: "Accept in full", description: "$140 · demand +15% · capacity +15% · morale -6", effect: { cost: 140, demandMultiplier: 1.15, capacityMultiplier: 1.15, moraleDelta: -6 } },
      { id: "partial", label: "Offer a partial order", description: "$20 · demand +5% · trust +2", balanced: true, effect: { cost: 20, demandMultiplier: 1.05, trustDelta: 2 } },
      { id: "decline", label: "Decline it", description: "$0 · trust -4", effect: { cost: 0, trustDelta: -4 } }
    ]
  }
];

export const CATALOG: CatalogItem[] = [
  ...VENTURES.filter((venture) => venture.unlockCost > 0).map((venture) => ({
    id: venture.id, type: "venture" as const, name: venture.name, description: venture.tagline, emoji: venture.emoji, cost: venture.unlockCost
  })),
  { id: "wild-week", type: "scenario", name: "Wild Week", description: "A collectible scenario pack reserved for a future match mode.", emoji: "🌪️", cost: 80 },
  { id: "neon-ledger", type: "cosmetic", name: "Neon Ledger", description: "Adds a vivid profile badge to your collection.", emoji: "🌈", cost: 40 }
];

export const getVenture = (id: string) => VENTURES.find((venture) => venture.id === id);
export const getAction = (id: string) => ACTIONS.find((action) => action.id === id);
export const getCatalogItem = (id: string) => CATALOG.find((item) => item.id === id);
