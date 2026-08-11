import { Studio } from "@/components/Studio";

export default function HomePage() {
  return (
    <main className="relative flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 8%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 48%), linear-gradient(180deg, #161616 0%, #121212 42%, #0c0c0c 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-16 sm:px-10">
        <header className="max-w-2xl animate-[fadeRise_0.7s_ease-out]">
          <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--gold)]">
            Culinary Physics · Fat Loss
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-[1.05] text-[var(--cream)] sm:text-6xl">
            GastronomyAI
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--cream-dim)]">
            Zero-willpower fat loss through gourmet culinary physics —
            Michelin technique, strict macros.
          </p>
          <a
            href="#studio"
            className="mt-8 inline-block border border-[var(--gold)] bg-[var(--gold)] px-6 py-3 text-xs uppercase tracking-[0.18em] text-[var(--charcoal)] transition hover:bg-transparent hover:text-[var(--gold)]"
          >
            Open Studio
          </a>
        </header>

        <section id="studio" className="mt-20 scroll-mt-10">
          <Studio />
        </section>
      </div>
    </main>
  );
}
