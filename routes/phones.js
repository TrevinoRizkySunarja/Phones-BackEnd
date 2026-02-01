import express from "express";
import Phone from "../models/Phones.js";
import { faker } from "@faker-js/faker";

const router = express.Router();

router.options('/', (req, res) => {
    res.header('Allow','GET, POST, OPTIONS');
    res.status(204).send();
});

router.get('/', async (req, res) => {
    const phones = await Phone.find();
    res.json({
        items: phones,
        _links: {
            self: {
                href: `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/phones`
            }
        }
    });
});

router.options('/:id', (req, res) => {
    res.header('Allow','GET, PUT, DELETE,OPTIONS');
    res.status(204).send();
});

try {
    router.get('/:id', async (req, res) => {
        const phone = await Phone.findById(req.params.id);
        if (phone === null) {
            return res.status(404).json({error: 'Phone not found'});
        } else {
            res.json(phone);
        }
    });
} catch (err){
    console.error(err);
    res.status(500).send('Server error');
}

router.post('/seed', async (req, res) => {
    await Phone.deleteMany({});

    for (let i = 0; i < req.body.amount; i++) {
        await Phone.create({
            title: faker.commerce.productName(),
            description: faker.lorem.paragraph(3),
            reviews: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 2 })),
            imageUrl: faker.image.url(),
        });
    }

    res.status(201).send();
});

export default router;
