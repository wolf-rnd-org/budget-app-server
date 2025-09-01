import { z } from "zod";

export const ExpenseSchema = z.object({
  id: z.string(),
  budget: z.number(),           // בקליינט זה number
  project: z.string(),          // מזהה/מחרוזת של תוכנית
  date: z.string(),
  categories: z.union([z.array(z.string()), z.string()]),
  amount: z.number(),
  invoice_description: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  invoice_file: z.string().nullable().optional(),
  business_number: z.string().nullable().optional(),
  invoice_type: z.string().nullable().optional(),
  bank_details_file: z.string().nullable().optional(),
  supplier_email: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  user_id: z.union([z.number(), z.string()]),
});

export type Expense = z.infer<typeof ExpenseSchema>;
