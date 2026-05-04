import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/app/lib/errors";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  try {
    console.log("Memories API: Fetching all memories...");
    const { data, error } = await supabase
      .from("memories")
      .select("id, url, title, content, created_at, embedding")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Memories API Error:", error.message);
      throw error;
    }

    return NextResponse.json({ memories: data }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Memories API Fatal Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
