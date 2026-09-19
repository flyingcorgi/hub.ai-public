import Link from "next/link";
import { headers } from "next/headers";
import { getPrincipal } from "@/lib/auth/authorization";
import { wizardModel } from "@/lib/workflows/wizard-server";

export const dynamic = "force-dynamic";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowDesignerEditor } from "@/components/workflows/designer-editor";
import { WorkflowDesignerRunner } from "@/components/workflows/designer-runner";

type Props = {
  searchParams: Promise<{ run?: string }>;
};

// Navigation is not the security boundary: every definition read and mutation also resolves
// current DB authorization in its Route Handler. Never serialize full definitions into this page.
export default async function WorkflowDesignerPage({ searchParams }: Props) {
  const { run } = await searchParams;
  let admin = false;
  try {
    const user = await getPrincipal(await headers());
    admin = user?.role === "admin" && user.emailVerified;
  } catch { /* Fail closed without logging session/configuration errors. */ }

  // Regular users only ever land here via a workflow card's ?run=<id> link — give them a clean,
  // workflow-scoped page (no "Workflow Designer" branding, no Design/Run tabs, no picker to
  // switch to a different workflow) rather than exposing the admin authoring tool's chrome.
  if (!admin) {
    return (
      <main className="container mx-auto py-6 px-4 sm:py-8">
        <div className="flex flex-col items-center space-y-6 sm:space-y-8">
          <Link
            href="/dashboard"
            className="self-start inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <WorkflowDesignerRunner initialWorkflowId={run} lockToInitial />
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-6 px-4 sm:py-8">
      <div className="flex flex-col items-center space-y-6 sm:space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-center sm:text-4xl">Workflow Designer</h1>
          <p className="text-muted-foreground text-center max-w-2xl">
            Design option groups and chained steps (LLM text generation and image-edit rounds),
            then run them — revision-checked definitions are saved in the database.
          </p>
        </div>
        {/* Keyed on `run` so navigating between sidebar workflow links (which only change the
            ?run= query param, not the route) remounts the tabs — Radix's defaultValue only
            applies once, on mount, and Next reuses this component across that navigation. */}
        <Tabs key={run ?? "design"} defaultValue={run ? "run" : "design"} className="w-full max-w-6xl mx-auto">
          <TabsList>
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="run">Run</TabsTrigger>
          </TabsList>
          <TabsContent value="design">
            <WorkflowDesignerEditor wizardModel={wizardModel()} />
          </TabsContent>
          <TabsContent value="run">
            <WorkflowDesignerRunner initialWorkflowId={run} adminCatalog />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
