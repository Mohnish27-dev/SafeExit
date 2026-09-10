// The app is served from a sub-path on the college ERP host, not from a domain
// root. Keep this in sync with `basePath` in next.config.mjs.
//
// Next prefixes basePath onto routes, onto _next asset URLs and onto webpack
// static imports, but NOT onto anything we write by hand: metadata icon URLs,
// raw <link> hrefs, URLs inside a <Script>, or the `url` query parameter the
// image loader hands to the optimizer. Those all go through here.
export const BASE_PATH = "/safeexit";

// Prefix a root-relative app URL with the base path, idempotently. Anything
// already carrying the prefix (webpack static imports, URLs we built earlier)
// is returned untouched, and absolute URLs are left alone.
export function withBasePath(url) {
	if (!url.startsWith("/") || url.startsWith(`${BASE_PATH}/`)) return url;
	return `${BASE_PATH}${url}`;
}
