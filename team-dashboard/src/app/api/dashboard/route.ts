import { fetchDashboardData } from "@/lib/notion";
import { fetchSlackData } from "@/lib/slack";

export const revalidate = 60;

export async function GET() {
  try {
    const [data, slack] = await Promise.all([
      fetchDashboardData(),
      fetchSlackData(),
    ]);
    return Response.json({ ...data, slack });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return Response.json(
      { error: "데이터 조회 실패" },
      { status: 500 }
    );
  }
}
