import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/meta" className="brand" aria-label="Limitless Stats — início">
      <span className="brand-mark" aria-hidden="true"><span className="brand-mark-core" /></span>
      {!compact && (
        <span className="brand-copy">
          <strong>LIMITLESS</strong>
          <small>STATS // ONLINE</small>
        </span>
      )}
    </Link>
  );
}
