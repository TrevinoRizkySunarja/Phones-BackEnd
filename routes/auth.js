// routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

router.options("/", (req, res) => {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.sendStatus(204);
});

router.all("/", (req, res) => {
    const authHeader = req.headers.authorization || "";

    if (!authHeader) {
        res.setHeader("WWW-Authenticate", "Basic");
        return res.status(401).json({ error: "Missing Authorization header" });
    }

    const user = process.env.BASIC_USER || "student";
    const pass = process.env.BASIC_PASS || "cmgt";

    let decoded = authHeader;
    if (authHeader.startsWith("Basic ")) {
        decoded = Buffer.from(authHeader.substring(6), "base64").toString("utf8");
    }

    if (decoded.includes(user) && decoded.includes(pass)) {
        const token = jwt.sign(
            { sub: user, role: "user" },
            process.env.JWT_SECRET || "change_me",
            { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
        );
        return res.json({ token });
    }

    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).json({ error: "Incorrect credentials" });
});

export default router;