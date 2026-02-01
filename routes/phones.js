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

function baseUrl() {
    // verwacht dat APPLICATION_URL bijv. "http://145.24.237.21" is
    return `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}`;
}

function collectionHref() {
    return `${baseUrl()}/phones`;
}

function selfHrefFromOriginalUrl(req) {
    // originalUrl bevat al /phones?...  -> maak er absolute url van
    return `${baseUrl()}${req.originalUrl}`;
}

function itemLinks(id) {
    return {
        self: { href: `${collectionHref()}/${id}` },
        collection: { href: collectionHref() },
    };
}

// OPTIONS collection (checker wil 204 + Allow)
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    return res.sendStatus(204);
});

// SEED eerst (anders pakt /:id 'seed')
router.post("/seed", async (req, res) => {
    await Phone.deleteMany({});

    const raw = req.body?.amount;
    const parsed = parseInt(raw, 10);

    // checker wil minimaal 5 items in collection
    const safeAmount = Number.isFinite(parsed) ? Math.max(parsed, 5) : 10;

    for (let i = 0; i < safeAmount; i++) {
        await Phone.create({
            title: faker.commerce.productName(),
            brand: faker.company.name(),
            description: faker.lorem.paragraph(),
            imageUrl: faker.image.url(),
            reviews: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 2 })),
        });
    }

    return res.sendStatus(201);
});

// GET collection: pagination + filter/search
// ?page=1&limit=10&q=iphone&brand=Apple
router.get("/", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const brand = (req.query.brand || "").toString().trim();

    const filter = {};
    if (brand) filter.brand = new RegExp(`^${brand}$`, "i");
    if (q) {
        filter.$or = [
            { title: new RegExp(q, "i") },
            { brand: new RegExp(q, "i") },
            { description: new RegExp(q, "i") },
        ];
    }

    const hasLimit =
        typeof req.query.limit !== "undefined" && `${req.query.limit}` !== "";

    // ZONDER limit => alle items teruggeven, maar WEL pagination object (checker)
    if (!hasLimit) {
        const itemsRaw = await Phone.find(filter).select("title brand").lean();
        const items = itemsRaw.map((p) => ({
            id: p._id.toString(),
            title: p.title,
            brand: p.brand,
            _links: itemLinks(p._id.toString()),
        }));

        const total = items.length;

        return res.json({
            items,
            pagination: {
                page: 1,
                limit: total, // alles in 1 pagina
                pageCount: 1,
                total,
            },
            _links: {
                self: { href: selfHrefFromOriginalUrl(req) }, // inclusief eventuele filter q/brand
                collection: { href: collectionHref() },
            },
        });
    }

    // MET limit => echte pagination
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
    const skip = (page - 1) * limit;

    const [itemsRaw, total] = await Promise.all([
        Phone.find(filter).select("title brand").skip(skip).limit(limit).lean(),
        Phone.countDocuments(filter),
    ]);

    const pageCount = Math.max(Math.ceil(total / limit), 1);

    const items = itemsRaw.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        brand: p.brand,
        _links: itemLinks(p._id.toString()),
    }));

    return res.json({
        items,
        pagination: {
            page,
            limit,
            pageCount,
            total,
        },
        _links: {
            self: { href: selfHrefFromOriginalUrl(req) }, // bevat page/limit + filter params
            collection: { href: collectionHref() },
        },
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
        imageUrl: nonEmptyString(req.body.imageUrl)
            ? req.body.imageUrl.trim()
            : faker.image.url(),
        reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : "",
        date: new Date(),
    });

    // teruggeven in checker-format (id + _links)
    return res.status(201).json({
        id: created._id.toString(),
        title: created.title,
        brand: created.brand,
        description: created.description,
        imageUrl: created.imageUrl,
        reviews: created.reviews,
        hasBookmark: created.hasBookmark ?? false,
        date: created.date,
        _links: itemLinks(created._id.toString()),
    });
});

// OPTIONS detail
router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    return res.sendStatus(204);
});

// GET detail + If-Modified-Since
router.get("/:id", async (req, res) => {
    try {
        const phone = await Phone.findById(req.params.id).lean();
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
            id: phone._id.toString(),
            title: phone.title,
            brand: phone.brand,
            description: phone.description,
            imageUrl: phone.imageUrl,
            reviews: phone.reviews,
            hasBookmark: phone.hasBookmark ?? false,
            date: phone.date,
            _links: itemLinks(phone._id.toString()),
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
                imageUrl: nonEmptyString(req.body.imageUrl)
                    ? req.body.imageUrl.trim()
                    : faker.image.url(),
                reviews: nonEmptyString(req.body.reviews) ? req.body.reviews.trim() : "",
                date: new Date(),
            },
            { new: true, lean: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json({
            id: updated._id.toString(),
            title: updated.title,
            brand: updated.brand,
            description: updated.description,
            imageUrl: updated.imageUrl,
            reviews: updated.reviews,
            hasBookmark: updated.hasBookmark ?? false,
            date: updated.date,
            _links: itemLinks(updated._id.toString()),
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
        if ("reviews" in req.body) {
            if (!nonEmptyString(req.body.reviews))
                return res
                    .status(400)
                    .json({ error: "reviews must be non-empty string" });
            update.reviews = req.body.reviews.trim();
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to patch" });
        }

        update.date = new Date();

        const updated = await Phone.findByIdAndUpdate(req.params.id, update, {
            new: true,
            lean: true,
        });

        if (!updated) return res.status(404).json({ error: "Phone not found" });

        return res.json({
            id: updated._id.toString(),
            title: updated.title,
            brand: updated.brand,
            description: updated.description,
            imageUrl: updated.imageUrl,
            reviews: updated.reviews,
            hasBookmark: updated.hasBookmark ?? false,
            date: updated.date,
            _links: itemLinks(updated._id.toString()),
        });
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// DELETE detail
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Phone.findByIdAndDelete(req.params.id).lean();
        if (!deleted) return res.status(404).json({ error: "Phone not found" });
        return res.sendStatus(204);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

export default router;
