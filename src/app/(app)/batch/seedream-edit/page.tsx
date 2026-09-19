import { Suspense } from "react";
import { BatchSeedreamGenerator } from "@/components/batch-seedream/batch-seedream-generator";

export default function BatchSeedreamEditPage() {
  return (
    <main className="container mx-auto py-6 px-4 sm:py-8">
      <div className="flex flex-col items-center space-y-6 sm:space-y-8">
        <h1 className="text-2xl font-bold text-center sm:text-4xl">Batch Automation</h1>
        <p className="text-muted-foreground text-center max-w-2xl">
          Queue up prompts, images, and audio ahead of time for Seedream 4.5 Edit, Wan 2.2
          image-to-video, or Multitalk, then run the whole batch with one click.
        </p>
        <Suspense>
          <BatchSeedreamGenerator />
        </Suspense>
      </div>
    </main>
  );
}
