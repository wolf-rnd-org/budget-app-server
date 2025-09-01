import express from "express";
import cors from "cors";
import budgetRoutes from "./routes/budget.routes.js";
import { notFound, errorHandler } from "./middlewares/errors.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// חשוב: הנתיב שהקליינט מצפה לו
app.use("/budget", budgetRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
