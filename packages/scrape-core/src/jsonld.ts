/**
 * Collect parsed JSON-LD documents from HTML `<script type="application/ld+json">` blocks.
 * Malformed JSON blocks are skipped so one bad script does not fail the page.
 */
export function collectJsonLdDocuments(html: string): unknown[] {
  const documents: unknown[] = [];
  const scriptRe =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      documents.push(JSON.parse(raw) as unknown);
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return documents;
}

/** Flatten top-level arrays and `@graph` nodes into a single list of objects. */
export function flattenJsonLdNodes(documents: unknown[]): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];

  const visit = (value: unknown): void => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;

    const obj = value as Record<string, unknown>;
    nodes.push(obj);

    if ('@graph' in obj) {
      visit(obj['@graph']);
    }
  };

  for (const doc of documents) visit(doc);
  return nodes;
}

export function typeIncludes(node: Record<string, unknown>, typeName: string): boolean {
  const raw = node['@type'];
  if (typeof raw === 'string') {
    return stripSchemaPrefix(raw) === typeName;
  }
  if (Array.isArray(raw)) {
    return raw.some(
      (t) => typeof t === 'string' && stripSchemaPrefix(t) === typeName,
    );
  }
  return false;
}

function stripSchemaPrefix(typeName: string): string {
  const trimmed = typeName.trim();
  const hash = trimmed.lastIndexOf('/');
  if (hash >= 0) return trimmed.slice(hash + 1);
  return trimmed;
}
