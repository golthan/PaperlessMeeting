export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new HttpError(400, message, details);
}

export function forbidden(message = "Forbidden") {
  return new HttpError(403, message);
}

export function notFound(message = "Not found") {
  return new HttpError(404, message);
}

