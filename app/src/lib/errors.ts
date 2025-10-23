export class HttpError extends Error {
  public status: number;
  public details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class RateLimitError extends HttpError {
  public retryAfter: number;
  constructor(message = "Too Many Requests", retryAfter = 60) {
    super(429, message);
    this.retryAfter = retryAfter;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not Found") {
    super(404, message);
  }
}
