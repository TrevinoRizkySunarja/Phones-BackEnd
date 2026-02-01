import mongoose from "mongoose";

const phoneSchema = new mongoose.Schema(
    {
        // 3 aanpasbare velden (strings)
        title: { type: String, required: true },
        brand: { type: String, required: true }, // <-- nieuw (3e veld)
        description: { type: String, required: true },

        // overige velden (niet nodig voor checker)
        imageUrl: { type: String, required: true },
        reviews: { type: String }, // als je dit wilt blijven seeden
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
                        href: `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/phones/${ret.id}`,
                    },
                    collection: {
                        href: `${process.env.APPLICATION_URL}:${process.env.EXPRESS_PORT}/phones`,
                    },
                };
                delete ret._id;
            },
        },
    }
);

const Phone = mongoose.model("Phone", phoneSchema);
export default Phone;
