export class EditHistory {
  constructor(cells, limit = 160) {
    this.cells = [...cells];
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  apply(change) {
    if (this.cells[change.index] === change.after) return this.cells;

    this.cells[change.index] = change.after;
    this.undoStack.push(change);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return this.cells;
  }

  undo() {
    const change = this.undoStack.pop();
    if (!change) return this.cells;

    this.cells[change.index] = change.before;
    this.redoStack.push(change);
    return this.cells;
  }

  redo() {
    const change = this.redoStack.pop();
    if (!change) return this.cells;

    this.cells[change.index] = change.after;
    this.undoStack.push(change);
    return this.cells;
  }
}
