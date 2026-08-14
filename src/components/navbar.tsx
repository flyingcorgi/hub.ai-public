'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ModelsNavDropdown } from "./models-nav-dropdown";

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/batch/seedream-edit", label: "Batch Automation" },
    { href: "/scripts", label: "Scripts" },
    { href: "/topic-designer", label: "Topic Designer" },
    { href: "/spreadsheet", label: "Spreadsheet" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-14 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="mr-1 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-xl font-bold text-transparent"
          >
            Hub.AI
          </Link>
          <ModelsNavDropdown />
          {navLinks.map((link) => (
            <Button
              key={link.href}
              asChild
              type="button"
              variant={pathname === link.href ? "default" : "ghost"}
              size="sm"
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild type="button" variant={pathname === "/settings" ? "default" : "ghost"} size="sm" className="gap-1.5">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
