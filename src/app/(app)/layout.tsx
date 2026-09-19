import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { AccountProvider } from "@/components/account/account-provider";

// Chrome (sidebar + mobile nav) for every screen inside the actual app — everything except the
// public landing page at "/", which renders with no app chrome (see src/app/page.tsx). A route
// group ("(app)") applies this without adding a path segment, so /goon-game, /queue, etc. are
// unaffected.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider><div className="flex min-h-screen flex-col md:flex-row">
      <DashboardSidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div></AccountProvider>
  );
}
