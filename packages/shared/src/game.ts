import {
  ACTIONS,
  BUSINESS_WEEKS_PER_YEAR,
  EBITDA_MULTIPLE,
  getAction,
  getVenture,
  INTEREST_RATE_ENVIRONMENTS,
  MAX_DAYS,
  MAX_VOLUNTARY_DEBT,
  MIN_OPERATING_RESERVE,
  RESIGNATION_MORALE_THRESHOLD,
  STARTING_CASH,
  STARTING_MORALE,
  STARTING_TRUST,
  TURNOVER_REARM_MORALE
} from "./config.js";
import type {
  BusinessState,
  CustomerDecisionReason,
  DayPlayerInput,
  DayPlayerOutput,
  Decision,
  Incident,
  InterestRateEnvironment,
  MarketEvent,
  PriceTier,
  PublicMarketSignal,
  RankingEntry,
  WorldDirective,
  WorldEventVisual
} from "./types.js";

const PRICE_MULTIPLIER: Record<PriceTier, number> = { budget: 0.85, standard: 1, premium: 1.2 };
const PRICE_APPEAL: Record<PriceTier, number> = { budget: 1.2, standard: 1, premium: 0.78 };
const INVENTORY_TARGET: Record<NonNullable<Decision["inventoryPolicy"]>, number> = { lean: 0.82, balanced: 1.05, stock_up: 1.4 };
const CAPITAL_OPTIONS: Record<NonNullable<Decision["capitalInvestment"]>, { cost: number; capacityPct: number }> = {
  none: { cost: 0, capacityPct: 0 },
  capacity_small: { cost: 500, capacityPct: 10 },
  capacity_large: { cost: 1_000, capacityPct: 20 }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const money = (value: number) => Math.round(value);

function buildDailyInsight(values: {
  revenue: number; unitCosts: number; wages: number; overhead: number; actionId: string;
  capacity: number; unitsSold: number; demand: number; interest: number; loanFee: number; operatingCashFlow: number;
  inventoryBloat: "none" | "watch" | "high"; turnoverTriggered: boolean;
}) {
  const grossProfit = values.revenue - values.unitCosts;
  const fixedCosts = values.wages + values.overhead;
  if (values.turnoverTriggered) return {
    code: "turnover_shock" as const, severity: "critical" as const, title: "Turnover Shock",
    explanation: "Low morale caused a resignation and an immediate recruitment and retraining bill.",
    nextMove: "Rebuild morale above 50 before another period of cost cutting or overtime."
  };
  if (values.inventoryBloat !== "none") return {
    code: "inventory_bloat" as const, severity: values.inventoryBloat === "high" ? "critical" as const : "warning" as const, title: "Inventory Bloat",
    explanation: "Supplier payments consumed cash faster than customers converted inventory into sales.",
    nextMove: "Use a lean inventory plan until demand catches up with the stock already on hand."
  };
  if (values.operatingCashFlow < 0) return {
    code: "cash_bleed" as const, severity: "critical" as const, title: "Cash Bleed",
    explanation: `Operations used $${Math.abs(money(values.operatingCashFlow))} more cash than customers supplied today.`,
    nextMove: "Hold cash or choose a lower-cost action unless tomorrow’s forecast clearly supports more demand."
  };
  if (values.interest + values.loanFee > values.revenue * 0.15 && values.interest + values.loanFee > 0) return {
    code: "debt_pressure" as const, severity: "critical" as const, title: "Financing Pressure",
    explanation: "Interest and emergency financing consumed more than 15% of today’s receipts.",
    nextMove: "Protect cash and contribution margin; another aggressive investment could force insolvency."
  };
  if (values.actionId === "overtime" && values.unitsSold < values.capacity * 0.75) return {
    code: "excess_capacity" as const, severity: "warning" as const, title: "Excess Staffing",
    explanation: "Overtime created capacity that customers did not use.",
    nextMove: "Skip overtime until forecast demand is close to your visible capacity."
  };
  if (values.demand > values.capacity) return {
    code: "missed_sales" as const, severity: "warning" as const, title: "Missed Sales",
    explanation: `${Math.max(0, values.demand - values.capacity)} potential sales exceeded today’s capacity.`,
    nextMove: "Consider training or overtime if the next forecast remains strong."
  };
  if (grossProfit > 0 && fixedCosts > grossProfit * 0.65) return {
    code: "fixed_cost_pressure" as const, severity: "warning" as const, title: "Fixed-Cost Pressure",
    explanation: `Payroll and overhead used ${Math.round((fixedCosts / grossProfit) * 100)}% of gross profit.`,
    nextMove: "Protect volume and avoid optional spending unless it creates enough additional contribution margin."
  };
  if (values.revenue > 0 && grossProfit / values.revenue < 0.45) return {
    code: "margin_pressure" as const, severity: "warning" as const, title: "Margin Pressure",
    explanation: "Unit costs left less than 45 cents of each sales dollar for fixed costs and profit.",
    nextMove: "Test a stronger price or prioritize service quality over buying low-margin volume."
  };
  return {
    code: "healthy_day" as const, severity: "positive" as const, title: "Healthy Cash Conversion",
    explanation: "Customer receipts covered today’s operating and financing costs.",
    nextMove: "Use tomorrow’s market signals before changing a strategy that is currently producing cash."
  };
}

export function createBusinessState(): BusinessState {
  return {
    cash: STARTING_CASH,
    debt: 0,
    voluntaryDebt: 0,
    emergencyDebt: 0,
    totalProfit: 0,
    morale: STARTING_MORALE,
    trust: STARTING_TRUST,
    loanUsed: false,
    insolvent: false,
    trainingDays: 0,
    capacityBonusPct: 0,
    fixedAssetValue: 0,
    inventoryUnits: 0,
    inventoryValue: 0,
    inventoryAverageUnitCost: 0,
    turnoverCount: 0,
    turnoverRiskArmed: true,
    vacancyWeeksRemaining: 0,
    lastPriceTier: "standard",
    history: []
  };
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultDecision(lastPriceTier: PriceTier, incident?: Incident): Decision {
  return {
    priceTier: lastPriceTier,
    actionId: "hold",
    incidentOptionId: incident?.options.find((option) => option.balanced)?.id ?? incident?.options[0]?.id,
    financingAction: "none",
    inventoryPolicy: "balanced",
    capitalInvestment: "none"
  };
}

export function calculateDay(
  day: number,
  event: MarketEvent,
  inputs: DayPlayerInput[],
  seed: number,
  interestRate: InterestRateEnvironment = INTEREST_RATE_ENVIRONMENTS.find((rate) => rate.id === "normal")!
): DayPlayerOutput[] {
  if (day < 1 || day > MAX_DAYS) throw new Error("Day is out of range");
  const rng = seededRandom(seed);
  const prepared = inputs.map((input) => {
    const venture = getVenture(input.ventureId);
    const action = getAction(input.decision.actionId);
    if (!venture || !action) throw new Error("Unknown venture or action");
    const incidentOption = input.incident?.options.find((option) => option.id === input.decision.incidentOptionId)
      ?? input.incident?.options.find((option) => option.balanced)
      ?? input.incident?.options[0];
    const trustFactor = 0.7 + input.business.trust / 200;
    const marketingFactor = input.decision.actionId === "marketing" ? 1.25 : 1;
    const appeal = PRICE_APPEAL[input.decision.priceTier] * trustFactor * marketingFactor;
    return { input, venture, action, incidentOption, appeal, randomFactor: 0.96 + rng() * 0.08 };
  });

  const meanAppeal = prepared.reduce((sum, item) => sum + item.appeal, 0) / Math.max(prepared.length, 1);

  return prepared.map(({ input, venture, action, incidentOption, appeal, randomFactor }) => {
    const previous = input.business;
    const incidentEffect = incidentOption?.effect;
    const financingAction = input.decision.financingAction ?? "none";
    const inventoryPolicy = input.decision.inventoryPolicy ?? "balanced";
    const capitalInvestment = input.decision.capitalInvestment ?? "none";

    let voluntaryDebt = previous.voluntaryDebt ?? 0;
    let emergencyDebt = previous.emergencyDebt ?? previous.debt ?? 0;
    let voluntaryLoanProceeds = 0;
    let principalRepaid = 0;
    if (financingAction === "borrow_500" || financingAction === "borrow_1000") {
      const requested = financingAction === "borrow_500" ? 500 : 1_000;
      voluntaryLoanProceeds = Math.min(requested, Math.max(0, MAX_VOLUNTARY_DEBT - voluntaryDebt));
      voluntaryDebt += voluntaryLoanProceeds;
    } else if (financingAction === "repay_500" || financingAction === "repay_all") {
      const requested = financingAction === "repay_500" ? 500 : voluntaryDebt;
      principalRepaid = Math.min(requested, voluntaryDebt, Math.max(0, previous.cash - MIN_OPERATING_RESERVE));
      voluntaryDebt -= principalRepaid;
    }

    const capitalOption = CAPITAL_OPTIONS[capitalInvestment];
    const capacityUpgradeAddedPct = Math.min(capitalOption.capacityPct, Math.max(0, 40 - previous.capacityBonusPct));
    const capitalExpenditure = capitalOption.capacityPct > 0 ? money(capitalOption.cost * capacityUpgradeAddedPct / capitalOption.capacityPct) : 0;
    const capacityBonusPct = previous.capacityBonusPct + capacityUpgradeAddedPct;
    const fixedAssetValue = previous.fixedAssetValue + capitalExpenditure;

    const actionMorale = input.decision.actionId === "overtime" ? -6 : input.decision.actionId === "training" ? 10 : input.decision.actionId === "cost_cut" ? -8 : 0;
    const actionTrust = input.decision.actionId === "quality" ? 10 : input.decision.actionId === "cost_cut" ? -3 : 0;
    const priceTrust = input.decision.priceTier === "budget" ? 1 : input.decision.priceTier === "premium" ? -1 : 0;
    const morale = clamp(previous.morale + actionMorale + (incidentEffect?.moraleDelta ?? 0), 0, 100);
    const trust = clamp(previous.trust + actionTrust + priceTrust + (incidentEffect?.trustDelta ?? 0), 0, 100);
    const wages = money(venture.wages * event.wageMultiplier);
    const riskArmed = previous.turnoverRiskArmed || morale >= TURNOVER_REARM_MORALE;
    const turnoverTriggered = riskArmed && morale < RESIGNATION_MORALE_THRESHOLD;
    const recruitmentExpense = turnoverTriggered ? Math.max(250, money(wages * 0.8)) : 0;
    const turnoverRiskArmed = turnoverTriggered ? false : riskArmed;
    const vacancyCapacity = previous.vacancyWeeksRemaining > 0 ? 0.88 : 1;
    const vacancyWeeksRemaining = turnoverTriggered ? 1 : Math.max(0, previous.vacancyWeeksRemaining - 1);

    const attentionFactor = clamp(appeal / meanAppeal, 0.65, 1.35);
    const sectorFactor = event.sectorMultipliers?.[venture.sector] ?? 1;
    const incidentDemand = incidentEffect?.demandMultiplier ?? 1;
    const demand = venture.baseDemand * event.demandMultiplier * sectorFactor * attentionFactor * incidentDemand * randomFactor;
    const moraleCapacity = 0.76 + previous.morale / 250;
    const trainedCapacity = previous.trainingDays > 0 ? 1.05 : 1;
    const overtimeCapacity = input.decision.actionId === "overtime" ? 1.25 : 1;
    const incidentCapacity = incidentEffect?.capacityMultiplier ?? 1;
    const capacity = Math.floor(venture.capacity * (1 + capacityBonusPct / 100) * moraleCapacity * trainedCapacity * overtimeCapacity * incidentCapacity * vacancyCapacity);

    const targetInventoryUnits = Math.ceil(demand * INVENTORY_TARGET[inventoryPolicy]);
    const purchasedUnits = Math.max(0, targetInventoryUnits - previous.inventoryUnits);
    const purchaseUnitCost = venture.unitCost * event.unitCostMultiplier;
    const purchaseCashOutflow = money(purchasedUnits * purchaseUnitCost);
    const availableUnits = previous.inventoryUnits + purchasedUnits;
    const availableValue = previous.inventoryValue + purchaseCashOutflow;
    const unitsSold = Math.max(0, Math.min(Math.round(demand), capacity, Math.floor(availableUnits)));
    const unitCosts = availableUnits > 0 ? money(availableValue * unitsSold / availableUnits) : 0;
    const endingUnits = Math.max(0, availableUnits - unitsSold);
    const endingValue = Math.max(0, availableValue - unitCosts);
    const endingAverageUnitCost = endingUnits > 0 ? endingValue / endingUnits : 0;
    const weeksOfInventoryOnHand = Math.round((endingUnits / Math.max(1, unitsSold)) * 100) / 100;
    const bloatSeverity = weeksOfInventoryOnHand >= 0.75 ? "high" as const : weeksOfInventoryOnHand >= 0.25 ? "watch" as const : "none" as const;

    const price = money(venture.basePrice * PRICE_MULTIPLIER[input.decision.priceTier]);
    const revenue = money(unitsSold * price);
    const incidentCost = incidentEffect?.cost ?? 0;
    const debtBeforeInterest = voluntaryDebt + emergencyDebt;
    const interest = money(debtBeforeInterest * interestRate.weeklyRateBps / 10_000);
    const ebitda = money(revenue - unitCosts - wages - venture.overhead - action.cost - incidentCost - recruitmentExpense);
    let profit = ebitda - interest;
    let cash = previous.cash + voluntaryLoanProceeds - principalRepaid - capitalExpenditure - purchaseCashOutflow
      + revenue - wages - venture.overhead - action.cost - incidentCost - recruitmentExpense - interest;
    let loanUsed = previous.loanUsed;
    let insolvent = previous.insolvent;
    let loanTriggered = false;
    let emergencyLoanProceeds = 0;
    let becameInsolvent = false;

    if (cash < 0 && !insolvent) {
      if (!loanUsed) {
        const fee = 100;
        const principal = 500 - cash + fee;
        emergencyDebt += principal;
        emergencyLoanProceeds = principal;
        cash += principal - fee;
        profit -= fee;
        loanUsed = true;
        loanTriggered = true;
      } else {
        insolvent = true;
        becameInsolvent = true;
      }
    }

    const debt = voluntaryDebt + emergencyDebt;
    const loanFee = loanTriggered ? 100 : 0;
    const operatingCashFlow = revenue - purchaseCashOutflow - wages - venture.overhead - action.cost - incidentCost - recruitmentExpense - interest - loanFee;
    const cashConversionGap = money(profit - operatingCashFlow);
    const inventory = {
      beginningUnits: previous.inventoryUnits,
      beginningValue: previous.inventoryValue,
      purchasedUnits,
      purchaseUnitCost: Math.round(purchaseUnitCost * 100) / 100,
      purchaseCashOutflow,
      unitsConsumed: unitsSold,
      costOfGoodsSold: unitCosts,
      endingUnits,
      endingValue,
      endingAverageUnitCost: Math.round(endingAverageUnitCost * 100) / 100,
      weeksOfInventoryOnHand,
      cashConversionGap,
      bloatSeverity
    };
    const loanProceeds = voluntaryLoanProceeds + emergencyLoanProceeds;
    const cashBridge = {
      beginningCash: previous.cash,
      customerReceipts: revenue,
      inventoryPurchases: purchaseCashOutflow,
      payroll: wages,
      overhead: venture.overhead,
      operatingActions: action.cost,
      incidents: incidentCost,
      recruitmentAndRetraining: recruitmentExpense,
      interestAndFees: interest + loanFee,
      capitalExpenditure,
      voluntaryLoanProceeds,
      emergencyLoanProceeds,
      loanRepayments: principalRepaid,
      loanProceeds,
      netChange: money(cash - previous.cash),
      endingCash: money(cash)
    };
    const insight = buildDailyInsight({ revenue, unitCosts, wages, overhead: venture.overhead, actionId: action.id, capacity, unitsSold, demand, interest, loanFee, operatingCashFlow, inventoryBloat: bloatSeverity, turnoverTriggered });
    const actionPhrase = action.id === "hold" ? "Holding cash avoided extra discretionary spending" : `${action.name} changed this week's costs or operating strength`;
    const marketPhrase = demand > venture.baseDemand ? "market demand ran above a normal week" : "market demand was below a normal week";
    const capacityPhrase = unitsSold >= capacity && demand > capacity ? " Capacity limited some potential sales." : unitsSold >= availableUnits && demand > availableUnits ? " Inventory limited some potential sales." : " Capacity and stock covered the available demand.";
    const explanation = `${actionPhrase}; ${marketPhrase}.${capacityPhrase}${turnoverTriggered ? " Low morale caused a resignation and recruitment bill." : ""}${loanTriggered ? " An emergency loan restored cash, but added a $100 fee and future interest." : ""}${becameInsolvent ? " A second cash rescue was needed, so the venture became insolvent." : ""}`;
    const expenses = money(unitCosts + wages + venture.overhead + action.cost + incidentCost + recruitmentExpense + interest + loanFee);
    const result = {
      day,
      unitsSold,
      revenue,
      expenses,
      expenseBreakdown: {
        costOfSales: unitCosts,
        payroll: wages,
        overhead: venture.overhead,
        operatingActions: action.cost,
        incidents: incidentCost,
        recruitmentAndRetraining: recruitmentExpense,
        interest,
        loanFees: loanFee
      },
      ebitda,
      profit,
      cash: money(cash),
      debt: money(debt),
      morale,
      trust,
      demand: Math.floor(demand),
      capacity,
      price,
      actionId: input.decision.actionId,
      priceTier: input.decision.priceTier,
      incidentTitle: input.incident?.title,
      incidentChoice: incidentOption?.label,
      explanation,
      loanTriggered,
      loanProceeds,
      becameInsolvent,
      inventory,
      turnover: {
        triggered: turnoverTriggered,
        resignedEmployees: turnoverTriggered ? 1 : 0,
        recruitmentExpense,
        capacityPenaltyPct: previous.vacancyWeeksRemaining > 0 ? 12 : 0,
        moraleAtTrigger: morale
      },
      financing: {
        action: financingAction,
        voluntaryLoanProceeds,
        principalRepaid,
        weeklyRateBps: interestRate.weeklyRateBps,
        interestExpense: interest,
        endingVoluntaryDebt: voluntaryDebt,
        endingEmergencyDebt: emergencyDebt
      },
      capitalExpenditure,
      capacityUpgradeAddedPct,
      cashBridge,
      insight
    };

    const trainingDays = input.decision.actionId === "training" ? 2 : Math.max(0, previous.trainingDays - 1);
    const business: BusinessState = {
      cash: result.cash,
      debt: result.debt,
      voluntaryDebt,
      emergencyDebt,
      totalProfit: previous.totalProfit + profit,
      morale,
      trust,
      loanUsed,
      insolvent,
      trainingDays,
      capacityBonusPct,
      fixedAssetValue,
      inventoryUnits: endingUnits,
      inventoryValue: endingValue,
      inventoryAverageUnitCost: inventory.endingAverageUnitCost,
      turnoverCount: previous.turnoverCount + (turnoverTriggered ? 1 : 0),
      turnoverRiskArmed,
      vacancyWeeksRemaining,
      lastTurnoverWeek: turnoverTriggered ? day : previous.lastTurnoverWeek,
      lastPriceTier: input.decision.priceTier,
      history: [...previous.history, result]
    };
    return { playerId: input.playerId, business, result };
  });
}

const EVENT_VISUALS: Record<string, WorldEventVisual> = {
  steady: "clear",
  boom: "festival",
  cautious: "rain",
  supply: "supply",
  labor: "labor",
  festival: "festival",
  digital: "digital",
  rates: "rates"
};

/** Turns authoritative day results into a compact, deterministic animation plan. */
export function createWorldDirective(
  day: number,
  event: MarketEvent,
  inputs: DayPlayerInput[],
  outputs: DayPlayerOutput[],
  seed: number,
  startsAt: number,
  durationMs: number
): WorldDirective {
  const outputByPlayer = new Map(outputs.map((output) => [output.playerId, output]));
  const totalDemand = Math.max(1, outputs.reduce((sum, output) => sum + output.result.demand, 0));
  const businesses = inputs.map((input) => {
      const output = outputByPlayer.get(input.playerId)!;
      const result = output.result;
      const venture = getVenture(input.ventureId)!;
      const capacityPressure = result.capacity > 0 ? result.demand / result.capacity : 1;
      const conversionRate = result.demand > 0 ? clamp(result.unitsSold / result.demand, 0, 1) : 1;
      const satisfaction = clamp(Math.round(output.business.trust * 0.62 + output.business.morale * 0.18 + conversionRate * 20 - Math.max(0, capacityPressure - 1) * 12), 8, 98);
      const representedCustomers = clamp(Math.round(7 + (result.demand / totalDemand) * 34), 6, 28);
      const staffCountBefore = clamp(Math.round(2 + input.business.morale / 34) - (input.business.vacancyWeeksRemaining > 0 ? 1 : 0), 1, 5);
      const inventoryPropCount = result.inventory.bloatSeverity === "high" ? clamp(Math.ceil(result.inventory.weeksOfInventoryOnHand * 7), 6, 8)
        : result.inventory.bloatSeverity === "watch" ? clamp(Math.ceil(result.inventory.weeksOfInventoryOnHand * 7), 2, 5) : 0;
      return {
        playerId: input.playerId,
        priceTier: input.decision.priceTier,
        marketingSpend: input.decision.actionId === "marketing" ? getAction("marketing")!.cost : 0,
        trafficTarget: result.demand,
        representedCustomers,
        queueCapacity: clamp(Math.round(result.capacity / Math.max(venture.baseDemand / 8, 1)), 3, 12),
        averageWaitSeconds: clamp(Math.round(4 + Math.max(0, capacityPressure - 0.65) * 22), 3, 32),
        serviceSeconds: clamp(Math.round(2.8 + capacityPressure * 2.2), 3, 8),
        satisfaction,
        conversionRate: Math.round(conversionRate * 100),
        staffCount: Math.max(1, staffCountBefore - (result.turnover.triggered ? 1 : 0)),
        deliveryShare: venture.sector === "digital" ? 0.9 : venture.sector === "retail" ? 0.42 : event.id === "cautious" ? 0.3 : 0.12,
        attentionShare: Math.round((result.demand / totalDemand) * 100),
        inventoryPropCount,
        inventoryBloatSeverity: result.inventory.bloatSeverity,
        inventoryValue: result.inventory.endingValue,
        staffCountBefore,
        staffCountAfter: Math.max(1, staffCountBefore - (result.turnover.triggered ? 1 : 0))
      };
    });
  const businessByPlayer = new Map(businesses.map((business) => [business.playerId, business]));
  const inputByPlayer = new Map(inputs.map((input) => [input.playerId, input]));
  const fairShare = 100 / Math.max(1, inputs.length);
  const reasonLabel = {
    price: "Lower visible price",
    wait: "Shorter expected wait",
    trust: "Stronger customer trust",
    marketing: "Marketing created awareness",
    capacity: "More room to serve"
  } as const;
  const customerCohorts = businesses.flatMap((destination, destinationIndex) => {
    const destinationInput = inputByPlayer.get(destination.playerId)!;
    const competitors = businesses.filter((business) => business.playerId !== destination.playerId);
    const source = [...competitors].sort((a, b) => b.averageWaitSeconds - a.averageWaitSeconds)[0];
    const meanTrust = inputs.reduce((sum, input) => sum + input.business.trust, 0) / Math.max(1, inputs.length);
    const primary: CustomerDecisionReason = destinationInput.decision.actionId === "marketing" ? "marketing"
      : destinationInput.decision.priceTier === "budget" ? "price"
        : destination.averageWaitSeconds < (source?.averageWaitSeconds ?? destination.averageWaitSeconds) ? "wait"
          : destinationInput.business.trust > meanTrust ? "trust" : "capacity";
    const secondary: CustomerDecisionReason = primary === "price" ? "wait" : destinationInput.business.trust >= meanTrust ? "trust" : "capacity";
    const counts = [Math.ceil(destination.representedCustomers * 0.5), Math.floor(destination.representedCustomers * 0.3)];
    counts.push(destination.representedCustomers - counts[0]! - counts[1]!);
    return counts.filter((count) => count > 0).map((count, cohortIndex) => {
      const reason = cohortIndex === 0 ? primary : cohortIndex === 1 ? secondary : "capacity";
      const fromCompetitor = destination.attentionShare > fairShare && cohortIndex < 2;
      return {
        id: `${day}-${destinationIndex}-${cohortIndex}`,
        originPlayerId: fromCompetitor ? source?.playerId : undefined,
        destinationPlayerId: destination.playerId,
        representedCustomers: count,
        actualCustomers: Math.max(1, Math.round(outputByPlayer.get(destination.playerId)!.result.demand * count / destination.representedCustomers)),
        reason,
        reasonLabel: reasonLabel[reason]
      };
    });
  });
  return {
    day,
    seed,
    startsAt,
    endsAt: startsAt + durationMs,
    eventVisual: EVENT_VISUALS[event.id] ?? "clear",
    trafficScale: clamp(totalDemand / Math.max(inputs.length * 70, 1), 0.65, 1.6),
    businesses,
    customerCohorts,
    staffEvents: outputs.filter((output) => output.result.turnover.triggered).map((output, index) => ({
      type: "resignation" as const,
      playerId: output.playerId,
      count: output.result.turnover.resignedEmployees,
      startsAtOffsetMs: Math.round(durationMs * (0.22 + index * 0.06)),
      durationMs: Math.max(1_500, Math.round(durationMs * 0.38))
    }))
  };
}

export function createPublicMarketSignals(players: Array<{ playerId: string; ventureId: string; business: BusinessState }>): PublicMarketSignal[] {
  return players.map(({ playerId, ventureId, business }) => {
    const venture = getVenture(ventureId)!;
    const latest = business.history.at(-1);
    const previous = business.history.at(-2);
    const visibleCapacity = latest?.capacity ?? venture.capacity;
    const visibleQueue = latest ? Math.max(0, latest.demand - latest.capacity) : 0;
    const utilization = latest ? latest.unitsSold / Math.max(1, latest.capacity) : 0.65;
    const trustDelta = latest && previous ? latest.trust - previous.trust : 0;
    return {
      playerId,
      observedPriceTier: latest?.priceTier ?? business.lastPriceTier,
      visibleCapacity,
      capacityLabel: utilization >= 0.92 ? "near capacity" : utilization <= 0.68 ? "open" : "steady",
      visibleQueue,
      trustTrend: trustDelta >= 3 ? "rising" : trustDelta <= -3 ? "falling" : "steady",
      previousTraffic: latest?.demand ?? venture.baseDemand
    };
  });
}

export function rankBusinesses(players: Array<{ playerId: string; business: BusinessState }>): RankingEntry[] {
  const valued = players.map((entry) => {
    const finalWeek = entry.business.history.at(-1);
    const finalWeekEbitda = finalWeek?.ebitda ?? 0;
    const annualizedEbitda = Math.max(0, finalWeekEbitda) * BUSINESS_WEEKS_PER_YEAR;
    const brandFactor = Math.round((0.85 + entry.business.trust / 100 * 0.3) * 100) / 100;
    const stabilityFactor = Math.round((0.85 + entry.business.morale / 100 * 0.3) * 100) / 100;
    const enterpriseValue = money(annualizedEbitda * EBITDA_MULTIPLE * brandFactor * stabilityFactor);
    const operatingReserve = Math.max(MIN_OPERATING_RESERVE, (finalWeek?.expenseBreakdown.payroll ?? 0) + (finalWeek?.expenseBreakdown.overhead ?? 0) + (finalWeek?.expenseBreakdown.interest ?? 0));
    const excessCash = Math.max(0, entry.business.cash - operatingReserve);
    const companyValuation = Math.max(0, money(enterpriseValue + excessCash - entry.business.debt));
    return {
      ...entry,
      valuationBreakdown: {
        finalWeekEbitda,
        annualizedEbitda,
        ebitdaMultiple: EBITDA_MULTIPLE,
        brandFactor,
        stabilityFactor,
        enterpriseValue,
        operatingReserve,
        excessCash,
        outstandingDebt: entry.business.debt,
        companyValuation
      }
    };
  });
  const sorted = valued.sort((a, b) => {
    if (a.business.insolvent !== b.business.insolvent) return a.business.insolvent ? 1 : -1;
    if (a.valuationBreakdown.companyValuation !== b.valuationBreakdown.companyValuation) return b.valuationBreakdown.companyValuation - a.valuationBreakdown.companyValuation;
    const aEbitda = a.business.history.at(-1)?.ebitda ?? 0;
    const bEbitda = b.business.history.at(-1)?.ebitda ?? 0;
    if (aEbitda !== bEbitda) return bEbitda - aEbitda;
    const aNetCash = a.business.cash - a.business.debt;
    const bNetCash = b.business.cash - b.business.debt;
    if (aNetCash !== bNetCash) return bNetCash - aNetCash;
    return b.business.morale - a.business.morale;
  });
  return sorted.map((entry, index) => ({
    playerId: entry.playerId,
    rank: index + 1,
    totalProfit: entry.business.totalProfit,
    netCash: entry.business.cash - entry.business.debt,
    morale: entry.business.morale,
    insolvent: entry.business.insolvent,
    companyValuation: entry.valuationBreakdown.companyValuation,
    valuationBreakdown: entry.valuationBreakdown
  }));
}

export function decisionLesson(business: BusinessState): { best: string; costly: string; lesson: string } {
  if (business.history.length === 0) return { best: "No completed days", costly: "No completed days", lesson: "Every decision creates a measurable tradeoff." };
  const best = [...business.history].sort((a, b) => b.profit - a.profit)[0]!;
  const costly = [...business.history].sort((a, b) => a.profit - b.profit)[0]!;
  const averageMorale = business.history.reduce((sum, day) => sum + day.morale, 0) / business.history.length;
  const lesson = business.debt > 0
    ? "Cash timing matters as much as profit: emergency financing adds fees and interest."
    : averageMorale < 45
      ? "Labor choices can reduce costs today while quietly limiting tomorrow’s capacity."
      : business.trust < 45
        ? "Customer trust is a demand asset; recovering it usually costs more than protecting it."
        : "A resilient business balances margin, demand, people, and enough cash for surprises.";
  const actionName = (id: string) => ACTIONS.find((item) => item.id === id)?.name ?? id;
  return {
    best: `Week ${best.day}: ${actionName(best.actionId)} (${best.profit >= 0 ? "+" : ""}$${best.profit})`,
    costly: `Week ${costly.day}: ${actionName(costly.actionId)} (${costly.profit >= 0 ? "+" : ""}$${costly.profit})`,
    lesson
  };
}
