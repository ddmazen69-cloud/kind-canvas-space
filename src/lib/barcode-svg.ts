// EAN-13 encoder + SVG renderer (zero dependencies).
// Produces scannable EAN-13 barcodes with valid check digit.

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
const MODULES = 95;

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
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

/** Bit pattern (95 modules) for a 13-digit EAN-13 code. */
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

export const EAN13_ASPECT = { w: 119, h: 75 }; // default quiet=12, barHeight=46, text 17

/**
 * Render an EAN-13 code as an SVG string.
 * `pxWidth` / `mmWidth` set the rendered width (height scales with the aspect).
 */
export function ean13Svg(code: string, opts: { barHeight?: number; quiet?: number; pxWidth?: number; mmWidth?: number } = {}): string {
  const q = opts.quiet ?? 12;
  const barHeight = opts.barHeight ?? 46;
  const pattern = ean13Pattern(code);
  const w = q * 2 + pattern.length;
  const textY = q + barHeight + 9;
  const h = textY + 8;
  const scale = (opts.mmWidth ?? opts.pxWidth ?? w) / w;
  const widthAttr = opts.mmWidth ? `${(w * scale).toFixed(2)}mm` : opts.pxWidth ? `${Math.round(w * scale)}` : `${w}`;
  const heightAttr = opts.mmWidth ? `${(h * scale).toFixed(2)}mm` : opts.pxWidth ? `${Math.round(h * scale)}` : `${h}`;

  let bars = "";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "1") bars += `<rect x="${q + i}" y="${q}" width="1" height="${barHeight}"/>`;
  }
  const d = code;
  const texts = [`<text x="${q - 5}" y="${textY}" text-anchor="middle" font-size="10" font-family="Arial, sans-serif">${d[0]}</text>`];
  for (let i = 0; i < 6; i++) {
    texts.push(`<text x="${q + 3 + i * 7 + 3.5}" y="${textY}" text-anchor="middle" font-size="9" font-family="Arial, sans-serif">${d[i + 1]}</text>`);
  }
  for (let j = 0; j < 6; j++) {
    texts.push(`<text x="${q + 50 + j * 7 + 3.5}" y="${textY}" text-anchor="middle" font-size="9" font-family="Arial, sans-serif">${d[j + 7]}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/><g fill="#000000">${bars}</g>${texts.join("")}</svg>`;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code[12];
}
