/**
 * SYNTHETIC DEMO DATA GENERATOR — MATLens
 * =======================================
 *
 * Everything produced here is invented. Brand names, company names and every
 * number are fictional and were written for this prototype. Nothing in this file
 * is derived from IQVIA, AWACS, SMSRC, PharmaTrac or any other market audit, and
 * no real company's performance is represented.
 *
 * Molecule names are real generic ingredients (public pharmacological
 * vocabulary); their association with these invented brands is fictional.
 *
 * The generator is deterministic (fixed seed) so that the demo tells the same
 * story every time it is opened — which matters when you are demonstrating it.
 *
 * Written in plain JS with JSDoc types so that both the React app and the
 * Node script that writes /public/demo-data can share one source of truth.
 */

const SEED = 20260829;
const PERIOD = 'MAT Aug 2026';
const THERAPY = 'Dermatology';
const CRORE = 1e7;

/** Deterministic PRNG (mulberry32) — same output on every machine, every run. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REGIONS = ['North', 'South', 'West', 'East', 'Central'];

/** Baseline national split of dermatology value across regions. */
const REGION_MIX = { North: 0.26, South: 0.24, West: 0.22, East: 0.14, Central: 0.14 };

/** Regional growth differential in percentage points versus a brand's national rate. */
const REGION_GROWTH_ADJ = { North: -1.0, South: 6.0, West: 2.0, East: -3.0, Central: 1.0 };

/** Indicative realised price per unit by segment, used to derive unit sales. */
const SEGMENT_PRICE = {
  'Antifungals': 320,
  'Topical Corticosteroids': 185,
  'Anti-Acne': 410,
  'Psoriasis & Immunology': 2400,
  'Dermo-Cosmetics & Emollients': 560,
  'Topical Antibacterials': 240,
};

/**
 * The synthetic brand universe.
 * valueCr = national MAT value in ₹ crore; growth = national MAT value growth %.
 */
