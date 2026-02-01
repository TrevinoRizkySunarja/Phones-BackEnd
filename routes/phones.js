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

function baseUrl(req) {
    // Gebruik request host zodat je server IP/host klopt in checker
    return `${req.protocol}://${req.get("host")}`;
}

function collectionHref(req) {
    return `${baseUrl(req)}/phones`;
}

function buildSelfHref(req) {
    const base = collectionHref(req);
    const qs = new URLSearchParams();

    // voeg alle query params toe zoals ze in request staan
    for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "undefined") continue;
        if (v === "") continue;
        qs.set(k, String(v));
    }

    const s = qs.toString();
    return s ? `${base}?${s}` : base;
}

function phoneLinks(req, id) {
    const base = baseUrl(req);
    return {
        self: { href: `${base}/phones/${id}` },
        collection: { href: `${base}/phones` },
    };
}

function mapCollectionItem(req, doc) {
    return {
        id: doc.id,
        title: doc.title,
        brand: doc.brand,
        _links: phoneLinks(req, doc.id),
    };
}

function buildFilter(req) {
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
    return filter;
}

/* -----------------------------
   OPTIONS collection
   Checker verwacht vaak 204
------------------------------ */
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.sendStatus(204);
});

/* -----------------------------
   SEED (moet vóór /:id)
   minimaal 5 items
------------------------------ */
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
            imageUrl: faker.image.url(),
            reviews: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 2 })),
            hasBookmark: false,
            date: new Date(),
        });
    }

    return res.sendStatus(201);
});

/* -----------------------------
   GET collection
   - Zonder page & zonder limit: alles tonen (geen pagination)
   - Met page of limit: pagination object verplicht (checker)
   Supports:
   ?page=1&limit=10&q=iphone&brand=Apple
------------------------------ */
router.get("/", async (req, res) => {
    const filter = buildFilter(req);

    const hasPage = typeof req.query.page !== "undefined" && req.query.page !== "";
    const hasLimit = typeof req.query.limit !== "undefined" && req.query.limit !== "";

    const selfHref = buildSelfHref(req);
    const collHref = collectionHref(req);

    // "normale" collectie (zonder pagination params): alles tonen
    if (!hasPage && !hasLimit) {
        const docs = await Phone.find(filter).select("title brand");
        const items = docs.map((d) => mapCollectionItem(req, d));

        return res.json({
            items,
            _links: {
                self: { href: selfHref },        // inclusief q/brand als die aanwezig zijn
                collection: { href: collHref },  // altijd /phones
            },
        });
    }

    // pagination mode (checker): page kan bestaan zonder limit
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);

    // als limit ontbreekt, gebruik een default (checker verwacht pagination object)
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);

    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
        Phone.find(filter).select("title brand").skip(skip).limit(limit),
        Phone.countDocuments(filter),
    ]);

    const items = docs.map((d) => mapCollectionItem(req, d));
    const pages = Math.ceil(total / limit);

    // self link moet exact huidige request weerspiegelen.
    // maar zorg dat page/limit er sowieso in zitten in pagination-mode.
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "undefined" || v === "") continue;
        qs.set(k, String(v));
    }
    qs.set("page", String(page));
    qs.set("limit", String(limit));
    const selfWithPaging = `${collHref}?${qs.toString()}`;

    return res.json({
        items,
        pagination: {
            page,
            limit,
            total,
            pages,
        },
        _links: {
            self: { href: selfWithPaging },
            collection: { href: collHref },
        },
    });
});

/* -----------------------------
   POST create
------------------------------ */
router.post("/", async (req, res) => {
    const error = validateFullBody(req.body);
    if (error) return res.status(400).json({ error });

    const created = await Phone.create({
        title: req.body.title.trim(),
        brand: req.body.brand.trim(),
        description: req.body.description.trim(),
        imageUrl: nonEmptyString(req.body.imageUrl) ? req.body.imageUrl.trim() : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : "",
        hasBookmark: typeof req.body.hasBookmark === "boolean" ? req.body.hasBookmark : false,
        date: new Date(),
    });

    return res.status(201).json({
        id: created.id,
        title: created.title,
        brand: created.brand,
        description: created.description,
        imageUrl: created.imageUrl,
        reviews: created.reviews,
        hasBookmark: created.hasBookmark,
        date: created.date,
        _links: phoneLinks(req, created.id),
    });
});

/* -----------------------------
   OPTIONS detail
------------------------------ */
router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    return res.sendStatus(204);
});

/* -----------------------------
   GET detail + If-Modified-Since
------------------------------ */
router.get("/:id", async (req, res) => {
    try {
        const phone = await Phone.findById(req.params.id);
        if (!phone) return res.status(404).json({ error: "Phone not found" });

        const last = new Date(phone.date || Date.now());
        const ims = req.headers["if-modified-since"];

        if (ims) {
            const imsDate = new Date(ims);
            if (!Number.isNaN(imsDate.getTime()) && last <= imsDate) {
                return res.status(304).send();
            }
        }

        res.setHeader("Last-Modified", last.toUTCString());

        return res.json({
            id: phone.id,
            title: phone.title,
            brand: phone.brand,
            description: phone.description,
            imageUrl: phone.imageUrl,
            reviews: phone.reviews,
            hasBookmark: phone.hasBookmark,
            date: phone.date,
            _links: phoneLinks(req, phone.id),
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/* -----------------------------
   PUT (full replace)
------------------------------ */
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

        return res.json({
            id: updated.id,
            title: updated.title,
            brand: updated.brand,
            description: updated.description,
            imageUrl: updated.imageUrl,
            reviews: updated.reviews,
            hasBookmark: updated.hasBookmark,
            date: updated.date,
            _links: phoneLinks(req, updated.id),
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/* -----------------------------
   PATCH (partial)
------------------------------ */
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
            if (!nonEmptyString(req.body.description)) return res.status(400).json({ error: "description must be non-empty string" });
            update.description = req.body.description.trim();
        }
        if ("imageUrl" in req.body) {
            if (!nonEmptyString(req.body.imageUrl)) return res.status(400).json({ error: "imageUrl must be non-empty string" });
            update.imageUrl = req.body.imageUrl.trim();
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

        return res.json({
            id: updated.id,
            title: updated.title,
            brand: updated.brand,
            description: updated.description,
            imageUrl: updated.imageUrl,
            reviews: updated.reviews,
            hasBookmark: updated.hasBookmark,
            date: updated.date,
            _links: phoneLinks(req, updated.id),
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

/* -----------------------------
   DELETE
------------------------------ */
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
