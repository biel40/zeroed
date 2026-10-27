/**
 * A map's mains, fed by its power switch. Every run starts with it off;
 * throwing the switch turns it on for the rest of the run: the machines
 * that wait for it start selling and every machine glows brighter. The
 * arena owns one and hands it to its machines.
 */
export class MapPower {
  private live = false;

  get on(): boolean {
    return this.live;
  }

  switchOn(): void {
    this.live = true;
  }

  reset(): void {
    this.live = false;
  }
}
