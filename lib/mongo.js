import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGO_URI);
let cachedCollection = null;

export async function getCollection() {
  if (!cachedCollection) {
    await client.connect();
    const db = client.db(); // db name from URI
    cachedCollection = db.collection("shipments");
  }
  return cachedCollection;
}
