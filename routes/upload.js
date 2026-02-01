import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
        cb(null, safe);
    }
});

const upload = multer({ storage });

// POST /upload (multipart/form-data field name: image)
router.post("/", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const url = `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/uploads/${req.file.filename}`;
    res.status(201).json({ url });
});

export default router;
