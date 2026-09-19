import { SettingsPage } from "@/components/settings/settings-page";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function Settings({ searchParams }: Props) {
  const { tab } = await searchParams;
  return (
    <main className="container mx-auto py-8 px-4">
      <SettingsPage initialTab={tab === "api-keys" ? "api-keys" : "templates"} />
    </main>
  );
}
