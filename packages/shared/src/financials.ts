import { STARTING_CASH } from "./config.js";
import type { BusinessState, FinancialStatements } from "./types.js";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function buildFinancialStatements(business: BusinessState): FinancialStatements {
  const days = business.history;
  const revenue = sum(days.map((day) => day.revenue));
  const costOfSales = sum(days.map((day) => day.expenseBreakdown.costOfSales));
  const payroll = sum(days.map((day) => day.expenseBreakdown.payroll));
  const overhead = sum(days.map((day) => day.expenseBreakdown.overhead));
  const operatingActions = sum(days.map((day) => day.expenseBreakdown.operatingActions));
  const incidentCosts = sum(days.map((day) => day.expenseBreakdown.incidents));
  const recruitmentAndRetraining = sum(days.map((day) => day.expenseBreakdown.recruitmentAndRetraining));
  const interestExpense = sum(days.map((day) => day.expenseBreakdown.interest));
  const loanFees = sum(days.map((day) => day.expenseBreakdown.loanFees));
  const grossProfit = revenue - costOfSales;
  const ebitda = grossProfit - payroll - overhead - operatingActions - incidentCosts - recruitmentAndRetraining;
  const operatingProfit = ebitda;
  const netIncome = operatingProfit - interestExpense - loanFees;
  const voluntaryLoanProceeds = sum(days.map((day) => day.financing.voluntaryLoanProceeds));
  const emergencyLoanProceeds = sum(days.map((day) => day.loanTriggered ? day.cashBridge.emergencyLoanProceeds : 0));
  const principalRepayments = sum(days.map((day) => day.financing.principalRepaid));
  const capitalExpenditure = sum(days.map((day) => day.capitalExpenditure));
  const inventoryPurchases = sum(days.map((day) => day.inventory.purchaseCashOutflow));
  const actionAndIncidentPayments = operatingActions + incidentCosts;
  const interestAndFees = interestExpense + loanFees;
  const netCashFromOperations = revenue - inventoryPurchases - payroll - overhead - actionAndIncidentPayments - recruitmentAndRetraining - interestAndFees;
  const netCashFromInvesting = -capitalExpenditure;
  const netCashFromFinancing = voluntaryLoanProceeds + emergencyLoanProceeds - principalRepayments;
  const netChangeInCash = netCashFromOperations + netCashFromInvesting + netCashFromFinancing;
  const equityTotal = STARTING_CASH + netIncome;
  const balanceTotal = business.debt + equityTotal;
  const assetTotal = business.cash + business.inventoryValue + business.fixedAssetValue;

  return {
    profitAndLoss: {
      revenue,
      costOfSales,
      grossProfit,
      payroll,
      overhead,
      operatingActions,
      incidentCosts,
      recruitmentAndRetraining,
      ebitda,
      operatingProfit,
      interestExpense,
      loanFees,
      netIncome
    },
    balanceSheet: {
      assets: { cash: business.cash, inventory: business.inventoryValue, fixedAssets: business.fixedAssetValue, total: assetTotal },
      liabilities: { voluntaryLoans: business.voluntaryDebt, emergencyLoan: business.emergencyDebt, total: business.debt },
      equity: { ownerCapital: STARTING_CASH, retainedEarnings: netIncome, total: equityTotal },
      balances: assetTotal === balanceTotal
    },
    cashFlow: {
      beginningCash: STARTING_CASH,
      operating: {
        customerReceipts: revenue,
        supplierPayments: -inventoryPurchases,
        employeePayments: -payroll,
        overheadPayments: -overhead,
        actionAndIncidentPayments: -actionAndIncidentPayments,
        recruitmentPayments: -recruitmentAndRetraining,
        interestAndFees: -interestAndFees,
        netCashFromOperations
      },
      investing: { capitalExpenditure: -capitalExpenditure, netCashFromInvesting },
      financing: { voluntaryLoanProceeds, emergencyLoanProceeds, principalRepayments: -principalRepayments, netCashFromFinancing },
      netChangeInCash,
      endingCash: business.cash,
      reconciles: STARTING_CASH + netChangeInCash === business.cash
    }
  };
}
