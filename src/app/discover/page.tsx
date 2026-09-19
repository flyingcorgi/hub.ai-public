import type { Metadata } from "next";
import { landingDemo, WorkflowLanding } from "@/components/workflows/workflow-landing";

export const metadata: Metadata = {
  title: "Workflow landing template | FetishUI",
  robots: { index: false, follow: false },
};

export default function WorkflowLandingPreview() {
  return <WorkflowLanding workflow={landingDemo} demo />;
}
