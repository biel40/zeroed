/** Only the DOM operations used by the diagnostics panel; no browser or visual validation. */
export class DebugElement {
  public readonly children: DebugElement[] = [];
  public readonly attributes: Record<string, string> = {};
  public readonly dataset: Record<string, string> = {};
  public id = '';
  public className = '';
  public textContent = '';
  public removed = false;

  public constructor(public readonly tag: string) {}

  public append(...children: DebugElement[]): void { this.children.push(...children); }
  public appendChild(child: DebugElement): DebugElement { this.children.push(child); return child; }
  public setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  public remove(): void { this.removed = true; }
}

export function createDebugDocument(): {
  nodes: DebugElement[];
  document: {
    body: DebugElement;
    documentElement: { lang: string };
    querySelectorAll(): never[];
    createElement(tag: string): DebugElement;
    createElementNS(namespace: string, tag: string): DebugElement;
  };
} {
  const nodes: DebugElement[] = [];
  const create = (tag: string): DebugElement => {
    const node = new DebugElement(tag);
    nodes.push(node);
    return node;
  };
  return {
    nodes,
    document: {
      body: new DebugElement('body'),
      documentElement: { lang: 'en' },
      querySelectorAll: () => [],
      createElement: create,
      createElementNS: (_namespace, tag) => create(tag),
    },
  };
}
