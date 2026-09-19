import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { readPublicWorkflowSummary } from "@/lib/workflows/catalog";
import { WorkflowLanding } from "@/components/workflows/workflow-landing";

export const dynamic = "force-dynamic";
// Template-first: keep campaign pages out of search until copy/examples are reviewed.
export const metadata: Metadata = {
  title: "Explore a guided workflow | FetishUI",
  robots: { index: false, follow: false },
};

export default async function WorkflowCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await readPublicWorkflowSummary(getDb(), id);
  if (!workflow) notFound();
  return <WorkflowLanding workflow={workflow} />;
}
