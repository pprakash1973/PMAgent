import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// SEC (C4): Auth.js advisory — a missing/invalid secret is a configuration error
// that can make existence-based `if (!session?.user)` checks fail open. Fail closed
// and loudly at server start rather than silently at request time.
//
// Skipped during `next build`: the compiler imports this module to collect route
// metadata, and build agents legitimately have no runtime secrets. Serving without
// one is what must be prevented, not compiling.
const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";
if (!IS_BUILD && (!AUTH_SECRET || AUTH_SECRET.length < 32)) {
  throw new Error(
    "AUTH_SECRET is missing or shorter than 32 characters. Refusing to start — " +
      "an unset secret can cause authentication checks to fail open. " +
      "Generate one with: openssl rand -base64 32"
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: AUTH_SECRET,
  // Azure (A2): Auth.js only auto-trusts the request host on Vercel. Without this
  // every sign-in on App Service / Container Apps fails with UntrustedHost, and it
  // is required when the app answers on several hostnames in a hybrid tenancy.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { org: true },
        });

        if (!user || !user.passwordHash || user.deletedAt) return null;
        if (user.status === "deactivated") return null;
        if (user.status === "invited") return null; // must accept invite first

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          orgId: user.orgId,
          orgName: user.org.name,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.orgId = (user as any).orgId;
        token.orgName = (user as any).orgName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        (session.user as any).role = token.role;
        (session.user as any).orgId = token.orgId;
        (session.user as any).orgName = token.orgName;

        // Freshen role + org from DB so role changes take effect without re-login
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: token.sub! },
            select: { role: true, orgId: true },
          });
          if (fresh) {
            (session.user as any).role = fresh.role;
            (session.user as any).orgId = fresh.orgId;
          }
        } catch {
          // DB unavailable — fall back to cached token values
        }
      }
      return session;
    },
  },
});
