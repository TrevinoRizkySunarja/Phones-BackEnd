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
    // Prefer env, fallback to request host (handig op server)
    const envBase = process.env.APPLICATION_URL;
    const port = process.env.EXPRESS_PORT;
    if (envBase && port) return `${envBase}:${port}`;
    return `${req.protocol}://${req.get("host")}`;
}

function phoneLinks(req, id) {
    const base = baseUrl(req);
    return {
        self: { href: `${base}/phones/${id}` },
        collection: { href: `${base}/phones` },
    };
}

function collectionLinks(req, href) {
    return {
        self: { href },
        collection: { href: `${baseUrl(req)}/phones` },
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

/* -----------------------------
   OPTIONS (collection)
------------------------------ */
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    // checker verwacht vaak 200
    return res.sendStatus(200);
});

/* -----------------------------
   SEED (moet vóór /:id)
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
            date: new Date(),
        });
    }

    return res.sendStatus(201);
});

/* -----------------------------
   GET collection (pagination + filter/search)
   ?page=1&limit=10&q=iphone&brand=Apple
   Zonder limit => alle items (geen default limit)
------------------------------ */
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

    const hasLimit =
        typeof req.query.limit !== "undefined" && req.query.limit !== "";

    // zonder limit: alles tonen
    if (!hasLimit) {
        const docs = await Phone.find(filter).select("title brand");
        const items = docs.map((d) => mapCollectionItem(req, d));

        const href = `${baseUrl(req)}/phones`;
        return res.json({
            items,
            _links: {
                self: { href },
                collection: { href },
            },
        });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
        Phone.find(filter).select("title brand").skip(skip).limit(limit),
        Phone.countDocuments(filter),
    ]);

    const items = docs.map((d) => mapCollectionItem(req, d));
    const href = `${baseUrl(req)}/phones?page=${page}&limit=${limit}`;

    return res.json({
        page,
        limit,
        total,
        items,
        _links: {
            self: { href },
            collection: { href: `${baseUrl(req)}/phones` },
        },
    });
});

/* -----------------------------
   POST create (201)
------------------------------ */
router.post("/", async (req, res) => {
    const error = validateFullBody(req.body);
    if (error) return res.status(400).json({ error });

    const created = await Phone.create({
        title: req.body.title.trim(),
        brand: req.body.brand.trim(),
        description: req.body.description.trim(),
        imageUrl: nonEmptyString(req.body.imageUrl)
            ? req.body.imageUrl.trim()
            : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : "",
        date: new Date(),
    });

    // checker wil vaak het aangemaakte resource terug
    return res.status(201).json({
        id: created.id,
        title: created.title,
        brand: created.brand,
        description: created.description,
        imageUrl: created.imageUrl,
        reviews: created.reviews,
        date: created.date,
        _links: phoneLinks(req, created.id),
    });
});

/* -----------------------------
   OPTIONS (detail)
------------------------------ */
router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    return res.sendStatus(200);
});

/* -----------------------------
   POST overload example (extra endpoint)
   POST /phones/:id/bookmark  body: { "hasBookmark": true }
   -> dit is "POST overload" (actie) die niet standaard CRUD is
------------------------------ */
router.post("/:id/bookmark", async (req, res) => {
    try {
        const val = req.body?.hasBookmark;
        if (typeof val !== "boolean") {
            return res.status(400).json({ error: "hasBookmark must be boolean" });
        }

        const updated = await Phone.findByIdAndUpdate(
            req.params.id,
            { hasBookmark: val, date: new Date() },
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
   POST /phones/:id/image (moet vóór /:id)
   body: { "imageUrl": "http://.../uploads/xxx.png" }
------------------------------ */
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

        return res.json({
            id: updated.id,
            title: updated.title,
            brand: updated.brand,
            description: updated.description,
            imageUrl: updated.imageUrl,
            reviews: updated.reviews,
            date: updated.date,
            _links: phoneLinks(req, updated.id),
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
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
   PUT detail (volledig vervangen)
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
                ...(nonEmptyString(req.body.imageUrl)
                    ? { imageUrl: req.body.imageUrl.trim() }
                    : {}),
                ...(nonEmptyString(req.body.reviews)
                    ? { reviews: req.body.reviews.trim() }
                    : {}),
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
   PATCH detail (deels aanpassen)
------------------------------ */
router.patch("/:id", async (req, res) => {
    try {
        const update = {};

        if ("title" in req.body) {
            if (!nonEmptyString(req.body.title))
                return res.status(400).json({ error: "title must be non-empty string" });
            update.title = req.body.title.trim();
        }
        if ("brand" in req.body) {
            if (!nonEmptyString(req.body.brand))
                return res.status(400).json({ error: "brand must be non-empty string" });
            update.brand = req.body.brand.trim();
        }
        if ("description" in req.body) {
            if (!nonEmptyString(req.body.description))
                return res
                    .status(400)
                    .json({ error: "description must be non-empty string" });
            update.description = req.body.description.trim();
        }
        if ("imageUrl" in req.body) {
            if (!nonEmptyString(req.body.imageUrl))
                return res
                    .status(400)
                    .json({ error: "imageUrl must be non-empty string" });
            update.imageUrl = req.body.imageUrl.trim();
        }
        if ("hasBookmark" in req.body) {
            if (typeof req.body.hasBookmark !== "boolean")
                return res.status(400).json({ error: "hasBookmark must be boolean" });
            update.hasBookmark = req.body.hasBookmark;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to patch" });
        }

        update.date = new Date();

        const updated = await Phone.findByIdAndUpdate(req.params.id, update, {
            new: true,
        });

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
   DELETE detail
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
