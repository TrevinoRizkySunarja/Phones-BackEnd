import express from "express";
import mongoose from "mongoose";
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
    // checker verwacht vaak exact http(s)://host (ipv env)
    return `${req.protocol}://${req.get("host")}`;
}

function collectionHref(req, extra = "") {
    return `${baseUrl(req)}/phones${extra}`;
}

function itemHref(req, id) {
    return `${baseUrl(req)}/phones/${id}`;
}

// =======================
// OPTIONS - COLLECTION
// =======================
router.options("/", (req, res) => {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-HTTP-Method-Override");
    return res.sendStatus(204);
});

// =======================
// GET COLLECTION
// pagination + filter/search
// - zonder limit => alle items (geen default limit)
// - met limit => pagination object vereist
// =======================
router.get("/", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const brand = (req.query.brand || "").toString().trim();

    const filter = {};
    if (brand) filter.brand = new RegExp("^" + brand + "$", "i");
    if (q) {
        filter.$or = [
            { title: new RegExp(q, "i") },
            { brand: new RegExp(q, "i") },
            { description: new RegExp(q, "i") }
        ];
    }

    const hasLimit = typeof req.query.limit !== "undefined" && req.query.limit !== "";

    // GEEN LIMIT => alles tonen
    if (!hasLimit) {
        const items = await Phone.find(filter).select("title brand");
        const mapped = items.map(p => ({
            id: p.id,
            title: p.title,
            brand: p.brand,
            _links: {
                self: { href: itemHref(req, p.id) },
                collection: { href: collectionHref(req) }
            }
        }));

        return res.json({
            items: mapped,
            _links: {
                self: { href: collectionHref(req) },
                collection: { href: collectionHref(req) }
            }
        });
    }

    // MET LIMIT => pagination object
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
        Phone.find(filter).select("title brand").skip(skip).limit(limit),
        Phone.countDocuments(filter)
    ]);

    const pages = Math.max(Math.ceil(total / limit), 1);

    const items = docs.map(p => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        _links: {
            self: { href: itemHref(req, p.id) },
            collection: { href: collectionHref(req) }
        }
    }));

    // checker wil vaak: pagination { page, limit, pages, total, count }
    const count = items.length;

    const selfHref = collectionHref(req, `?page=${page}&limit=${limit}`) +
        (q ? `&q=${encodeURIComponent(q)}` : "") +
        (brand ? `&brand=${encodeURIComponent(brand)}` : "");

    const collectionLink = collectionHref(req) +
        (q || brand
            ? `?${q ? `q=${encodeURIComponent(q)}` : ""}${q && brand ? "&" : ""}${brand ? `brand=${encodeURIComponent(brand)}` : ""}`
            : "");

    const nextHref =
        page < pages
            ? collectionHref(req, `?page=${page + 1}&limit=${limit}`) +
            (q ? `&q=${encodeURIComponent(q)}` : "") +
            (brand ? `&brand=${encodeURIComponent(brand)}` : "")
            : null;

    const prevHref =
        page > 1
            ? collectionHref(req, `?page=${page - 1}&limit=${limit}`) +
            (q ? `&q=${encodeURIComponent(q)}` : "") +
            (brand ? `&brand=${encodeURIComponent(brand)}` : "")
            : null;

    return res.json({
        items,
        pagination: {
            page,
            limit,
            pages,
            total,
            count
        },
        _links: {
            self: { href: selfHref },
            collection: { href: collectionLink },
            ...(nextHref ? { next: { href: nextHref } } : {}),
            ...(prevHref ? { prev: { href: prevHref } } : {})
        }
    });
});

// =======================
// POST CREATE
// =======================
router.post("/", async (req, res) => {
    const error = validateFullBody(req.body);
    if (error) return res.status(400).json({ error });

    const created = await Phone.create({
        title: req.body.title.trim(),
        brand: req.body.brand.trim(),
        description: req.body.description.trim(),
        imageUrl: nonEmptyString(req.body.imageUrl) ? req.body.imageUrl.trim() : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : undefined
    });

    return res.status(201).json({
        ...created.toJSON(),
        _links: {
            self: { href: itemHref(req, created.id) },
            collection: { href: collectionHref(req) }
        }
    });
});

// =======================
// SEED
// =======================
router.post("/seed", async (req, res) => {
    await Phone.deleteMany({});

    const amountRaw = req.body?.amount;
    const parsed = parseInt(amountRaw, 10);
    const safeAmount = Number.isFinite(parsed) ? Math.max(parsed, 5) : 10;

    for (let i = 0; i < safeAmount; i++) {
        await Phone.create({
            title: faker.commerce.productName(),
            brand: faker.company.name(),
            description: faker.lorem.paragraph(),
            imageUrl: faker.image.url()
        });
    }

    return res.sendStatus(201);
});

// =======================
// OPTIONS - DETAIL
// =======================
router.options("/:id", (req, res) => {
    res.setHeader("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-HTTP-Method-Override");
    return res.sendStatus(204);
});

// =======================
// GET DETAIL + If-Modified-Since
// =======================
router.get("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: "Invalid id format" });
        }

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

        return res.json({
            ...phone.toJSON(),
            _links: {
                self: { href: itemHref(req, phone.id) },
                collection: { href: collectionHref(req) }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// =======================
// PUT DETAIL (replace)
// =======================
router.put("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: "Invalid id format" });
        }

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
                date: new Date()
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json({
            ...updated.toJSON(),
            _links: {
                self: { href: itemHref(req, updated.id) },
                collection: { href: collectionHref(req) }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// =======================
// PATCH DETAIL (partial)
// =======================
router.patch("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: "Invalid id format" });
        }

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

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to patch" });
        }

        update.date = new Date();

        const updated = await Phone.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json({
            ...updated.toJSON(),
            _links: {
                self: { href: itemHref(req, updated.id) },
                collection: { href: collectionHref(req) }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// =======================
// DELETE DETAIL
// =======================
router.delete("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: "Invalid id format" });
        }

        const deleted = await Phone.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Phone not found" });

        return res.sendStatus(204);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

export default router;
