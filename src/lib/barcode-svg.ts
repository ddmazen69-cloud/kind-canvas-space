// Zero-dependency barcode encoders + SVG renderers.
// Supports EAN-13, UPC-A and Code128 (code set B).

/* ─────────────────────────── EAN-13 / UPC-A tables ─────────────────────────── */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL",
  "4": "LGLLGG", "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG",
  "8": "LGLGGL", "9": "LGGLGL",
};
const START = "101";
const MIDDLE = "01010";
const END = "101";

export function ean13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function upcaCheckDigit(first11: string): string {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(first11[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

/** Random valid 13-digit EAN-13 code, avoiding the provided existing codes. */
export function generateEan13(existing: Iterable<string | null | undefined> = []): string {
  const taken = new Set<string>();
  for (const x of existing) if (x) taken.add(String(x).trim());
  for (let attempt = 0; attempt < 30; attempt++) {
    let first12 = String(1 + Math.floor(Math.random() * 9));
    for (let i = 0; i < 11; i++) first12 += Math.floor(Math.random() * 10);
    const code = first12 + ean13CheckDigit(first12);
    if (!taken.has(code)) return code;
  }
  const ts = String(Date.now()).padStart(12, "0").slice(-12);
  return ts + ean13CheckDigit(ts);
}

/** Random valid 12-digit UPC-A code, avoiding the provided existing codes. */
export function generateUpcA(existing: Iterable<string | null | undefined> = []): string {
  const taken = new Set<string>();
  for (const x of existing) if (x) taken.add(String(x).trim());
  for (let attempt = 0; attempt < 30; attempt++) {
    let first11 = String(1 + Math.floor(Math.random() * 9));
    for (let i = 0; i < 10; i++) first11 += Math.floor(Math.random() * 10);
    const code = first11 + upcaCheckDigit(first11);
    if (!taken.has(code)) return code;
  }
  const ts = String(Date.now()).padStart(11, "0").slice(-11);
  return ts + upcaCheckDigit(ts);
}

/* ─────────────────────────────── Code 128 tables ────────────────────────────── */

// Standard Code128 symbol patterns, index = symbol value (0..106).
const C128 = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100",
  "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110",
  "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010",
  "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110",
  "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000",
  "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010",
  "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110",
  "11110101110", "11010000100", "11010010000", "11010011100", "1100011101011",
];
const C128_START_B = 104;
const C128_STOP = 106;

/** Code128 (set B) bit pattern for an ASCII 32–126 string. */
export function code128bPattern(text: string): string {
  let pattern = C128[C128_START_B];
  let checksum = C128_START_B;
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    if (val < 0 || val > 95) throw new Error("Code128 يدعم الأرقام والحروف اللاتينية فقط");
    pattern += C128[val];
    checksum += val * (i + 1);
  }
  checksum %= 103;
  pattern += C128[checksum];
  pattern += C128[C128_STOP];
  return pattern;
}

const C128_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Random 8-char alphanumeric Code128 code, avoiding the provided existing codes. */
export function generateCode128(existing: Iterable<string | null | undefined> = []): string {
  const taken = new Set<string>();
  for (const x of existing) if (x) taken.add(String(x).trim());
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    for (let i = 0; i < 8; i++) code += C128_CHARSET[Math.floor(Math.random() * C128_CHARSET.length)];
    if (!taken.has(code)) return code;
  }
  return "BK" + String(Date.now()).slice(-6);
}

/* ─────────────────────────── format detection & validity ────────────────────── */

export type BarcodeFormat = "ean13" | "upca" | "code128";

export function detectFormat(code: string): BarcodeFormat {
  if (/^\d{13}$/.test(code)) return "ean13";
  if (/^\d{12}$/.test(code)) return "upca";
  return "code128";
}

export function isValidBarcode(format: BarcodeFormat, code: string): boolean {
  if (format === "ean13") return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
  if (format === "upca") return /^\d{12}$/.test(code) && upcaCheckDigit(code.slice(0, 11)) === code[11];
  return code.length >= 1 && code.length <= 80 && /^[\x20-\x7E]+$/.test(code);
}

/* ─────────────────────────────── SVG rendering ──────────────────────────────── */

const QUIET = 12;
const BAR_HEIGHT = 46;

