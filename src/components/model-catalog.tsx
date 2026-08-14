'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { allModels } from "@/lib/models/registry";
import { modelNavGroups, modelById, modelHref, providerFor } from "@/lib/models/nav-groups";

const ALL_PROVIDERS = "All";

export function ModelCatalog() {
  const providerOptions = useMemo(() => {
    const present = new Set(allModels.map((model) => providerFor(model.id)));
    return [ALL_PROVIDERS, ...Array.from(present).sort()];
  }, []);

  const [provider, setProvider] = useState<string>(ALL_PROVIDERS);

  return (
    <div className="w-full max-w-4xl space-y-10">
      <div className="flex justify-center">
        <div className="space-y-1">
          <Label className="text-sm">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === ALL_PROVIDERS ? "All Providers" : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {modelNavGroups.map((group) => {
        const visibleIds = group.modelIds.filter((modelId) => {
          if (provider === ALL_PROVIDERS) return true;
          return providerFor(modelId) === provider;
        });

        if (visibleIds.length === 0) return null;

        return (
          <section key={group.label} className="space-y-4">
            <h2 className="text-xl font-semibold border-b pb-2">{group.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleIds.map((modelId) => {
                const model = modelById.get(modelId);
                if (!model) return null;
                return (
                  <Link key={modelId} href={modelHref(modelId)} className="block">
                    <Card className="h-full flex items-center justify-center p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                      <CardHeader className="p-0">
                        <CardTitle className="text-base">{model.name}</CardTitle>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
