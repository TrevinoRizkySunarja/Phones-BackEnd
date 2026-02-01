export default function requireJsonBody(req, res, next) {
    const m = req.method.toUpperCase();
    const needs = m === "POST" || m === "PUT" || m === "PATCH";

    if (!needs) return next();

    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json") && !ct.includes("multipart/form-data")) {
        return res.status(415).send("Unsupported Media Type: use application/json");
    }

    next();
}
