import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export interface AuthPayload {
  viewer_id: string;
  role:      'admin' | 'viewer' | 'operator';
  iat?:      number;
  exp?:      number;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = header.slice(7);
  try {
    if (!JWT_SECRET) {
      res.status(500).json({ error: 'JWT_SECRET is not configured' });
      return;
    }
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as Request & { auth: AuthPayload }).auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Request & { auth?: AuthPayload }).auth;
    if (!auth || !roles.includes(auth.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }
    next();
  };
}

export function issueToken(viewer_id: string, role: AuthPayload['role']): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ viewer_id, role }, JWT_SECRET, { expiresIn: '8h' });
}
