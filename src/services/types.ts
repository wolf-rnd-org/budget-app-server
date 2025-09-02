// src/services/types.ts
export interface BudgetsFields {
  program_id?: string;      
  total_budget?: number;    
  total_expenses?: number;  
  remaining_balance?: number;
}

export interface ExpensesFields {
  project?: string;         
  amount?: number;         
}
