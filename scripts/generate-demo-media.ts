/**
 * Generates the demo catalogue imagery.
 *
 * Why generated and not photographed: the two demo stores are fixtures, and
 * stock photography would be worse on every axis that matters here. A stock
 * photo cannot be checked against the row it illustrates, so a bracelet shot
 * quietly ends up on a bangle; it needs a network round trip, so the shop
 * looks broken offline; and its licence travels with the repository. These are
 * drawn from the product's own attributes - its jewellery type, its metal, its
 * stone - so a 22K gold kada renders as a gold kada and a moonstone chain
 * renders with a moonstone.
 *
 * They are deliberately stylised line art, not imitation photographs. Nothing
 * here pretends to be a picture of a real object someone can buy.
 *
 * Output is SVG: a couple of kilobytes each, crisp at any size, and diffable.
 *
 * Run with: pnpm media:generate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'web',
  'public',
  'demo',
);

// --- palettes ---------------------------------------------------------------

interface Palette {
  /** Background wash, light to slightly deeper. */
  bg0: string;
  bg1: string;
  /** Metal: highlight, body, shadow. */
  hi: string;
  mid: string;
  lo: string;
  /** Stone, when the piece has one. */
  stone: string;
  stoneHi: string;
}

const PALETTES = {
  gold: {
    bg0: '#FCF6EA',
    bg1: '#F0E2C4',
    hi: '#FBEFD2',
    mid: '#D7AF62',
    lo: '#9A763A',
    stone: '#B33A3A',
    stoneHi: '#E8807F',
  },
  roseGold: {
    bg0: '#FDF2EE',
    bg1: '#F2DAD2',
    hi: '#FBE2D8',
    mid: '#D59A89',
    lo: '#A3675A',
    stone: '#8E4B6B',
    stoneHi: '#C98FA9',
  },
  whiteGold: {
    bg0: '#F7F9FB',
    bg1: '#E4EAEF',
    hi: '#FFFFFF',
    mid: '#C9D2D9',
    lo: '#8C98A2',
    stone: '#DCEBF5',
    stoneHi: '#FFFFFF',
  },
  silver: {
    bg0: '#F6F8F9',
    bg1: '#E2E8EC',
    hi: '#FDFEFE',
    mid: '#BEC7CE',
    lo: '#7E8B95',
    stone: '#AFC6D8',
    stoneHi: '#EAF3F9',
  },
  oxidised: {
    bg0: '#F4F4F3',
    bg1: '#DEDEDC',
    hi: '#E9E9E6',
    mid: '#9A9A96',
    lo: '#5B5B58',
    stone: '#C2B49A',
    stoneHi: '#E7DDC9',
  },
  pearl: {
    bg0: '#FBF9F6',
    bg1: '#EAE3D8',
    hi: '#FFFFFF',
    mid: '#EDE6DA',
    lo: '#C3B8A6',
    stone: '#F6F1E8',
    stoneHi: '#FFFFFF',
  },
} as const satisfies Record<string, Palette>;

type PaletteKey = keyof typeof PALETTES;

// --- drawing helpers --------------------------------------------------------

const S = 1000;

function defs(p: Palette, id: string): string {
  return `
  <defs>
    <radialGradient id="bg-${id}" cx="50%" cy="38%" r="78%">
      <stop offset="0%" stop-color="${p.bg0}"/>
      <stop offset="100%" stop-color="${p.bg1}"/>
    </radialGradient>
    <linearGradient id="metal-${id}" x1="0%" y1="0%" x2="70%" y2="100%">
      <stop offset="0%" stop-color="${p.hi}"/>
      <stop offset="42%" stop-color="${p.mid}"/>
      <stop offset="100%" stop-color="${p.lo}"/>
    </linearGradient>
    <linearGradient id="stone-${id}" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="${p.stoneHi}"/>
      <stop offset="100%" stop-color="${p.stone}"/>
    </linearGradient>
    <radialGradient id="shadow-${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${p.lo}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${p.lo}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

/** A soft contact shadow so the piece sits on the surface rather than floats. */
function groundShadow(id: string, cx: number, cy: number, rx: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.round(rx * 0.17)}" fill="url(#shadow-${id})"/>`;
}

