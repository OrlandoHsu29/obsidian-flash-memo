type LayoutNode = Record<string, unknown>;

function node(value: unknown): LayoutNode | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LayoutNode : null;
}

function leafIds(value: unknown): string[] {
  const entry = node(value);
  if (!entry) return [];
  if (entry.type === 'leaf') return typeof entry.id === 'string' ? [entry.id] : [];
  return Array.isArray(entry.children) ? entry.children.flatMap(leafIds) : [];
}

export function withoutMemoPopout(layout: Record<string, unknown>, ownedLeafId: string): Record<string, unknown> {
  if (!ownedLeafId) return layout;
  const floating = node(layout.floating);
  if (!floating || !Array.isArray(floating.children)) return layout;
  const remaining = floating.children.filter(value => {
    const window = node(value);
    if (!window || window.type !== 'window') return true;
    const ids = leafIds(window);
    // Shared/user popouts must retain all of their tabs and window state.
    return ids.length !== 1 || ids[0] !== ownedLeafId;
  });
  if (remaining.length === floating.children.length) return layout;
  const result = { ...layout };
  if (remaining.length) result.floating = { ...floating, children: remaining };
  else delete result.floating;
  if (result.active === ownedLeafId) {
    const replacement = leafIds(layout.main)[0] ?? leafIds(result.floating)[0];
    if (replacement) result.active = replacement;
    else delete result.active;
  }
  return result;
}
