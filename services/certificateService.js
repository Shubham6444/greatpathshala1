const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const certificateDir = path.join(__dirname, "..", "certificates");
const logoPath = path.join(__dirname, "..", "bg.png");
const signaturePath = path.join(__dirname, "..", "sign.png");

const COLORS = {
  maroon: "#B3142E",
  gold: "#D4AF37",
  goldDark: "#A9841B",
  pink: "#D98BA5",
  cream: "#FCF7EF",
  ink: "#241018",
  gray: "#6B7280",
  white: "#FFFFFF",
};

const PAGE_W = 842;
const PAGE_H = 595;
const SVG_SCALE = 2;
const WEBSITE = "www.greatpathshala.com";

function escapeXml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
}

function fitText(doc, text, maxWidth, initialSize, minSize = 24) {
  let size = initialSize;
  while (size > minSize && doc.fontSize(size).widthOfString(text) > maxWidth) {
    size -= 1;
  }
  return size;
}

function mirrorPoints(points, w, h) {
  return points.map(([x, y]) => [w - x, h - y]);
}

// Generates the vertices of a 5-pointed star, used for the seal/badge
function starPoints(cx, cy, spikes, outerR, innerR) {
  const points = [];
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i++) {
    points.push([cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR]);
    rot += step;
    points.push([cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR]);
    rot += step;
  }
  return points;
}

const CORNER_SHAPES = [
  {
    pts: [
      [0, 0],
      [230, 0],
      [0, 180],
    ],
    color: COLORS.maroon,
  },
  {
    pts: [
      [0, 0],
      [140, 0],
      [0, 110],
    ],
    color: COLORS.gold,
  },
  {
    pts: [
      [0, 150],
      [85, 235],
      [0, 235],
    ],
    color: COLORS.maroon,
  },
  {
    pts: [
      [0, 205],
      [45, 250],
      [0, 250],
    ],
    color: COLORS.pink,
  },
];

const BADGE_CX = 760;
const BADGE_CY = 92;

function ribbonPoints(cx, cy, width, height) {
  const x0 = cx - width / 2,
    x1 = cx + width / 2,
    notch = 16;
  return [
    [x0, cy],
    [x0 + notch, cy - height / 2],
    [x1 - notch, cy - height / 2],
    [x1, cy],
    [x1 - notch, cy + height / 2],
    [x0 + notch, cy + height / 2],
  ];
}

// ---------- PDF drawing helpers ----------

function drawCorner(doc, mirror) {
  CORNER_SHAPES.forEach(({ pts, color }) => {
    const p = mirror ? mirrorPoints(pts, PAGE_W, PAGE_H) : pts;
    doc.polygon(...p).fill(color);
  });
}

function drawWatermark(doc) {
  doc.save();
  doc.opacity(0.045);
  doc.fillColor(COLORS.maroon);
  doc.font("Helvetica-Bold").fontSize(128);
  doc.rotate(-20, { origin: [PAGE_W / 2, PAGE_H / 2] });
  doc.text("GREATPATHSHALA", -80, PAGE_H / 2 - 65, {
    width: PAGE_W + 160,
    align: "center",
  });
  doc.restore();
}

function drawBadge(doc, cx, cy) {
  doc.lineWidth(2).circle(cx, cy, 34).fillAndStroke(COLORS.gold, COLORS.maroon);
  doc.lineWidth(1).circle(cx, cy, 27).stroke(COLORS.cream);
  doc.polygon(...starPoints(cx, cy, 5, 15, 6.5)).fill(COLORS.white);
  const ribbonL = [
    [cx - 17, cy + 29],
    [cx - 2, cy + 29],
    [cx - 9, cy + 55],
  ];
  const ribbonR = [
    [cx + 2, cy + 29],
    [cx + 17, cy + 29],
    [cx + 9, cy + 55],
  ];
  doc.polygon(...ribbonL).fill(COLORS.maroon);
  doc.polygon(...ribbonR).fill(COLORS.goldDark);
}

