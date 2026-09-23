import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { COMMANDS, SECTION_COMMAND, ShellService, parseCommand } from './shell.service';
import { SceneSyncService } from './scene-sync.service';

describe('parseCommand', () => {
  it('reads names and aliases, ignoring case and spacing', () => {
    expect(parseCommand('about')).toBe('about');
    expect(parseCommand('  ABOUT ')).toBe('about');
    expect(parseCommand('ls')).toBe('projects');
    expect(parseCommand('cat   about.txt')).toBe('about');
  });

  it('tells an empty line from an unknown one', () => {
    expect(parseCommand('   ')).toBe('empty');
    expect(parseCommand('rm -rf /')).toBe('unknown');
  });

  it('gives every command a unique name and aliases no other command uses', () => {
    const spellings = COMMANDS.flatMap(c => [c.name, ...c.aliases]);
    expect(new Set(spellings).size).toBe(spellings.length);
  });

  it('maps every section link to a real command', () => {
    for (const command of Object.values(SECTION_COMMAND)) {
      expect(COMMANDS.some(c => c.name === command)).toBe(true);
    }
  });
});

describe('ShellService', () => {
  function create(platform: 'browser' | 'server'): ShellService {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(ShellService);
  }

  it('starts a browser session at help', () => {
    const shell = create('browser');
    expect(shell.entries().map(e => e.command)).toEqual(['help']);
  });

  it('renders every section on the server, for readers without JavaScript', () => {
    const shell = create('server');
    expect(shell.entries().map(e => e.command)).toEqual(['help', 'projects', 'ai-stack', 'about', 'contact']);
  });

  it('runs a command into the scrollback and marks its section', () => {
    const shell = create('browser');
    shell.run('about');
    expect(shell.entries().at(-1)?.command).toBe('about');
    expect(TestBed.inject(SceneSyncService).activeSection()).toBe('about');
    expect(shell.input()).toBe('');
  });

  it('clears the scrollback', () => {
    const shell = create('browser');
    shell.run('contact');
    shell.run('clear');
    expect(shell.entries()).toEqual([]);
  });

  it('recalls earlier lines with the arrows and finishes names with tab', () => {
    const shell = create('browser');
    shell.run('about');
    shell.run('contact');
    shell.recall(-1);
    expect(shell.input()).toBe('contact');
    shell.recall(-1);
    expect(shell.input()).toBe('about');
    shell.recall(1);
    shell.recall(1);
    expect(shell.input()).toBe('');
    shell.input.set('pro');
    shell.complete();
    expect(shell.input()).toBe('projects');
  });

  it('fills the prompt without running when a command is clicked', () => {
    const shell = create('browser');
    shell.fill('ai-stack');
    expect(shell.input()).toBe('ai-stack');
    expect(shell.entries().length).toBe(1);
  });
});
