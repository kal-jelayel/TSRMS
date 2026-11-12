import { randomBytes } from "node:crypto";
import {
  decryptPhone, encryptedPhonePrefix, encryptPhone, readPhoneEncryptionKey,
} from "../lib/security/phoneEncryption.js";
import { hashStaffPassword } from "../lib/security/staffPassword.js";
import { createServerSupabase } from "../lib/supabase/server.js";

async function migratePhones(db) {
  const key = readPhoneEncryptionKey();
  const pageSize = 200;
  for (const table of ["passengers", "reservations"]) {
    let lastId;
    let migrated = 0;
    let verified = 0;
    while (true) {
      let query = db.from(table).select("id, phone").order("id").limit(pageSize);
      if (lastId) query = query.gt("id", lastId);
      const { data: rows, error } = await query;
      if (error) throw new Error(`Could not read ${table} (${error.code || "connection error"}).`);
      for (const row of rows) {
        if (row.phone == null) continue;
        if (row.phone.startsWith(encryptedPhonePrefix)) {
          try {
            decryptPhone(row.phone, key);
          } catch {
            throw new Error(`Could not decrypt an existing ${table} value with this key.`);
          }
          verified++;
          continue;
        }
        // A booking may have already replaced the number with encrypted data.
        const { data: updated, error: updateError } = await db.from(table)
          .update({ phone: encryptPhone(row.phone, key) })
          .eq("id", row.id).not("phone", "like", `${encryptedPhonePrefix}%`).select("id");
        if (updateError) throw new Error(`Could not encrypt a ${table} row (${updateError.code || "connection error"}).`);
        migrated += updated.length;
      }
      if (rows.length < pageSize) break;
      lastId = rows.at(-1).id;
    }
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true })
      .not("phone", "like", `${encryptedPhonePrefix}%`);
    if (error || count !== 0) throw new Error(`Could not verify that all ${table} phone numbers are encrypted.`);
    console.log(`${table}: ${migrated} encrypted, ${verified} already encrypted and verified.`);
  }
}

async function resetStaffPassword(db, username) {
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await db.from("users").update({ password: await hashStaffPassword(password) })
    .eq("username", username).select("id");
  if (error) throw new Error(`Could not reset the password (${error.code || "connection error"}).`);
  if (data.length !== 1) throw new Error("Staff username not found. Use the exact username from Supabase.");
  console.log(`New password for ${username}: ${password}`);
}

async function main() {
  const [command, username] = process.argv.slice(2);
  if (command !== "migrate-phones" && (command !== "reset-password" || !username)) {
    throw new Error("Use npm run migrate:phones or npm run reset:staff-password -- USERNAME.");
  }
  const db = createServerSupabase();
  const { data: ready, error } = await db.rpc("tsrms_phone_access_ready");
  if (error || ready !== true) throw new Error("Phone permissions could not be verified. Apply protect_passenger_phones.sql first and check the server key.");
  if (command === "migrate-phones") await migratePhones(db);
  else await resetStaffPassword(db, username);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
