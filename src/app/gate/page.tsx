import { GATE_API_PATH } from "@/lib/auth/gate";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const params = await searchParams;
  const unconfigured = params.error === "unconfigured";
  const badPassword = params.error === "1";
  const from = params.from?.startsWith("/") ? params.from : "/";

  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 8%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 48%), linear-gradient(180deg, #161616 0%, #121212 42%, #0c0c0c 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--gold)]">
          GastronomyAI
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-[var(--cream)]">
          Coach access
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--cream-dim)]">
          This URL spends a hosted model. Enter the site password.
        </p>

        {unconfigured && (
          <p
            role="alert"
            className="mt-6 border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200"
          >
            SITE_PASSWORD is not set on this host. Add it before anyone can
            Elevate.
          </p>
        )}

        {badPassword && (
          <p
            role="alert"
            className="mt-6 border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200"
          >
            That password did not match.
          </p>
        )}

        {!unconfigured && (
          <form action={GATE_API_PATH} method="post" className="mt-8 space-y-4">
            <input type="hidden" name="from" value={from} />
            <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Password
            </label>
            <input
              className="w-full border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm text-[var(--cream)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--gold-dim)]"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
            <button
              type="submit"
              className="border border-[var(--gold)] bg-[var(--gold)] px-6 py-3 text-xs uppercase tracking-[0.18em] text-[var(--charcoal)] transition hover:bg-transparent hover:text-[var(--gold)]"
            >
              Enter
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
