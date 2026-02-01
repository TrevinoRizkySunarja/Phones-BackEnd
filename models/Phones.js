import mongoose from "mongoose";

const phoneSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },        // bv. "iPhone 15 Pro"
        description: { type: String, required: true },  // uitleg/omschrijving

        brand: { type: String },                        // bv. "Apple", "Samsung"
        model: { type: String },                        // bv. "15 Pro", "S24"
        os: { type: String, enum: ["iOS", "Android", "Other"], default: "Other" },

        imageUrl: { type: String, required: true },
        hasBookmark: { type: Boolean, default: false },
        date: { type: Date, default: Date.now },
    },
    {
        toJSON: {
            virtuals: true,
            versionKey: false,
            transform: (doc, ret) => {
                ret._links = {
                    self: {
                        href: `${process.env.APPLICATION_URL};${process.env.EXPRESS_PORT}/phones/${ret.id}`,
                    },
                    collection: {
                        href: `${process.env.APPLICATION_URL};${process.env.EXPRESS_PORT}/phones`,
                    },
                };

                delete ret._id;
            },
        },
    }
);

const Phone = mongoose.model('Phone', phoneSchema);

export default Phone;
