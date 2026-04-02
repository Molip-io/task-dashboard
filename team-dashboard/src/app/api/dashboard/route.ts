import { fetchDashboardData } from "@/lib/notion";

export const revalidate = 60; // ISR: 60초마다 갱신

export async function GET() {
  try {
    const data = await fetchDashboardData();
    return Response.json(data);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return Response.json(
      { error: "Notion 데이터 조회 실패" },
      { status: 500 }
    );
  }
}
