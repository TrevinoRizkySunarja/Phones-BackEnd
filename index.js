import express from 'express';
import mongoose from "mongoose";
import phonesRouter from './routes/phones.js';

try {
    const app = express();
    await mongoose.connect(`mongodb://127.0.0.1:27017/${process.env.DB_NAME}`, {
        serverSelectionTimeoutMS:3000
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
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        next();
    });

    // middleware
    app.use(express.json());
    app.use(express.urlencoded({extended: true}));

    app.get('/', (req, res) => {
        res.json({ message: 'Hello World' });
    });

    app.use('/phones', phonesRouter);

    app.listen(process.env.EXPRESS_PORT, () => {
        console.log(`Server is running on port ${process.env.EXPRESS_PORT}`);
    });

} catch (e) {
    console.log(e);
}
