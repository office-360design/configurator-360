// Metadata only: never import a renderer or product builder into this module.
export const liteSlugs = ["chair", "cardbox", "bookshelf", "tiles"] as const;
export type LiteSlug = typeof liteSlugs[number];
export function isLiteSlug(slug: string): slug is LiteSlug {
  return (liteSlugs as readonly string[]).includes(slug);
}

export type LiteState = { [key: string]: string | number };
export const liteDefaults: Record<LiteSlug, LiteState> = {
  chair: { wood: "#be8851", woodType:"oak", fabric: "#b88162", weave: "linen" },
  cardbox: { style: "standard", width: 600, depth: 400, height: 300, open: 0, colour: "#b88959", paper:"TFT",top:"simple-flaps",bottom:"simple-flaps" },
  bookshelf: { family: "compact", layout: "straight", count: 2, doors: "lower", colour: "#b98555", hardware:"diamond", doorOpen:"closed", shelves:9 },
  tiles: { length: 3.25, width: 1.75, tile: "parket", pattern: "running", rotation:0, colour: "#969a98", curbs:"no" },
};
