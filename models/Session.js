const mongoose = require('mongoose');

module.exports = mongoose.model('Session', new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true }, type: String, title: String,
  excerpt: String, body: String, subject: String, date: String, scheduledAt: String,
  classDates: [String], amount: Number, feePlan: { type: String, default: 'full' },
  joinEnabled: { type: Boolean, default: true }, offerEnabled: { type: Boolean, default: false }, link: String, imageUrl: String,
  published: { type: Boolean, default: true }, createdAt: String, updatedAt: String
}, { versionKey: false }));