function stroke(id: string, width: number): string {
  return `fill="none" stroke="url(#metal-${id})" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
}

/** Specular highlight arc laid over a metal stroke to read as polish. */
function sheen(d: string, width: number, opacity = 0.75): string {
  return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function facetedStone(id: string, cx: number, cy: number, r: number): string {
  const top = cy - r;
  const bottom = cy + r * 1.15;
  return `
    <g>
      <polygon points="${cx - r},${cy - r * 0.35} ${cx - r * 0.5},${top} ${cx + r * 0.5},${top} ${cx + r},${cy - r * 0.35} ${cx},${bottom}"
               fill="url(#stone-${id})" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="3"/>
      <polygon points="${cx - r * 0.5},${top} ${cx + r * 0.5},${top} ${cx},${cy - r * 0.35}"
               fill="#FFFFFF" fill-opacity="0.45"/>
      <polygon points="${cx - r},${cy - r * 0.35} ${cx},${cy - r * 0.35} ${cx},${bottom}"
               fill="#000000" fill-opacity="0.06"/>
    </g>`;
}

function roundStone(id: string, cx: number, cy: number, r: number): string {
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#stone-${id})" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="3"/>
      <ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" rx="${r * 0.32}" ry="${r * 0.22}" fill="#FFFFFF" fill-opacity="0.6"/>
    </g>`;
}

// --- shapes -----------------------------------------------------------------
// Each returns the artwork for a 1000x1000 canvas, centred and generously
// margined so a square crop never clips it.

type Shape = (id: string, p: Palette) => string;

const solitaireRing: Shape = (id) => `
  ${groundShadow(id, 500, 800, 230)}
  <circle cx="500" cy="590" r="205" ${stroke(id, 40)}/>
  ${sheen('M 355 448 A 205 205 0 0 1 470 388', 12, 0.65)}
  <path d="M 452 400 L 470 350 M 548 400 L 530 350" ${stroke(id, 16)}/>
  ${facetedStone(id, 500, 318, 92)}`;

const couplePair: Shape = (id) => `
  ${groundShadow(id, 500, 810, 300)}
  <circle cx="390" cy="560" r="180" ${stroke(id, 46)}/>
  <circle cx="625" cy="620" r="150" ${stroke(id, 34)}/>
  ${sheen('M 262 432 A 180 180 0 0 1 368 381', 13, 0.6)}
  ${sheen('M 521 514 A 150 150 0 0 1 609 471', 10, 0.55)}
  ${roundStone(id, 625, 470, 26)}`;

const stackingRings: Shape = (id) => `
  ${groundShadow(id, 500, 830, 260)}
  <ellipse cx="500" cy="400" rx="195" ry="60" ${stroke(id, 22)}/>
  <ellipse cx="500" cy="520" rx="205" ry="63" ${stroke(id, 26)}/>
  <ellipse cx="500" cy="645" rx="190" ry="58" ${stroke(id, 20)}/>
  ${sheen('M 330 380 A 195 60 0 0 1 470 345', 8, 0.7)}
  ${sheen('M 318 500 A 205 63 0 0 1 468 462', 9, 0.7)}`;

const bangle: Shape = (id, p) => `
  ${groundShadow(id, 500, 830, 290)}
  <circle cx="500" cy="500" r="290" ${stroke(id, 72)}/>
  <circle cx="500" cy="500" r="290" fill="none" stroke="${p.lo}" stroke-opacity="0.35"
          stroke-width="72" stroke-dasharray="6 46" stroke-linecap="round"/>
  ${sheen('M 294 294 A 290 290 0 0 1 452 213', 20, 0.6)}
  <circle cx="500" cy="500" r="252" fill="none" stroke="${p.hi}" stroke-opacity="0.5" stroke-width="3"/>
  <circle cx="500" cy="500" r="328" fill="none" stroke="${p.lo}" stroke-opacity="0.3" stroke-width="3"/>`;

