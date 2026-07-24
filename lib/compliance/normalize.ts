// vendors.normalized_name is the anchor for PRD 3.1 Tier 2 and Tier 3 matching,
// so every write path has to derive it the same way.
export function normalizeVendorName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
