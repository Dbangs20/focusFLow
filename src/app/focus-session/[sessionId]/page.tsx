import { redirect } from "next/navigation";

export default async function LegacyFocusSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  redirect(`/focus-sessions/${encodeURIComponent(sessionId)}`);
}