const cuff: Shape = (id) => `
  ${groundShadow(id, 500, 820, 270)}
  <path d="M 742 620 A 275 275 0 1 0 630 745" ${stroke(id, 78)}/>
  ${sheen('M 300 330 A 275 275 0 0 1 455 232', 22, 0.6)}
  <circle cx="742" cy="620" r="30" fill="url(#metal-${id})"/>
  <circle cx="630" cy="745" r="30" fill="url(#metal-${id})"/>`;

const chain: Shape = (id) => {
  const links: string[] = [];
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    const x = 160 + t * 680;
    const y = 420 + Math.sin(t * Math.PI) * 220;
    const tilt = i % 2 === 0 ? -22 : 22;
    links.push(
      `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="52" ry="33" ${stroke(id, 17)}
         transform="rotate(${tilt} ${x.toFixed(0)} ${y.toFixed(0)})"/>`,
    );
  }
  return `${groundShadow(id, 500, 830, 300)}${links.join('')}`;
};

const necklace: Shape = (id, p) => `
  ${groundShadow(id, 500, 860, 300)}
  <path d="M 215 250 Q 500 820 785 250" ${stroke(id, 15)}/>
  <path d="M 215 250 Q 500 820 785 250" fill="none" stroke="${p.hi}" stroke-opacity="0.6"
        stroke-width="15" stroke-dasharray="3 22" stroke-linecap="round"/>
  <path d="M 268 400 Q 500 860 732 400" ${stroke(id, 11)}/>
  ${facetedStone(id, 500, 690, 74)}
  ${roundStone(id, 392, 626, 24)}
  ${roundStone(id, 608, 626, 24)}`;

const bridalSet: Shape = (id, p) => `
  ${groundShadow(id, 500, 880, 320)}
  <path d="M 230 215 Q 500 740 770 215" ${stroke(id, 17)}/>
  <path d="M 230 215 Q 500 740 770 215" fill="none" stroke="${p.hi}" stroke-opacity="0.55"
        stroke-width="17" stroke-dasharray="3 24" stroke-linecap="round"/>
  ${facetedStone(id, 500, 625, 86)}
  ${roundStone(id, 372, 556, 27)}
  ${roundStone(id, 628, 556, 27)}
  <g>
    <path d="M 250 790 l 0 -46" ${stroke(id, 10)}/>
    <circle cx="250" cy="820" r="48" ${stroke(id, 15)}/>
    ${roundStone(id, 250, 820, 18)}
  </g>
  <g>
    <path d="M 750 790 l 0 -46" ${stroke(id, 10)}/>
    <circle cx="750" cy="820" r="48" ${stroke(id, 15)}/>
    ${roundStone(id, 750, 820, 18)}
  </g>`;

const pendant: Shape = (id, p) => `
  ${groundShadow(id, 500, 860, 230)}
  <path d="M 268 215 Q 500 640 732 215" ${stroke(id, 13)}/>
  <path d="M 268 215 Q 500 640 732 215" fill="none" stroke="${p.hi}" stroke-opacity="0.55"
        stroke-width="13" stroke-dasharray="3 20" stroke-linecap="round"/>
  <circle cx="500" cy="548" r="34" ${stroke(id, 13)}/>
  <path d="M 500 582 L 614 700 L 500 818 L 386 700 Z" fill="url(#metal-${id})"
        stroke="${p.hi}" stroke-opacity="0.5" stroke-width="4"/>
  ${roundStone(id, 500, 700, 54)}`;

const jhumka: Shape = (id, p) => {
  const one = (cx: number): string => `
    <g>
      <circle cx="${cx}" cy="242" r="40" ${stroke(id, 12)}/>
      ${roundStone(id, cx, 330, 32)}
      <path d="M ${cx - 118} 560 Q ${cx} 376 ${cx + 118} 560 Z" fill="url(#metal-${id})"
            stroke="${p.hi}" stroke-opacity="0.45" stroke-width="4"/>
      <path d="M ${cx - 118} 560 L ${cx + 118} 560" ${stroke(id, 10)}/>
      ${[-92, -56, -19, 19, 56, 92]
        .map(
          (dx, i) =>
            `<g><path d="M ${cx + dx} 566 l 0 ${34 + (i % 2) * 18}" ${stroke(id, 7)}/>` +
            `<circle cx="${cx + dx}" cy="${608 + (i % 2) * 18}" r="15" fill="url(#metal-${id})"/></g>`,
        )
        .join('')}
    </g>`;
  return `${groundShadow(id, 500, 860, 290)}${one(318)}${one(682)}`;
};

