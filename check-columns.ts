import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkColumns() {
  const { data, error } = await supabase.from('memories').select('*').limit(1);
  if (error) {
    console.error("Error fetching memories:", error.message);
    return;
  }
  if (data && data.length > 0) {
    console.log("Columns found in first record:", Object.keys(data[0]));
  } else {
    console.log("No records found, attempting to get column names via select('id,type,dedupe_key')");
    const { error: colError } = await supabase.from('memories').select('id,type,dedupe_key').limit(1);
    if (colError) {
        console.error("Columns 'type' or 'dedupe_key' missing:", colError.message);
    } else {
        console.log("Columns 'type' and 'dedupe_key' exist!");
    }
  }
}

checkColumns();
