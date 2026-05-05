import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkEnum() {
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'memory_type' });
  if (error) {
    console.log("RPC get_enum_values failed, trying raw query...");
    const { data: raw, error: rawError } = await supabase.from('memories').select('type').limit(10);
    if (rawError) {
        console.error("Error:", rawError.message);
    } else {
        console.log("Existing types in DB:", [...new Set(raw.map(r => r.type))]);
    }
  } else {
    console.log("Enum values:", data);
  }
}

checkEnum();
