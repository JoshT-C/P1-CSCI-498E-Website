/**
 * Who the site belongs to. The hero, the terminal screens and the footer
 * all read these, so the name, pronouns and status exist exactly once.
 */
export const SITE_META = {
  name: 'Joshua T-C',
  /** The name split for the display heading: the accent half is phosphor. */
  nameParts: ['Joshua', 'T-C'] as const,
  pronouns: 'any / all',
  status: 'metaphysical exile',
  lede:
    'Computer science student at the Colorado School of Mines. I run a homelab, the servers for Minecraft at Mines (600+ members), and a local AI stack that serves four large language models from one RTX 5090.',
  stack: ['angular', 'three.js', 'llama.cpp'],
  year: 2026
} as const;

/** The prompt of the session behind the glass: a visitor logged in as a
 *  guest, reading Joshua's files. */
export const SESSION_PROMPT = 'guest@t-c:~$';

