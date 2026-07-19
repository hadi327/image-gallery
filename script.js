// ---- Configuration & Asset Allocation ----
const DEFAULT_IMAGES = [
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/612d1402-0ad9-4135-3bbc-a30a6a252b00/w=800", alt: "Canvas Node 1" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/6d2ad64a-102d-4eab-0efe-31479e34b500/w=800", alt: "Canvas Node 2" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/be854dd1-37aa-4fc7-f569-fdb948109300/w=800", alt: "Canvas Node 3" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/51984031-9176-484b-f5e0-4af9a8e9ed00/w=800", alt: "Canvas Node 4" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/34ce1842-4b7a-4d52-0302-38582c341700/w=800", alt: "Canvas Node 5" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/88369c6d-00cc-4ac9-74ca-0f0965e06300/w=800", alt: "Canvas Node 6" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/aeaa0756-9647-4f6c-d900-204bd25e4a00/w=800", alt: "Canvas Node 7" },
    { src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/316d1761-fd79-4ca9-b8d4-f2bb20521a00/w=800", alt: "Canvas Node 8" },
];

const config = {
    images: DEFAULT_IMAGES,
    density: 5,
    imageWidth: 150,
    imageHeight: 150,
    rounded: 3,
    dragSpeed: 20,
    driftAmount: 20,
    friction: 10,
    backgroundColor: "#000000"
};

// Internal Engine Specifications
const PX_PER_UNIT = 6;
const CELL_SIZE = 110;
const MAX_RANGE = 20;
const SCALE_MIN = 0.45;
const SCALE_MAX = 1.6;
const SUBCELL_INNER_PAD = 0.1;

// Configuration boundary safe clamp rules
const safeDensity = Math.max(1, Math.min(15, Math.floor(config.density || 5)));
const safeImageWidth = Math.max(8, Math.min(4000, config.imageWidth || 150));
const safeImageHeight = Math.max(8, Math.min(4000, config.imageHeight || 150));
const safeRounded = Math.max(0, Math.min(20, config.rounded ?? 3));
const safeDragSpeed = Math.max(0.1, Math.min(5, (config.dragSpeed || 20) / 20));
const safeDriftAmount = Math.max(0, Math.min(20, config.driftAmount ?? 8));
const safeFriction = 1 - (Math.max(1, Math.min(20, config.friction ?? 10)) / 20) * 0.3;

const subN = Math.max(1, Math.ceil(Math.sqrt(safeDensity)));
const subSize = CELL_SIZE / subN;
const effectivePerCell = Math.min(safeDensity, subN * subN);
const imagesCount = config.images.length;

// ---- State Management Coordinate Systems ----
let targetX = 0, targetY = 0;
let camX = 0, camY = 0;
let velX = 0, velY = 0;

let targetLogZoom = 0, logZoom = 0, velLogZoom = 0;
let driftTX = 0, driftTY = 0, driftX = 0, driftY = 0;

const container = document.getElementById("gallery-container");
const scene = document.getElementById("gallery-scene");
container.style.backgroundColor = config.backgroundColor;

let cW = container.clientWidth || 900;
let cH = container.clientHeight || 600;

const ro = new ResizeObserver(() => {
    cW = container.clientWidth || cW;
    cH = container.clientHeight || cH;
});
ro.observe(container);

// ---- Spatial Hashing & Deterministic PRNG Core ----
function hash3(cx, cy, cz, salt) {
    let h = (cx | 0) * 0x8da6b343;
    h ^= Math.imul(cy | 0, 0xd8163841);
    h ^= Math.imul(cz | 0, 0xcb1ab31f);
    h ^= salt | 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ---- Layout Array Generator Processing Engine ----
function generateCell(gx, gy, octave) {
    const seed = hash3(gx, gy, octave | 0, 0x9e3779b1);
    const rand = mulberry32(seed);

    const totalSubs = subN * subN;
    const subs = new Array(totalSubs);
    for (let i = 0; i < totalSubs; i++) subs[i] = i;
    for (let i = totalSubs - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = subs[i];
        subs[i] = subs[j];
        subs[j] = tmp;
    }

    const tiles = [];
    const count = Math.min(effectivePerCell, totalSubs);
    const pad = subSize * SUBCELL_INNER_PAD;
    const innerRange = Math.max(0, subSize - pad * 2);

    const cellX0 = gx * CELL_SIZE;
    const cellY0 = gy * CELL_SIZE;

    const wWorld = safeImageWidth / PX_PER_UNIT;
    const hWorld = safeImageHeight / PX_PER_UNIT;

    for (let slot = 0; slot < count; slot++) {
        const subIdx = subs[slot];
        const sx = subIdx % subN;
        const sy = Math.floor(subIdx / subN);

        const wx = cellX0 + sx * subSize + pad + rand() * innerRange;
        const wy = cellY0 + sy * subSize + pad + rand() * innerRange;
        const bakedScale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN);
        const imgIdx = imagesCount > 0 ? Math.floor(rand() * imagesCount) % imagesCount : 0;

        tiles.push({
            wx, wy, cx: gx, cy: gy, slot, octave, imgIdx,
            w: wWorld, h: hWorld, rot: 0, bakedScale
        });
    }
    return tiles;
}

// ---- Layer Pooling Optimization Architecture ----
const layerPools = new Map();

function getPool(octave) {
    let pool = layerPools.get(octave);
    if (!pool) {
        pool = { tileEls: new Map(), imgEls: new Map() };
        layerPools.set(octave, pool);
    }
    return pool;
}

function disposeLayer(octave) {
    const pool = layerPools.get(octave);
    if (!pool) return;
    pool.tileEls.forEach((el) => {
        if (el.parentNode === scene) scene.removeChild(el);
    });
    pool.tileEls.clear();
    pool.imgEls.clear();
    layerPools.delete(octave);
}

function removeTile(octave, key) {
    const pool = layerPools.get(octave);
    if (!pool) return;
    const el = pool.tileEls.get(key);
    if (el && el.parentNode === scene) scene.removeChild(el);
    pool.tileEls.delete(key);
    pool.imgEls.delete(key);
}

function ensureTile(t) {
    const pool = getPool(t.octave);
    const key = `${t.cx},${t.cy},${t.slot}`;
    let el = pool.tileEls.get(key);
    
    if (!el) {
        el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = "50%";
        el.style.top = "50%";
        el.style.transformOrigin = "0 0";
        el.style.willChange = "transform, opacity";
        el.style.pointerEvents = "none";
        el.dataset.tileKey = key;

        const img = document.createElement("img");
        const src = config.images[t.imgIdx];
        img.src = src?.src || "";
        img.alt = src?.alt || "";
        img.draggable = false;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.pointerEvents = "none";
        img.style.userSelect = "none";
        
        el.appendChild(img);
        scene.appendChild(el);
        
        pool.tileEls.set(key, el);
        pool.imgEls.set(key, img);
    }
    return el;
}

// ---- Multi-Layer Octave Projection Engine Pipeline ----
function projectLayer(octave, layerScale, layerAlpha, layerZBase, cx, cy) {
    const pool = getPool(octave);
    const camCellX = Math.floor(cx / CELL_SIZE);
    const camCellY = Math.floor(cy / CELL_SIZE);

    const worldHalfX = cW / 2 / (PX_PER_UNIT * layerScale);
    const worldHalfY = cH / 2 / (PX_PER_UNIT * layerScale);
    const rangeX = Math.min(MAX_RANGE, Math.ceil(worldHalfX / CELL_SIZE) + 1);
    const rangeY = Math.min(MAX_RANGE, Math.ceil(worldHalfY / CELL_SIZE) + 1);

    const visibleKeys = new Set();
    const tilesThisFrame = [];

    for (let dy = -rangeY; dy <= rangeY; dy++) {
        for (let dx = -rangeX; dx <= rangeX; dx++) {
            const tiles = generateCell(camCellX + dx, camCellY + dy, octave);
            for (let i = 0; i < tiles.length; i++) {
                tilesThisFrame.push(tiles[i]);
            }
        }
    }

    const orderKeys = new Array(tilesThisFrame.length);
    const orderScale = new Array(tilesThisFrame.length);

    for (let i = 0; i < tilesThisFrame.length; i++) {
        const t = tilesThisFrame[i];
        const key = `${t.cx},${t.cy},${t.slot}`;
        visibleKeys.add(key);

        const dxPx = (t.wx - cx) * layerScale * PX_PER_UNIT;
        const dyPx = (t.wy - cy) * layerScale * PX_PER_UNIT;
        const s = t.bakedScale * layerScale;

        const el = ensureTile(t);
        const img = pool.imgEls.get(key);

        const wPx = t.w * PX_PER_UNIT;
        const hPx = t.h * PX_PER_UNIT;

        el.style.transform = `translate3d(${dxPx}px, ${dyPx}px, 0) scale(${s}) rotate(${t.rot}deg) translate(${-wPx / 2}px, ${-hPx / 2}px)`;
        el.style.width = `${wPx}px`;
        el.style.height = `${hPx}px`;
        el.style.opacity = String(layerAlpha);

        if (img) {
            const radiusPx = (safeRounded / 20) * (Math.min(wPx, hPx) / 2);
            img.style.borderRadius = `${radiusPx}px`;
        }

        orderKeys[i] = key;
        orderScale[i] = t.bakedScale;
    }

    for (const key of Array.from(pool.tileEls.keys())) {
        if (!visibleKeys.has(key)) removeTile(octave, key);
    }

    const idxs = orderKeys.map((_, i) => i);
    idxs.sort((a, b) => orderScale[a] - orderScale[b]);
    for (let k = 0; k < idxs.length; k++) {
        const el = pool.tileEls.get(orderKeys[idxs[k]]);
        if (el) el.style.zIndex = String(layerZBase + k);
    }
}

let lastOctaves = new Set();

function project() {
    const octave = Math.floor(logZoom);
    const frac = logZoom - octave;

    const scaleCurrent = Math.pow(2, frac);
    const scaleNext = Math.pow(2, frac - 1);

    const alphaCurrent = 1 - frac;
    const alphaNext = frac;

    projectLayer(octave, scaleCurrent, alphaCurrent, 0, camX, camY);
    projectLayer(octave + 1, scaleNext, alphaNext, 100000, camX, camY);

    const nowOctaves = new Set([octave, octave + 1]);
    for (const o of Array.from(lastOctaves)) {
        if (!nowOctaves.has(o)) disposeLayer(o);
    }
    for (const o of Array.from(layerPools.keys())) {
        if (!nowOctaves.has(o)) disposeLayer(o);
    }
    lastOctaves = nowOctaves;
}

// ---- Main Thread Render Loop ----
function loop() {
    targetX += velX;
    targetY += velY;
    velX *= safeFriction;
    velY *= safeFriction;

    if (velLogZoom !== 0) {
        targetLogZoom += velLogZoom;
        velLogZoom *= safeFriction;
    }

    driftX = lerp(driftX, driftTX * safeDriftAmount, 0.08);
    driftY = lerp(driftY, driftTY * safeDriftAmount, 0.08);

    camX = lerp(camX, targetX + driftX, 0.18);
    camY = lerp(camY, targetY + driftY, 0.18);
    logZoom = lerp(logZoom, targetLogZoom, 0.18);

    project();
    requestAnimationFrame(loop);
}

project();
requestAnimationFrame(loop);

// ---- Interaction Event Listeners ----
let dragging = false;
let lastPX = 0, lastPY = 0, lastT = 0, pid = null;

container.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    pid = e.pointerId;
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastT = e.timeStamp;
    try { container.setPointerCapture(e.pointerId); } catch {}
});

