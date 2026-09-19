import { Model } from "@/lib/types";
import * as veniceSeedreamV5Pro from "./venice/seedream-v5-pro";
import * as veniceSeedreamV5ProEdit from "./venice/seedream-v5-pro-edit";
import * as veniceSeedreamV5ProMultiEdit from "./venice/seedream-v5-pro-multi-edit";
import * as veniceIdeogramV4 from "./venice/ideogram-v4";
import * as veniceKrea2Turbo from "./venice/krea-2-turbo";
import * as veniceWan27TextToVideo from "./venice/wan-2.7-text-to-video";
import * as veniceWan27ImageToVideo from "./venice/wan-2.7-image-to-video";

function extractModels(moduleExports: Record<string, unknown>): Model[] {
  return Object.values(moduleExports).filter(
    (value): value is Model =>
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "id" in value &&
      "inputSchema" in value &&
      "outputSchema" in value
  );
}

const veniceModels = [
  ...extractModels(veniceSeedreamV5Pro),
  ...extractModels(veniceSeedreamV5ProEdit),
  ...extractModels(veniceSeedreamV5ProMultiEdit),
  ...extractModels(veniceIdeogramV4),
  ...extractModels(veniceKrea2Turbo),
  ...extractModels(veniceWan27TextToVideo),
  ...extractModels(veniceWan27ImageToVideo),
];

// Export all models in a single array
export const allModels = [...veniceModels];
