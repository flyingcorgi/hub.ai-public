import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImageGenerator } from "@/components/image-generator";
import { allModels } from "@/lib/models/registry";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ "model-id": string }>;
};

export default async function FluxModelPage({ params }: Props) {
  const { "model-id": modelId } = await params;

  // Find the model from our registry
  const model = allModels.find((m) => m.id.replace(/\//g, "-") === modelId);

  if (!model) {
    notFound();
  }

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
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold sm:text-4xl">{model.name}</h1>
          {model.costEstimate && <p className="text-sm text-muted-foreground">{model.costEstimate}</p>}
        </div>
        <ImageGenerator model={model} />
      </div>
    </main>
  );
}
