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
    <main className="container mx-auto py-8 px-4">
      <div className="flex flex-col items-center space-y-8">
        <h1 className="text-4xl font-bold text-center">{model.name}</h1>
        <p className="text-muted-foreground text-center max-w-2xl">
          Generate {model.mediaType === "video" ? "videos" : "images"} using {model.name}
        </p>
        <ImageGenerator model={model} />
      </div>
    </main>
  );
}