async function createCertificate({ registration, session }) {
  fs.mkdirSync(certificateDir, { recursive: true });
  const certificateId =
    registration.certificateId ||
    `CERT-${new Date().getFullYear()}-${registration.id.slice(0, 8).toUpperCase()}`;
  const pdfName = `${registration.id}.pdf`,
    imageName = `${registration.id}.png`;
  const pdfPath = path.join(certificateDir, pdfName),
    imagePath = path.join(certificateDir, imageName);
  const attendance =
    session?.type === "class"
      ? `${Object.values(registration.attendance?.classDates || {}).filter(Boolean).length} day(s)`
      : registration.attendance?.webinarPresent
        ? "Yes"
        : "No";
  const attendanceLabel =
    session?.type === "class" ? "Class attendance" : "Webinar attended";
  const issuedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // ---------------- PDF (high quality, vector) ----------------
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.cream);

    drawWatermark(doc);

    drawCorner(doc, false);
    drawCorner(doc, true);

    doc
      .rect(26, 26, PAGE_W - 52, PAGE_H - 52)
      .lineWidth(1.4)
      .stroke(COLORS.gold);
    doc
      .rect(38, 38, PAGE_W - 76, PAGE_H - 76)
      .lineWidth(1)
      .stroke(COLORS.pink);

    drawBadge(doc, BADGE_CX, BADGE_CY);

    if (fs.existsSync(logoPath))
      doc.image(logoPath, PAGE_W / 2 - 28, 46, { fit: [56, 56] });
    doc
      .fillColor(COLORS.goldDark)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text("G R E A T P A T H S H A L A", 0, 106, { align: "center" });

    doc
      .fillColor(COLORS.ink)
      .font("Times-Bold")
      .fontSize(40)
      .text("CERTIFICATE", 0, 130, { align: "center" });

    const ribbonCy = 190;
    doc
      .polygon(...ribbonPoints(PAGE_W / 2, ribbonCy, 260, 26))
      .fill(COLORS.maroon);
    doc
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text("O F   C O M P L E T I O N", 0, ribbonCy - 6, { align: "center" });

    doc
      .fillColor(COLORS.gray)
      .font("Helvetica")
      .fontSize(12)
      .text("This certificate is proudly presented to", 0, 228, {
        align: "center",
      });

    const name = registration.name || "";
    const nameSize = fitText(doc, name, 600, 40);
    doc
      .fillColor(COLORS.maroon)
      .font("Times-BoldItalic")
      .fontSize(nameSize)
      .text(name, 121, 252, { width: 600, align: "center" });

    doc
      .moveTo(291, 310)
      .lineTo(551, 310)
      .lineWidth(1.6)
      .strokeColor(COLORS.gold)
      .stroke();

    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(13.5)
      .text(
        `For successfully completing ${registration.webinarTitle}.`,
        91,
        328,
        {
          width: 660,
          align: "center",
        },
      );

    const footerY = 452;
    const cols = [
      { x: 110, w: 200, label: "ISSUED", value: issuedDate },
      { x: 340, w: 200, label: "CERTIFICATE ID", value: certificateId },
    ];
    cols.forEach(({ x, w, label, value }) => {
      doc
        .moveTo(x, footerY - 8)
        .lineTo(x + w, footerY - 8)
        .lineWidth(0.75)
        .strokeColor(COLORS.gold)
        .stroke();
      doc
        .fillColor(COLORS.gray)
        .font("Helvetica")
        .fontSize(8.5)
        .text(label, x, footerY, {
          width: w,
          align: "center",
          characterSpacing: 0.6,
        });
      doc
        .fillColor(COLORS.maroon)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(value, x, footerY + 13, { width: w, align: "center" });
    });

    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, 630, 412, { fit: [110, 48], align: "center" });
    } else {
      doc
        .fillColor(COLORS.maroon)
        .font("Times-Italic")
        .fontSize(21)
        .text("GreatPathshala", 618, 425, { width: 134, align: "center" });
    }
    doc
      .moveTo(618, 468)
      .lineTo(752, 468)
      .lineWidth(1)
      .strokeColor(COLORS.gold)
      .stroke();
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(10)
      .text("Authorized Signature", 618, 474, { width: 134, align: "center" });

    doc
      .moveTo(300, 517)
      .lineTo(542, 517)
      .lineWidth(0.6)
      .strokeColor(COLORS.gold)
      .stroke();
    doc
      .fillColor(COLORS.goldDark)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(WEBSITE, 0, 524, { align: "center", characterSpacing: 1.2 });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  // ---------------- PNG (SVG rendered at 2x for high quality) ----------------
  const name = escapeXml(registration.name);
  const title = escapeXml(registration.webinarTitle);
  const S = SVG_SCALE;
  const toPts = (pts) => pts.map(([x, y]) => `${x * S},${y * S}`).join(" ");

  const watermarkSvg = `
    <text x="${(PAGE_W / 2) * S}" y="${(PAGE_H / 2 + 45) * S}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${128 * S}" fill="${COLORS.maroon}" opacity="0.045" transform="rotate(-20 ${(PAGE_W / 2) * S} ${(PAGE_H / 2) * S})">GREATPATHSHALA</text>`;

  const cornerBR = CORNER_SHAPES.map(({ pts, color }) => ({
    pts: mirrorPoints(pts, PAGE_W, PAGE_H),
    color,
  }));
  const cornerPolys = [...CORNER_SHAPES, ...cornerBR]
    .map(
      ({ pts, color }) => `<polygon points="${toPts(pts)}" fill="${color}"/>`,
    )
    .join("");

  const star = starPoints(BADGE_CX, BADGE_CY, 5, 15, 6.5);
  const ribbonL = [
    [BADGE_CX - 17, BADGE_CY + 29],
    [BADGE_CX - 2, BADGE_CY + 29],
    [BADGE_CX - 9, BADGE_CY + 55],
  ];
  const ribbonR = [
    [BADGE_CX + 2, BADGE_CY + 29],
    [BADGE_CX + 17, BADGE_CY + 29],
    [BADGE_CX + 9, BADGE_CY + 55],
  ];
  const badgeSvg = `
    <circle cx="${BADGE_CX * S}" cy="${BADGE_CY * S}" r="${34 * S}" fill="${COLORS.gold}" stroke="${COLORS.maroon}" stroke-width="${2 * S}"/>
    <circle cx="${BADGE_CX * S}" cy="${BADGE_CY * S}" r="${27 * S}" fill="none" stroke="${COLORS.cream}" stroke-width="${S}"/>
    <polygon points="${toPts(star)}" fill="${COLORS.white}"/>
    <polygon points="${toPts(ribbonL)}" fill="${COLORS.maroon}"/>
    <polygon points="${toPts(ribbonR)}" fill="${COLORS.goldDark}"/>`;

  const titleRibbonSvg = `<polygon points="${toPts(ribbonPoints(PAGE_W / 2, 190, 260, 26))}" fill="${COLORS.maroon}"/>`;

  const hasSignature = fs.existsSync(signaturePath);
  const signatureTextSvg = hasSignature
    ? ""
    : `<text x="${685 * S}" y="${440 * S}" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="${21 * S}" fill="${COLORS.maroon}">GreatPathshala</text>`;

  const footerCols = [
    { x: 110, w: 200, label: "ISSUED", value: escapeXml(issuedDate) },
    {
      x: 340,
      w: 200,
      label: "CERTIFICATE ID",
      value: escapeXml(certificateId),
    },
  ];
  const footerSvg = footerCols
    .map(
      ({ x, w, label, value }) => `
      <line x1="${x * S}" y1="${444 * S}" x2="${(x + w) * S}" y2="${444 * S}" stroke="${COLORS.gold}" stroke-width="${0.75 * S}"/>
      <text x="${(x + w / 2) * S}" y="${459 * S}" text-anchor="middle" font-family="Arial" font-size="${8.5 * S}" fill="${COLORS.gray}" letter-spacing="1">${label}</text>
      <text x="${(x + w / 2) * S}" y="${476 * S}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${11 * S}" fill="${COLORS.maroon}">${value}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W * S}" height="${PAGE_H * S}">
    <rect width="${PAGE_W * S}" height="${PAGE_H * S}" fill="${COLORS.cream}"/>
    ${watermarkSvg}
    ${cornerPolys}
    <rect x="${26 * S}" y="${26 * S}" width="${(PAGE_W - 52) * S}" height="${(PAGE_H - 52) * S}" fill="none" stroke="${COLORS.gold}" stroke-width="${1.4 * S}"/>
    <rect x="${38 * S}" y="${38 * S}" width="${(PAGE_W - 76) * S}" height="${(PAGE_H - 76) * S}" fill="none" stroke="${COLORS.pink}" stroke-width="${S}"/>
    ${badgeSvg}
    <text x="${(PAGE_W / 2) * S}" y="${118 * S}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${13 * S}" fill="${COLORS.goldDark}" letter-spacing="2">GREATPATHSHALA</text>
    <text x="${(PAGE_W / 2) * S}" y="${172 * S}" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="${40 * S}" fill="${COLORS.ink}">CERTIFICATE</text>
    ${titleRibbonSvg}
    <text x="${(PAGE_W / 2) * S}" y="${(190 + 5) * S}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${13 * S}" fill="${COLORS.white}" letter-spacing="2">OF COMPLETION</text>
    <text x="${(PAGE_W / 2) * S}" y="${232 * S}" text-anchor="middle" font-family="Arial" font-size="${12 * S}" fill="${COLORS.gray}">This certificate is proudly presented to</text>
    <text x="${(PAGE_W / 2) * S}" y="${292 * S}" text-anchor="middle" font-family="Georgia" font-style="italic" font-weight="bold" font-size="${42 * S}" fill="${COLORS.maroon}">${name}</text>
    <line x1="${291 * S}" y1="${310 * S}" x2="${551 * S}" y2="${310 * S}" stroke="${COLORS.gold}" stroke-width="${1.6 * S}"/>
    <text x="${(PAGE_W / 2) * S}" y="${348 * S}" text-anchor="middle" font-family="Arial" font-size="${13.5 * S}" fill="${COLORS.ink}">For successfully completing ${title}.</text>
    ${footerSvg}
    ${signatureTextSvg}
    <line x1="${618 * S}" y1="${468 * S}" x2="${752 * S}" y2="${468 * S}" stroke="${COLORS.gold}" stroke-width="${S}"/>
    <text x="${685 * S}" y="${484 * S}" text-anchor="middle" font-family="Arial" font-size="${10 * S}" fill="${COLORS.ink}">Authorized Signature</text>
    <line x1="${300 * S}" y1="${517 * S}" x2="${542 * S}" y2="${517 * S}" stroke="${COLORS.gold}" stroke-width="${0.6 * S}"/>
    <text x="${(PAGE_W / 2) * S}" y="${534 * S}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${11 * S}" fill="${COLORS.goldDark}" letter-spacing="1.2">${WEBSITE}</text>
  </svg>`;

  const composites = [];
  if (fs.existsSync(logoPath))
    composites.push({
      input: await sharp(logoPath)
        .resize(112, 112, { fit: "contain" })
        .png()
        .toBuffer(),
      left: (PAGE_W * S) / 2 - 56,
      top: 92 * S,
    });
  if (hasSignature)
    composites.push({
      input: await sharp(signaturePath)
        .resize(220, 96, { fit: "contain" })
        .png()
        .toBuffer(),
      left: 630 * S,
      top: 412 * S,
    });

  await sharp(Buffer.from(svg))
    .composite(composites)
    .png({ quality: 100 })
    .toFile(imagePath);

  return {
    certificateId,
    certificateUrl: `/certificates/${pdfName}`,
    certificateImageUrl: `/certificates/${imageName}`,
  };
}

module.exports = { createCertificate };
