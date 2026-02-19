import { withAuth } from "next-auth/middleware";
import { authCookieConfig } from "@/lib/authOptions";

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
      name: authCookieConfig.sessionToken,
    },
  },
});
