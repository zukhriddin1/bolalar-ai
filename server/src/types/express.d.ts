import type { TokenPayload } from "../auth/tokens.js";

// Declaration merging: `requireAuth` populates `req.user`, and every handler
// behind it reads the same typed value instead of casting.
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
