import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  getLatest: publicProcedure.query(() => {
    return {
      id: 1,
      name: "Hello World",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => {
      // This would typically create a post in the database
      // For now, just return a mock response
      return {
        id: Math.floor(Math.random() * 1000),
        name: input.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
});
