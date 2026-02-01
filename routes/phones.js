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

// helper: absolute base url voor links (werkt op server + checker)
function baseUrl(req) {
    return `${req.protocol}://${req.get("host")}`;
}

// helper: build self link incl query (zodat checker bij filter/pagination klopt)
function buildSelfHref(req) {
    const qs = new URLSearchParams(req.query).toString();
    return `${baseUrl(req)}${req.baseUrl}${req.path}${qs ? `?${qs}` : ""}`;
}

function itemDto(req, phone) {
    return {
        id: phone.id,
        title: phone.title,
        brand: phone.brand,
        _links: {
            self: { href: `${baseUrl(req)}/phones/${phone.id}` },
            collection: { href: `${baseUrl(req)}/phones` }
        }
    };
}

// OPTIONS collection (basic allow + CORS preflight headers)
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    return res.sendStatus(200);
});

// GET collection: pagination + filter/search
// - Checker wil pagination object (ook zonder limit)
// - Zonder limit: alle items terug, maar pagination object blijft aanwezig
// Query:
// ?page=1&limit=5&q=iphone&brand=Apple
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

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = req.query.limit ? Math.max(parseInt(req.query.limit, 10), 1) : null;

    const total = await Phone.countDocuments(filter);
    const pages = limit ? Math.max(Math.ceil(total / limit), 1) : 1;

    const docs = limit
        ? await Phone.find(filter).skip((page - 1) * limit).limit(limit)
        : await Phone.find(filter);

    const items = docs.map(p => itemDto(req, p));

    return res.json({
        items,
        pagination: {
            page,
            limit,          // null als er geen limit is
            pages,
            total,
            count: items.length
        },
        _links: {
            self: { href: buildSelfHref(req) },          // belangrijk voor filter/pagination checks
            collection: { href: `${baseUrl(req)}/phones` }
        }
    });
});

// POST create (201)
router.post("/", async (req, res) => {
    const error = validateFullBody(req.body);
    if (error) return res.status(400).json({ error });

    const created = await Phone.create({
        title: req.body.title.trim(),
        brand: req.body.brand.trim(),
        description: req.body.description.trim(),
        imageUrl: nonEmptyString(req.body.imageUrl) ? req.body.imageUrl.trim() : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : faker.lorem.paragraphs(2),
        hasBookmark: typeof req.body.hasBookmark === "boolean" ? req.body.hasBookmark : false,
        date: new Date()
    });

    // detail json incl links (checker ok)
    return res.status(201).json({
        ...created.toJSON(),
        _links: {
            self: { href: `${baseUrl(req)}/phones/${created.id}` },
            collection: { href: `${baseUrl(req)}/phones` }
        }
    });
});

// Seed (POST) — zorgt voor min 5 items (checker)
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
            reviews: faker.lorem.paragraphs(2),
            imageUrl: faker.image.url(),
            hasBookmark: false,
            date: new Date()
        });
    }

    return res.sendStatus(201);
});

// OPTIONS detail (basic allow + CORS preflight headers)
router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    return res.sendStatus(200);
});

// GET detail + If-Modified-Since
router.get("/:id", async (req, res) => {
    try {
        const phone = await Phone.findById(req.params.id);
        if (!phone) return res.status(404).json({ error: "Phone not found" });

        const last = new Date(phone.date || Date.now());
        const ims = req.headers["if-modified-since"];

        if (ims) {
            const imsDate = new Date(ims);
            if (!isNaN(imsDate.getTime()) && last <= imsDate) {
                return res.status(304).send();
            }
        }

        res.setHeader("Last-Modified", last.toUTCString());

        return res.json({
            ...phone.toJSON(),
            _links: {
                self: { href: `${baseUrl(req)}/phones/${phone.id}` },
                collection: { href: `${baseUrl(req)}/phones` }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// PUT detail (volledig vervangen)
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
                date: new Date()
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json({
            ...updated.toJSON(),
            _links: {
                self: { href: `${baseUrl(req)}/phones/${updated.id}` },
                collection: { href: `${baseUrl(req)}/phones` }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// PATCH detail (deels aanpassen)
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

        return res.json({
            ...updated.toJSON(),
            _links: {
                self: { href: `${baseUrl(req)}/phones/${updated.id}` },
                collection: { href: `${baseUrl(req)}/phones` }
            }
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// DELETE detail
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Phone.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Phone not found" });
        return res.status(204).send();
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

export default router;
