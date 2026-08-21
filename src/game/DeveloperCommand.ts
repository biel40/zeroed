export class DeveloperCommand {
  private readonly command: string;
  private matchedCharacters = 0;

  public constructor(command: string) {
    this.command = command.toUpperCase();
  }

  public push(key: string): boolean {
    if (key.length !== 1) return false;

    const character = key.toUpperCase();
    if (character === this.command[this.matchedCharacters]) {
      this.matchedCharacters++;
      if (this.matchedCharacters < this.command.length) return false;

      this.matchedCharacters = 0;
      return true;
    }

    this.matchedCharacters = character === this.command[0] ? 1 : 0;
    return false;
  }

  public reset(): void {
    this.matchedCharacters = 0;
  }
}
