import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcrypt';

import { createTRPCRouter, publicProcedure, protectedProcedure } from '~/trpc/trpc';
import { createJWTToken } from '~/lib/session';

// Input schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8)
});

export const authRouter = createTRPCRouter({
  // Login endpoint (returns JWT token)
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ ctx, input }) => {
      // For development/demo purposes, this is a simplified login
      // In production, you would typically use NextAuth providers
      
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true
        }
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password'
        });
      }

      // In a real implementation, you would verify the password hash
      // For now, this is a placeholder - assuming password verification passes

      // Generate JWT token
      const token = createJWTToken({
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email
      });

      if (!token) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create authentication token'
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token,
        expiresIn: '7d'
      };
    }),

  // Register endpoint (for demo purposes)
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user already exists
      const existingUser = await ctx.db.user.findUnique({
        where: { email: input.email }
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User with this email already exists'
        });
      }

      // In a real implementation, you would hash the password
      // const hashedPassword = await bcrypt.hash(input.password, 12);

      const user = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: 'USER'
          // password: hashedPassword (if storing passwords)
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true
        }
      });

      // Generate JWT token for immediate login
      const token = createJWTToken({
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email
      });

      if (!token) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'User created but failed to create authentication token'
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token,
        expiresIn: '7d'
      };
    }),

  // Get current user (protected endpoint)
  me: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              designSessions: true,
              templates: true
            }
          }
        }
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found'
        });
      }

      return user;
    }),

  // Refresh token endpoint
  refreshToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      const token = createJWTToken({
        id: ctx.session.user.id,
        role: ctx.session.user.role,
        name: ctx.session.user.name,
        email: ctx.session.user.email
      });

      if (!token) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create new authentication token'
        });
      }

      return {
        token,
        expiresIn: '7d'
      };
    }),

  // Validate token endpoint (useful for frontend)
  validateToken: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        valid: true,
        user: {
          id: ctx.session.user.id,
          email: ctx.session.user.email,
          name: ctx.session.user.name,
          role: ctx.session.user.role
        }
      };
    })
});
