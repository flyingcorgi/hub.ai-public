import Link from "next/link";
import { ArrowRight, Check, ChevronRight, ImageIcon, KeyRound } from "lucide-react";
import type { WorkflowSummary } from "@/lib/workflows/designer-types";
import { LandingKeySetup } from "./landing-key-setup";

export const landingDemo: WorkflowSummary = {
  id: "template", name: "A fresh look for your photo.",
  description: "Start with a photo. Explore a different style. Make something that feels like you.",
  free: false, published: true,
};

// Public copy only. Never pass definitions, reference images or prompt fragments here.
export function WorkflowLanding({ workflow, demo = false }: { workflow: WorkflowSummary; demo?: boolean }) {
  const runHref = demo ? "/dashboard" : `/workflows/designer?run=${encodeURIComponent(workflow.id)}`;
  return <main className="min-h-screen bg-background text-foreground selection:bg-primary/20">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
      <Link href="/" className="text-lg font-bold tracking-tight">Fetish<span className="text-primary">UI</span></Link>
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Browse workflows <ChevronRight className="inline h-4 w-4" /></Link>
    </header>
    {demo && <p className="mx-auto max-w-6xl px-5 text-xs text-muted-foreground sm:px-8">Template preview · sample copy and illustrated placeholders, not a live workflow.</p>}

    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Your photo. A new direction.</p>
        <h1 className="break-words text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">{workflow.name}</h1>
        <p className="max-w-lg whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground sm:text-lg">{workflow.description}</p>
        <p className="text-sm text-muted-foreground">Start with a ready-made workflow, not a blank prompt box.</p>
        <Link href={runHref} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-primary px-7 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90">
          {demo ? "Explore the workflows" : "Explore this workflow"} <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {workflow.free ? "No membership needed for this workflow." : "Membership: $45 for 90 days of paid workflow access."}
          {" "}Venice account, API key and separately billed generation required. Enrollment is subject to availability.
        </p>
        <a href="#how-it-works" className="inline-block text-sm underline underline-offset-4">New to AI images? Start here.</a>
      </div>
      <figure className="relative min-w-0 rounded-[2rem] border bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-8">
        <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground"><span>ONE STARTING POINT</span><span>A DIFFERENT LOOK</span></div>
        <div className="grid grid-cols-2 items-center gap-4">
          <ExampleArtwork muted label="Your starting image" />
          <ExampleArtwork label="Your new direction" />
        </div>
        <figcaption className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ImageIcon className="h-4 w-4 shrink-0" />Illustrated layout placeholders—not generated results. Real examples belong here after review; results will vary.</figcaption>
      </figure>
    </section>

    <section id="how-it-works" className="border-y bg-muted/20">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h2 className="text-2xl font-semibold tracking-tight">Less setup. More creating.</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {[
            ["01", "Pick your workflow", "Find a starting point you like. Review its options before you generate."],
            ["02", "Set up Venice once", "Venice runs the AI. Create a key there and save it here in this browser—no code needed."],
            ["03", "Make it yours", "Add your input, choose the available settings and generate when you’re ready. Each model step can use Venice credit."],
          ].map(([number, title, text]) => <div key={number}><span className="text-xs font-mono text-primary">{number}</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
        </div>
      </div>
    </section>

    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Know what you’re paying for</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">The workflow is here.<br />The AI runs on Venice.</h2>
        <div className="mt-7 space-y-5 text-sm">
          <p className="flex gap-3"><Check className="h-5 w-5 shrink-0 text-primary" /><span><strong>FetishUI membership</strong><br /><span className="text-muted-foreground">$45 / 90 days for paid guided workflows. Not a bundle of image credits.</span></span></p>
          <p className="flex gap-3"><KeyRound className="h-5 w-5 shrink-0 text-primary" /><span><strong>Your Venice account</strong><br /><span className="text-muted-foreground">Generation is billed separately by Venice. Review its current prices and API access requirements before purchasing.</span></span></p>
        </div>
        <Link href="/unlock" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">View membership & availability <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="space-y-5 rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Already have a Venice account?</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">You don’t need to learn the API. The key lets this app send the requests you choose to Venice. Open its settings in a new tab, then return here to paste your key.</p>
        <LandingKeySetup />
        <p className="text-xs leading-relaxed text-muted-foreground">Saving a key does not generate anything or buy a membership. You can browse first.</p>
      </div>
    </section>

    <section className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
      <h2 className="mb-5 text-2xl font-semibold">A few things to know</h2>
      {[
        ["Do I need the Workflow Wizard?", "No. Ready-made workflows are the starting point. The authoring Wizard is a separate, admin-only beta—not a membership feature being promised here."],
        ["Will my image look exactly like an example?", "No. Your input, settings and the AI model affect the result. A generation can cost credit even if you don’t like the result."],
        ["Where do my key and images go?", "Your key is saved in this browser’s localStorage and is shared by accounts using this browser. Generation requests send your key, prompts and media through FetishUI’s backend to Venice. Provider privacy varies by model; this is not a promise that media never touches servers."],
      ].map(([question, answer]) => <details key={question} className="border-b py-4"><summary className="cursor-pointer text-sm font-medium">{question}</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}
    </section>
    <footer className="border-t px-5 py-7 text-center text-xs text-muted-foreground">18+ only. Use images you have permission to use.</footer>
  </main>;
}

function ExampleArtwork({ muted = false, label }: { muted?: boolean; label: string }) {
  return <div className={muted ? "mt-8" : "mb-8"}>
    <div className={`overflow-hidden rounded-2xl border bg-background shadow-lg ${muted ? "grayscale" : ""}`}>
      <svg viewBox="0 0 240 310" role="img" aria-label={`${label}: illustrative landscape placeholder`} className="h-auto w-full">
        <rect width="240" height="310" fill="#30224c" />
        <circle cx="166" cy="87" r="44" fill="#f8bd9c" />
        <path d="M0 195L83 98L166 210L240 140V310H0Z" fill="#866bba" />
        <path d="M0 240L100 174L180 247L240 202V310H0Z" fill="#c49cc7" />
        <path d="M0 280Q80 218 140 272T240 255V310H0Z" fill="#edbdd2" />
      </svg>
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">{label}</p>
  </div>;
}
