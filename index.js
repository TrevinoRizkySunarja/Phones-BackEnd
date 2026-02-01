import express from "express";
import mongoose from "mongoose";

import phonesRouter from "./routes/phones.js";
import loginRouter from "./routes/auth.js";
import protectedRouter from "./routes/protected.js";
import uploadRouter from "./routes/upload.js";

import methodOverride from "./middleware/methodOverride.js";
import requireJsonBody from "./middleware/requireJsonBody.js";

try {
    const app = express();

    await mongoose.connect(`mongodb://127.0.0.1:27017/${process.env.DB_NAME}`, {
        serverSelectionTimeoutMS: 3000
    });

    function acceptJsonOnly(req, res, next) {
        if (req.method === "OPTIONS") return next();

        const acceptHeader = (req.headers["accept"] || "").toLowerCase();
        if (acceptHeader.includes("application/json")) {
            next();
        } else {
            res.status(406).send("Not Acceptable: Only application/json is supported");
        }
    }

    app.use(acceptJsonOnly);

    // CORS middleware
    app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        next();
    });


    // POST overload (method override)
    app.use(methodOverride);

    // body parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // JSON afdwingen voor POST/PUT/PATCH (multipart mag ook voor upload)
    app.use(requireJsonBody);

    // static files voor uploads
    app.use("/uploads", express.static("uploads"));

    app.get("/", (req, res) => {
        res.json({ message: "CoolPhones API" });
    });

    // routes
    app.use("/phones", phonesRouter);
    app.use("/login", loginRouter);         // POST /login (Basic -> JWT)
    app.use("/protected", protectedRouter); // GET /protected/ping (Bearer JWT)
    app.use("/upload", uploadRouter);       // POST /upload (multipart)

    app.listen(process.env.EXPRESS_PORT, "0.0.0.0", () => {
        console.log(`Server is running on port ${process.env.EXPRESS_PORT}`);
    });

} catch (e) {
    console.log(e);
}
