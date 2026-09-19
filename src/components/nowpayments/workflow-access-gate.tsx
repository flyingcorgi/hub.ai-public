'use client';

import { type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useAccount } from "@/components/account/account-provider";

// UI hint only for browser-local paid features, not a tamper-proof storage boundary. Server
// workflow APIs independently authorize reads/mutations; album backup/export is never paywalled.
export function PaidAccessGate({
  children,
  title = "This is locked",
  description = "$45 unlocks every guided workflow for 3 months — BYOK for generation costs.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { account, loading } = useAccount();
  if (loading) return null;
  if (!account.unlocked) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16">
        <LockCard title={title} description={description} />
      </main>
    );
  }

  return <>{children}</>;
}

// Exported so designer-runner.tsx can show the same lock prompt inline (in place of just the Run
// tab's content) instead of wrapping in another <main>, since the page around it isn't locked.
export function LockCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/unlock">Unlock workflows</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
