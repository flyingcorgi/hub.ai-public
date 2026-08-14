import { ModelCatalog } from "@/components/model-catalog";

export default function Home() {
  return (
    <main className="container mx-auto py-8 px-4">
      <div className="flex flex-col items-center space-y-10">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-center">Hub.AI</h1>
          <p className="text-muted-foreground text-center max-w-2xl">
            One hub for every image and video generation model — FAL.AI, WaveSpeed, Replicate, and BytePlus.
          </p>
        </div>

        <ModelCatalog />
      </div>
    </main>
  );
}
