export function verifyBearerToken(authHeader: string | null): boolean {
  const token = process.env.DASHBOARD_API_TOKEN;
  if (!token) {
    console.error("[auth] DASHBOARD_API_TOKEN is not set");
    return false;
  }
  if (!authHeader?.startsWith("Bearer ")) return false;
  return authHeader.slice(7) === token;
}
