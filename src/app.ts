import express from "express";
import cors from "cors";
import { notFound, errorHandler } from "./middlewares/errors.js";
import budgetRoutes from "./routes/budgets.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import programsRoutes from "./routes/programs.routes.js";
import authRoutes from "./routes/auth.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";

const app = express();
app.use(cors());
app.use(express.json());


app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/budgets", budgetRoutes);
app.use("/expenses", expensesRoutes);
app.use("/programs", programsRoutes);
app.use("/auth", authRoutes);
app.use("/budgets/documents", invoiceRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
