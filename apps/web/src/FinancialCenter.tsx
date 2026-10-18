import { useEffect, useMemo, useState } from "react";
import { buildFinancialStatements, getVenture, type PublicPlayer, type RankingEntry } from "@market-rush/shared";

type StatementTab = "pnl" | "balance" | "cash";

const money = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toLocaleString()}`;
const outflow = (value: number) => value === 0 ? "$0" : `(${money(Math.abs(value))})`;

function Row({ label, value, strong = false, total = false, hint }: { label: string; value: number; strong?: boolean; total?: boolean; hint?: string }) {
  return <div className={`statement-row ${strong ? "statement-row--strong" : ""} ${total ? "statement-row--total" : ""}`}>
    <span>{label}{hint && <small>{hint}</small>}</span><b>{money(value)}</b>
  </div>;
}

function ExpenseRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className="statement-row statement-row--indent"><span>{label}{hint && <small>{hint}</small>}</span><b>{value < 0 ? money(-value) : outflow(value)}</b></div>;
}

export function FinancialCenter({ players, rankings }: { players: PublicPlayer[]; rankings: RankingEntry[] }) {
  const reportingPlayers = useMemo(() => rankings.map((ranking) => players.find((player) => player.id === ranking.playerId)).filter((player): player is PublicPlayer => Boolean(player?.business)), [players, rankings]);
  const [selectedId, setSelectedId] = useState(reportingPlayers[0]?.id ?? "");
  const [tab, setTab] = useState<StatementTab>("pnl");
  useEffect(() => {
    if (!reportingPlayers.some((player) => player.id === selectedId)) setSelectedId(reportingPlayers[0]?.id ?? "");
  }, [reportingPlayers, selectedId]);
  const selected = reportingPlayers.find((player) => player.id === selectedId) ?? reportingPlayers[0];
  if (!selected?.business) return null;
  const statements = buildFinancialStatements(selected.business);
  const pnl = statements.profitAndLoss;
  const balance = statements.balanceSheet;
  const cash = statements.cashFlow;

  return <section className="financial-center">
    <div className="financial-heading">
      <div><div className="eyebrow">SIX-WEEK FINANCIAL REPORT</div><h2>Open the books.</h2><p>See how inventory, capital investment, and debt separate accounting profit from cash.</p></div>
      <span className={`reconcile-badge ${balance.balances && cash.reconciles ? "reconcile-badge--yes" : ""}`}>{balance.balances && cash.reconciles ? "✓ Statements reconciled" : "Review required"}</span>
    </div>
    <div className="founder-tabs" role="tablist" aria-label="Choose a founder’s statements">
      {reportingPlayers.map((player) => {
        const rank = rankings.find((entry) => entry.playerId === player.id)?.rank;
        return <button key={player.id} role="tab" aria-selected={selected.id === player.id} className={selected.id === player.id ? "founder-tab founder-tab--active" : "founder-tab"} onClick={() => setSelectedId(player.id)}><span>{getVenture(player.ventureId ?? "")?.emoji}</span><div><strong>{player.nickname}</strong><small>#{rank}{player.isBot ? " · BOT" : ""}</small></div></button>;
      })}
    </div>
    <div className="statement-shell">
      <div className="statement-nav" role="tablist" aria-label="Financial statement">
        <button role="tab" aria-selected={tab === "pnl"} onClick={() => setTab("pnl")} className={tab === "pnl" ? "active" : ""}>P&amp;L statement</button>
        <button role="tab" aria-selected={tab === "balance"} onClick={() => setTab("balance")} className={tab === "balance" ? "active" : ""}>Balance sheet</button>
        <button role="tab" aria-selected={tab === "cash"} onClick={() => setTab("cash")} className={tab === "cash" ? "active" : ""}>Cash flow</button>
      </div>
      <div className="statement-paper">
        <div className="statement-title"><div><span>{getVenture(selected.ventureId ?? "")?.emoji}</span><div><h3>{selected.nickname}</h3><small>{getVenture(selected.ventureId ?? "")?.name} · End of Week 6</small></div></div><b>{tab === "pnl" ? "PROFIT & LOSS" : tab === "balance" ? "BALANCE SHEET" : "CASH FLOW STATEMENT"}</b></div>
        {tab === "pnl" && <div className="statement-body">
          <Row label="Sales revenue" value={pnl.revenue} />
          <ExpenseRow label="Cost of sales" value={pnl.costOfSales} hint="Materials or service delivery" />
          <Row label="Gross profit" value={pnl.grossProfit} strong />
          <div className="statement-section-label">OPERATING EXPENSES</div>
          <ExpenseRow label="Payroll" value={pnl.payroll} />
          <ExpenseRow label="Overhead" value={pnl.overhead} hint="Rent, tools, and recurring costs" />
          <ExpenseRow label="Operating actions" value={pnl.operatingActions} hint="Investments net of cost savings" />
          <ExpenseRow label="Incident responses" value={pnl.incidentCosts} />
          <ExpenseRow label="Recruitment & retraining" value={pnl.recruitmentAndRetraining} hint="Turnover cost caused by low morale" />
          <Row label="EBITDA" value={pnl.ebitda} strong hint="Earnings before interest, tax, depreciation, and amortization" />
          <Row label="Operating profit" value={pnl.operatingProfit} strong />
          <ExpenseRow label="Interest expense" value={pnl.interestExpense} />
          <ExpenseRow label="Emergency loan fees" value={pnl.loanFees} />
          <Row label="Net income" value={pnl.netIncome} total />
        </div>}
        {tab === "balance" && <div className="balance-grid">
          <div><div className="statement-section-label">ASSETS</div><Row label="Cash" value={balance.assets.cash} /><Row label="Inventory" value={balance.assets.inventory} hint="Purchased but not yet sold" /><Row label="Capacity assets" value={balance.assets.fixedAssets} /><Row label="Total assets" value={balance.assets.total} total /></div>
          <div><div className="statement-section-label">LIABILITIES</div><Row label="Planned loans payable" value={balance.liabilities.voluntaryLoans} /><Row label="Emergency loan payable" value={balance.liabilities.emergencyLoan} /><Row label="Total liabilities" value={balance.liabilities.total} strong /><div className="statement-section-label statement-section-label--spaced">OWNER’S EQUITY</div><Row label="Starting owner capital" value={balance.equity.ownerCapital} /><Row label="Retained earnings" value={balance.equity.retainedEarnings} /><Row label="Total equity" value={balance.equity.total} strong /><Row label="Liabilities + equity" value={balance.liabilities.total + balance.equity.total} total /></div>
        </div>}
        {tab === "cash" && <div className="statement-body">
          <Row label="Beginning cash balance" value={cash.beginningCash} strong />
          <div className="statement-section-label">OPERATING ACTIVITIES</div>
          <Row label="Cash received from customers" value={cash.operating.customerReceipts} />
          <Row label="Payments to suppliers" value={cash.operating.supplierPayments} />
          <Row label="Payments to employees" value={cash.operating.employeePayments} />
          <Row label="Overhead payments" value={cash.operating.overheadPayments} />
          <Row label="Actions and incident responses" value={cash.operating.actionAndIncidentPayments} />
          <Row label="Recruitment and retraining" value={cash.operating.recruitmentPayments} />
          <Row label="Interest and loan fees" value={cash.operating.interestAndFees} />
          <Row label="Net cash from operations" value={cash.operating.netCashFromOperations} strong />
          <div className="statement-section-label">INVESTING ACTIVITIES</div>
          <Row label="Capacity investments" value={cash.investing.capitalExpenditure} />
          <Row label="Net cash from investing" value={cash.investing.netCashFromInvesting} strong />
          <div className="statement-section-label">FINANCING ACTIVITIES</div>
          <Row label="Planned loan proceeds" value={cash.financing.voluntaryLoanProceeds} />
          <Row label="Emergency loan proceeds" value={cash.financing.emergencyLoanProceeds} />
          <Row label="Principal repayments" value={cash.financing.principalRepayments} />
          <Row label="Net cash from financing" value={cash.financing.netCashFromFinancing} strong />
          <Row label="Net change in cash" value={cash.netChangeInCash} strong />
          <Row label="Ending cash balance" value={cash.endingCash} total />
        </div>}
        <div className="statement-note">Learning model · Inventory becomes an expense when sold, while purchases affect cash immediately. Amounts are rounded to whole dollars.</div>
      </div>
    </div>
  </section>;
}