const anklet: Shape = (id) => {
  const charms: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = 215 + i * 95;
    charms.push(
      `<g><path d="M ${x} 430 l 0 34" ${stroke(id, 7)}/><circle cx="${x}" cy="482" r="17" fill="url(#metal-${id})"/></g>`,
      `<g><path d="M ${x} 700 l 0 34" ${stroke(id, 7)}/><circle cx="${x}" cy="752" r="17" fill="url(#metal-${id})"/></g>`,
    );
  }
  return `
  ${groundShadow(id, 500, 860, 300)}
  <ellipse cx="500" cy="340" rx="300" ry="96" ${stroke(id, 15)}/>
  <ellipse cx="500" cy="610" rx="300" ry="96" ${stroke(id, 15)}/>
  ${sheen('M 215 320 A 300 96 0 0 1 430 236', 7, 0.7)}
  ${charms.join('')}`;
};

const pearlChoker: Shape = (id, p) => {
  const beads: string[] = [];
  const count = 21;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const angle = Math.PI * (0.08 + t * 0.84);
    const x = 500 - Math.cos(angle) * 330;
    const y = 300 + Math.sin(angle) * 330;
    const r = 34 - Math.abs(t - 0.5) * 11;
    beads.push(`
      <g>
        <circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}"
                fill="${p.stone}" stroke="${p.lo}" stroke-opacity="0.35" stroke-width="2"/>
        <ellipse cx="${(x - r * 0.3).toFixed(0)}" cy="${(y - r * 0.35).toFixed(0)}"
                 rx="${(r * 0.34).toFixed(0)}" ry="${(r * 0.24).toFixed(0)}" fill="#FFFFFF" fill-opacity="0.85"/>
      </g>`);
  }
  return `${groundShadow(id, 500, 760, 300)}${beads.join('')}`;
};

const SHAPES = {
  solitaireRing,
  couplePair,
  stackingRings,
  bangle,
  cuff,
  chain,
  necklace,
  bridalSet,
  pendant,
  jhumka,
  anklet,
  pearlChoker,
} satisfies Record<string, Shape>;

type ShapeKey = keyof typeof SHAPES;

// --- product mapping --------------------------------------------------------

interface Piece {
  slug: string;
  shape: ShapeKey;
  palette: PaletteKey;
  alt: string;
}

/**
 * One entry per seeded product. Keyed by slug so a mismatch is visible in the
 * diff rather than inferred at runtime, and so the seed can fail loudly if a
 * product has no artwork.
 */
