import Link from "next/link";
import { ArrowRight, Gamepad2, Images, KeyRound, Sparkles, Wand2 } from "lucide-react";

// Public landing page — the one route with no sidebar/app chrome (see the (app) route group's
// own layout for that). First thing a new visitor sees before they've unlocked anything; the
// actual app lives at /dashboard. Server component: nothing here needs client state.
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.14),transparent)]"
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
          <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 bg-clip-text text-lg font-bold text-transparent">
            FetishUI
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Enter App
          </Link>
          <Link
            href="/unlock"
            className="rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Get Access
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10 text-center sm:pt-16">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Adult AI generation,{" "}
          <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 bg-clip-text text-transparent">
            guided end to end
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
          Guided transformation workflows, every major Venice.ai model, and an AI companion who
          actually talks back — all in one place. Bring your own Venice.ai key; we never touch
          your generation costs.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Enter the App <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/unlock"
            className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            $45 / 3 months — Unlock Workflows
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">18+ only. No account required to browse — an unlock code gates guided workflows.</p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={Wand2}
            title="Guided Workflows"
            description="Step-by-step transformation flows for feminization, sissy lifestyle, and femdom content — no prompt-writing needed."
          />
          <FeatureCard
            icon={Sparkles}
            title="Every Venice Model"
            description="Text-to-image, image-to-image, and video, all powered by Venice.ai — pick a model and go."
          />
          <FeatureCard
            icon={Gamepad2}
            title="Goon Game"
            description="An AI mistress who negotiates, rewards, and punishes in real time — a genuine interactive chat, not a menu."
          />
          <FeatureCard
            icon={Images}
            title="Albums & Queue"
            description="Save, organize, and revisit every generation — pull straight from your albums into any workflow."
          />
        </div>
      </section>

      {/* Pricing band */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-3xl border bg-gradient-to-br from-primary/10 via-fuchsia-500/5 to-transparent p-8 text-center">
          <h2 className="text-xl font-semibold">Bring your own key. Unlock the rest.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Models and generation are always billed directly by your own Venice.ai account.
            $45 unlocks every guided workflow and your albums for 3 months.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/unlock"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              Get Access <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/settings?tab=api-keys"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <KeyRound className="h-4 w-4" /> I already have a key
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-muted-foreground">
        FetishUI — 18+ AI-generated adult content. All content is synthetic.
      </footer>
    </main>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 text-left shadow-sm">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
