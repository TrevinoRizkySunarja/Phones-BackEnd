import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

function parseBasic(headerValue) {
    if (!headerValue) return null;
    const [type, value] = headerValue.split(" ");
    if (type !== "Basic" || !value) return null;

    const decoded = Buffer.from(value, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;

    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

router.post("/", (req, res) => {
    const creds = parseBasic(req.headers.authorization);
    if (!creds) {
        res.setHeader("WWW-Authenticate", "Basic");
        return res.status(401).json({ error: "Missing Basic Authorization" });
    }

    const ok =
        creds.user === process.env.BASIC_USER &&
        creds.pass === process.env.BASIC_PASS;

    if (!ok) {
        res.setHeader("WWW-Authenticate", "Basic");
        return res.status(401).json({ error: "Incorrect credentials" });
    }

    const token = jwt.sign(
        { sub: creds.user, role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );

    res.json({ token });
});

export default router;
