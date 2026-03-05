const MAX_HISTORY = 5;

export class MaskHistory {
  private history: ImageData[] = [];
  private index = -1;

  save(maskData: ImageData) {
    const copy = new ImageData(
      new Uint8ClampedArray(maskData.data),
      maskData.width,
      maskData.height,
    );
    // Discard any redo states
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(copy);
    // Trim to max
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.index = this.history.length - 1;
  }

  undo(): ImageData | null {
    if (this.index <= 0) return null;
    this.index--;
    return this.cloneCurrent();
  }

  redo(): ImageData | null {
    if (this.index >= this.history.length - 1) return null;
    this.index++;
    return this.cloneCurrent();
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.history.length - 1;
  }

  private cloneCurrent(): ImageData {
    const current = this.history[this.index];
    return new ImageData(
      new Uint8ClampedArray(current.data),
      current.width,
      current.height,
    );
  }
}
