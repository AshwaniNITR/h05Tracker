import mongoose, { Mongoose } from 'mongoose';

const MONGODB_URI: string | undefined = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}

interface MongooseGlobal {
    conn: Mongoose | null;
    promise: Promise<Mongoose> | null;
}

// Extend globalThis to include mongoose
declare global {
    // eslint-disable-next-line no-var
    var mongoose: MongooseGlobal | undefined;
}

const cached: MongooseGlobal = globalThis.mongoose ?? { conn: null, promise: null };

if (!globalThis.mongoose) {
    globalThis.mongoose = cached;
}

async function dbConnect(): Promise<Mongoose> {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI!).then((mongooseInstance) => {
            return mongooseInstance;
        });
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

export default dbConnect;