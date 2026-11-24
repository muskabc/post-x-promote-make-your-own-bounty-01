// Entry program for post-x-promote-make-your-own-bounty-01.
//
// Reads POST.json (the X post this entry hands in), validates the address
// structurally with the URL parser, canonicalises it, and writes the
// canonical form to the output directory as POST.json.
//
// A valid entry post is https://x.com/<handle>/status/<digits>:
//   - scheme must be http or https (https is what a real post uses, http is
//     tolerated and upgraded to https on output);
//   - host must be x.com or twitter.com, with or without a www. prefix;
//   - the path must be exactly /<handle>/status/<digits>, no extra segments,
//     no trailing slash, and no query string or fragment.
// Anything else is refused with a clear error instead of being passed on.
// The output is a single canonical JSON object, {"url": "<canonical>"}, so
// equivalent spellings of the same post always produce identical bytes.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? ".";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID_RE = /^\d{1,19}$/;

class EntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryError";
  }
}

function canonicalPostUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    throw new EntryError("POST.json url must be a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EntryError(
      "POST.json url must look like https://x.com/<handle>/status/<id>"
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EntryError("POST.json url must use http or https");
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") {
    throw new EntryError("POST.json url must point at x.com or twitter.com");
  }

  if (parsed.search !== "" || parsed.hash !== "") {
    throw new EntryError(
      "POST.json url must not carry a query string or fragment"
    );
  }

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 3 || segments[1] !== "status") {
    throw new EntryError(
      "POST.json url must look like https://x.com/<handle>/status/<id>"
    );
  }
  const [handle, , statusId] = segments;
  if (!HANDLE_RE.test(handle)) {
    throw new EntryError("POST.json url has an invalid X handle");
  }
  if (!STATUS_ID_RE.test(statusId)) {
    throw new EntryError("POST.json url has an invalid numeric status id");
  }

  return `https://x.com/${handle}/status/${statusId}`;
}

async function loadCanonicalUrl(): Promise<string> {
  let text: string;
  try {
    text = await readFile(join(BOT_DIR, "POST.json"), "utf8");
  } catch {
    throw new EntryError("could not read POST.json");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EntryError("POST.json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new EntryError("POST.json must be a JSON object with a url field");
  }

  return canonicalPostUrl((parsed as Record<string, unknown>).url);
}

async function main(): Promise<void> {
  const url = await loadCanonicalUrl();
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "POST.json");
  await writeFile(outPath, `${JSON.stringify({ url })}\n`, "utf8");
  console.log(`entry post: ${url}`);
  console.log(`wrote ${outPath}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
});
