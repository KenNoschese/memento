import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkFoldersTable() {
  console.log("Checking for 'folders' table...");
  const { data, error } = await supabase.from('folders').select('id').limit(1);
  
  if (error) {
    console.error("Error querying 'folders' table:", error.message);
    console.error("Error code:", error.code);
  } else {
    console.log("Table 'folders' exists and is accessible!");
  }
}

checkFoldersTable();
