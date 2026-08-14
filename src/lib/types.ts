export interface Model {
  name: string;
  id: string;
  // Explicit, not inferred from the id string — the previous id-substring heuristic
  // ("includes('/image-to-video')" etc.) kept missing new models and mislabeling the
  // generate button/result panel. Required so every new model must declare it.
  mediaType: "image" | "video";
  // Human-readable cost per run, e.g. "$0.03 / image" or "$0.30 / 5s clip". Costs vary by
  // resolution/duration for many models, so this is a representative figure, not a live quote.
  costEstimate?: string;
  inputSchema: ModelParameter[];
  outputSchema: ModelParameter[];
}

export interface Generation {
  id: string;
  modelId: string;
  modelName: string;
  prompt: string;
  parameters: Record<string, any>;
  output: {
    images: Image[];
    timings: Record<string, any>;
    seed: number;
    has_nsfw_concepts: boolean[];
  };
  timestamp: number;
}

export interface ModelParameter {
  key: string;
  type: ModelParameterType;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: unknown[];  // For enum-like parameters
  properties?: Record<string, { 
    type: string;
    description?: string;
    validation?: {
      min?: number;
      max?: number;
    };
    default?: unknown;
  }>;
  items?: {
    type: string;
    description?: string;
    properties?: Record<string, { 
      type: string;
      description?: string;
      validation?: {
        min?: number;
        max?: number;
      };
      default?: unknown;
    }>;
  };  // For array item types
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: (value: unknown) => boolean;
  };
}

export type ModelParameterType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'enum'
  | 'image'  // Special type for image data
  | 'audio'  // Special type for audio data
  | 'video'  // Special type for video data
  | 'file'   // Special type for file uploads
  | 'json';  // For structured JSON data

export interface Image {
  url: string;
  width: number;
  height: number;
  content_type: string;
  [key: string]: unknown;  // Allows additional image properties
}

// Helper type for runtime parameter values
export interface ModelParameterValue {
  key: string;
  value: unknown;
}