import { Metadata } from "next";
import { GoonGame } from "@/components/goon-game/goon-game";
import { GameBackupControls } from "@/components/goon-game/game-backup-controls";

export const metadata: Metadata = {
  title: "Goon Game — FetishUI",
  description: "Stroke, edge, and obey. A goon challenge powered by Venice.ai.",
};

export default function GoonGamePage() {
  return <>
    <GameBackupControls />
    <GoonGame />
  </>;
}