export const PIECES: Piece[] = [
  // Aurum Jewellers
  {
    slug: '22k-gold-kada-bangle',
    shape: 'bangle',
    palette: 'gold',
    alt: 'A broad 22K gold kada bangle with a patterned band',
  },
  {
    slug: '22k-gold-chain-20-inch',
    shape: 'chain',
    palette: 'gold',
    alt: 'A 20 inch 22K gold link chain laid in a curve',
  },
  {
    slug: 'rose-gold-jhumka-earrings',
    shape: 'jhumka',
    palette: 'roseGold',
    alt: 'A pair of rose gold jhumka earrings with bell domes and dangling beads',
  },
  {
    slug: 'gold-plated-statement-necklace',
    shape: 'necklace',
    palette: 'gold',
    alt: 'A gold plated statement necklace with a central faceted stone',
  },
  {
    slug: '18k-gold-pendant-with-ruby',
    shape: 'pendant',
    palette: 'gold',
    alt: 'An 18K gold pendant set with a ruby, on a fine chain',
  },
  {
    slug: 'diamond-solitaire-engagement-ring',
    shape: 'solitaireRing',
    palette: 'whiteGold',
    alt: 'A white gold solitaire engagement ring with a raised diamond',
  },
  {
    slug: '22k-gold-couple-rings-pair',
    shape: 'couplePair',
    palette: 'gold',
    alt: 'A pair of 22K gold couple rings, one set with a small stone',
  },
  {
    slug: '21k-gold-bridal-necklace-set',
    shape: 'bridalSet',
    palette: 'gold',
    alt: 'A 21K gold bridal set: necklace with matching drop earrings',
  },
  // Silver Leaf Studio
  {
    slug: 'sterling-silver-oxidised-jhumkas',
    shape: 'jhumka',
    palette: 'oxidised',
    alt: 'A pair of oxidised sterling silver jhumka earrings',
  },
  {
    slug: 'silver-anklet-pair',
    shape: 'anklet',
    palette: 'silver',
    alt: 'A pair of silver anklets with small hanging charms',
  },
  {
    slug: '925-silver-cuff-bracelet',
    shape: 'cuff',
    palette: 'silver',
    alt: 'An open 925 silver cuff bracelet with rounded terminals',
  },
  {
    slug: 'silver-chain-with-moonstone',
    shape: 'pendant',
    palette: 'silver',
    alt: 'A silver chain with a moonstone set in a drop pendant',
  },
  {
    slug: 'artificial-pearl-choker',
    shape: 'pearlChoker',
    palette: 'pearl',
    alt: 'A graduated pearl choker',
  },
  {
    slug: 'minimal-silver-stacking-rings-set-of-3',
    shape: 'stackingRings',
    palette: 'silver',
    alt: 'Three slim silver stacking rings',
  },
];

// --- emit -------------------------------------------------------------------

/**
 * `view` is the second image: the same artwork framed tighter and tilted, the
 * way a catalogue shows a detail shot. Two genuinely different images per
 * product, from one drawing.
 */
function render(piece: Piece, view: 'full' | 'detail'): string {
  const palette = PALETTES[piece.palette];
  const id = `${piece.slug}-${view}`;
  const art = SHAPES[piece.shape](id, palette);

  const box = view === 'full' ? `0 0 ${S} ${S}` : `${S * 0.16} ${S * 0.16} ${S * 0.68} ${S * 0.68}`;
  const tilt = view === 'detail' ? ` transform="rotate(-9 ${S / 2} ${S / 2})"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${S}" height="${S}" role="img" aria-label="${piece.alt}">
  <title>${piece.alt}</title>${defs(palette, id)}
  <rect x="0" y="0" width="${S}" height="${S}" fill="url(#bg-${id})"/>
  <g${tilt}>${art}
  </g>
</svg>
`;
}

function storeLogo(name: string, initials: string, palette: PaletteKey): string {
  const p = PALETTES[palette];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${name}">
  <title>${name}</title>
  <defs>
    <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p.hi}"/>
      <stop offset="55%" stop-color="${p.mid}"/>
      <stop offset="100%" stop-color="${p.lo}"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="92" fill="none" stroke="url(#lg)" stroke-width="8"/>
  <circle cx="100" cy="100" r="78" fill="none" stroke="${p.lo}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="100" y="128" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="76" fill="url(#lg)">${initials}</text>
</svg>
`;
}

/**
 * Only when run as a script. The seed imports PIECES from this module as the
 * manifest of what artwork exists, and importing it must not write files.
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const piece of PIECES) {
    writeFileSync(join(OUT_DIR, `${piece.slug}.svg`), render(piece, 'full'), 'utf8');
    writeFileSync(join(OUT_DIR, `${piece.slug}-detail.svg`), render(piece, 'detail'), 'utf8');
    count += 2;
  }

  writeFileSync(
    join(OUT_DIR, 'logo-aurum-jewellers.svg'),
    storeLogo('Aurum Jewellers', 'AJ', 'gold'),
    'utf8',
  );
  writeFileSync(
    join(OUT_DIR, 'logo-silver-leaf.svg'),
    storeLogo('Silver Leaf Studio', 'SL', 'silver'),
    'utf8',
  );
  count += 2;

  console.log(`Wrote ${count} files to apps/web/public/demo`);
}

if (isDirectRun()) {
  main();
}
