// @appspec:generated — do not edit
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Thrown by slot stubs until the slot is implemented; routes answer 501.
export class NotImplemented extends Error {
  constructor(slot: string) {
    super(`Slot ${slot} is not implemented yet`);
  }
}
