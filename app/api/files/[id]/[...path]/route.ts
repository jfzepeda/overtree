import { NextResponse } from "next/server";
import path from "node:path";
import {
  deleteFile,
  readFile,
  readFileBinary,
  writeFile,
} from "@/lib/core/files";
import { releaseDocs } from "@/lib/yjs/doc-manager";

type Ctx = { params: Promise<{ id: string; path: string[] }> };

const BINARY_EXT = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".eps",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
]);

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(req: Request, { params }: Ctx) {
  const { id, path: parts } = await params;
  const rel = parts.join("/");
  const ext = path.extname(rel).toLowerCase();
  try {
    if (BINARY_EXT.has(ext)) {
      const buf = await readFileBinary(id, rel);
      return new Response(new Uint8Array(buf), {
        headers: {
          "content-type": MIME[ext] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    const content = await readFile(id, rel);
    const url = new URL(req.url);
    if (url.searchParams.get("raw") === "1") {
      return new Response(content, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.json({ path: rel, content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 404 },
    );
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id, path: parts } = await params;
  const rel = parts.join("/");
  try {
    const body = await req.text();
    await writeFile(id, rel, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, path: parts } = await params;
  const rel = parts.join("/");
  try {
    await releaseDocs(id, rel);
    await deleteFile(id, rel);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}
