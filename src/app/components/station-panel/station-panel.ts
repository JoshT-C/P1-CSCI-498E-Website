import {
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ACTIVE_BACKEND, DIAGRAMS, FLOPPIES, NODES, SERVICES, type HomelabNode } from '../../services/content/homelab';
import { STACK } from '../../services/content/projects';
import { SceneSyncService } from '../../services/scene-sync.service';
import { FLOPPY_PER_ROW, FLOPPY_STRIPES } from '../../config/scene.config';
import { DiagramComponent } from '../diagram/diagram';

interface Spec {
  readonly label: string;
  readonly value: string;
}

/** A node's known facts, in reading order; unknown (null) fields drop out. */
function specs(node: HomelabNode): Spec[] {
  const rows: [string, string | null][] = [
    ['chassis', node.chassis],
    ['cpu', node.cpu],
    ['gpu', node.gpu],
    ['memory', node.memory]
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null).map(([label, value]) => ({ label, value }));
}

/**
 * The panel a station opens: the rack's homelab, the floppy shelf, the
 * whiteboard's diagrams, the laptop's stack. A native <dialog> opened
 * modally, so focus is trapped and Esc closes it for free; the backdrop is
 * clear, so the prop stays in view behind it (the camera frames it left of
 * the panel). Closing — Esc, the close button, a backdrop click — clears
 * the station, which sends the camera back.
 */
@Component({
  selector: 'app-station-panel',
  imports: [DiagramComponent],
  templateUrl: './station-panel.html'
})
export class StationPanelComponent {
  private readonly sync = inject(SceneSyncService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly station = this.sync.station;
  readonly floppyId = this.sync.floppy;

  readonly rackNodes = NODES.filter(n => n.id !== 'laptop').map(n => ({ node: n, specs: specs(n) }));
  readonly laptop = (() => {
    const node = NODES.find(n => n.id === 'laptop')!;
    return { node, specs: specs(node) };
  })();
  readonly laptopStory = FLOPPIES.find(f => f.id === 'laptop-stack') ?? null;
  readonly services = SERVICES;
  readonly models = STACK.models;
  readonly activeBackend = ACTIVE_BACKEND;
  readonly switching = STACK.switching;
  readonly diagrams = DIAGRAMS;
  /** The disk buttons laid out as the shelf is: the back row (higher, on
   *  the riser) above the front row, each row left to right. */
  readonly floppyRows = (() => {
    const rows: { id: string; label: string; stripe: string }[][] = [];
    FLOPPIES.forEach((f, i) => {
      const r = Math.floor(i / FLOPPY_PER_ROW);
      (rows[r] ??= []).push({ id: f.id, label: f.label, stripe: FLOPPY_STRIPES[i % FLOPPY_STRIPES.length] });
    });
    return rows.reverse();
  })();
  readonly floppy = computed(() => FLOPPIES.find(f => f.id === this.floppyId()) ?? null);

  readonly title = computed(() => {
    switch (this.station()) {
      case 'rack':
        return 'Homelab';
      case 'floppies':
        return 'Projects not on GitHub';
      case 'whiteboard':
        return 'Architecture';
      case 'laptop':
        return 'Laptop';
      default:
        return '';
    }
  });

  readonly command = computed(() => {
    switch (this.station()) {
      case 'rack':
        return 'ssh thelio -- ai status';
      case 'floppies':
        return 'ls /mnt/floppy';
      case 'whiteboard':
        return 'cat architecture.md';
      case 'laptop':
        return 'ssh laptop -- nvidia-smi';
      default:
        return '';
    }
  });

  constructor() {
    effect(() => {
      const open = this.station() !== null && this.station() !== 'terminal';
      if (!this.isBrowser) return;
      const d = this.dialog().nativeElement;
      if (open && !d.open) d.showModal();
      else if (!open && d.open) d.close();
    });
  }

  close(): void {
    this.sync.closeStation();
  }

  /** The dialog closed itself (Esc): mirror that into the station state. */
  onClose(): void {
    this.sync.closeStation();
  }

  /** A press on the ::backdrop lands on the dialog element itself. Pointer
   *  only by design: the keyboard equivalent is Esc, native to <dialog>. */
  onDialogClick(event: PointerEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  pick(id: string): void {
    this.sync.selectFloppy(id);
  }
}
