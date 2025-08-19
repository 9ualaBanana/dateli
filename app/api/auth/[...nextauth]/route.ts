import NextAuth, { User, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { getRedisClient } from "../../../../lib/redis";
import bcrypt from "bcryptjs"; // ensure you run `npm install bcryptjs`

// Augment some runtime shapes used across NextAuth callbacks
type TokenWithPartner = JWT & { partnerId?: string; coupleToken?: string };
type AuthUser = User & { partnerId?: string; coupleToken?: string };
type SessionWithPartner = Session & { user: Session["user"] & { partnerId?: string; coupleToken?: string } };

// Notes / required env vars:
// - APPLE_CLIENT_ID (Service ID / Client ID)
// - APPLE_TEAM_ID (Apple Developer Team ID)
// - APPLE_KEY_ID (Key ID for the private key)
// - APPLE_PRIVATE_KEY (the .p8 private key contents, newlines escaped as \n)
// - NEXTAUTH_SECRET (a strong random secret)
// - NEXTAUTH_URL (your site URL)
// Example .env entries:
// APPLE_CLIENT_ID=com.example.service
// APPLE_TEAM_ID=ABCDE12345
// APPLE_KEY_ID=XYZ99ABC
// APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----"

// The Apple provider needs a clientSecret JWT. NextAuth will accept a
// string or a callable; here we pass an object built from the private key.
// We cast to `any` in places to avoid strict typing friction — replace with
// a proper helper if you want stricter typing.

const authHandler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<AuthUser | null> {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        const client = await getRedisClient();
        const key = `partner:email:${email.toLowerCase()}`;
        const raw = await client.get(key);
        if (!raw) return null;
        type StoredPartner = {
          partnerId: string;
          coupleToken: string;
          email: string;
          displayName?: string | null;
          passwordHash?: string;
        };
        let user: StoredPartner | null = null;
        try {
          user = JSON.parse(raw) as StoredPartner;
        } catch {
          return null;
        }
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        const out: AuthUser = {
          id: user.partnerId,
          name: user.displayName ?? undefined,
          email: user.email ?? undefined,
          partnerId: user.partnerId,
          coupleToken: user.coupleToken,
        } as AuthUser;
        return out;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      // Attach partnerId and coupleToken to session.user if present in token
      const s = session as SessionWithPartner;
      const t = token as TokenWithPartner;
      if (s?.user) {
        s.user.partnerId = t.partnerId ?? s.user.partnerId;
        s.user.coupleToken = t.coupleToken ?? s.user.coupleToken;
      }
      return s;
    },
    async jwt({ token, user }: { token: JWT; user?: AuthUser }) {
      // On first sign-in, `user` will be set by authorize()
      const t = token as TokenWithPartner;
      const u = user as AuthUser | undefined;
      if (u) {
        t.partnerId = u.partnerId;
        t.coupleToken = u.coupleToken;
      }
      return t as JWT;
    },
  },
});

export { authHandler as GET, authHandler as POST }
