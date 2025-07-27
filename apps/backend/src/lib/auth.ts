import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '~/lib/db';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }
  
  interface User {
    role?: string;
  }
}

const config: NextAuthConfig = {
  adapter: PrismaAdapter(db) as any,
  providers: [
    // Add your auth providers here
  ],
  callbacks: {
    session: ({ session, user }: { session: any; user: any }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
        role: user.role || 'USER'
      }
    })
  }
};

const authConfig = NextAuth(config);

export const {
  handlers: { GET, POST },
  signOut
} = authConfig;

export const auth: (typeof authConfig)['auth'] = authConfig.auth;
export const signIn: (typeof authConfig)['signIn'] = authConfig.signIn;
