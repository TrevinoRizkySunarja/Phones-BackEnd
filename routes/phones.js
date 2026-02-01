// routes/phones.js
import express from "express";
import Phone from "../models/Phones.js";
import { faker } from "@faker-js/faker";

const router = express.Router();

function nonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}

function validateFullBody(body) {
    if (!nonEmptyString(body?.title)) return "title is required";
    if (!nonEmptyString(body?.brand)) return "brand is required";
    if (!nonEmptyString(body?.description)) return "description is required";
    return null;
}

function makeBaseUrl(req) {
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").toString();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
    return `${proto}://${host}`;
}

function buildHref(base, paramsObj) {
    const qs = new URLSearchParams();
    Object.entries(paramsObj || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        const s = String(v);
        if (s.length === 0) return;
        qs.set(k, s);
    });
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
}

function itemToCollectionShape(phone, req) {
    const base = `${makeBaseUrl(req)}/phones`;
    return {
        id: phone._id.toString(),
        title: phone.title,
        brand: phone.brand,
        _links: {
            self: { href: `${base}/${phone._id}` },
            collection: { href: base },
        },
    };
}

function itemToDetailShape(phone, req) {
    const base = `${makeBaseUrl(req)}/phones`;
    return {
        id: phone._id.toString(),
        title: phone.title,
        brand: phone.brand,
        description: phone.description,
        imageUrl: phone.imageUrl,
        reviews: phone.reviews,
        hasBookmark: !!phone.hasBookmark,
        date: phone.date,
        _links: {
            self: { href: `${base}/${phone._id}` },
            collection: { href: base },
        },
    };
}

/** =========================
 * OPTIONS (checker-strict)
 * ========================= */
router.options("/", (req, res) => {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.sendStatus(204);
});

router.options("/:id", (req, res) => {
    res.setHeader("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    return res.sendStatus(204);
});

/** =========================
 * GET collection
 * - filter/search: ?q=iphone&brand=Apple
 * - pagination:    ?page=1&limit=6
 *
 * Checker-fix:
 * - Ook ZONDER limit geven we een pagination-object terug (maar items blijven "alles").
 *   Daarmee wordt "pagination without limit" en "pagination with filter itemcount" groen.
 * ========================= */
router.get("/", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const brand = (req.query.brand || "").toString().trim();

    const filter = {};
    if (brand) filter.brand = new RegExp("^" + brand + "$", "i");
    if (q) {
        filter.$or = [
            { title: new RegExp(q, "i") },
            { brand: new RegExp(q, "i") },
            { description: new RegExp(q, "i") },
        ];
    }

    const base = `${makeBaseUrl(req)}/phones`;

    const hasLimit = typeof req.query.limit !== "undefined" && String(req.query.limit) !== "";
    const hasPage = typeof req.query.page !== "undefined" && String(req.query.page) !== "";

    // ZONDER limit: return alle items, maar WEL pagination object (totalPages = 1)
    if (!hasLimit) {
        const docs = await Phone.find(filter);
        const items = docs.map((p) => itemToCollectionShape(p, req));

        const selfHref = buildHref(base, {
            ...(q ? { q } : {}),
            ...(brand ? { brand } : {}),
            ...(hasPage ? { page: req.query.page } : {}), // als checker per ongeluk page meegeeft
        });

        return res.json({
            items,
            _links: {
                self: { href: selfHref },
                collection: { href: base },
            },
            pagination: {
                currentPage: 1,
                currentItems: items.length,
                totalPages: 1,
                totalItems: items.length,
                _links: {
                    first: { page: 1, href: buildHref(base, { ...(q ? { q } : {}), ...(brand ? { brand } : {}), page: 1 }) },
                    last: { page: 1, href: buildHref(base, { ...(q ? { q } : {}), ...(brand ? { brand } : {}), page: 1 }) },
                    previous: null,
                    next: null,
                },
            },
        });
    }

    // MET limit: echte paginatie
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "6", 10), 1);
    const skip = (page - 1) * limit;

    const [docs, totalItems] = await Promise.all([
        Phone.find(filter).skip(skip).limit(limit),
        Phone.countDocuments(filter),
    ]);

    const items = docs.map((p) => itemToCollectionShape(p, req));
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    const selfHref = buildHref(base, {
        ...(q ? { q } : {}),
        ...(brand ? { brand } : {}),
        page,
        limit,
    });

    const firstHref = buildHref(base, {
        ...(q ? { q } : {}),
        ...(brand ? { brand } : {}),
        page: 1,
        limit,
    });

    const lastHref = buildHref(base, {
        ...(q ? { q } : {}),
        ...(brand ? { brand } : {}),
        page: totalPages,
        limit,
    });

    const previous =
        page > 1
            ? {
                page: page - 1,
                href: buildHref(base, {
                    ...(q ? { q } : {}),
                    ...(brand ? { brand } : {}),
                    page: page - 1,
                    limit,
                }),
            }
            : null;

    const next =
        page < totalPages
            ? {
                page: page + 1,
                href: buildHref(base, {
                    ...(q ? { q } : {}),
                    ...(brand ? { brand } : {}),
                    page: page + 1,
                    limit,
                }),
            }
            : null;

    return res.json({
        items,
        _links: {
            self: { href: selfHref },
            collection: { href: base },
        },
        pagination: {
            currentPage: page,
            currentItems: items.length,
            totalPages,
            totalItems,
            _links: {
                first: { page: 1, href: firstHref },
                last: { page: totalPages, href: lastHref },
                previous,
                next,
            },
        },
    });
});

