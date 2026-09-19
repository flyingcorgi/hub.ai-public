'use client';

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SidebarNavContent } from "@/components/dashboard/sidebar";

// The sidebar is `hidden` below the md breakpoint (see sidebar.tsx), which otherwise leaves
// mobile with no navigation at all — this fixed top bar + slide-over drawer is its replacement,
// shown only below md.
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="dark sticky top-0 z-40 flex items-center gap-2 border-b border-white/5 bg-[#0b0b0d] px-3 py-3 text-neutral-200 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-neutral-300 hover:bg-white/5 hover:text-neutral-100">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Choose a tool or manage your account.</DialogDescription>
          <SidebarNavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="bg-gradient-to-r from-pink-300 to-pink-500 bg-clip-text text-base font-bold text-transparent">
        FetishUI
      </Link>
    </div>
  );
}
