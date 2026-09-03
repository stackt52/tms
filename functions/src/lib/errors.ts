export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'You are not allowed to do that') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, msg: string, details?: unknown) => new HttpError(409, code, msg, details);
export const unprocessable = (code: string, msg: string, details?: unknown) => new HttpError(422, code, msg, details);
