import { sheetProfiles } from "../js/sheetPlanner.js?v=sketch-47";
import { CATALOG_EVIDENCE } from "./evidence.js?v=builder-game-3";

export const CATALOG_VERSION = "rodach-2026-10-07";
const website = "https://rodach.ro/";
const pdf = website + "wp-content/uploads/2023/12/Catalog-Rodach-_QR.pdf";
const product = (id, title, profile, extra = {}) =>
  Object.freeze({
    id,
    title,
    manufacturer: "Rodach / Damila",
    profile: profile ? Object.freeze({ ...profile }) : null,
    directions: id === "simetric" ? ["left", "right"] : ["left"],
    finishes:
      id === "clasic"
        ? ["smart", "plus", "premium"]
        : ["plus", "premium", "suprem"],
    colours: ["#7f1d2d", "#383e42", "#45322e", "#202322", "#355341"],
    source:
      website +
      "tigla-metalica-rodach-" +
      id +
      (id === "simetric" ? "-2/" : "/"),
    evidence: [
      {
        url: pdf,
        kind: "catalog",
        date: "2023-12",
        page: CATALOG_EVIDENCE.products[id]?.pdfPage,
        confirmed: false,
      },
      {
        url: CATALOG_EVIDENCE.products[id]?.website,
        kind: "website",
        reviewed: CATALOG_EVIDENCE.reviewed,
        confirmed: false,
      },
    ],
    parameterEvidence: CATALOG_EVIDENCE.products[id],
    confirmed: false,
    modelAccuracy: "visual",
    compatible: ["ridge", "valley", "flashing", "eaves", "gutter", "downpipe"],
    installation: {
      sideSource:
        "https://github.com/office-360design/configurator-360/issues/520",
      guide: website + "instructiuni-de-montaj/",
      fasteningsConfirmed: false,
      alignment: "uphill-module-grid",
    },
    representation: {
      kind: "procedural-visual",
      generator: "profileRelief",
      thumbnail: "illustrated-symbol",
      colourAccuracy: "screen-approximation",
    },
    unresolved: [
      "exactCrossSection",
      "fastenings",
      "stockAllowance",
      "catalogVersionConfirmation",
    ],
    ...extra,
  });

export const PRODUCTS = Object.freeze([
  product("antic", "Rodach Antic", sheetProfiles.antic, {
    relief: 0.04,
    issues: [
      "allowanceInferred",
      "weightConflict",
      "installationGuideConflict",
    ],
  }),
  product(
    "simetric",
    "Rodach Simetric",
    {
      width: 1180,
      usefulWidth: 1100,
      module: 350,
      endOverlap: 100,
      minModules: 3,
      maxModules: 22,
      maxLength: 7800,
      kgPerM2: 4.9,
      minPitch: 14,
    },
    {
      relief: 0.025,
      issues: [
        "allowanceInferred",
        "simetricWidthConflict",
        "weightConflict",
        "installationGuideConflict",
      ],
    },
  ),
  product("clasic", "Rodach Clasic", sheetProfiles.clasic, {
    relief: 0.0242,
    issues: [
      "allowanceInferred",
      "clasicWidthConflict",
      "clasicLengthConflict",
      "installationGuideConflict",
    ],
  }),
  product(
    "colina",
    "Rodach Colina",
    {
      width: 1160,
      usefulWidth: 1060,
      module: 350,
      endOverlap: 130,
      minModules: 1,
      maxModules: 8,
      maxLength: 2920,
      kgPerM2: 4.5,
      minPitch: 20,
    },
    {
      relief: 0.034,
      issues: [
        "colinaLengthConflict",
        "weightConflict",
        "installationGuideConflict",
      ],
    },
  ),
  product("click", "Rodach Click", null, {
    source: website + "tabla-click-rodach/",
    continuous: {
      usefulWidth: 500,
      maxLength: 12000,
      minLength: 500,
      width: 500,
      endOverlap: 0,
      minPitch: 10,
    },
    relief: 0.025,
    issues: ["clickAllowanceMissing", "clickPitchConflict"],
  }),
]);

export const ACCESSORIES = Object.freeze(
  [
    {
      id: "ridge",
      title: "Coamă",
      edge: ["ridge", "hip"],
      image: "../assets/rainwater/system-overview.jpg",
      section: "ridge",
      length: null,
    },
    {
      id: "valley",
      title: "Dolie",
      edge: ["valley"],
      section: "valley",
      length: null,
    },
    {
      id: "flashing",
      title: "Pazie / racord perete",
      edge: ["verge", "wall"],
      section: "flashing",
      length: null,
    },
    {
      id: "eaves",
      title: "Șorț streașină",
      edge: ["gutter"],
      section: "eaves",
      length: null,
    },
    {
      id: "gutter",
      title: "Jgheab",
      edge: ["gutter"],
      image: "../assets/rainwater/01.jpg",
      section: "gutter",
      length: null,
    },
    {
      id: "downpipe",
      title: "Burlan",
      image: "../assets/rainwater/02.jpg",
      section: "downpipe",
      length: null,
    },
  ].map((item) =>
    Object.freeze({
      ...item,
      source: website + "accesorii-pentru-tigla-metalica/",
      confirmed: false,
      modelAccuracy: "visual",
    }),
  ),
);

export function getProduct(id) {
  const item = PRODUCTS.find((p) => p.id === id);
  if (!item) throw new Error("unknownProduct");
  return item;
}

// Cross-sections are presentation geometry, never dimensions for orders.
export function profileRelief(id, across, uphill) {
  const p = getProduct(id),
    width = (p.profile?.usefulWidth || p.continuous.usefulWidth) / 1000;
  const u = ((((across / width) * (id === "click" ? 1 : 5)) % 1) + 1) % 1;
  if (id === "click") return u < 0.025 || u > 0.975 ? p.relief : 0.002;
  const wave = Math.pow(
    (1 + Math.cos(u * Math.PI * 2)) / 2,
    id === "antic" ? 0.55 : 1.4,
  );
  const course = (((uphill / (p.profile.module / 1000)) % 1) + 1) % 1;
  const step = course < 0.08 ? 1 - course / 0.08 : 0;
  return wave * p.relief * 0.65 + step * p.relief * 0.35;
}
