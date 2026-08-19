require("dotenv").config();
const express = require("express"),
  path = require("path"),
  fs = require("fs"),
  crypto = require("crypto");
const { v4: uuid } = require("uuid"),
  Razorpay = require("razorpay"),
  nodemailer = require("nodemailer");
const connectDatabase = require("./config/database");
const User = require("./models/User"),
  Session = require("./models/Session"),
  Registration = require("./models/Registration"),
  Otp = require("./models/Otp");
const { createCertificate } = require("./services/certificateService");
const app = express(),
  PORT = process.env.PORT || 3000,
  ADMIN_KEY = process.env.ADMIN_KEY,
  SECRET = process.env.SESSION_SECRET;
const rzpId = process.env.RAZORPAY_KEY_ID,
  rzpSecret = process.env.RAZORPAY_KEY_SECRET,
  rzp =
    rzpId && rzpSecret
      ? new Razorpay({ key_id: rzpId, key_secret: rzpSecret })
      : null;
const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +process.env.SMTP_PORT || 465,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;
const certDir = path.join(__dirname, "certificates");
fs.mkdirSync(certDir, { recursive: true });
app.use(express.json({ verify: (q, s, b) => (q.rawBody = b) }));
app.use(express.static(__dirname));
app.use("/certificates", express.static(certDir));
const cleanPhone = (x) =>
    String(x || "")
      .replace(/\D/g, "")
      .slice(-10),
  esc = (x) =>
    String(x || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const admin = (q, s, n) =>
  q.headers["x-admin-key"] === ADMIN_KEY
    ? n()
    : s.status(401).json({ error: "Invalid admin key." });
const sign = (x) => crypto.createHmac("sha256", SECRET).update(x).digest("hex");
const token = (id) => {
  const p = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 2592e6 }),
  ).toString("base64url");
  return p + "." + sign(p);
};
async function account(q) {
  const [p, g] = (q.headers.authorization || "")
    .replace(/^Bearer /, "")
    .split(".");
  if (!p || !g || g !== sign(p)) return null;
  try {
    const x = JSON.parse(Buffer.from(p, "base64url"));
    return x.exp > Date.now() ? User.findById(x.id) : null;
  } catch {
    return null;
  }
}
function norm(b, old = {}) {
  const type = ["post", "webinar", "class", "document", "image"].includes(
      b.type,
    )
      ? b.type
      : "post",
    title = String(b.title || "").trim();
  if (!title) throw Error("A title is required.");
  let dates =
    b.classDates === undefined
      ? old.classDates || []
      : String(b.classDates).split(",");
  dates =
    type === "class"
      ? [
          ...new Set(
            dates
              .map((x) => String(x).trim())
              .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
          ),
        ].sort()
      : [];
  if (type === "class" && !dates.length && b.scheduledAt)
    dates = [String(b.scheduledAt).slice(0, 10)];
  return {
    ...old,
    type,
    title,
    excerpt: String(b.excerpt || ""),
    body: String(b.body || ""),
    subject: String(b.subject || "General"),
    scheduledAt: String(b.scheduledAt || ""),
    classDates: dates,
    amount: ["webinar", "class"].includes(type)
      ? Math.max(1, +b.amount || 29)
      : 0,
    feePlan: type === "class" && b.feePlan === "monthly" ? "monthly" : "full",
    joinEnabled: b.joinEnabled !== false,
    offerEnabled: b.offerEnabled === true || b.offerEnabled === "true",
    published: b.published !== false,
    link: String(b.link || ""),
    imageUrl: String(b.imageUrl || ""),
    updatedAt: new Date().toISOString(),
  };
}
app.get("/register.html", async (q, s, n) => {
  const x = await Session.findOne({
    id: q.query.webinar,
    published: { $ne: false },
    joinEnabled: { $ne: false },
  });
  if (!x) return s.status(404).sendFile(path.join(__dirname, "not-found.html"));
  n();
});
app.get("/api/content", async (q, s) =>
  s.json({
    success: true,
    items: await Session.find({ published: { $ne: false } })
      .sort({ updatedAt: -1 })
      .lean(),
  }),
);
app.get("/api/admin/content", admin, async (q, s) =>
  s.json({
    success: true,
    items: await Session.find().sort({ updatedAt: -1 }).lean(),
  }),
);
app.post("/api/admin/content", admin, async (q, s) => {
  try {
    const x = norm(q.body, { id: uuid(), createdAt: new Date().toISOString() });
    await Session.create(x);
    s.status(201).json({ success: true, item: x });
  } catch (e) {
    s.status(400).json({ error: e.message });
  }
});
app.put("/api/admin/content/:id", admin, async (q, s) => {
  const old = await Session.findOne({ id: q.params.id });
  if (!old) return s.status(404).json({ error: "Content not found." });
  const x = norm(q.body, old.toObject());
  await Session.updateOne({ id: q.params.id }, x);
  s.json({ success: true, item: x });
});
app.delete("/api/admin/content/:id", admin, async (q, s) =>
  s.json({
    success: !!(await Session.deleteOne({ id: q.params.id })).deletedCount,
  }),
);
app.patch("/api/admin/content/:id/offer", admin, async (q, s) => {
  const item = await Session.findOneAndUpdate({ id: q.params.id }, { offerEnabled: !!q.body.offerEnabled }, { new: true });
  if (!item) return s.status(404).json({ error: "Content not found." });
  s.json({ success: true, item });
});
app.post("/api/register", async (q, s) => {
  try {
    const { name, email } = q.body,
      phone = cleanPhone(q.body.phone),
      webinarId = String(q.body.webinarId || "");
    const session = await Session.findOne({
      id: webinarId,
      published: { $ne: false },
    });
    if (!session)
      return s.status(404).json({ error: "Select an available session." });
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || phone.length !== 10)
      return s
        .status(400)
        .json({ error: "Enter valid name, email and phone." });
    const old = await Registration.findOne({
      webinarId,
      $or: [{ email: email.toLowerCase() }, { phone }],
    });
    if (old?.paymentStatus === "paid")
      return s.status(409).json({ error: "Already registered." });
    if (!rzp)
      return s.status(503).json({ error: "Online payment unavailable." });
    const order = await rzp.orders.create({
      amount: session.amount * 100,
      currency: "INR",
      receipt: "reg_" + Date.now(),
    });
    const acc = await User.findOne({ email: email.toLowerCase() });
    const data = {
      id: old?.id || uuid(),
      name,
      email: email.toLowerCase(),
      phone,
      accountId: acc ? String(acc._id) : "",
      webinarId,
      webinarTitle: session.title,
      amount: session.amount,
      currency: "INR",
      orderId: order.id,
      paymentMethod: "razorpay",
      feePlan: session.feePlan,
      paymentStatus: "pending",
      attendance: old?.attendance || {},
      certificateGenerated: false,
      registeredAt: old?.registeredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await Registration.findOneAndUpdate({ id: data.id }, data, {
      upsert: true,
    });
    s.json({
      success: true,
      studentId: data.id,
      orderId: order.id,
      amount: order.amount,
      currency: "INR",
      razorpayKeyId: rzpId,
      name,
      email,
      phone,
      webinarTitle: session.title,
    });
  } catch (e) {
    console.error(e);
    s.status(500).json({ error: "Registration failed." });
  }
});
app.post("/api/verify-payment", async (q, s) => {
  const {
      studentId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = q.body,
    expected = crypto
      .createHmac("sha256", rzpSecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");
  if (expected !== razorpay_signature)
    return s.status(400).json({ error: "Payment signature is not valid." });
  const x = await Registration.findOneAndUpdate(
    { id: studentId, orderId: razorpay_order_id },
    {
      paymentStatus: "paid",
      paymentId: razorpay_payment_id,
      paidAt: new Date().toISOString(),
    },
  );
  if (!x) return s.status(404).json({ error: "Registration not found." });
  s.json({ success: true });
});
app.post("/api/auth/request-otp", async (q, s) => {
  const email = String(q.body.email || "").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !mailer)
    return s.status(400).json({ error: "Email sign-in unavailable." });
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ email, name: "" });
  const code = String(crypto.randomInt(1e5, 1e6));
  await Otp.findOneAndUpdate(
    { email },
    {
      email,
      hash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: Date.now() + 600000,
      attempts: 0,
    },
    { upsert: true },
  );
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your sign-in code",
    text: "Your OTP is " + code,
  });
  s.json({ success: true });
});
app.post("/api/auth/verify-otp", async (q, s) => {
  const email = String(q.body.email || "").toLowerCase(),
    otp = await Otp.findOne({ email }),
    hash = crypto
      .createHash("sha256")
      .update(String(q.body.code || ""))
      .digest("hex");
  if (!otp || otp.expiresAt < Date.now() || otp.hash !== hash)
    return s.status(401).json({ error: "Invalid or expired code." });
  await Otp.deleteOne({ email });
  const u = await User.findOne({ email });
  s.json({
    success: true,
    token: token(String(u._id)),
    account: { email: u.email, name: u.name },
  });
});
app.get("/api/student/dashboard", async (q, s) => {
  const u = await account(q);
  if (!u) return s.status(401).json({ error: "Please sign in again." });
  const registrations = await Registration.find({
    $or: [{ accountId: String(u._id) }, { email: u.email }],
  }).lean();
  s.json({ success: true, account: u, registrations });
});
app.get("/api/admin/students", admin, async (q, s) =>
  s.json({
    success: true,
    students: await Registration.find().sort({ registeredAt: -1 }).lean(),
  }),
);
app.patch("/api/admin/students/:id/payment", admin, async (q, s) => {
  const x = await Registration.findOneAndUpdate(
    { id: q.params.id },
    {
      paymentStatus: q.body.status,
      paymentMethod: q.body.paymentMethod,
      paidAt: q.body.status === "paid" ? new Date().toISOString() : undefined,
    },
    { new: true },
  );
  s.json({ success: true, student: x });
});
app.get("/api/admin/attendance/:sessionId", admin, async (q, s) => {
  const session = await Session.findOne({ id: q.params.sessionId });
  if (!session) return s.status(404).json({ error: "Session not found." });
  s.json({
    success: true,
    session,
    students: await Registration.find({ webinarId: session.id }).lean(),
  });
});
app.put("/api/admin/attendance/:id", admin, async (q, s) => {
  const x = await Registration.findOne({ id: q.params.id }),
    session = await Session.findOne({ id: x.webinarId });
  if (!x || x.paymentStatus !== "paid")
    return s.status(400).json({ error: "Confirm payment first." });
  x.attendance ||= { webinarPresent: false, classDates: {} };
  if (session.type === "class")
    x.attendance.classDates.set(q.body.date, !!q.body.present);
  else x.attendance.webinarPresent = !!q.body.present;
  x.attendanceHistory.push({
    date: q.body.date || session.scheduledAt.slice(0, 10),
    present: !!q.body.present,
    markedAt: new Date().toISOString(),
  });
  await x.save();
  s.json({ success: true });
});
app.put("/api/admin/attendance/:id/dates", admin, async (q, s) => {
  const x = await Session.findOne({ id: q.params.id, type: "class" });
  x.classDates = [...new Set([...x.classDates, q.body.date])].sort();
  await x.save();
  s.json({ success: true, classDates: x.classDates });
});
app.get("/api/admin/analytics", admin, async (q, s) => {
  const all = await Registration.find().lean(),
    paid = all.filter((x) => x.paymentStatus === "paid");
  s.json({
    success: true,
    attendance: { labels: [], values: [] },
    collections: { labels: [], values: [] },
    payments: {
      online: paid.filter((x) => x.paymentMethod === "razorpay").length,
      upi: paid.filter((x) => x.paymentMethod === "upi").length,
      cash: paid.filter((x) => x.paymentMethod === "cash").length,
      pending: all.filter((x) => x.paymentStatus !== "paid").length,
    },
  });
});
app.post("/api/admin/generate-certificate/:id", admin, async (q, s) => {
  const x = await Registration.findOne({ id: q.params.id });
  if (!x || x.paymentStatus !== "paid")
    return s.status(400).json({ error: "Payment must be completed." });
  const certId = x.certificateId || `CERT-${new Date().getFullYear()}-${x.id.slice(0, 8).toUpperCase()}`,
    pdfFile = `${x.id}.pdf`, pngFile = `${x.id}.png`, session = await Session.findOne({ id: x.webinarId });
  const attendance =
    session?.type === "class"
      ? `${Object.values(x.attendance?.classDates || {}).filter(Boolean).length} day(s)`
      : x.attendance?.webinarPresent
        ? "Yes"
        : "No";
  const result = await createCertificate({ registration: x.toObject(), session: session?.toObject() });
  x.certificateGenerated = true;
  x.certificateId = result.certificateId;
  x.certificateUrl = result.certificateUrl;
  x.certificateImageUrl = result.certificateImageUrl;
  await x.save();
  return s.json({ success: true, ...result });
});
app.post("/api/certificate/lookup", async (q, s) => {
  const v = String(q.body.query || "").toLowerCase(),
    x = await Registration.findOne({
      $or: [{ email: v }, { phone: cleanPhone(v) }],
    });
  if (!x || !x.certificateGenerated)
    return s.status(404).json({ error: "Certificate not found." });
  s.json({
    success: true,
    name: x.name,
    certificateId: x.certificateId,
    certificateUrl: x.certificateUrl,
  });
});
connectDatabase()
  .then(() =>
    app.listen(PORT, () =>
      console.log("Server running: http://localhost:" + PORT),
    ),
  )
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
