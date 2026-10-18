import { describe, expect, it } from "vitest";
import { MARKET_EVENTS, VENTURES } from "./config.js";
import { buildFinancialStatements } from "./financials.js";
import { calculateDay, createBusinessState, createWorldDirective, defaultDecision, rankBusinesses } from "./game.js";
import type { BusinessState, DayPlayerInput } from "./types.js";

const steady = MARKET_EVENTS.find((event) => event.id === "steady")!;

describe("Market Rush economics", () => {
  it("normalizes every venture to $200 on a baseline day", () => {
    for (const venture of VENTURES) {
      expect(venture.baseDemand * venture.basePrice - venture.baseDemand * venture.unitCost - venture.wages - venture.overhead).toBe(200);
    }
  });

  it("keeps equivalent strategies within 5% over seeded neutral days", () => {
    const totals = new Map(VENTURES.map((venture) => [venture.id, 0]));
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const inputs: DayPlayerInput[] = VENTURES.map((venture) => ({
        playerId: venture.id,
        ventureId: venture.id,
        business: createBusinessState(),
        decision: { priceTier: "standard", actionId: "hold" }
      }));
      calculateDay(1, steady, inputs, seed).forEach((output) => totals.set(output.playerId, totals.get(output.playerId)! + output.result.profit));
    }
    const averages = [...totals.values()].map((total) => total / 1_000);
    const mean = averages.reduce((sum, value) => sum + value, 0) / averages.length;
    for (const average of averages) expect(Math.abs(average - mean) / mean).toBeLessThan(0.05);
  });

  it("uses a neutral timeout decision and the balanced incident response", () => {
    const decision = defaultDecision("premium", {
      id: "test", title: "Test", emoji: "!", description: "", lesson: "", options: [
        { id: "risky", label: "Risky", description: "", effect: { cost: 0 } },
        { id: "balanced", label: "Balanced", description: "", balanced: true, effect: { cost: 10 } }
      ]
    });
    expect(decision).toEqual({ priceTier: "premium", actionId: "hold", incidentOptionId: "balanced", financingAction: "none", inventoryPolicy: "balanced", capitalInvestment: "none" });
  });

  it("issues one rescue loan, then marks a second cash failure insolvent", () => {
    const failing: BusinessState = { ...createBusinessState(), cash: -1_000 };
    const first = calculateDay(1, steady, [{ playerId: "p", ventureId: "cafe", business: failing, decision: { priceTier: "standard", actionId: "hold" } }], 1)[0]!;
    expect(first.result.loanTriggered).toBe(true);
    expect(first.business.cash).toBe(500);
    const secondState = { ...first.business, cash: -2_000 };
    const second = calculateDay(2, steady, [{ playerId: "p", ventureId: "cafe", business: secondState, decision: { priceTier: "standard", actionId: "hold" } }], 2)[0]!;
    expect(second.result.becameInsolvent).toBe(true);
    expect(second.business.insolvent).toBe(true);
  });

  it("ranks solvent businesses before insolvent businesses and applies tie breakers", () => {
    const base = createBusinessState();
    const rankings = rankBusinesses([
      { playerId: "insolvent", business: { ...base, totalProfit: 9_999, insolvent: true } },
      { playerId: "cash", business: { ...base, totalProfit: 200, cash: 3_500 } },
      { playerId: "morale", business: { ...base, totalProfit: 200, cash: 3_500, morale: 90 } }
    ]);
    expect(rankings.map((entry) => entry.playerId)).toEqual(["morale", "cash", "insolvent"]);
  });

  it("produces three financial statements that reconcile to the game ledger", () => {
    let business = createBusinessState();
    for (let day = 1; day <= 6; day += 1) {
      business = calculateDay(day, steady, [{ playerId: "p", ventureId: "cafe", business, decision: { priceTier: "standard", actionId: day === 2 ? "training" : "hold" } }], day)[0]!.business;
    }
    const statements = buildFinancialStatements(business);
    expect(statements.profitAndLoss.netIncome).toBe(business.totalProfit);
    expect(statements.balanceSheet.balances).toBe(true);
    expect(statements.balanceSheet.assets.total).toBe(statements.balanceSheet.liabilities.total + statements.balanceSheet.equity.total);
    expect(statements.cashFlow.reconciles).toBe(true);
    expect(statements.cashFlow.endingCash).toBe(business.cash);
  });

  it("creates a deterministic, bounded living-district directive from authoritative results", () => {
    const inputs: DayPlayerInput[] = VENTURES.slice(0, 2).map((venture) => ({
      playerId: venture.id,
      ventureId: venture.id,
      business: createBusinessState(),
      decision: { priceTier: venture.id === VENTURES[0]!.id ? "premium" : "standard", actionId: venture.id === VENTURES[0]!.id ? "marketing" : "hold" }
    }));
    const outputs = calculateDay(1, steady, inputs, 42);
    const first = createWorldDirective(1, steady, inputs, outputs, 99, 1_000, 22_000);
    const second = createWorldDirective(1, steady, inputs, outputs, 99, 1_000, 22_000);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ day: 1, seed: 99, startsAt: 1_000, endsAt: 23_000, eventVisual: "clear" });
    expect(first.businesses).toHaveLength(2);
    expect(first.businesses[0]).toMatchObject({ priceTier: "premium", marketingSpend: 150 });
    expect(first.businesses[1]).toMatchObject({ priceTier: "standard", marketingSpend: 0 });
    expect(first.customerCohorts.reduce((sum, cohort) => sum + cohort.representedCustomers, 0)).toBe(first.businesses.reduce((sum, business) => sum + business.representedCustomers, 0));
    expect(first.customerCohorts.every((cohort) => ["price", "wait", "trust", "marketing", "capacity"].includes(cohort.reason))).toBe(true);
    for (const business of first.businesses) {
      expect(business.representedCustomers).toBeGreaterThanOrEqual(6);
      expect(business.satisfaction).toBeGreaterThanOrEqual(8);
      expect(business.satisfaction).toBeLessThanOrEqual(98);
      expect(business.conversionRate).toBeGreaterThan(0);
      expect(business.conversionRate).toBeLessThanOrEqual(100);
    }
  });

  it("reconciles each daily cash bridge and produces an actionable financial insight", () => {
    const output = calculateDay(1, steady, [{ playerId: "p", ventureId: "cafe", business: createBusinessState(), decision: { priceTier: "standard", actionId: "overtime" } }], 7)[0]!;
    const bridge = output.result.cashBridge;
    expect(bridge.beginningCash + bridge.customerReceipts - bridge.inventoryPurchases - bridge.payroll - bridge.overhead - bridge.operatingActions - bridge.incidents - bridge.recruitmentAndRetraining - bridge.interestAndFees - bridge.capitalExpenditure + bridge.loanProceeds - bridge.loanRepayments).toBe(bridge.endingCash);
    expect(bridge.netChange).toBe(bridge.endingCash - bridge.beginningCash);
    expect(output.result.insight.title.length).toBeGreaterThan(3);
    expect(output.result.insight.nextMove.length).toBeGreaterThan(10);
  });

  it("charges turnover when morale crosses the resignation threshold and sends a staff event", () => {
    const business = { ...createBusinessState(), morale: 34 };
    const inputs: DayPlayerInput[] = [{ playerId: "p", ventureId: "cafe", business, decision: { priceTier: "standard", actionId: "hold" } }];
    const output = calculateDay(1, steady, inputs, 9)[0]!;
    expect(output.result.turnover.triggered).toBe(true);
    expect(output.result.expenseBreakdown.recruitmentAndRetraining).toBeGreaterThanOrEqual(250);
    expect(output.business.turnoverRiskArmed).toBe(false);
    const directive = createWorldDirective(1, steady, inputs, [output], 10, 1_000, 20_000);
    expect(directive.staffEvents).toMatchObject([{ type: "resignation", playerId: "p", count: 1 }]);
  });

  it("makes inventory purchases a cash-flow item while recognizing only sold inventory in profit", () => {
    const output = calculateDay(1, steady, [{ playerId: "p", ventureId: "online-shop", business: createBusinessState(), decision: { priceTier: "premium", actionId: "hold", inventoryPolicy: "stock_up" } }], 11)[0]!;
    expect(output.result.inventory.endingValue).toBeGreaterThan(0);
    expect(output.result.inventory.purchaseCashOutflow).toBeGreaterThan(output.result.expenseBreakdown.costOfSales);
    expect(output.result.inventory.cashConversionGap).toBeGreaterThan(0);
    const statements = buildFinancialStatements(output.business);
    expect(statements.balanceSheet.assets.inventory).toBe(output.business.inventoryValue);
    expect(statements.balanceSheet.balances).toBe(true);
    expect(statements.cashFlow.reconciles).toBe(true);
  });

  it("applies the forecast weekly rate to intentional borrowing without consuming the rescue loan", () => {
    const spike = { id: "spike" as const, label: "Spike", weeklyRateBps: 700, description: "" };
    const output = calculateDay(1, steady, [{ playerId: "p", ventureId: "cafe", business: createBusinessState(), decision: { priceTier: "standard", actionId: "hold", financingAction: "borrow_1000" } }], 12, spike)[0]!;
    expect(output.business.voluntaryDebt).toBe(1_000);
    expect(output.result.expenseBreakdown.interest).toBe(70);
    expect(output.business.loanUsed).toBe(false);
  });

  it("ranks by quality-adjusted company valuation instead of accumulated cash", () => {
    const base = createBusinessState();
    const operating = calculateDay(1, steady, [{ playerId: "operator", ventureId: "cafe", business: base, decision: { priceTier: "standard", actionId: "hold" } }], 13)[0]!.business;
    const cashHoarder = { ...createBusinessState(), cash: 8_000, history: [{ ...operating.history[0]!, ebitda: -50 }] };
    const rankings = rankBusinesses([{ playerId: "operator", business: operating }, { playerId: "cash", business: cashHoarder }]);
    expect(rankings[0]?.playerId).toBe("operator");
    expect(rankings[0]?.valuationBreakdown.annualizedEbitda).toBeGreaterThan(0);
  });
});