const BRANDS = [
  // ---- Antifungals ----
  { brand: 'Dermazol', company: 'Nordic Remedies India', molecule: 'Terbinafine', segment: 'Antifungals', valueCr: 198, growth: 15.1 },
  { brand: 'Soranil', company: 'Aurex Life Sciences', molecule: 'Luliconazole', segment: 'Antifungals', valueCr: 186, growth: 7.2,
    mix: { North: 0.34, South: 0.13, West: 0.30, East: 0.12, Central: 0.11 },
    regionAdj: { North: 0.5, South: -2.0, West: 1.5, East: -2.5, Central: 0.5 } },
  { brand: 'Fungiclear', company: 'Vantiva Healthcare', molecule: 'Luliconazole', segment: 'Antifungals', valueCr: 174, growth: 24.6,
    mix: { North: 0.18, South: 0.38, West: 0.20, East: 0.12, Central: 0.12 } },
  { brand: 'Ketorin', company: 'Solvex Pharma', molecule: 'Ketoconazole', segment: 'Antifungals', valueCr: 121, growth: 4.1 },
  { brand: 'Itracare', company: 'Kritika Labs', molecule: 'Itraconazole', segment: 'Antifungals', valueCr: 112, growth: 15.3 },
  { brand: 'Sertazyl', company: 'Meridian Dermacare', molecule: 'Sertaconazole', segment: 'Antifungals', valueCr: 78, growth: 11.4 },
  { brand: 'Terbimax', company: 'Zenova Pharma', molecule: 'Terbinafine', segment: 'Antifungals', valueCr: 71, growth: -2.6 },
  { brand: 'Lulivan', company: 'Kestrel Biosciences', molecule: 'Luliconazole', segment: 'Antifungals', valueCr: 38, growth: 58.4,
    mix: { North: 0.20, South: 0.34, West: 0.24, East: 0.10, Central: 0.12 } },
  { brand: 'Amorofix', company: 'Trilok Healthcare', molecule: 'Amorolfine', segment: 'Antifungals', valueCr: 34, growth: 13.9 },
  { brand: 'Fungiban', company: 'Bharat Cutis', molecule: 'Ketoconazole', segment: 'Antifungals', valueCr: 29, growth: -6.8 },
  { brand: 'Itrazen', company: 'Elvia Sciences', molecule: 'Itraconazole', segment: 'Antifungals', valueCr: 26, growth: 21.7 },
  { brand: 'Lulicort', company: 'Orbis Derma', molecule: 'Luliconazole', segment: 'Antifungals', valueCr: 22, growth: 33.1 },
  { brand: 'Luliderm', company: 'Nordic Remedies India', molecule: 'Luliconazole', segment: 'Antifungals', valueCr: 27, growth: 29.3 },
  { brand: 'Itrasol', company: 'Aventra Healthcare', molecule: 'Itraconazole', segment: 'Antifungals', valueCr: 20, growth: 12.8 },
  { brand: 'Dermalite', company: 'Denvo Healthcare', molecule: 'Ketoconazole', segment: 'Antifungals', valueCr: 18, growth: 6.1 },
  { brand: 'Terbiflex', company: 'Sanchit Remedies', molecule: 'Terbinafine', segment: 'Antifungals', valueCr: 16, growth: -8.2 },

  // ---- Topical Corticosteroids ----
  { brand: 'Momecort', company: 'Crestlin Pharma', molecule: 'Mometasone', segment: 'Topical Corticosteroids', valueCr: 142, growth: 6.4 },
  { brand: 'Clobenol', company: 'Nuvia Life', molecule: 'Clobetasol', segment: 'Topical Corticosteroids', valueCr: 96, growth: 3.2 },
  { brand: 'Flutizone', company: 'Pentara Labs', molecule: 'Fluticasone', segment: 'Topical Corticosteroids', valueCr: 74, growth: 8.9 },
  { brand: 'Momeflex', company: 'Aurex Life Sciences', molecule: 'Mometasone', segment: 'Topical Corticosteroids', valueCr: 61, growth: 5.1 },
  { brand: 'Halobet', company: 'Sable & Co Pharma', molecule: 'Halobetasol', segment: 'Topical Corticosteroids', valueCr: 52, growth: -1.4 },
  { brand: 'Desonex', company: 'Indus Cutis', molecule: 'Desonide', segment: 'Topical Corticosteroids', valueCr: 44, growth: 12.6 },
  { brand: 'Clobetal', company: 'Aventra Healthcare', molecule: 'Clobetasol', segment: 'Topical Corticosteroids', valueCr: 33, growth: -4.9 },
  { brand: 'Steroderm', company: 'Cygnet Derma', molecule: 'Mometasone', segment: 'Topical Corticosteroids', valueCr: 28, growth: 9.7 },
  { brand: 'Flutiderm', company: 'Cygnet Derma', molecule: 'Fluticasone', segment: 'Topical Corticosteroids', valueCr: 18, growth: 7.3 },
  { brand: 'Momesol', company: 'Verdant Derma', molecule: 'Mometasone', segment: 'Topical Corticosteroids', valueCr: 15, growth: 4.4 },
  { brand: 'Clobix', company: 'Lumis Pharma', molecule: 'Clobetasol', segment: 'Topical Corticosteroids', valueCr: 13, growth: -2.1 },

  // ---- Anti-Acne ----
  { brand: 'Adaclear', company: 'Halcyon Pharma', molecule: 'Adapalene', segment: 'Anti-Acne', valueCr: 118, growth: 17.2 },
  { brand: 'Acnetrex', company: 'Rivona Labs', molecule: 'Isotretinoin', segment: 'Anti-Acne', valueCr: 92, growth: 14.8 },
  { brand: 'Benzoclear', company: 'Amaris Pharma', molecule: 'Benzoyl Peroxide', segment: 'Anti-Acne', valueCr: 67, growth: 10.3 },
  { brand: 'Adalin-C', company: 'Denvo Healthcare', molecule: 'Adapalene + Clindamycin', segment: 'Anti-Acne', valueCr: 58, growth: 22.4 },
  { brand: 'Azeladerm', company: 'Sanchit Remedies', molecule: 'Azelaic Acid', segment: 'Anti-Acne', valueCr: 41, growth: 19.6 },
  { brand: 'Clindaqua', company: 'Verdant Derma', molecule: 'Clindamycin', segment: 'Anti-Acne', valueCr: 36, growth: 6.2 },
  { brand: 'Acnovia', company: 'Aurex Life Sciences', molecule: 'Adapalene', segment: 'Anti-Acne', valueCr: 31, growth: 11.8 },
  { brand: 'Isoclear', company: 'Lumis Pharma', molecule: 'Isotretinoin', segment: 'Anti-Acne', valueCr: 27, growth: 25.9 },
  { brand: 'Adaplus', company: 'Kestrel Biosciences', molecule: 'Adapalene', segment: 'Anti-Acne', valueCr: 19, growth: 27.8 },
  { brand: 'Benzalux', company: 'Orbis Derma', molecule: 'Benzoyl Peroxide', segment: 'Anti-Acne', valueCr: 16, growth: 8.8 },
  { brand: 'Retinova', company: 'Trilok Healthcare', molecule: 'Isotretinoin', segment: 'Anti-Acne', valueCr: 14, growth: 16.3 },
  { brand: 'Azelac', company: 'Crestlin Pharma', molecule: 'Azelaic Acid', segment: 'Anti-Acne', valueCr: 12, growth: 21.5 },

  // ---- Psoriasis & Immunology ----
  { brand: 'Apremid', company: 'Nordic Remedies India', molecule: 'Apremilast', segment: 'Psoriasis & Immunology', valueCr: 88, growth: 31.5 },
  { brand: 'Calcipro', company: 'Vantiva Healthcare', molecule: 'Calcipotriol + Betamethasone', segment: 'Psoriasis & Immunology', valueCr: 76, growth: 24.1 },
  { brand: 'Psorinex', company: 'Kritika Labs', molecule: 'Calcipotriol', segment: 'Psoriasis & Immunology', valueCr: 49, growth: 18.3 },
  { brand: 'Secukin-D', company: 'Meridian Dermacare', molecule: 'Secukinumab', segment: 'Psoriasis & Immunology', valueCr: 44, growth: 42.8 },
  { brand: 'Metholan', company: 'Zenova Pharma', molecule: 'Methotrexate', segment: 'Psoriasis & Immunology', valueCr: 33, growth: 7.6 },
  { brand: 'Apreza', company: 'Solvex Pharma', molecule: 'Apremilast', segment: 'Psoriasis & Immunology', valueCr: 29, growth: 36.4 },
  { brand: 'Apretab', company: 'Halcyon Pharma', molecule: 'Apremilast', segment: 'Psoriasis & Immunology', valueCr: 18, growth: 34.7 },
  { brand: 'Psorilite', company: 'Bharat Cutis', molecule: 'Calcipotriol', segment: 'Psoriasis & Immunology', valueCr: 12, growth: 15.2 },

  // ---- Dermo-Cosmetics & Emollients ----
  { brand: 'Ceravita', company: 'Sable & Co Pharma', molecule: 'Ceramide Complex', segment: 'Dermo-Cosmetics & Emollients', valueCr: 104, growth: 20.7 },
  { brand: 'Suncora SPF', company: 'Orbis Derma', molecule: 'Sunscreen Filters', segment: 'Dermo-Cosmetics & Emollients', valueCr: 87, growth: 23.9 },
  { brand: 'Urexoft', company: 'Crestlin Pharma', molecule: 'Urea', segment: 'Dermo-Cosmetics & Emollients', valueCr: 63, growth: 12.1 },
  { brand: 'Glycolux', company: 'Nuvia Life', molecule: 'Glycolic Acid', segment: 'Dermo-Cosmetics & Emollients', valueCr: 51, growth: 16.5 },
  { brand: 'Hydraderm', company: 'Pentara Labs', molecule: 'Ceramide Complex', segment: 'Dermo-Cosmetics & Emollients', valueCr: 46, growth: 9.4 },
  { brand: 'Solguard', company: 'Aurex Life Sciences', molecule: 'Sunscreen Filters', segment: 'Dermo-Cosmetics & Emollients', valueCr: 39, growth: 14.2 },
  { brand: 'Cerawell', company: 'Meridian Dermacare', molecule: 'Ceramide Complex', segment: 'Dermo-Cosmetics & Emollients', valueCr: 23, growth: 26.4 },
  { brand: 'Sunvia', company: 'Zenova Pharma', molecule: 'Sunscreen Filters', segment: 'Dermo-Cosmetics & Emollients', valueCr: 21, growth: 18.6 },
  { brand: 'Emollex', company: 'Elvia Sciences', molecule: 'Urea', segment: 'Dermo-Cosmetics & Emollients', valueCr: 17, growth: 11.9 },
  { brand: 'Moistura', company: 'Indus Cutis', molecule: 'Urea', segment: 'Dermo-Cosmetics & Emollients', valueCr: 24, growth: 5.8 },

  // ---- Topical Antibacterials ----
  { brand: 'Mupirex', company: 'Aventra Healthcare', molecule: 'Mupirocin', segment: 'Topical Antibacterials', valueCr: 79, growth: 8.1 },
  { brand: 'Fusiderm', company: 'Cygnet Derma', molecule: 'Fusidic Acid', segment: 'Topical Antibacterials', valueCr: 62, growth: 6.7 },
  { brand: 'Nadicin', company: 'Halcyon Pharma', molecule: 'Nadifloxacin', segment: 'Topical Antibacterials', valueCr: 41, growth: 13.4 },
  { brand: 'Mupiban', company: 'Rivona Labs', molecule: 'Mupirocin', segment: 'Topical Antibacterials', valueCr: 31, growth: -3.5 },
  { brand: 'Fusicare', company: 'Amaris Pharma', molecule: 'Fusidic Acid', segment: 'Topical Antibacterials', valueCr: 22, growth: 2.9 },
  { brand: 'Mupicare', company: 'Kritika Labs', molecule: 'Mupirocin', segment: 'Topical Antibacterials', valueCr: 14, growth: 4.7 },
  { brand: 'Nadiflex', company: 'Solvex Pharma', molecule: 'Nadifloxacin', segment: 'Topical Antibacterials', valueCr: 11, growth: 9.3 },
];

