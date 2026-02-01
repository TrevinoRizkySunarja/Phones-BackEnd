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

function baseUrl() {
    return `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}`;
}

function collectionUrl() {
    return `${baseUrl()}/phones`;
}

function detailUrl(id) {
    return `${baseUrl()}/phones/${id}`;
}

function buildItemLinks(id) {
    return {
        self: { href: detailUrl(id) },
        collection: { href: collectionUrl() }
    };
}

// OPTIONS collection (Allow header + CORS methods voor checker)
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.sendStatus(204);
});

// GET collection (pagination + filter/search + links)
router.get("/", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const brand = (req.query.brand || "").toString().trim();

    // pagination detectie
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;

    const pageParsed = parseInt(pageRaw, 10);
    const limitParsed = parseInt(limitRaw, 10);

    const hasPagination =
        (typeof pageRaw !== "undefined" && pageRaw !== "") ||
        (typeof limitRaw !== "undefined" && limitRaw !== "");

    const safePage = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

    // “zonder limit moet alles getoond worden” => limit = null
    const safeLimit =
        Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : null;

    // filter/search
    const filter = {};
    if (brand) filter.brand = new RegExp("^" + brand + "$", "i");

    if (q) {
        filter.$or = [
            { title: new RegExp(q, "i") },
            { brand: new RegExp(q, "i") },
            { description: new RegExp(q, "i") }
        ];
    }

    const totalItems = await Phone.countDocuments(filter);

    let query = Phone.find(filter).select("title brand");
    if (hasPagination && safeLimit) {
        query = query.skip((safePage - 1) * safeLimit).limit(safeLimit);
    }

    const docs = await query;

    const items = docs.map((d) => ({
        id: d.id,
        title: d.title,
        brand: d.brand,
        _links: buildItemLinks(d.id)
    }));

    const response = {
        items,
        _links: {
            self: {
                href: hasPagination
                    ? `${collectionUrl()}?page=${safePage}${safeLimit ? `&limit=${safeLimit}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`
                    : collectionUrl()
            },
            collection: { href: collectionUrl() }
        }
    };

    // checker verwacht pagination object als pagination aan staat (page/limit aanwezig)
    if (hasPagination) {
        response.pagination = {
            page: safePage,
            limit: safeLimit,                 // null als je geen limit meegeeft
            totalItems,
            totalPages: safeLimit ? Math.ceil(totalItems / safeLimit) : 1,
            itemCount: items.length
        };
    }

    return res.json(response);
});

// POST create item (201)
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

    const out = created.toObject({ versionKey: false });
    out.id = created.id;
    delete out._id;
    out._links = buildItemLinks(created.id);

    return res.status(201).json(out);
});

// POST seed (min 5 items voor checker)
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
            imageUrl: faker.image.url(),
            reviews: faker.lorem.paragraphs(2),
            hasBookmark: false,
            date: new Date()
        });
    }

    return res.sendStatus(201);
});

// OPTIONS detail (Allow + CORS methods voor checker)
router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    return res.sendStatus(204);
});

// GET detail + If-Modified-Since
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
                return res.status(304).send();
            }
        }

        res.setHeader("Last-Modified", last.toUTCString());

        const out = phone.toObject({ versionKey: false });
        out.id = phone.id;
        delete out._id;
        out._links = buildItemLinks(phone.id);

        return res.json(out);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// PUT detail (volledig vervangen)
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
                ...(typeof req.body.hasBookmark === "boolean" ? { hasBookmark: req.body.hasBookmark } : {}),
                date: new Date()
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Phone not found" });

        const out = updated.toObject({ versionKey: false });
        out.id = updated.id;
        delete out._id;
        out._links = buildItemLinks(updated.id);

        return res.json(out);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// PATCH detail (deels aanpassen)
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

        const out = updated.toObject({ versionKey: false });
        out.id = updated.id;
        delete out._id;
        out._links = buildItemLinks(updated.id);

        return res.json(out);
    } catch {
        return res.status(400).json({ error: "Invalid id format" });
    }
});

// DELETE detail
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
