export const PRICE_TIERS = ["budget", "standard", "premium"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const ACTION_IDS = ["marketing", "overtime", "training", "quality", "cost_cut", "hold"] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const FINANCING_ACTIONS = ["none", "borrow_500", "borrow_1000", "repay_500", "repay_all"] as const;
export type FinancingAction = (typeof FINANCING_ACTIONS)[number];
export const INVENTORY_POLICIES = ["lean", "balanced", "stock_up"] as const;
export type InventoryPolicy = (typeof INVENTORY_POLICIES)[number];
export const CAPITAL_INVESTMENTS = ["none", "capacity_small", "capacity_large"] as const;
export type CapitalInvestment = (typeof CAPITAL_INVESTMENTS)[number];
export const MATCH_PACES = ["quick", "standard", "relaxed"] as const;
export type MatchPace = (typeof MATCH_PACES)[number];

export type GamePhase = "lobby" | "forecast" | "decisions" | "operations" | "results" | "finished";
export type Sector = "food" | "retail" | "services" | "digital";
export type WorldEventVisual = "clear" | "rain" | "festival" | "supply" | "labor" | "digital" | "rates";

export interface VentureConfig {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  sector: Sector;
  basePrice: number;
  baseDemand: number;
  capacity: number;
  unitCost: number;
  wages: number;
  overhead: number;
  unlockCost: number;
  strengths: string;
}

export interface ActionConfig {
  id: ActionId;
  name: string;
  emoji: string;
  description: string;
  cost: number;
}

export interface MarketEvent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  demandMultiplier: number;
  unitCostMultiplier: number;
  wageMultiplier: number;
  interestMultiplier: number;
  sectorMultipliers?: Partial<Record<Sector, number>>;
}

export interface InterestRateEnvironment {
  id: "low" | "normal" | "high" | "spike";
  label: string;
  weeklyRateBps: number;
  description: string;
}

export interface IncidentEffect {
  cost: number;
  moraleDelta?: number;
  trustDelta?: number;
  capacityMultiplier?: number;
  demandMultiplier?: number;
}

export interface IncidentOption {
  id: string;
  label: string;
  description: string;
  balanced?: boolean;
  effect: IncidentEffect;
}

export interface Incident {
  id: string;
  title: string;
  emoji: string;
  description: string;
  lesson: string;
  options: IncidentOption[];
}

export interface Decision {
  priceTier: PriceTier;
  actionId: ActionId;
  incidentOptionId?: string;
  financingAction?: FinancingAction;
  inventoryPolicy?: InventoryPolicy;
  capitalInvestment?: CapitalInvestment;
}

export interface BusinessState {
  cash: number;
  debt: number;
  voluntaryDebt: number;
  emergencyDebt: number;
  totalProfit: number;
  morale: number;
  trust: number;
  loanUsed: boolean;
  insolvent: boolean;
  trainingDays: number;
  capacityBonusPct: number;
  fixedAssetValue: number;
  inventoryUnits: number;
  inventoryValue: number;
  inventoryAverageUnitCost: number;
  turnoverCount: number;
  turnoverRiskArmed: boolean;
  vacancyWeeksRemaining: number;
  lastTurnoverWeek?: number;
  lastPriceTier: PriceTier;
  history: DayResult[];
}

export type DailyInsightCode = "cash_bleed" | "fixed_cost_pressure" | "excess_capacity" | "missed_sales" | "debt_pressure" | "margin_pressure" | "inventory_bloat" | "turnover_shock" | "healthy_day";

export interface DailyInsight {
  code: DailyInsightCode;
  severity: "positive" | "warning" | "critical";
  title: string;
  explanation: string;
  nextMove: string;
}

export interface DailyCashBridge {
  beginningCash: number;
  customerReceipts: number;
  inventoryPurchases: number;
  payroll: number;
  overhead: number;
  operatingActions: number;
  incidents: number;
  recruitmentAndRetraining: number;
  interestAndFees: number;
  capitalExpenditure: number;
  voluntaryLoanProceeds: number;
  emergencyLoanProceeds: number;
  loanRepayments: number;
  loanProceeds: number;
  netChange: number;
  endingCash: number;
}

export interface InventoryMovement {
  beginningUnits: number;
  beginningValue: number;
  purchasedUnits: number;
  purchaseUnitCost: number;
  purchaseCashOutflow: number;
  unitsConsumed: number;
  costOfGoodsSold: number;
  endingUnits: number;
  endingValue: number;
  endingAverageUnitCost: number;
  weeksOfInventoryOnHand: number;
  cashConversionGap: number;
  bloatSeverity: "none" | "watch" | "high";
}

export interface TurnoverResult {
  triggered: boolean;
  resignedEmployees: number;
  recruitmentExpense: number;
  capacityPenaltyPct: number;
  moraleAtTrigger: number;
}

export interface FinancingResult {
  action: FinancingAction;
  voluntaryLoanProceeds: number;
  principalRepaid: number;
  weeklyRateBps: number;
  interestExpense: number;
  endingVoluntaryDebt: number;
  endingEmergencyDebt: number;
}

