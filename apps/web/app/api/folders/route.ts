import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/app/lib/errors";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = url.searchParams.get("memento_user_id")?.trim();

    let query = supabase
      .from("folders")
      .select("*")
      .order("name", { ascending: true });

    if (user) {
      query = query.eq("user_id", user);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ folders: data || [] }, { headers: corsHeaders });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const user = url.searchParams.get("memento_user_id")?.trim();
    const { name, memento_user_id } = await req.json();
    const resolvedUserId = memento_user_id ?? user ?? null;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await supabase
      .from("folders")
      .insert([{ name: name.trim(), user_id: resolvedUserId }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ folder: data }, { headers: corsHeaders });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Folder id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { error } = await supabase.from("folders").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500, headers: corsHeaders },
    );
  }
}
