export default function methodOverride(req, res, next) {
    if (req.method !== "POST") return next();

    const hdr = (req.headers["x-http-method-override"] || "").toUpperCase();
    const qry = (req.query?._method || "").toString().toUpperCase();

    const override = hdr || qry;
    const allowed = ["PATCH", "PUT", "DELETE"];

    if (allowed.includes(override)) {
        req.method = override;
    }

    next();
}
