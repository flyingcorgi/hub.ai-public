'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateManager } from "@/components/templates/template-manager";
import { ApiKeyInput } from "@/components/api-key-input";

export function SettingsPage({ initialTab = "templates" }: { initialTab?: "templates" | "api-keys" }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Templates and API keys for every tool in FetishUI.</p>
      </div>

      {/* Keyed on initialTab so a link straight to ?tab=api-keys re-applies even if this page
          is already mounted — Radix's defaultValue only takes effect once, on mount. */}
      <Tabs key={initialTab} defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="pt-4">
          <TemplateManager />
        </TabsContent>
        <TabsContent value="api-keys" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">API Keys</CardTitle>
              <CardDescription>
                Stored locally in this browser and used by every generation tool in FetishUI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeyInput />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