export interface DayResult {
  day: number;
  unitsSold: number;
  revenue: number;
  expenses: number;
  expenseBreakdown: {
    costOfSales: number;
    payroll: number;
    overhead: number;
    operatingActions: number;
    incidents: number;
    recruitmentAndRetraining: number;
    interest: number;
    loanFees: number;
  };
  ebitda: number;
  profit: number;
  cash: number;
  debt: number;
  morale: number;
  trust: number;
  demand: number;
  capacity: number;
  price: number;
  actionId: ActionId;
  priceTier: PriceTier;
  incidentTitle?: string;
  incidentChoice?: string;
  explanation: string;
  loanTriggered: boolean;
  loanProceeds: number;
  becameInsolvent: boolean;
  inventory: InventoryMovement;
  turnover: TurnoverResult;
  financing: FinancingResult;
  capitalExpenditure: number;
  capacityUpgradeAddedPct: number;
  cashBridge: DailyCashBridge;
  insight: DailyInsight;
}

export interface ProfitAndLossStatement {
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  payroll: number;
  overhead: number;
  operatingActions: number;
  incidentCosts: number;
  recruitmentAndRetraining: number;
  ebitda: number;
  operatingProfit: number;
  interestExpense: number;
  loanFees: number;
  netIncome: number;
}

export interface BalanceSheetStatement {
  assets: { cash: number; inventory: number; fixedAssets: number; total: number };
  liabilities: { voluntaryLoans: number; emergencyLoan: number; total: number };
  equity: { ownerCapital: number; retainedEarnings: number; total: number };
  balances: boolean;
}

export interface CashFlowStatement {
  beginningCash: number;
  operating: {
    customerReceipts: number;
    supplierPayments: number;
    employeePayments: number;
    overheadPayments: number;
    actionAndIncidentPayments: number;
    recruitmentPayments: number;
    interestAndFees: number;
    netCashFromOperations: number;
  };
  investing: { capitalExpenditure: number; netCashFromInvesting: number };
  financing: { voluntaryLoanProceeds: number; emergencyLoanProceeds: number; principalRepayments: number; netCashFromFinancing: number };
  netChangeInCash: number;
  endingCash: number;
  reconciles: boolean;
}

export interface FinancialStatements {
  profitAndLoss: ProfitAndLossStatement;
  balanceSheet: BalanceSheetStatement;
  cashFlow: CashFlowStatement;
}

export interface DayPlayerInput {
  playerId: string;
  ventureId: string;
  business: BusinessState;
  decision: Decision;
  incident?: Incident;
}

export interface DayPlayerOutput {
  playerId: string;
  business: BusinessState;
  result: DayResult;
}

export interface WorldBusinessDirective {
  playerId: string;
  priceTier: PriceTier;
  marketingSpend: number;
  trafficTarget: number;
  representedCustomers: number;
  queueCapacity: number;
  averageWaitSeconds: number;
  serviceSeconds: number;
  satisfaction: number;
  conversionRate: number;
  staffCount: number;
  deliveryShare: number;
  attentionShare: number;
  inventoryPropCount: number;
  inventoryBloatSeverity: "none" | "watch" | "high";
  inventoryValue: number;
  staffCountBefore: number;
  staffCountAfter: number;
}

export interface StaffWorldEvent {
  type: "resignation";
  playerId: string;
  count: number;
  startsAtOffsetMs: number;
  durationMs: number;
}

export type CustomerDecisionReason = "price" | "wait" | "trust" | "marketing" | "capacity";

export interface CustomerCohortDirective {
  id: string;
  originPlayerId?: string;
  destinationPlayerId: string;
  representedCustomers: number;
  actualCustomers: number;
  reason: CustomerDecisionReason;
  reasonLabel: string;
}

export interface PublicMarketSignal {
  playerId: string;
  observedPriceTier: PriceTier;
  visibleCapacity: number;
  capacityLabel: "open" | "steady" | "near capacity";
  visibleQueue: number;
  trustTrend: "rising" | "steady" | "falling";
  previousTraffic: number;
}

export interface WorldDirective {
  day: number;
  seed: number;
  startsAt: number;
  endsAt: number;
  eventVisual: WorldEventVisual;
  trafficScale: number;
  businesses: WorldBusinessDirective[];
  customerCohorts: CustomerCohortDirective[];
  staffEvents: StaffWorldEvent[];
}

export interface ValuationBreakdown {
  finalWeekEbitda: number;
  annualizedEbitda: number;
  ebitdaMultiple: number;
  brandFactor: number;
  stabilityFactor: number;
  enterpriseValue: number;
  operatingReserve: number;
  excessCash: number;
  outstandingDebt: number;
  companyValuation: number;
}

export interface RankingEntry {
  playerId: string;
  rank: number;
  totalProfit: number;
  netCash: number;
  morale: number;
  insolvent: boolean;
  companyValuation: number;
  valuationBreakdown: ValuationBreakdown;
}

export interface Profile {
  id: string;
  nickname: string;
  tokens: number;
  unlockedItemIds: string[];
}

export interface CatalogItem {
  id: string;
  type: "venture" | "scenario" | "cosmetic";
  name: string;
  description: string;
  emoji: string;
  cost: number;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  spectator: boolean;
  ventureId?: string;
  decisionSubmitted: boolean;
  business?: BusinessState;
  incident?: Incident;
  reward?: number;
}

export interface RoomSnapshot {
  code: string;
  revision: number;
  phase: GamePhase;
  day: number;
  maxDays: number;
  phaseEndsAt?: number;
  matchPace: MatchPace;
  marketEvent?: MarketEvent;
  interestRate?: InterestRateEnvironment;
  worldDirective?: WorldDirective;
  publicMarketSignals: PublicMarketSignal[];
  players: PublicPlayer[];
  rankings?: RankingEntry[];
  matchId?: string;
}

export interface ServerError {
  code: string;
  message: string;
}

export type Ack<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ServerError };
