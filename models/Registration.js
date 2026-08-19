const mongoose = require('mongoose');

module.exports = mongoose.model('Registration', new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true }, accountId: String, name: String,
  email: { type: String, index: true }, phone: String, webinarId: { type: String, index: true }, webinarTitle: String,
  amount: Number, currency: String, orderId: String, paymentId: String, paymentMethod: String,
  feePlan: String, paymentStatus: { type: String, index: true }, paidAt: String,
  attendance: { webinarPresent: { type: Boolean, default: false }, classDates: { type: Map, of: Boolean, default: {} } },
  attendanceHistory: [{ date: String, present: Boolean, markedAt: String }],
  certificateGenerated: Boolean, certificateId: String, certificateUrl: String, certificateImageUrl: String,
  registeredAt: String, updatedAt: String
}, { versionKey: false }));