function renderSvg(pattern: string, text: Array<{ x: number; value: string; fontSize: number }>, opts: { quiet?: number; barHeight?: number; pxWidth?: number; mmWidth?: number }): string {
  const q = opts.quiet ?? QUIET;
  const barHeight = opts.barHeight ?? BAR_HEIGHT;
  const w = q * 2 + pattern.length;
  const textY = q + barHeight + 9;
  const h = textY + 8;
  const scale = (opts.mmWidth ?? opts.pxWidth ?? w) / w;
  const widthAttr = opts.mmWidth ? `${(w * scale).toFixed(2)}mm` : opts.pxWidth ? `${Math.round(w * scale)}` : `${w}`;
  const heightAttr = opts.mmWidth ? `${(h * scale).toFixed(2)}mm` : opts.pxWidth ? `${Math.round(h * scale)}` : `${h}`;
  let bars = "";
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === "1") bars += `<rect x="${q + i}" y="${q}" width="1" height="${barHeight}"/>`;
  const texts = text.map((t) => `<text x="${q + t.x}" y="${textY}" text-anchor="middle" font-size="${t.fontSize}" font-family="Arial, sans-serif">${t.value}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/><g fill="#000000">${bars}</g>${texts}</svg>`;
}

function ean13Pattern(code: string): string {
  const d = code.slice(0, 13);
  const parity = PARITY[d[0]] ?? "LLLLLL";
  let pattern = START;
  for (let i = 1; i <= 6; i++) pattern += (parity[i - 1] === "L" ? L : G)[Number(d[i])];
  pattern += MIDDLE;
  for (let i = 7; i <= 12; i++) pattern += R[Number(d[i])];
  pattern += END;
  return pattern;
}

function upcaPattern(code: string): string {
  const d = code.slice(0, 12);
  let pattern = START;
  for (let i = 0; i < 6; i++) pattern += L[Number(d[i])];
  pattern += MIDDLE;
  for (let i = 6; i < 12; i++) pattern += R[Number(d[i])];
  pattern += END;
  return pattern;
}

/** EAN-13 digit positions (relative to pattern start). */
function ean13Text(code: string) {
  const d = code;
  const t: Array<{ x: number; value: string; fontSize: number }> = [{ x: -5, value: d[0], fontSize: 10 }];
  for (let i = 0; i < 6; i++) t.push({ x: 3 + i * 7 + 3.5, value: d[i + 1], fontSize: 9 });
  for (let j = 0; j < 6; j++) t.push({ x: 50 + j * 7 + 3.5, value: d[j + 7], fontSize: 9 });
  return t;
}

/** UPC-A digit positions (all 12 under the bars). */
function upcaText(code: string) {
  const d = code;
  const t: Array<{ x: number; value: string; fontSize: number }> = [];
  for (let i = 0; i < 6; i++) t.push({ x: 3 + i * 7 + 3.5, value: d[i], fontSize: 9 });
  for (let j = 0; j < 6; j++) t.push({ x: 50 + j * 7 + 3.5, value: d[j + 6], fontSize: 9 });
  return t;
}

export function ean13Svg(code: string, opts: { quiet?: number; barHeight?: number; pxWidth?: number; mmWidth?: number } = {}): string {
  return renderSvg(ean13Pattern(code), ean13Text(code), opts);
}

export function upcaSvg(code: string, opts: { quiet?: number; barHeight?: number; pxWidth?: number; mmWidth?: number } = {}): string {
  return renderSvg(upcaPattern(code), upcaText(code), opts);
}

export function code128Svg(code: string, opts: { quiet?: number; barHeight?: number; pxWidth?: number; mmWidth?: number } = {}): string {
  return renderSvg(code128bPattern(code), [{ x: code128bPattern(code).length / 2, value: code, fontSize: 9 }], opts);
}

/** Render any supported code in the detected format. */
export function renderBarcode(code: string, opts: { quiet?: number; barHeight?: number; pxWidth?: number; mmWidth?: number } = {}): string {
  const f = detectFormat(code);
  if (f === "upca") return upcaSvg(code, opts);
  if (f === "code128") return code128Svg(code, opts);
  return ean13Svg(code, opts);
}

/** Intrinsic SVG dimensions (viewBox) for a code in the given format — used for mm-fit on labels. */
export function barcodeViewBox(format: BarcodeFormat, code: string): { w: number; h: number } {
  const pattern = format === "code128" ? code128bPattern(code) : format === "upca" ? upcaPattern(code) : ean13Pattern(code);
  const q = QUIET;
  const barHeight = BAR_HEIGHT;
  return { w: q * 2 + pattern.length, h: q + barHeight + 9 + 8 };
}
