# About the project

This project is a financial planning calculator that takes a very configurable approach to financial planning.

It represents everything using a simple math language to enable building complex financial plans from the ground up.

For instance we can declare a large purchase using:

```
-- Purchase using a loan

-- Inputs
down_payment, original_principal, apr

-- Init
asset_price = down_payment + original_principal
current_principal = original_principal
payments = total_months
monthly_interest = apr / 12
payment = original_principal * (monthly_interest * (1 + monthly_interest)^(payments))/((1+monthly_interest)^(payments)-1)

-- Assets
asset_price

-- Liabilities
original_principal

-- Income

-- Expenses
down_payment

-- Monthly (can alternatively define a Yearly tag)
interest_portion = current_principal * monthly_interest
principal_portion = payment - interest_Portion
current_principal = current_principal - principal_portion
reduction_in_liability = -principal_portion

-- Assets

-- Liabilities
reduction_in_liability

-- Income

-- Expenses
payment

-- Graph
interest_portion, principal_portion
```

When the user wants to add this to their financial plan, they simply add this block, defining the start and end of the block period and then entering the inputs of the loan. If they wish to change the math behind the loan, they can actually open this pseudo-code as an interface and modify it!

The block receives default inputs such as the lenght of the block period which you can see was used in the original block without being defined
```
-- Default Inputs
total_months

-- Default Monthly Block Inputs
months_since_start

-- Default Yearly Block Inputs
years_since_start
```

A given block executes once the inputs are entered. It first runs the init block, then modifies the quantities and rates, the runs the monthly calculation for each month in the block period (or yearly)

# User Flow

The user will enter initially their current age. Assets and Liabilities (quantities) are initialized to 0 and income and expenses (rates) are also initialized to zero. This defines the starting point of the simulation and is displayed using two main graphs at the top of the page. The quantities graph shows assets - liabilities and the rates graph shows income - expenses. The main graphs always display from ages 0-100 and shows the corresponding year for those ages.

The quantities and rates are the 

The user can then begin adding blocks. The program will have a defined library of blocks, but users can of course also add custom blocks. These blocks use a simple math language, but in reality will be evaluated using `eval()` on the frontend, we simply disallow the use of `.{}[]'"` characters to prevent code execution. After the user has defined their equation, it is executed for each month in the timespan and the `Graph` values are shown using a stacked bar chart. All blocks by default also display quantity and rate charts for the block.

By adding a block, the quantity and rates values of that block are added to the main graph to form a complete financial picture.

Any block can be separated into many sections. Each section will use the same underlying block computation but the inputs can be modified. This enables the user to add their "Salary" as a single block where it grows at 2% per year but every 5 years there's a large jump. Note that since it's just javscript the user could also do `salary += months_since_start % 5 === 0 ? 100000 : 0` which is cool!

# Rules

* NEVER read package-lock.json, worker-configuration.d.ts