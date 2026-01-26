import { type BlockState } from "./components/Block";

export interface BlockTemplate {
  id: string;
  name: string;
  category: "loans" | "income" | "investments" | "expenses";
  description: string;
  state: Omit<BlockState, "graphs"> & { graphs: [] };
}

// Get a date string for today
const today = new Date().toISOString().split("T")[0];

// Get a date string for 30 years from now
const thirtyYearsLater = new Date(
  new Date().getFullYear() + 30,
  new Date().getMonth(),
  new Date().getDate()
)
  .toISOString()
  .split("T")[0];

// Get a date string for retirement (assume 35 years from now for templates)
const retirementDate = new Date(
  new Date().getFullYear() + 35,
  new Date().getMonth(),
  new Date().getDate()
)
  .toISOString()
  .split("T")[0];

export const blockTemplates: BlockTemplate[] = [
  // LOANS
  {
    id: "home-loan",
    name: "Home Loan",
    category: "loans",
    description:
      "A standard mortgage with monthly payments. Tracks principal, interest portions, and updates property/debt values.",
    state: {
      title: "Home Loan",
      startDate: today,
      endDate: thirtyYearsLater,
      inputs: {
        down: "50000",
        principal: "350000",
        apr: "0.065",
      },
      init: `# Calculate loan parameters
asset_price = down + principal
monthly_interest = apr / 12
payment = principal * monthly_interest * (1 + monthly_interest) ** total_periods / ((1 + monthly_interest) ** total_periods - 1)

# Update global balances
property = property + asset_price
debts = debts + principal
cash = cash - down`,
      frequency: "monthly",
      execution: `# Calculate this month's breakdown
interest_portion = principal * monthly_interest
principal_portion = payment - interest_portion

# Update balances
principal = principal - principal_portion
debts = debts - principal_portion
cash = cash - payment`,
      exports: "interest_portion,principal_portion,payment",
      graphs: [],
    },
  },
  {
    id: "car-loan",
    name: "Car Loan",
    category: "loans",
    description:
      "An auto loan with fixed monthly payments over 3-7 years. Tracks vehicle depreciation separately from loan payoff.",
    state: {
      title: "Car Loan",
      startDate: today,
      endDate: new Date(
        new Date().getFullYear() + 5,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        down: "5000",
        principal: "25000",
        apr: "0.059",
      },
      init: `# Calculate loan parameters
vehicle_value = down + principal
monthly_interest = apr / 12
car_payment = principal * monthly_interest * (1 + monthly_interest) ** total_periods / ((1 + monthly_interest) ** total_periods - 1)

# Update global balances
property = property + vehicle_value
debts = debts + principal
cash = cash - down`,
      frequency: "monthly",
      execution: `# Calculate payment breakdown
car_interest = principal * monthly_interest
car_principal = car_payment - car_interest

# Update balances
principal = principal - car_principal
debts = debts - car_principal
cash = cash - car_payment

# Vehicle depreciation (roughly 15% per year)
vehicle_value = vehicle_value * 0.9875
property = property - vehicle_value * 0.0125`,
      exports: "car_payment,car_interest,car_principal",
      graphs: [],
    },
  },
  {
    id: "student-loan",
    name: "Student Loan",
    category: "loans",
    description:
      "A student loan with standard 10-year repayment. Supports federal loan average rates.",
    state: {
      title: "Student Loan",
      startDate: today,
      endDate: new Date(
        new Date().getFullYear() + 10,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        principal: "35000",
        apr: "0.055",
      },
      init: `# Calculate loan parameters
monthly_interest = apr / 12
student_payment = principal * monthly_interest * (1 + monthly_interest) ** total_periods / ((1 + monthly_interest) ** total_periods - 1)

# Update global balances
debts = debts + principal`,
      frequency: "monthly",
      execution: `# Calculate payment breakdown
student_interest = principal * monthly_interest
student_principal = student_payment - student_interest

# Update balances
principal = principal - student_principal
debts = debts - student_principal
cash = cash - student_payment`,
      exports: "student_payment,student_interest",
      graphs: [],
    },
  },

  // INCOME
  {
    id: "salary",
    name: "Monthly Salary",
    category: "income",
    description:
      "Regular monthly income with optional annual raises. Net income after taxes.",
    state: {
      title: "Monthly Salary",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        gross_monthly: "8000",
        tax_rate: "0.25",
        annual_raise: "0.03",
      },
      init: `# Calculate initial net income
net_salary = gross_monthly * (1 - tax_rate)`,
      frequency: "monthly",
      execution: `# Add net income to cash
cash = cash + net_salary

# Apply annual raise each January
yearly_month = periods_from_start % 12
net_salary = net_salary * (1 + annual_raise / 12)`,
      exports: "net_salary",
      graphs: [],
    },
  },
  {
    id: "social-security",
    name: "Social Security",
    category: "income",
    description:
      "Monthly Social Security benefits starting at retirement. Includes annual COLA adjustments.",
    state: {
      title: "Social Security",
      startDate: retirementDate,
      endDate: new Date(
        new Date().getFullYear() + 70,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        monthly_benefit: "2500",
        cola_rate: "0.025",
      },
      init: `# Initialize benefit amount
ss_benefit = monthly_benefit`,
      frequency: "monthly",
      execution: `# Add benefit to cash
cash = cash + ss_benefit

# Apply annual COLA increase
ss_benefit = ss_benefit * (1 + cola_rate / 12)`,
      exports: "ss_benefit",
      graphs: [],
    },
  },
  {
    id: "rental-income",
    name: "Rental Income",
    category: "income",
    description:
      "Monthly rental property income after expenses. Includes vacancy rate and maintenance costs.",
    state: {
      title: "Rental Income",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        monthly_rent: "2000",
        vacancy_rate: "0.05",
        maintenance_rate: "0.10",
      },
      init: `# Calculate effective rental income
effective_rent = monthly_rent * (1 - vacancy_rate) * (1 - maintenance_rate)`,
      frequency: "monthly",
      execution: `# Add rental income to cash
cash = cash + effective_rent`,
      exports: "effective_rent",
      graphs: [],
    },
  },

  // INVESTMENTS
  {
    id: "k401-contribution",
    name: "401(k) Contributions",
    category: "investments",
    description:
      "Monthly 401(k) contributions with employer match. Includes investment growth.",
    state: {
      title: "401(k) Contributions",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        monthly_contribution: "1500",
        employer_match_rate: "0.50",
        employer_match_limit: "0.06",
        annual_return: "0.07",
      },
      init: `# Calculate employer contribution (assumes 6% salary match)
# Adjust monthly_contribution to stay within limits
employer_contribution = monthly_contribution * employer_match_rate`,
      frequency: "monthly",
      execution: `# Add contributions
total_401k_contribution = monthly_contribution + employer_contribution
k401 = k401 + total_401k_contribution
cash = cash - monthly_contribution

# Apply monthly investment growth
monthly_return = annual_return / 12
k401 = k401 * (1 + monthly_return)`,
      exports: "total_401k_contribution",
      graphs: [],
    },
  },
  {
    id: "roth-ira",
    name: "Roth IRA Contributions",
    category: "investments",
    description:
      "Annual Roth IRA contributions up to the limit. Tax-free growth and withdrawals.",
    state: {
      title: "Roth IRA",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        annual_contribution: "7000",
        annual_return: "0.07",
      },
      init: `# Initialize Roth IRA balance (add to investments)
monthly_roth = annual_contribution / 12`,
      frequency: "monthly",
      execution: `# Add monthly contribution
investments = investments + monthly_roth
cash = cash - monthly_roth

# Apply monthly investment growth
monthly_return = annual_return / 12
investments = investments * (1 + monthly_return)`,
      exports: "monthly_roth",
      graphs: [],
    },
  },
  {
    id: "brokerage-investment",
    name: "Brokerage Investments",
    category: "investments",
    description:
      "Regular contributions to a taxable brokerage account with compound growth.",
    state: {
      title: "Brokerage Account",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        monthly_investment: "500",
        annual_return: "0.08",
      },
      init: `# Initialize investment tracking
monthly_return = annual_return / 12`,
      frequency: "monthly",
      execution: `# Add monthly contribution
investments = investments + monthly_investment
cash = cash - monthly_investment

# Apply compound growth
investments = investments * (1 + monthly_return)`,
      exports: "monthly_investment",
      graphs: [],
    },
  },
  {
    id: "bond-ladder",
    name: "Bond Portfolio",
    category: "investments",
    description:
      "Conservative bond investments with steady returns. Lower risk, lower return profile.",
    state: {
      title: "Bond Portfolio",
      startDate: today,
      endDate: retirementDate,
      inputs: {
        monthly_contribution: "300",
        annual_yield: "0.045",
      },
      init: `# Initialize bond tracking
monthly_yield = annual_yield / 12`,
      frequency: "monthly",
      execution: `# Add monthly contribution
bonds = bonds + monthly_contribution
cash = cash - monthly_contribution

# Apply bond yield
bonds = bonds * (1 + monthly_yield)`,
      exports: "monthly_contribution",
      graphs: [],
    },
  },

  // EXPENSES
  {
    id: "monthly-expenses",
    name: "Monthly Expenses",
    category: "expenses",
    description:
      "Fixed monthly living expenses including rent/utilities, food, transportation, etc.",
    state: {
      title: "Monthly Expenses",
      startDate: today,
      endDate: new Date(
        new Date().getFullYear() + 70,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        housing: "1500",
        food: "600",
        transportation: "400",
        utilities: "200",
        other: "300",
        inflation_rate: "0.03",
      },
      init: `# Calculate total monthly expenses
total_expenses = housing + food + transportation + utilities + other`,
      frequency: "monthly",
      execution: `# Deduct expenses from cash
cash = cash - total_expenses

# Apply inflation annually
total_expenses = total_expenses * (1 + inflation_rate / 12)`,
      exports: "total_expenses",
      graphs: [],
    },
  },
  {
    id: "emergency-fund",
    name: "Emergency Fund",
    category: "expenses",
    description:
      "Build an emergency fund with automatic contributions until target is reached.",
    state: {
      title: "Emergency Fund",
      startDate: today,
      endDate: new Date(
        new Date().getFullYear() + 5,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        monthly_contribution: "500",
        target_amount: "30000",
        savings_rate: "0.04",
      },
      init: `# Initialize emergency fund
emergency_fund = 0
monthly_savings_rate = savings_rate / 12`,
      frequency: "monthly",
      execution: `# Only contribute if below target
contribution = monthly_contribution
emergency_fund = emergency_fund + contribution
cash = cash - contribution

# Apply savings interest
emergency_fund = emergency_fund * (1 + monthly_savings_rate)`,
      exports: "emergency_fund",
      graphs: [],
    },
  },
  {
    id: "healthcare-costs",
    name: "Healthcare Costs",
    category: "expenses",
    description:
      "Monthly healthcare premiums and out-of-pocket costs. Increases faster than inflation.",
    state: {
      title: "Healthcare",
      startDate: today,
      endDate: new Date(
        new Date().getFullYear() + 70,
        new Date().getMonth(),
        new Date().getDate()
      )
        .toISOString()
        .split("T")[0],
      inputs: {
        monthly_premium: "400",
        monthly_outofpocket: "100",
        annual_increase: "0.05",
      },
      init: `# Calculate total healthcare cost
healthcare_cost = monthly_premium + monthly_outofpocket`,
      frequency: "monthly",
      execution: `# Deduct healthcare costs
cash = cash - healthcare_cost

# Apply annual healthcare inflation
healthcare_cost = healthcare_cost * (1 + annual_increase / 12)`,
      exports: "healthcare_cost",
      graphs: [],
    },
  },
];

// Helper to get templates by category
export function getTemplatesByCategory(
  category: BlockTemplate["category"]
): BlockTemplate[] {
  return blockTemplates.filter((t) => t.category === category);
}

// Get all categories with their templates
export function getTemplateCategories(): {
  category: BlockTemplate["category"];
  label: string;
  templates: BlockTemplate[];
}[] {
  return [
    { category: "income", label: "Income", templates: getTemplatesByCategory("income") },
    { category: "investments", label: "Investments", templates: getTemplatesByCategory("investments") },
    { category: "loans", label: "Loans", templates: getTemplatesByCategory("loans") },
    { category: "expenses", label: "Expenses", templates: getTemplatesByCategory("expenses") },
  ];
}