container.addEventListener("pointermove", (e) => {
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    driftTX = Math.max(-1, Math.min(1, nx));
    driftTY = Math.max(-1, Math.min(1, ny));

    if (!dragging || e.pointerId !== pid) return;

    const dpx = e.clientX - lastPX;
    const dpy = e.clientY - lastPY;

    const frac = logZoom - Math.floor(logZoom);
    const effScale = (1 - frac) * Math.pow(2, frac) + frac * Math.pow(2, frac - 1);
    
    const dWorldX = (-dpx / (PX_PER_UNIT * effScale)) * safeDragSpeed;
    const dWorldY = (-dpy / (PX_PER_UNIT * effScale)) * safeDragSpeed;
    
    targetX += dWorldX;
    targetY += dWorldY;

    const dt = Math.max(1, e.timeStamp - lastT);
    const k = 16 / dt;
    velX = dWorldX * k;
    velY = dWorldY * k;

    lastPX = e.clientX;
    lastPY = e.clientY;
    lastT = e.timeStamp;
});

const handlePointerUp = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    pid = null;
    try { container.releasePointerCapture(e.pointerId); } catch {}
};

container.addEventListener("pointerup", handlePointerUp);
container.addEventListener("pointercancel", handlePointerUp);

container.addEventListener("wheel", (e) => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= 400;
    const step = -delta * 0.0015 * safeDragSpeed;
    velLogZoom += step;
}, { passive: false });

container.addEventListener("pointerleave", () => {
    driftTX = 0;
    driftTY = 0;
});