export const DEMO_FOCUS_BRAND = 'Soranil';
export const DEMO_PERIOD = PERIOD;

/**
 * Builds the row-level synthetic dataset: one row per brand per region.
 * @returns {Array<Record<string, string|number>>} rows keyed by abbreviated
 *   pharma-style column headers, exactly as a market-audit export would arrive.
 */
export function generateDemoRows() {
  const random = makeRandom(SEED);
  const jitter = (spread) => (random() - 0.5) * 2 * spread;
  const rows = [];

  for (const item of BRANDS) {
    // Smaller brands are frequently regional rather than national.
    const regionalOnly = item.valueCr < 22;
    let regions = REGIONS;
    if (regionalOnly) {
      const shuffled = [...REGIONS].sort(() => random() - 0.5);
      regions = shuffled.slice(0, 3);
    }

    // Region mix: brand override where the story needs one, otherwise the
    // national baseline with brand-level jitter, renormalised over the regions
    // the brand actually sells in.
    const rawMix = {};
    for (const region of regions) {
      const base = (item.mix ?? REGION_MIX)[region] ?? 0.1;
      rawMix[region] = Math.max(0.02, base * (1 + jitter(0.22)));
    }
    const mixTotal = Object.values(rawMix).reduce((a, b) => a + b, 0);

    const basePrice = SEGMENT_PRICE[item.segment] * (1 + jitter(0.18));
    const priceInflation = 3.5 + random() * 3.5; // realised price growth, %

    for (const region of regions) {
      const share = rawMix[region] / mixTotal;
      const current = item.valueCr * CRORE * share;

      const adj = (item.regionAdj ?? REGION_GROWTH_ADJ)[region] ?? 0;
      const regionGrowth = item.growth + adj + jitter(1.6);
      const previous = current / (1 + regionGrowth / 100);

      const price = basePrice * (1 + jitter(0.06));
      const prevPrice = price / (1 + priceInflation / 100);

      rows.push({
        BRAND_NAME: item.brand,
        COMP_NAME: item.company,
        MOLECULE_NAME: item.molecule,
        THERAPY_AREA: THERAPY,
        SEGMENT: item.segment,
        REGION: region,
        PERIOD: PERIOD,
        MAT_VAL: Math.round(current),
        PREV_MAT_VAL: Math.round(previous),
        MAT_UNITS: Math.round(current / price),
        PREV_MAT_UNITS: Math.round(previous / prevPrice),
      });
    }
  }

  // Sort the way an audit export usually arrives: segment, then brand, then region.
  rows.sort(
    (a, b) =>
      String(a.SEGMENT).localeCompare(String(b.SEGMENT)) ||
      String(a.BRAND_NAME).localeCompare(String(b.BRAND_NAME)) ||
      REGIONS.indexOf(String(a.REGION)) - REGIONS.indexOf(String(b.REGION)),
  );

  return rows;
}

export const DEMO_COLUMNS = [
  'BRAND_NAME',
  'COMP_NAME',
  'MOLECULE_NAME',
  'THERAPY_AREA',
  'SEGMENT',
  'REGION',
  'PERIOD',
  'MAT_VAL',
  'PREV_MAT_VAL',
  'MAT_UNITS',
  'PREV_MAT_UNITS',
];
