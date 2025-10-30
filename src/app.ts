import express from "express";
import cors from "cors";
import { notFound, errorHandler } from "./middlewares/errors.js";
import budgetRoutes from "./routes/budgets.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import programsRoutes from "./routes/programs.routes.js";
import authRoutes from "./routes/auth.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import budgetsRoutes from "./routes/budgets.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import fundingSourcesRouter from "./routes/fundingSources.router.js";
import emailRouter from './routes/email.routes.js'; 

const app = express();
app.use(cors());
// Ensure large JSON payloads (e.g., base64 attachments) are parsed before routes
app.use(express.json({ limit: '15mb' }));


app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/budgets/categories", categoriesRoutes);
app.use("/budgets/funding-sources", fundingSourcesRouter);
app.use("/budgets", budgetRoutes);
app.use("/expenses", expensesRoutes);
app.use("/programs", programsRoutes);
app.use("/categories", categoriesRoutes);
app.use("/auth", authRoutes);
app.use("/documents", invoiceRoutes);
app.use("/" /* או "/api" */, budgetsRoutes);
app.use('/api/emails', emailRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
