"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAdminRole, normalizeAppRole } from "@/lib/auth/roles";
import { readSessionUser } from "@/lib/auth/sessionClient";
import { formatISODateToDMY, parseDMYToISO } from "@/lib/date/dmy";
import {
  deleteScheduleFromSupabase,
  insertScheduleInSupabase,
} from "@/lib/supabase/schedules";

import { useContingency } from "@/lib/supabase/useContingency";
import { contingency } from "@/lib/supabase/contingency.mjs";
import ContingencyNotice from "../ContingencyNotice";

const emptyForm = {
  trainName: "",
  origin: "",
  destination: "",
  departureDate: "",
  departureTime: "",
  price: "",
  totalSeats: "",
};

export default function SchedulesPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState(null);
  const data = useContingency(sessionUser);
  const { refresh } = data;
  const schedules = data.snapshot?.schedules ?? [];
  const loading = data.status === "loading";
  const canWrite = data.status === "ready" && !data.busy;
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  const isAdmin = isAdminRole(sessionUser?.role);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const restored = readSessionUser();
      if (!restored?.username || !restored?.role) {
        router.replace("/");
        return;
      }
      setSessionUser({ ...restored, role: normalizeAppRole(restored.role) });
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (sessionUser) void refresh();
  }, [sessionUser, refresh]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      contingency.assertReady();
      const departureISO = parseDMYToISO(form.departureDate);
      if (!departureISO) {
        throw new Error("Enter departure date as DD/MM/YYYY (e.g. 31/12/2026).");
      }
      await insertScheduleInSupabase({ ...form, departureDate: departureISO });
      setSuccess("Schedule creation confirmed.");
      setForm(emptyForm);
      await data.refresh();
    } catch (err) {
      setError(err.message ?? "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError("");
    setSuccess("");
    setDeletingId(id);
    try {
      contingency.assertReady();
      await deleteScheduleFromSupabase(id);
      setSuccess("Schedule deletion confirmed.");
      await data.refresh();
    } catch (err) {
      setError(err.message ?? "Failed to delete schedule.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!sessionUser) {
    return (
      <main className="w-full px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-[min(96rem,98vw)] text-sm text-slate-600">Loading…</div>
      </main>
    );
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-[min(96rem,98vw)] space-y-6">
        <header className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Schedules</h1>
            <p className="text-sm text-slate-600">
              {isAdmin
                ? "Create, list, and manage schedules in the database."
                : "View schedules in the database."}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            ← Back to dashboard
          </Link>
        </header>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

        <ContingencyNotice data={data} />
        {success ? <p role="status" className="text-green-800">{success}</p> : null}
        {!data.snapshot ? <p>Data unavailable{loading ? " - loading live data." : "."}</p> : <section
          className={`grid gap-4 ${isAdmin ? "lg:grid-cols-[1fr_1.4fr]" : "lg:grid-cols-1"}`}
        >
          {isAdmin ? (
            <article className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Create schedule</h2>
              <form onSubmit={handleSubmit} className="mt-3 grid gap-2">
                {[
                  ["trainName", "Train name"],
                  ["origin", "Origin"],
                  ["destination", "Destination"],
                  ["departureDate", "DD/MM/YYYY", "text"],
                  ["departureTime", "Departure time", "time"],
                  ["price", "Ticket price (SAR)", "number"],
                  ["totalSeats", "Total seats", "number"],
                ].map(([field, label, type]) => (
                  <input
                    key={field}
                    type={type || "text"}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder={label}
                    title={field === "departureDate" ? "Departure date (dd/mm/yyyy)" : undefined}
                    value={form[field]}
                    onChange={(e) => setForm((s) => ({ ...s, [field]: e.target.value }))}
                    required
                    disabled={saving || !canWrite}
                  />
                ))}
                <button
                  type="submit"
                  disabled={saving || !canWrite}
                  className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Schedule"}
                </button>
              </form>
            </article>
          ) : null}

          <article className="card p-5 sm:p-6 overflow-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">All schedules</h2>
              <button
                type="button"
                onClick={data.refresh}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <p className="mt-4 text-sm text-slate-600">Loading schedules…</p>
            ) : (
              <table className="mt-3 w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="p-2">Train</th>
                    <th className="p-2">Route</th>
                    <th className="p-2">Date / time</th>
                    <th className="p-2">Seats</th>
                    <th className="p-2">Price</th>
                    <th className="p-2">Status</th>
                    {isAdmin ? <th className="p-2">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {schedules.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="p-4 text-slate-500">
                        {isAdmin ? (
                          <>
                            No rows yet. Add a schedule with the form, or confirm the Supabase table
                            and RLS policies match{" "}
                            <code className="text-xs">supabase/sql/schedules.sql</code>.
                          </>
                        ) : (
                          "No schedules to display."
                        )}
                      </td>
                    </tr>
                  ) : (
                    schedules.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="p-2">{item.trainName}</td>
                        <td className="p-2">
                          {item.origin} → {item.destination}
                        </td>
                        <td className="p-2">
                          {formatISODateToDMY(item.departureDate)} {item.departureTime}
                        </td>
                        <td className="p-2">
                          {item.availableSeats}/{item.totalSeats}
                        </td>
                        <td className="p-2">SAR {item.price}</td>
                        <td className="p-2">{item.status}</td>
                        {isAdmin ? (
                          <td className="p-2">
                            <button
                              type="button"
                              className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId !== null || !canWrite}
                            >
                              {deletingId === item.id ? "Deleting…" : "Delete"}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </article>
        </section>}
      </div>
    </main>
  );
}
