export const wizardBlueprint = () => ({
  name: "Watercolor portrait", description: "Restyle an uploaded portrait and add an editable caption.",
  optionGroups: [
    { id: "style", name: "Style", inputType: "choices", choices: [{ id: "warm", label: "Warm", prompt: "warm watercolor palette" }] },
    { id: "caption", name: "Caption", inputType: "text", choices: [] },
  ],
  steps: [
    { id: "edit", type: "image-edit", label: "Restyle portrait", modelId: "venice/seedream-v5-pro-multi-edit", promptTemplate: "Restyle the input portrait. {{options}} {{custom}}", sourceImage: "pipeline" },
    { id: "caption", type: "text-overlay", label: "Add caption", promptTemplate: "{{caption}}", textPosition: "bottom" },
  ],
});
export const wizardProviderResponse = (blueprint: unknown = wizardBlueprint()) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(blueprint) } }] });
