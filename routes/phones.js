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

// OPTIONS collection
router.options("/", (req, res) => {
    res.header("Allow", "GET, POST, OPTIONS");
    res.status(204).send();
});

// GET collection: pagination + filter/search
// ?page=1&limit=10&q=iphone&brand=Apple
// Zonder limit => alle items (geen default limit)
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
    if (!hasLimit) {
        const items = await Phone.find(filter).select("title brand");
        return res.json({
            items,
            _links: {
                self: { href: `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/phones` }
            }
        });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        Phone.find(filter).select("title brand").skip(skip).limit(limit),
        Phone.countDocuments(filter)
    ]);

    res.json({
        page,
        limit,
        total,
        items,
        _links: {
            self: { href: `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/phones?page=${page}&limit=${limit}` }
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
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : undefined
    });

    res.status(201).json(created);
});

// Seed (POST)
router.post("/seed", async (req, res) => {
    await Phone.deleteMany({});

    const amountRaw = req.body?.amount;
    const amount = Number.isFinite(amountRaw) ? amountRaw : parseInt(amountRaw || "10", 10);
    const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 10;

    for (let i = 0; i < safeAmount; i++) {
        await Phone.create({
            title: faker.commerce.productName(),
            brand: faker.company.name(),
            description: faker.lorem.paragraph(2),
            reviews: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 2 })),
            imageUrl: faker.image.url()
        });
    }

    res.status(201).send();
});

// OPTIONS detail
router.options("/:id", (req, res) => {
    res.header("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.status(204).send();
});

// GET detail + If-Modified-Since
router.get("/:id", async (req, res) => {
    try {
        const phone = await Phone.findById(req.params.id);
        if (!phone) return res.status(404).json({ error: "Phone not found" });

        const last = new Date(phone.date || Date.now()); // jij gebruikt date als last-modified basis
        const ims = req.headers["if-modified-since"];

        if (ims) {
            const imsDate = new Date(ims);
            if (!isNaN(imsDate.getTime()) && last <= imsDate) {
                return res.status(304).send();
            }
        }

        res.setHeader("Last-Modified", last.toUTCString());
        res.json(phone);
    } catch {
        res.status(400).json({ error: "Invalid id format" });
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
                date: new Date()
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });
        res.json(updated);
    } catch {
        res.status(400).json({ error: "Invalid id format" });
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

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to patch" });
        }

        update.date = new Date();

        const updated = await Phone.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!updated) return res.status(404).json({ error: "Phone not found" });

        res.json(updated);
    } catch {
        res.status(400).json({ error: "Invalid id format" });
    }
});

// POST overload: /phones/:id?_method=PATCH etc (handled in middleware) -> route blijft hetzelfde
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Phone.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Phone not found" });
        res.status(204).send();
    } catch {
        res.status(400).json({ error: "Invalid id format" });
    }
});

// Koppel imageUrl aan een phone via url (na upload)
// POST /phones/:id/image  body: { "imageUrl": "http://.../uploads/xxx.png" }
router.post("/:id/image", async (req, res) => {
    try {
        if (!nonEmptyString(req.body?.imageUrl)) {
            return res.status(400).json({ error: "imageUrl is required" });
        }

        const updated = await Phone.findByIdAndUpdate(
            req.params.id,
            { imageUrl: req.body.imageUrl.trim(), date: new Date() },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });
        res.json(updated);
    } catch {
        res.status(400).json({ error: "Invalid id format" });
    }
});

export default router;
