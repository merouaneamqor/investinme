import { ActivityList } from "@/components/activity-list";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { accountOf, listActivity } from "@/lib/platform";
import { redirect } from "next/navigation";

export default async function ActivityPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  const db = getDb();
  const account = accountOf(db, user.id);
  const items = listActivity(db, user.id);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Activity</p>
        <h1>Transaction history</h1>
      </div>
      <p className="lede">
        Available {formatUsdt(account.availableCents)} · Invested {formatUsdt(account.principalCents)} ·
        Pending {formatUsdt(account.pendingCents)}
      </p>
      <ActivityList items={items} />
    </>
  );
}
