"use client";

type Props = {
  src: string | null;
};

export function PdfViewer({ src }: Props) {
  if (!src) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm bg-[var(--pdf-bg)]">
        Compile (Cmd+Enter) to see PDF.
      </div>
    );
  }
  return (
    <iframe
      key={src}
      src={src}
      title="PDF preview"
      className="h-full w-full bg-[var(--pdf-bg)]"
      style={{ border: 0 }}
    />
  );
}
