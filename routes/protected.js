import express from "express";
import { requireJwt } from "../middleware/jwt.js";

const router = express.Router();

router.get("/ping", requireJwt, (req, res) => {
    res.json({ ok: true, user: req.user });
});

export default router;
