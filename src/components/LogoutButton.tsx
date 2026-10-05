import { GATE_API_PATH, GATE_INTENT_LOGOUT, gateIsRequired } from "@/lib/auth/gate";

export function LogoutButton() {
  if (!gateIsRequired()) return null;

  return (
    <form action={GATE_API_PATH} method="post">
      <input type="hidden" name="intent" value={GATE_INTENT_LOGOUT} />
      <button
        type="submit"
        className="border border-[var(--border)] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--cream-dim)] transition hover:border-[var(--gold-dim)] hover:text-[var(--gold)]"
      >
        Log out
      </button>
    </form>
  );
}
