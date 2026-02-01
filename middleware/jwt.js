import jwt from "jsonwebtoken";

export function requireJwt(req, res, next) {
    const auth = req.headers.authorization || "";
    const [type, token] = auth.split(" ");

    if (type !== "Bearer" || !token) {
        return res.status(401).json({ error: "Missing Bearer token" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
