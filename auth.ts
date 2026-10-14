import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isOwnerEmail } from "@/lib/auth/owner-access";

// Auth.js v5 reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from env automatically
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // JWT session: no session table needed for a single-owner site
  session: { strategy: "jwt" },
  callbacks: {
    // Only allowlisted, Google-verified emails can sign in
    signIn({ profile }) {
      return profile?.email_verified === true && isOwnerEmail(profile.email);
    },
  },
});
