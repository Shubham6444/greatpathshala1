const mongoose = require("mongoose");
const dns = require("dns");

async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing.");
  const resolvers = (process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map(value => value.trim()).filter(Boolean);
  if (resolvers.length) dns.setServers(resolvers);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("MongoDB connected.");
}

module.exports = connectDatabase;
