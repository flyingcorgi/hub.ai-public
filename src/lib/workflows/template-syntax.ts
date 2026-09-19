// Inspect author-written templates only, never generated prose or user-supplied replacements.
// Single braces (e.g. JSON examples) remain literal. Tokens require exactly two braces.
export function templateTokens(template: string): string[] {
  const tokens: string[] = [];
  const remainder = template.replace(/\{+\{([^{}]*)\}\}+/g, (match, token: string) => {
    if (match !== `{{${token}}}` || !/^[a-z0-9-]+$/i.test(token)) {
      throw new Error("Invalid template token. Use exactly two braces, for example {{caption}}.");
    }
    tokens.push(token.toLowerCase());
    return "";
  });
  if (remainder.includes("{{") || remainder.includes("}}")) {
    throw new Error("Unclosed or malformed template token.");
  }
  return tokens;
}
