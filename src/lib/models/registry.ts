import { Model } from "@/lib/types";
import * as seedreamTextToImage from "./seedream/text-to-image";
import * as qwenImageEdit from "./qwen/image-edit";
import * as qwenTextToImage from "./qwen/text-to-image";
import * as longcatAvatar from "./longcat/image-audio-to-video";
import * as pixverseLipsync from "./pixverse/lipsync";
import * as wavespeedMultitalk from "./wavespeed/multitalk";
import * as wavespeedInfinitetalk from "./wavespeed/infinitetalk";
import * as wavespeedWanI2v from "./wavespeed/wan-i2v-720p-ultra-fast";
import * as alibabaWan25I2vFast from "./wavespeed/alibaba-wan-2.5-i2v-fast";
import * as alibabaWan26I2vPro from "./wavespeed/alibaba-wan-2.6-i2v-pro";
import * as wavespeedSeedream45Edit from "./wavespeed/seedream-v4.5-edit";
import * as wavespeedSeedream5Pro from "./wavespeed/seedream-v5.0-pro";
import * as wavespeedSeedream5ProEdit from "./wavespeed/seedream-v5.0-pro-edit";
import * as wavespeedGptImage2Edit from "./wavespeed/gpt-image-2-edit";
import * as wavespeedGptImage2TextToImage from "./wavespeed/gpt-image-2-text-to-image";
import * as wavespeedGrokImagineVideoI2v from "./wavespeed/grok-imagine-video-i2v";
import * as wavespeedGrokImagineVideoT2v from "./wavespeed/grok-imagine-video-t2v";
import * as wavespeedSeedance2MiniI2v from "./wavespeed/seedance-2.0-mini-i2v";
import * as wavespeedSeedance2I2v from "./wavespeed/seedance-2.0-i2v";
import * as wavespeedFlux2Klein9bTextToImage from "./wavespeed/flux-2-klein-9b-text-to-image";
import * as wavespeedFlux2Klein9bEdit from "./wavespeed/flux-2-klein-9b-edit";
import * as wavespeedFlux2Klein9bTextToImageLora from "./wavespeed/flux-2-klein-9b-text-to-image-lora";
import * as wavespeedFlux2Klein9bEditLora from "./wavespeed/flux-2-klein-9b-edit-lora";
import * as wavespeedZImageTurboLora from "./wavespeed/z-image-turbo-lora";
import * as wavespeedLtx23I2vLora from "./wavespeed/ltx-2.3-i2v-lora";
import * as wavespeedWan22I2v720pLora from "./wavespeed/wan-2.2-i2v-720p-lora";
import * as wavespeedMinimaxH3I2v from "./wavespeed/minimax-h3-i2v";
import * as wavespeedPrunaPVideoAvatar from "./wavespeed/pruna-p-video-avatar";
import * as wavespeedSeedance25I2v from "./wavespeed/seedance-2.5-i2v";
import * as wavespeedSeedance25I2vSpicy from "./wavespeed/seedance-2.5-i2v-spicy";
import * as wavespeedSeedance25VideoExtend from "./wavespeed/seedance-2.5-video-extend";
import * as replicateSeedream from "./replicate/seedream";
import * as topazUpscaleImage from "./topaz/upscale-image";

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

const seedreamModels = extractModels(seedreamTextToImage);
const qwenModels = [
  ...extractModels(qwenImageEdit),
  ...extractModels(qwenTextToImage),
];
const longcatModels = extractModels(longcatAvatar);
const pixverseModels = extractModels(pixverseLipsync);
const wavespeedModels = [
  ...extractModels(wavespeedMultitalk),
  ...extractModels(wavespeedInfinitetalk),
  ...extractModels(wavespeedWanI2v),
  ...extractModels(alibabaWan25I2vFast),
  ...extractModels(alibabaWan26I2vPro),
  ...extractModels(wavespeedSeedream45Edit),
  ...extractModels(wavespeedSeedream5Pro),
  ...extractModels(wavespeedSeedream5ProEdit),
  ...extractModels(wavespeedGptImage2Edit),
  ...extractModels(wavespeedGptImage2TextToImage),
  ...extractModels(wavespeedGrokImagineVideoI2v),
  ...extractModels(wavespeedGrokImagineVideoT2v),
  ...extractModels(wavespeedSeedance2MiniI2v),
  ...extractModels(wavespeedSeedance2I2v),
  ...extractModels(wavespeedFlux2Klein9bTextToImage),
  ...extractModels(wavespeedFlux2Klein9bEdit),
  ...extractModels(wavespeedFlux2Klein9bTextToImageLora),
  ...extractModels(wavespeedFlux2Klein9bEditLora),
  ...extractModels(wavespeedZImageTurboLora),
  ...extractModels(wavespeedLtx23I2vLora),
  ...extractModels(wavespeedWan22I2v720pLora),
  ...extractModels(wavespeedMinimaxH3I2v),
  ...extractModels(wavespeedPrunaPVideoAvatar),
  ...extractModels(wavespeedSeedance25I2v),
  ...extractModels(wavespeedSeedance25I2vSpicy),
  ...extractModels(wavespeedSeedance25VideoExtend),
];
const replicateModels = extractModels(replicateSeedream);
const topazModels = extractModels(topazUpscaleImage);

// Export all models in a single array
export const allModels = [
  ...seedreamModels,
  ...qwenModels,
  ...longcatModels,
  ...pixverseModels,
  ...wavespeedModels,
  ...replicateModels,
  ...topazModels,
];
