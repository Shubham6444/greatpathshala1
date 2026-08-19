const mongoose = require('mongoose');

module.exports = mongoose.model('Otp', new mongoose.Schema({
  email: { type: String, unique: true }, hash: String, expiresAt: Number, attempts: { type: Number, default: 0 }
}, { timestamps: true }));
