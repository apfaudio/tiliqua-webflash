const GLYPH_W = 9;
const GLYPH_H = 15;
const ATLAS_COLS = 16;
const FIRST_CHAR = 0x20;

const PANEL_W = 72;
const PANEL_H = 135;
const IO_LEFT_ROWS = [18, 32, 46, 60, 74, 88, 102, 116];
const IO_RIGHT_ROWS = [20, 42, 56, 77, 98, 116];

const IO_COLS = 18;
const LABEL_GAP = 6;
const LABEL_W = IO_COLS * GLYPH_W;
const PANEL_X = LABEL_W + LABEL_GAP;
const WIDTH = LABEL_W + LABEL_GAP + PANEL_W + LABEL_GAP + LABEL_W;

const BRIEF_LINES = 2;
const BRIEF_COLS = Math.floor(WIDTH / GLYPH_W);
const HEADER_H = GLYPH_H + 4 + BRIEF_LINES * GLYPH_H + 8;
const HEIGHT = HEADER_H + PANEL_H;

export const DOCS_WIDTH = WIDTH;

const COLOR_TITLE = [0xff, 0xff, 0xff];
const COLOR_BODY = [0x44, 0xaa, 0xff];

let assets = null;

async function loadMask(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const mask = new Uint8Array(img.width * img.height);
    for (let i = 0; i < mask.length; i++) {
        mask[i] = data[i * 4];
    }
    return { w: img.width, h: img.height, data: mask };
}

export async function loadDocsAssets() {
    const [panel, font, fontBold] = await Promise.all([
        loadMask('tiliqua.png'),
        loadMask('font9x15.png'),
        loadMask('font9x15b.png'),
    ]);
    assets = { panel, font, fontBold };
}

function blitMask(target, mask, dx, dy, color, sx = 0, sy = 0, w = mask.w, h = mask.h) {
    for (let y = 0; y < h; y++) {
        const ty = dy + y;
        if (ty < 0 || ty >= target.height) continue;
        for (let x = 0; x < w; x++) {
            const tx = dx + x;
            if (tx < 0 || tx >= target.width) continue;
            if (mask.data[(sy + y) * mask.w + (sx + x)] < 64) continue;
            const o = (ty * target.width + tx) * 4;
            target.data[o] = color[0];
            target.data[o + 1] = color[1];
            target.data[o + 2] = color[2];
            target.data[o + 3] = 255;
        }
    }
}

function drawText(target, text, x, y, color, bold = false) {
    const atlas = bold ? assets.fontBold : assets.font;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const index = (code < FIRST_CHAR || code > 0x7f ? 0x3f : code) - FIRST_CHAR;
        blitMask(
            target, atlas, x + i * GLYPH_W, y, color,
            (index % ATLAS_COLS) * GLYPH_W, Math.floor(index / ATLAS_COLS) * GLYPH_H,
            GLYPH_W, GLYPH_H
        );
    }
}

function drawCentred(target, text, y, color, bold = false) {
    const x = Math.round(PANEL_X + PANEL_W / 2 - (text.length * GLYPH_W) / 2);
    drawText(target, text, x, y, color, bold);
}

function wrapText(text, columns, maxLines) {
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        if (line && (line + ' ' + word).length > columns) {
            lines.push(line);
            line = word;
            if (lines.length === maxLines) return lines;
        } else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

export function docsReady() {
    return assets !== null;
}

export function fitScale(availableWidth, availableHeight = 0) {
    const byWidth = Math.floor(availableWidth / WIDTH);
    const byHeight = availableHeight ? Math.floor(availableHeight / HEIGHT) : byWidth;
    return Math.max(1, Math.min(byWidth, byHeight));
}

export function drawDocs(canvas, info, scale = 2) {
    const help = info && info.help;
    if (!help || !assets) return false;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.width = `${WIDTH * scale}px`;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(WIDTH, HEIGHT);

    drawCentred(image, (info.title || '').toUpperCase(), 0, COLOR_TITLE, true);
    wrapText(help.brief || '', BRIEF_COLS, BRIEF_LINES).forEach((line, i) => {
        drawCentred(image, line, GLYPH_H + 4 + i * GLYPH_H, COLOR_BODY);
    });

    blitMask(image, assets.panel, PANEL_X, HEADER_H, COLOR_BODY);

    (help.io_left || []).forEach((label, i) => {
        if (!label || i >= IO_LEFT_ROWS.length) return;
        const text = label.slice(0, IO_COLS);
        drawText(image, text, PANEL_X - LABEL_GAP - text.length * GLYPH_W,
                 HEADER_H + IO_LEFT_ROWS[i] - 6, COLOR_BODY);
    });
    (help.io_right || []).forEach((label, i) => {
        if (!label || i >= IO_RIGHT_ROWS.length) return;
        drawText(image, label.slice(0, IO_COLS), PANEL_X + PANEL_W + LABEL_GAP,
                 HEADER_H + IO_RIGHT_ROWS[i] - 6, COLOR_BODY);
    });

    ctx.putImageData(image, 0, 0);
    return true;
}
