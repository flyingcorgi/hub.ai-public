// Groups any list of templates by their free-form `category` field, used consistently across
// every template dropdown/list in the app. Uncategorized items are grouped last so populated
// categories surface first as a list grows.
export function groupByCategory<T extends { category?: string }>(
  items: T[]
): { category: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || "Uncategorized";
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });
  return sortedKeys.map((category) => ({ category, items: groups.get(category)! }));
}
