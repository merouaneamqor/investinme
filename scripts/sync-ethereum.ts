import { syncChain } from "../lib/chain-sync";
import { getDb } from "../lib/db";

async function main() {
  const result = await syncChain(getDb());
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
