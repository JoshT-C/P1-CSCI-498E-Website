import { ACTIVE_BACKEND, DIAGRAMS, FLOPPIES, NODES, SERVICES } from './homelab';
import { STACK } from './projects';

/** Collects every string the homelab content ships, for the secret scan. */
function allStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk([NODES, SERVICES, DIAGRAMS, FLOPPIES]);
  return out;
}

describe('content/homelab', () => {
  describe('nodes', () => {
    it('has unique ids', () => {
      const ids = NODES.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every node non-empty tape', () => {
      for (const node of NODES) {
        expect(node.tape.trim().length, `${node.id} tape`).toBeGreaterThan(0);
      }
    });
  });

  describe('diagrams', () => {
    it('only draws edges between nodes that exist in the same diagram', () => {
      for (const diagram of DIAGRAMS) {
        const ids = new Set(diagram.nodes.map(n => n.id));
        for (const edge of diagram.edges) {
          expect(ids.has(edge.from), `${diagram.title}: edge from ${edge.from}`).toBe(true);
          expect(ids.has(edge.to), `${diagram.title}: edge to ${edge.to}`).toBe(true);
        }
      }
    });

    it('places every node centre within the 0-1 panel', () => {
      for (const diagram of DIAGRAMS) {
        for (const node of diagram.nodes) {
          expect(node.x, `${diagram.title} ${node.id} x`).toBeGreaterThanOrEqual(0);
          expect(node.x, `${diagram.title} ${node.id} x`).toBeLessThanOrEqual(1);
          expect(node.y, `${diagram.title} ${node.id} y`).toBeGreaterThanOrEqual(0);
          expect(node.y, `${diagram.title} ${node.id} y`).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('floppies', () => {
    it('has unique ids', () => {
      const ids = FLOPPIES.map(f => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('keeps disk labels short', () => {
      for (const floppy of FLOPPIES) {
        expect(floppy.label.length, `${floppy.id} label`).toBeLessThanOrEqual(14);
      }
    });

    it('only links to absolute https URLs or in-page anchors', () => {
      for (const floppy of FLOPPIES) {
        if (floppy.href !== null) {
          expect(floppy.href.startsWith('#') || floppy.href.startsWith('https://'))
            .toBe(true);
        }
      }
    });

    it('carries an hrefLabel exactly when it carries an href', () => {
      for (const floppy of FLOPPIES) {
        expect(floppy.hrefLabel === null, `${floppy.id} hrefLabel`)
          .toBe(floppy.href === null);
      }
    });
  });

  describe('rack display', () => {
    it('lights a backend that exists in STACK.models', () => {
      expect(ACTIVE_BACKEND).toBeGreaterThanOrEqual(0);
      expect(ACTIVE_BACKEND).toBeLessThan(STACK.models.length);
    });
  });

  describe('secret scan', () => {
    // The copy must be public-safe: the same gate as content/projects.spec.ts.
    const PRIVATE_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    const PRIVATE_RANGE = /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
    const PORT = /(?<![\w.]):\d{2,5}\b/; // a bare ":8080" — URLs were stripped first
    const LOCALHOST = /localhost/i;
    const LOCAL_DOMAIN = /\.local\b/i;
    const LAN_DOMAIN = /\.lan\b/i;
    const CREDENTIALS = /(?:sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9_-]{20,}|\bapi[_-]?key\b|\.env\b|proxmox)/i;

    it('contains no IPs, ports, local hostnames, or credential shapes', () => {
      for (const text of allStrings()) {
        // Strip URLs first, or "https://" trips the port pattern.
        const scrubbed = text.replace(/https?:\/\/\S+/g, '');
        expect(scrubbed, `IP address in: ${text}`).not.toMatch(PRIVATE_IP);
        expect(scrubbed, `private range in: ${text}`).not.toMatch(PRIVATE_RANGE);
        expect(scrubbed, `port in: ${text}`).not.toMatch(PORT);
        expect(text, `localhost in: ${text}`).not.toMatch(LOCALHOST);
        expect(text, `'.local' in: ${text}`).not.toMatch(LOCAL_DOMAIN);
        expect(text, `'.lan' in: ${text}`).not.toMatch(LAN_DOMAIN);
        expect(text, `credential shape in: ${text}`).not.toMatch(CREDENTIALS);
      }
    });
  });
});