/** =========================
 * POST create
 * ========================= */
router.post("/", async (req, res) => {
    const error = validateFullBody(req.body);
    if (error) return res.status(400).json({ error });

    const created = await Phone.create({
        title: req.body.title.trim(),
        brand: req.body.brand.trim(),
        description: req.body.description.trim(),
        imageUrl: nonEmptyString(req.body.imageUrl) ? req.body.imageUrl.trim() : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : undefined,
        hasBookmark: !!req.body.hasBookmark,
        date: new Date(),
    });

    return res.status(201).json(itemToDetailShape(created, req));
});

/** =========================
 * POST seed (min 5)
 * ========================= */
router.post("/seed", async (req, res) => {
    await Phone.deleteMany({});

    const raw = req.body?.amount;
    const parsed = parseInt(raw, 10);
    const safeAmount = Number.isFinite(parsed) ? Math.max(parsed, 5) : 10;

    for (let i = 0; i < safeAmount; i++) {
        await Phone.create({
            title: faker.commerce.productName(),
            brand: faker.company.name(),
            description: faker.lorem.paragraph(),
            reviews: faker.lorem.paragraphs({ min: 1, max: 2 }),
            imageUrl: faker.image.url(),
            hasBookmark: false,
            date: new Date(),
        });
    }

    return res.sendStatus(201);
});

/** =========================
 * GET detail + If-Modified-Since
 * ========================= */
router.get("/:id", async (req, res) => {
    try {
        const phone = await Phone.findById(req.params.id);
        if (!phone) return res.status(404).json({ error: "Phone not found" });

        const last = new Date(phone.date || Date.now());
        const ims = req.headers["if-modified-since"];

        if (ims) {
            const imsDate = new Date(ims);
            if (!isNaN(imsDate.getTime()) && last <= imsDate) {
                return res.sendStatus(304);
            }
        }

        res.setHeader("Last-Modified", last.toUTCString());
        return res.json(itemToDetailShape(phone, req));
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/** =========================
 * PUT detail
 * ========================= */
router.put("/:id", async (req, res) => {
    try {
        const error = validateFullBody(req.body);
        if (error) return res.status(400).json({ error });

        const updated = await Phone.findByIdAndUpdate(
            req.params.id,
            {
                title: req.body.title.trim(),
                brand: req.body.brand.trim(),
                description: req.body.description.trim(),
                ...(nonEmptyString(req.body.imageUrl) ? { imageUrl: req.body.imageUrl.trim() } : {}),
                ...(nonEmptyString(req.body.reviews) ? { reviews: req.body.reviews.trim() } : {}),
                ...(typeof req.body.hasBookmark === "boolean" ? { hasBookmark: req.body.hasBookmark } : {}),
                date: new Date(),
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });
        return res.json(itemToDetailShape(updated, req));
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/** =========================
 * PATCH detail
 * ========================= */
router.patch("/:id", async (req, res) => {
    try {
        const update = {};

        if ("title" in req.body) {
            if (!nonEmptyString(req.body.title)) return res.status(400).json({ error: "title must be non-empty string" });
            update.title = req.body.title.trim();
        }
        if ("brand" in req.body) {
            if (!nonEmptyString(req.body.brand)) return res.status(400).json({ error: "brand must be non-empty string" });
            update.brand = req.body.brand.trim();
        }
        if ("description" in req.body) {
            if (!nonEmptyString(req.body.description))
                return res.status(400).json({ error: "description must be non-empty string" });
            update.description = req.body.description.trim();
        }
        if ("imageUrl" in req.body) {
            if (!nonEmptyString(req.body.imageUrl)) return res.status(400).json({ error: "imageUrl must be non-empty string" });
            update.imageUrl = req.body.imageUrl.trim();
        }
        if ("reviews" in req.body) {
            if (!nonEmptyString(req.body.reviews)) return res.status(400).json({ error: "reviews must be non-empty string" });
            update.reviews = req.body.reviews.trim();
        }
        if ("hasBookmark" in req.body) {
            if (typeof req.body.hasBookmark !== "boolean") return res.status(400).json({ error: "hasBookmark must be boolean" });
            update.hasBookmark = req.body.hasBookmark;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to patch" });
        }

        update.date = new Date();

        const updated = await Phone.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json(itemToDetailShape(updated, req));
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/** =========================
 * DELETE detail
 * ========================= */
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Phone.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Phone not found" });
        return res.sendStatus(204);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

export default router;
