'use client';

import { useState } from "react";
import { VeniceKeySetup } from "@/components/venice-key-setup";

export function LandingKeySetup() {
  const [open, setOpen] = useState(false);
  return <VeniceKeySetup open={open} onOpenChange={setOpen} />;
}
