import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isOwnerEmail } from "@/lib/auth/owner-access";

// Auth.js v5 reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from env automatically
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Only allowlisted, Google-verified emails can sign in
    signIn({ profile }) {
      return profile?.email_verified === true && isOwnerEmail(profile.email);
    },
  },
});
