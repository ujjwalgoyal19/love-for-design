import jwt from 'jsonwebtoken';
import { db } from './db';

interface SessionUser {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
}

interface SessionData {
  user: SessionUser;
}

export interface AuthSession {
  user?: SessionUser;
}

/**
 * Extract session from various authentication methods
 */
export async function extractSession(
  req: any
): Promise<AuthSession | null> {
  // Method 1: Check for Bearer token (JWT)
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const session = await validateJWTToken(bearerToken);
    if (session) return session;
  }

  // Method 2: Check for session cookie (NextAuth)
  const sessionToken = extractSessionCookie(req);
  if (sessionToken) {
    const session = await validateSessionCookie(sessionToken);
    if (session) return session;
  }

  // Method 3: Check for API key (for external integrations)
  const apiKey = extractAPIKey(req);
  if (apiKey) {
    const session = await validateAPIKey(apiKey);
    if (session) return session;
  }

  return null;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: any): string | null {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Extract session cookie from NextAuth
 */
function extractSessionCookie(req: any): string | null {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;

  // NextAuth.js uses different cookie names based on configuration
  // Try both common patterns
  const patterns = [
    'next-auth.session-token=',
    '__Secure-next-auth.session-token=',
    'authjs.session-token=',
    '__Secure-authjs.session-token='
  ];

  for (const pattern of patterns) {
    const cookie = cookieHeader
      .split(';')
      .find((c: string) => c.trim().startsWith(pattern));
    
    if (cookie) {
      const token = cookie.split('=')[1];
      if (token) {
        return decodeURIComponent(token);
      }
    }
  }

  return null;
}

/**
 * Extract API key from headers
 */
function extractAPIKey(req: any): string | null {
  return req.headers?.['x-api-key'] || req.query?.api_key || null;
}

/**
 * Validate JWT token and extract user session
 */
async function validateJWTToken(token: string): Promise<AuthSession | null> {
  try {
    if (!process.env.NEXTAUTH_SECRET) {
      console.warn('NEXTAUTH_SECRET not set, cannot validate JWT tokens');
      return null;
    }

    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as any;
    
    if (decoded && decoded.sub) {
      const user = await db.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      });

      if (user) {
        return {
          user: {
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email
          }
        };
      }
    }
  } catch (error) {
    console.error('JWT validation error:', error);
  }

  return null;
}

/**
 * Validate session cookie from NextAuth
 */
async function validateSessionCookie(sessionToken: string): Promise<AuthSession | null> {
  try {
    const dbSession = await db.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Check if session exists and is not expired
    if (dbSession && dbSession.expires > new Date()) {
      return {
        user: {
          id: dbSession.user.id,
          role: dbSession.user.role,
          name: dbSession.user.name,
          email: dbSession.user.email
        }
      };
    }
  } catch (error) {
    console.error('Session cookie validation error:', error);
  }

  return null;
}

/**
 * Validate API key and return associated user session
 */
async function validateAPIKey(apiKey: string): Promise<AuthSession | null> {
  try {
    // In a real implementation, you would store API keys in the database
    // with user associations. For now, this is a placeholder.
    
    // Example: Look up API key in a hypothetical ApiKey table
    // const apiKeyRecord = await db.apiKey.findUnique({
    //   where: { key: apiKey, isActive: true },
    //   include: { user: true }
    // });
    
    // For development, you could hardcode a few API keys
    if (process.env.NODE_ENV === 'development') {
      if (apiKey === process.env.ADMIN_API_KEY) {
        // Return a hardcoded admin user for development
        const adminUser = await db.user.findFirst({
          where: { role: 'ADMIN' },
          select: {
            id: true,
            role: true,
            name: true,
            email: true
          }
        });

        if (adminUser) {
          return {
            user: {
              id: adminUser.id,
              role: adminUser.role,
              name: adminUser.name,
              email: adminUser.email
            }
          };
        }
      }
    }
  } catch (error) {
    console.error('API key validation error:', error);
  }

  return null;
}

/**
 * Create a JWT token for a user (useful for API responses)
 */
export function createJWTToken(user: SessionUser): string | null {
  try {
    if (!process.env.NEXTAUTH_SECRET) {
      throw new Error('NEXTAUTH_SECRET not set');
    }

    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
        name: user.name,
        email: user.email
      },
      process.env.NEXTAUTH_SECRET,
      {
        expiresIn: '7d' // Token expires in 7 days
      }
    );
  } catch (error) {
    console.error('Error creating JWT token:', error);
    return null;
  }
}
