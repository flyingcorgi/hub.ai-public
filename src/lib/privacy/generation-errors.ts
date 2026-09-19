// Only application-authored, content-free messages may use this class. Never wrap a provider
// response, request value, URL, or arbitrary exception message in it. Those can echo secrets.
export class GenerationError extends Error {}

export function generationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof GenerationError ? error.message : fallback;
}

// Deliberately do not parse/return Venice's error body: it can echo a prompt, image, or key.
// Status-based hints preserve useful feedback without maintaining a fragile redaction regex.
export async function assertVeniceResponseOk(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);

  const hints: Record<number, string> = {
    400: "Check the selected model's inputs.",
    401: "Check your Venice.ai API key.",
    402: "Check your Venice.ai balance.",
    403: "Check your Venice.ai key permissions and model access.",
    413: "Reduce the size of the input images.",
    422: "Check the selected model's inputs.",
    429: "Venice.ai is rate limiting requests. Try again later.",
  };
  throw new GenerationError(
    `Venice.ai request failed (${response.status}). ${hints[response.status] ?? "Try again later or check Venice.ai's service status."}`
  );
}
