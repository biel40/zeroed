/**
 * The station's mains, fed by the machine room's main switch. Every run
 * starts with it off (the lights run dim and flickering on what is left);
 * throwing the switch turns it on for the rest of the run: the lockers
 * that wait for it start selling and every machine blazes.
 */
export class Station33Power {
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
