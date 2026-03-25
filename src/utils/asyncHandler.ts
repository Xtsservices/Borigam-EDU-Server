import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async route handlers to catch errors and pass to Express error handler
 * This ensures that errors thrown in async functions are properly caught and handled
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Higher-order function to wrap async controller methods
 */
export const wrapAsync = (fn: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((error: any) => {
      console.error(`❌ Async Error in ${req.method} ${req.path}:`, error);
      next(error);
    });
  };
};
