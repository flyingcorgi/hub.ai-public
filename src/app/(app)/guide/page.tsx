import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableOfContents, type TocEntry } from "@/components/guide/table-of-contents";
import { PromptExample, TokenExample } from "@/components/guide/prompt-example";
import { ExternalLink, KeyRound } from "lucide-react";

const TOC: TocEntry[] = [
  { id: "getting-started", label: "Getting your API key" },
  { id: "basics", label: "Prompt basics" },
  { id: "negative", label: "Negative prompts" },
  { id: "references", label: "Reference images & editing" },
  { id: "tokens", label: "Workflow templates & tokens" },
  { id: "captions", label: "Captions & text overlay" },
  { id: "models", label: "Model guide" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}

export default function GuidePage() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">Prompt Guide</h1>
        <p className="max-w-2xl text-muted-foreground">
          How to set up your Venice.ai API key, get better results out of every model in FetishUI,
          and how the Workflow Designer&rsquo;s templates actually work under the hood.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <TableOfContents entries={TOC} />
          </div>
        </aside>

        <div className="space-y-12">
          <Section id="getting-started" title="Getting your API key">
            <p className="text-muted-foreground">
              FetishUI is bring-your-own-key: every generation runs against your own Venice.ai
              account, billed directly by Venice — FetishUI never sees or charges for generation
              costs. You need a key before anything on the Dashboard will generate.
            </p>
            <ol className="space-y-3">
              <li className="flex gap-3 rounded-lg border p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">1</span>
                <div className="text-sm text-muted-foreground">
                  <span className="text-foreground">Create a Venice.ai account</span> if you don&rsquo;t
                  have one, at{" "}
                  <a href="https://venice.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">venice.ai</a>.
                </div>
              </li>
              <li className="flex gap-3 rounded-lg border p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
                <div className="text-sm text-muted-foreground">
                  <span className="text-foreground">Add credit to your account.</span> Venice is
                  pay-as-you-go — generations are billed per image/video (see the{" "}
                  <a href="#models" className="text-primary hover:underline">Model guide</a>{" "}
                  below for typical costs) and draw from that balance directly, no separate
                  subscription.
                </div>
              </li>
              <li className="flex gap-3 rounded-lg border p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">3</span>
                <div className="text-sm text-muted-foreground">
                  <span className="text-foreground">Generate an API key</span> on Venice&rsquo;s API
                  settings page:{" "}
                  <a
                    href="https://venice.ai/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    venice.ai/settings/api <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  — give it a name you&rsquo;ll recognize, and copy the key immediately (Venice only
                  shows it once).
                </div>
              </li>
              <li className="flex gap-3 rounded-lg border p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">4</span>
                <div className="text-sm text-muted-foreground">
                  <span className="text-foreground">Paste it into FetishUI</span> under Settings →
                  API Keys and hit Save. It&rsquo;s stored only in this browser&rsquo;s local storage —
                  never sent anywhere except directly to Venice with each generation request.
                </div>
              </li>
            </ol>
            <Button asChild size="sm" className="gap-2">
              <Link href="/settings?tab=api-keys">
                <KeyRound className="h-4 w-4" /> Go to Settings → API Keys
              </Link>
            </Button>
          </Section>

          <Separator />

          <Section id="basics" title="Prompt basics">
            <p className="text-muted-foreground">
              Every model here reads a prompt the same rough way: it weighs earlier words more
              heavily than later ones, and it fills in anything you leave vague with whatever&rsquo;s
              statistically common for that phrase. Being specific is how you take that decision
              away from it. A reliable order to write in:
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li><span className="text-foreground">Subject</span> — who or what, described concretely (not just &ldquo;a woman&rdquo;, but her build, hair, expression, pose)</li>
              <li><span className="text-foreground">Action / pose</span> — what they&rsquo;re doing, how they&rsquo;re positioned</li>
              <li><span className="text-foreground">Setting</span> — where, and what&rsquo;s around them</li>
              <li><span className="text-foreground">Style / medium</span> — photo, 3D render, anime, oil painting, etc.</li>
              <li><span className="text-foreground">Lighting & mood</span> — soft studio light, golden hour, neon, dramatic shadow</li>
              <li><span className="text-foreground">Camera & composition</span> — close-up, wide shot, low angle, shallow depth of field</li>
              <li><span className="text-foreground">Quality boosters</span> — sparingly: &ldquo;highly detailed&rdquo;, &ldquo;8k&rdquo;, &ldquo;sharp focus&rdquo;</li>
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              <PromptExample kind="bad">a pretty woman, high quality, best quality, amazing, 8k</PromptExample>
              <PromptExample kind="good">
                a woman in her late 20s with curly red hair, confident smile, standing on a rooftop
                at sunset, city skyline behind her, warm golden light, shot on 85mm, shallow depth
                of field
              </PromptExample>
            </div>
            <p className="text-sm text-muted-foreground">
              Stacking quality words (&ldquo;best quality, amazing, stunning, 8k, masterpiece&hellip;&rdquo;)
              does less than people think — one or two is plenty. What actually moves the needle is
              specificity earlier in the prompt.
            </p>
          </Section>

          <Separator />

          <Section id="negative" title="Negative prompts">
            <p className="text-muted-foreground">
              The negative prompt field (on every image model here) tells the model what to steer
              away from — it&rsquo;s not a blocklist, more like a second, opposite-weighted prompt.
              Useful default to start from and trim down per-model:
            </p>
            <div className="rounded-lg border bg-muted/30 p-3">
              <code className="text-sm text-muted-foreground">
                blurry, low quality, distorted, extra limbs, extra fingers, fused fingers, bad
                anatomy, watermark, text, signature, cropped, out of frame
              </code>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep it short and relevant to what you&rsquo;re actually seeing go wrong — a negative
              prompt with 40 unrelated terms in it dilutes the ones that matter. If a specific
              generation keeps producing one particular flaw, add a term for exactly that flaw
              rather than a longer generic list.
            </p>
          </Section>

          <Separator />

          <Section id="references" title="Reference images & editing">
            <p className="text-muted-foreground">
              Image-to-image models here come in two shapes, and knowing which you&rsquo;re using
              changes how to prompt:
            </p>
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Single-image edit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  <p>One input image, transformed in place. Prompt what should <em>change</em>,
                  not the whole scene — the model already has the original for everything you
                  don&rsquo;t mention.</p>
                  <PromptExample kind="good">change the jacket to red leather, keep everything else the same</PromptExample>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Multi-image edit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  <p>A base image plus one or more reference images attached alongside it (this is
                  what a workflow&rsquo;s <code className="text-xs">attachReferenceImages</code>{" "}
                  option controls, and what an option group&rsquo;s attached reference image feeds
                  into). Say explicitly which image each reference is for.</p>
                  <PromptExample kind="good">apply the outfit from the second reference image onto the person in the base image</PromptExample>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Separator />

          <Section id="tokens" title="Workflow templates & tokens">
            <p className="text-muted-foreground">
              Every step in the Workflow Designer (LLM, image-edit, or caption) builds its prompt
              from a template with tokens in it. Tokens get replaced when the workflow actually
              runs — this is what lets one workflow adapt to whatever the runner picked.
            </p>
            <div className="space-y-2">
              <TokenExample token="{{options}}">
                Every option group the step consumes, concatenated into one fragment. A group
                contributes its chosen choice&rsquo;s prompt text (or the label, if the choice
                never got its own prompt filled in), or whatever was typed for a free-text group.
                Resolves to &ldquo;none&rdquo; if nothing&rsquo;s selected.
              </TokenExample>
              <TokenExample token="{{custom}}">
                The free-form &ldquo;Extra instructions&rdquo; box on the Run tab. &ldquo;none&rdquo; if left blank.
              </TokenExample>
              <TokenExample token="{{group-name}}">
                One <em>specific</em> group&rsquo;s chosen fragment, addressed by its name — spaces
                become hyphens, e.g. a group called &ldquo;Image Prompt&rdquo; is{" "}
                <code className="text-xs">{"{{image-prompt}}"}</code>. Use this instead of{" "}
                <code className="text-xs">{"{{options}}"}</code> when a step needs one group&rsquo;s
                text and not the combined blob of every group.
              </TokenExample>
              <TokenExample token="{{llm-step-name}}">
                A prior LLM step&rsquo;s generated output, addressed the same way (its label,
                hyphenated) unless it was given an explicit variable name. Only available in steps
                that run <em>after</em> that LLM step in the chain.
              </TokenExample>
            </div>
            <p className="text-sm text-muted-foreground">
              An image-edit step&rsquo;s template might read: <code className="text-xs">Stylize the
              photo. Style: {"{{options}}"}. Extra: {"{{custom}}"}. Caption idea: {"{{caption}}"}.</code>{" "}
              — combining the chosen style group, whatever the user typed, and a prior LLM step&rsquo;s
              output, all in one prompt.
            </p>
          </Section>

          <Separator />

          <Section id="captions" title="Captions & text overlay">
            <p className="text-muted-foreground">
              Text-overlay steps draw text straight onto the image with code — no model call, so
              wording never gets garbled the way asking an image model to render text does. A few
              things that make captions read better:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Short lines wrap more predictably than one long sentence — punchy beats dense.</li>
              <li>
                <span className="text-foreground">Outline width</span> matters more than color
                choice for legibility — a 2&ndash;3px outline in a contrasting color keeps text
                readable over busy backgrounds, gradient or not.
              </li>
              <li>
                <span className="text-foreground">3D / emboss</span> reads best on short, bold
                headline-style text — it gets muddy on long paragraphs since the shadow stack
                starts overlapping itself.
              </li>
              <li>
                <span className="text-foreground">Gradient fills</span> (including the Trans and
                Rainbow presets) show their color range best across wider boxes — a short caption
                in a narrow box mostly shows one color band, not the full gradient.
              </li>
              <li>
                Drag a box&rsquo;s resize handle to change wrap width, not the font size, when text
                is overflowing — reflowing usually looks better than shrinking.
              </li>
            </ul>
          </Section>

          <Separator />

          <Section id="models" title="Model guide">
            <div className="grid gap-3 sm:grid-cols-2">
              <ModelCard name="Seedream V5 Pro" type="Text to image" cost="$0.06 / image (1K), $0.11 (2K)">
                The general-purpose default — good balance of prompt-following and quality across
                most subjects and styles. Start here if you&rsquo;re not sure which model to pick.
              </ModelCard>
              <ModelCard name="Seedream V5 Pro Edit" type="Image edit" cost="$0.06 / image (1K), $0.11 (2K)">
                Single-image editing — targeted changes to one existing photo. Prompt the change,
                not the whole scene.
              </ModelCard>
              <ModelCard name="Seedream V5 Pro Multi-Edit" type="Multi-image edit" cost="$0.06 + $0.0035 per extra image">
                Base image plus attached references — the model most workflow image-edit steps use
                by default, since it&rsquo;s the one that accepts reference images alongside the base.
              </ModelCard>
              <ModelCard name="Ideogram V4" type="Text to image" cost="$0.06 / image">
                Noticeably better than the others here at rendering legible text <em>inside</em> the
                image itself (posters, signs, labels) — reach for this specifically when the
                generated image needs to contain readable words.
              </ModelCard>
              <ModelCard name="Krea 2 Turbo" type="Text to image" cost="$0.04 / image (1K), $0.06 (2K)">
                The fastest and cheapest option — good for rapidly iterating on a prompt or
                composition before committing to a slower/pricier model for the final pass.
              </ModelCard>
              <ModelCard name="Wan 2.7 Text to Video" type="Text to video" cost="Venice.ai pricing">
                Generates video straight from a text prompt — describe motion and camera movement
                explicitly (&ldquo;slow pan left&rdquo;, &ldquo;hair blowing in wind&rdquo;), not just a static
                scene, or you&rsquo;ll get a mostly-still clip.
              </ModelCard>
              <ModelCard name="Wan 2.7 Image to Video" type="Image to video" cost="Venice.ai pricing">
                Animates a starting image — this is what Feminization Studio&rsquo;s second step uses to
                bring a transformed photo to life. Prompt <em>how</em> the image should move.
              </ModelCard>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

function ModelCard({
  name,
  type,
  cost,
  children,
}: {
  name: string;
  type: string;
  cost: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{name}</CardTitle>
          <Badge variant="outline" className="shrink-0 text-[10px]">{type}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{cost}</p>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}
