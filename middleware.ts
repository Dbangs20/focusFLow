import { withAuth } from "next-auth/middleware";

// Keep middleware edge-safe: do not import authOptions/prisma here.
const sessionTokenCookieName = "focusflow.session-token";

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/focus-group",
    "/focus-group/:path*",
    "/focus-sessions",
    "/focus-sessions/:path*",
    "/focus-session",
    "/focus-session/:path*",
    "/tasks",
    "/tasks/:path*",
  ],
};

export default withAuth({
  pages: {
    signIn: "/signin",
  },
  cookies: {
    sessionToken: {
      name: sessionTokenCookieName,
    },
  },
});
