import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function buildDedupeKey() {
  return createHash("md5")
    .update(["page", "test", "test", "test"].join("\n"))
    .digest("hex");
}

async function checkSchema() {
  try {
    const { data, error } = await supabase.rpc('get_table_info', { table_name: 'memories' });
    if (error) {
        // Fallback: try to just insert a dummy record and see the error
        console.log("RPC get_table_info failed, attempting dummy insert...");
        const { error: insertError } = await supabase.from('memories').insert([{ 
            url: 'test', 
            title: 'test', 
            content: 'test', 
            embedding: new Array(768).fill(0),
            type: 'page',
            dedupe_key: buildDedupeKey(),
        }]);
        if (insertError) {
            console.error("Insert failed:", insertError.message);
        } else {
            console.log("Insert with 768 dimensions succeeded!");
        }
    } else {
        console.log("Table info:", data);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

checkSchema();
