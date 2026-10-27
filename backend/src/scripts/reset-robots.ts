// Return the fleet to its configured base and stop any assigned or active runs.
// Stop the backend before running this command so the simulator cannot race it.
import pg from "pg";
import { getRobotBaseLocation } from "../robotBase.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = getRobotBaseLocation();

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: runs } = await client.query<{ runId: string }>(
      `SELECT run_id AS "runId" FROM DeliveryRun
       WHERE run_status IN ('assigned', 'active') FOR UPDATE`,
    );
    const runIds = runs.map(({ runId }) => runId);

    let requeuedOrders = 0;
    if (runIds.length > 0) {
      const { rowCount } = await client.query(
        `WITH cancelled AS (
           UPDATE Delivery SET delivery_status = 'cancelled', updated_at = now()
           WHERE run_id = ANY($1) AND delivery_status <> 'delivered'
           RETURNING order_id
         )
         UPDATE Orders SET order_status = 'placed', updated_at = now()
         WHERE order_id IN (SELECT order_id FROM cancelled)`,
        [runIds],
      );
      requeuedOrders = rowCount ?? 0;
      await client.query(
        `UPDATE DeliveryRun SET run_status = 'cancelled', completed_at = now(), updated_at = now()
         WHERE run_id = ANY($1)`,
        [runIds],
      );
    }

    const { rowCount: robotsReset } = await client.query(
      `UPDATE Robot SET current_latitude = $1, current_longitude = $2,
         robot_status = 'available', last_updated = now()`,
      [base.latitude, base.longitude],
    );
    await client.query("COMMIT");
    console.log(
      `Reset ${robotsReset ?? 0} robot(s) to ${base.latitude}, ${base.longitude}; ` +
        `stopped ${runIds.length} active run(s) and requeued ${requeuedOrders} undelivered order(s).`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("Could not reset robots:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
