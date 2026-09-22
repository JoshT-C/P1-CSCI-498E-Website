import {
  CURATED_PROJECTS,
  GITHUB_USERNAME,
  HIDDEN_REPOS,
  MAX_GRID_PROJECTS,
  STACK,
  TERMINAL
} from './projects';

/** Collects every string the site ships, for the secret scan. */
function allStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk([GITHUB_USERNAME, MAX_GRID_PROJECTS, [...HIDDEN_REPOS], CURATED_PROJECTS, STACK, TERMINAL]);
  return out;
}

describe('content/projects', () => {
  describe('curated projects', () => {
    it('has unique ids and non-empty copy', () => {
      const ids = CURATED_PROJECTS.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of CURATED_PROJECTS) {
        expect(p.title).toBeTruthy();
        expect(p.tagline).toBeTruthy();
        expect(p.body).toBeTruthy();
        expect(p.href).toBeTruthy();
        expect(p.tags.length).toBeGreaterThan(0);
      }
    });

    it('only links to absolute https URLs or in-page anchors', () => {
      for (const p of CURATED_PROJECTS) {
        expect(p.href.startsWith('#') || p.href.startsWith('https://')).toBe(true);
      }
    });

    it('features the AI stack first, linked to the stack section', () => {
      expect(CURATED_PROJECTS[0].id).toBe('ai-stack');
      expect(CURATED_PROJECTS[0].href).toBe('#stack');
    });
  });

  describe('github grid config', () => {
    it('points at a valid GitHub username', () => {
      expect(GITHUB_USERNAME).toMatch(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9]))*$/);
    });

    it('hides the class project and the previous-site repos', () => {
      expect(HIDDEN_REPOS.has('P1-CSCI-498E-Website')).toBe(true);
      expect(HIDDEN_REPOS.has('joshua_t-c.github.io')).toBe(true);
      expect(HIDDEN_REPOS.has('joshua_t-c.github.io.dev')).toBe(true);
    });

    it('bounds the grid', () => {
      expect(MAX_GRID_PROJECTS).toBeGreaterThan(0);
      expect(MAX_GRID_PROJECTS).toBeLessThanOrEqual(12);
    });
  });

  describe('ai stack copy', () => {
    it('lists exactly four model rows with complete fields', () => {
      expect(STACK.models.length).toBe(4);
      const names = STACK.models.map(m => m.name);
      expect(new Set(names).size).toBe(names.length);
      for (const m of STACK.models) {
        expect(m.name).toBeTruthy();
        expect(m.architecture).toBeTruthy();
        expect(m.context).toMatch(/^\d[\d,]*$/);
        expect(m.speed).toMatch(/\d+\s*tok\/s$/);
        expect(m.note).toBeTruthy();
      }
    });

    it('names the interactive default in a note', () => {
      expect(STACK.models.some(m => m.note.toLowerCase().includes('default'))).toBe(true);
    });
  });

  describe('secret scan', () => {
    // The copy must be public-safe: nothing internal, nothing credential-shaped.
    const INTERNAL_HOST = /lopyhupis/i;
    const PRIVATE_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    const PRIVATE_RANGE = /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
    const PORT = /(?<![\w.]):\d{2,5}\b/; // a bare ":8080" — URLs were stripped first
    const CREDENTIALS = /(?:sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9_-]{20,}|\bapi[_-]?key\b|\.env\b|proxmox)/i;

    it('contains no internal hostnames, IPs, ports, or credential shapes', () => {
      for (const text of allStrings()) {
        // Strip URLs first, or "https://" trips the port pattern.
        const scrubbed = text.replace(/https?:\/\/\S+/g, '');
        expect(scrubbed, `hostname in: ${text}`).not.toMatch(INTERNAL_HOST);
        expect(scrubbed, `IP address in: ${text}`).not.toMatch(PRIVATE_IP);
        expect(scrubbed, `private range in: ${text}`).not.toMatch(PRIVATE_RANGE);
        expect(scrubbed, `port in: ${text}`).not.toMatch(PORT);
        expect(text, `credential shape in: ${text}`).not.toMatch(CREDENTIALS);
      }
    });
  });
});
