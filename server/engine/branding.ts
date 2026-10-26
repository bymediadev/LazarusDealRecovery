/** White-label brand tokens for standalone installs. */

export type BrandTokens = {
  brandName: string;
  logoUrl: string | null;
  standalone: boolean;
};

export function resolveBrandTokens(): BrandTokens {
  const standalone =
    ["1", "true", "yes"].includes(
      (process.env.STANDALONE_INSTALL ?? "").trim().toLowerCase()
    );
  return {
    standalone,
    brandName:
      (process.env.WHITE_LABEL_BRAND_NAME ?? "").trim() ||
      "Lazarus Deal Recovery",
    logoUrl: (process.env.CUSTOM_BRAND_LOGO_URL ?? "").trim() || null,
  };
}
