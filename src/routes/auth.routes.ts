import { Router } from "express";

const r = Router();

// GET /auth/me
r.get("/me", (_req, res) => {
  res.json({
    userId: 101,
    email: "demo@example.com",
    firstName: "Demo",
    lastName: "User",
    features: []
  });
});

export default r;
