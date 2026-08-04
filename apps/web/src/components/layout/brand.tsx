import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/meta" className="brand" aria-label="SH Meta Games — início">
      <span className="brand-mark" aria-hidden="true"><span className="brand-mark-core">SH</span></span>
      {!compact && (
        <span className="brand-copy">
          <strong>SH META</strong>
          <small>GAMES // TCG</small>
        </span>
      )}
    </Link>
  );
}
