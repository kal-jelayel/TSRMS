"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isAdminRole, normalizeAppRole } from "@/lib/auth/roles";
import { clearSessionUser, persistSessionUser, readSessionUser } from "@/lib/auth/sessionClient";
import {
  getDashboardStats,
  initializeState,
  searchSchedules,
} from "@/lib/application/tsrmsService";
import { formatISODateToDMY, parseDMYToISO } from "@/lib/date/dmy";
import { signInWithUsersTable } from "@/lib/supabase/auth";
import { useContingency } from "@/lib/supabase/useContingency";
import { contingency } from "@/lib/supabase/contingency.mjs";
import ContingencyNotice from "./ContingencyNotice";
import {
  cancelReservationByConfirmationInSupabase,
  completeReservationInSupabase,
} from "@/lib/supabase/reservations";

const ALL_TABS = [
  "Dashboard",
  "Schedules",
  "Passengers",
  "Reservations",
  "Cancellations",
  "Reports",
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [sessionUser, setSessionUser] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const data = useContingency(sessionUser);
  const { refresh } = data;
  const state = data.snapshot ?? initializeState();
  const canWrite = data.status === "ready" && !data.busy;
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginPending, setLoginPending] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [reservationForm, setReservationForm] = useState({
    origin: "Riyadh",
    destination: "Dammam",
    dateDisplay: "",
    scheduleId: "",
    seats: 1,
    nationalId: "",
    fullName: "",
    phone: "",
  });
  const [cancelForm, setCancelForm] = useState({ confirmationCode: "", reason: "" });

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const restored = readSessionUser();
      if (restored?.username && restored?.role) {
        setSessionUser({ ...restored, role: normalizeAppRole(restored.role) });
      }
    });
    return () => { active = false; };
  }, []);

  const isAdmin = isAdminRole(sessionUser?.role);

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((tab) => tab !== "Reports" || isAdmin),
    [isAdmin]
  );

  const stats = useMemo(() => getDashboardStats(state), [state]);
  useEffect(() => {
    if (sessionUser) void refresh();
  }, [sessionUser, activeTab, refresh]);

  const reservationDateISO = useMemo(
    () => parseDMYToISO(reservationForm.dateDisplay),
    [reservationForm.dateDisplay]
  );

  const routeMatches = useMemo(
    () =>
      reservationDateISO
        ? searchSchedules(state, {
            origin: reservationForm.origin,
            destination: reservationForm.destination,
            date: reservationDateISO,
          })
        : [],
    [reservationDateISO, reservationForm.destination, reservationForm.origin, state]
  );

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearMessages();
    setShowForgotHelp(false);
    setLoginPending(true);
    try {
      const user = await signInWithUsersTable(loginForm.username, loginForm.password);
      setActiveTab("Dashboard");
      setSessionUser(user);
      persistSessionUser(user);
    } catch (err) {
      const msg = err?.message || "";
      if (msg === "Incorrect username or password.") {
        setError("Incorrect username or password.");
      } else {
        setError(msg || "Login failed.");
      }
    } finally {
      setLoginPending(false);
    }
  }

  async function handleReservation(event) {
    event.preventDefault();
    clearMessages();
    try {
      contingency.assertReady();
      if (!reservationDateISO) {
        throw new Error("Enter travel date as DD/MM/YYYY (e.g. 31/12/2026).");
      }
      const seats = Number(reservationForm.seats);
      const scheduleId = reservationForm.scheduleId;
      const result = await completeReservationInSupabase({
        scheduleId,
        seats,
        passenger: {
          nationalId: reservationForm.nationalId,
          fullName: reservationForm.fullName,
          phone: reservationForm.phone,
        },
      });
      setSuccess(`Reservation confirmed: ${result.booking.confirmationCode}.`);
      await data.refresh();
    } catch (err) {
      setError(err.message ?? "Reservation failed.");
    }
  }

  async function handleCancellation(event) {
    event.preventDefault();
    clearMessages();
    try {
      contingency.assertReady();
      await cancelReservationByConfirmationInSupabase(
        cancelForm.confirmationCode.trim(),
        cancelForm.reason
      );
      setSuccess("Cancellation confirmed.");
      await data.refresh();
      setCancelForm({ confirmationCode: "", reason: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  if (!sessionUser) {
    return (
      <main className="w-full px-4 py-10 sm:py-14 sm:px-6 flex justify-center">
        <section className="card w-full max-w-lg p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">TSRMS Login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with your username and password.
          </p>
          <form className="mt-6 space-y-3" onSubmit={handleLogin}>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white/80 px-3 py-2.5 text-sm border-slate-200 bg-white"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
              autoComplete="username"
            />
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 bg-white/80 px-3 py-2.5 text-sm border-slate-200 bg-white"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={loginPending}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loginPending ? "Signing in…" : "Login"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForgotHelp((v) => !v);
                setError("");
              }}
              className="w-full text-center text-xs text-slate-500 underline-offset-2 hover:underline text-slate-500"
            >
              Forgot password?
            </button>
          </form>
          {showForgotHelp ? (
            <p className="mt-4 text-sm text-slate-600">
              Please contact the system administrator to reset your password.
            </p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="mx-auto max-w-[min(96rem,98vw)] space-y-6">
        <header className="card app-top-header p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Train Schedule & Reservation Management System
              </h1>
              <p className="text-sm text-slate-700">
                Logged in as {sessionUser.role === "ADMIN" ? "ADMIN" : "STAFF"}
              </p>
            </div>
            <button
              onClick={() => {
                clearSessionUser();
                setSessionUser(null);
                setSuccess("");
                setError("");
              }}
              className="rounded-lg border border-amber-900/20 bg-white/60 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-white/90"
            >
              Logout
            </button>
          </div>
        </header>

        <nav className="card flex flex-wrap items-center gap-2 border-slate-200 bg-slate-50 p-3 sm:p-4">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setError(""); setSuccess(""); }}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

        <ContingencyNotice data={data} />
        {success ? <p role="status" className="text-sm text-green-800">{success}</p> : null}
        {!data.snapshot ? <p>Data unavailable{data.status === "loading" ? " - loading live data." : "."}</p> : <>

        {activeTab === "Dashboard" ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Active Schedules", stats.activeSchedules],
              ["Total Passengers", stats.totalPassengers],
              ["Total Bookings", stats.totalBookings],
              ["Revenue (SAR)", stats.totalRevenue],
              ["Seat Occupancy", `${stats.seatOccupancyRate}%`],
              ["Confirmed", stats.confirmedBookings],
              ["Cancelled", stats.cancelledBookings],
            ].map(([label, value]) => (
              <article key={label} className="card p-5 sm:p-6">
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
              </article>
            ))}
          </section>
        ) : null}

        {activeTab === "Schedules" ? (
          <section className="card space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Schedules</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {isAdmin
                    ? "Create, list, and manage schedules in the database."
                    : "View schedules in the database."}
                </p>
              </div>
              {isAdmin ? (
              <Link
                href="/schedules"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Open schedules manager
              </Link>
              ) : null}
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100">
                    <th className="p-2">Train</th>
                    <th className="p-2">Route</th>
                    <th className="p-2">Date / time</th>
                    <th className="p-2">Seats</th>
                    <th className="p-2">Price</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.schedules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-slate-500">
                        No schedules loaded. Add rows in Supabase or use the schedules manager. If
                        the table is missing, run{" "}
                        <code className="rounded bg-slate-100 px-1 text-xs">
                          supabase/sql/schedules.sql
                        </code>{" "}
                        in the Supabase SQL editor.
                      </td>
                    </tr>
                  ) : (
                    state.schedules.map((item) => (
                      <tr key={item.id} className="border-b border-slate-200 border-slate-100">
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "Passengers" ? (
          <section className="card p-5 sm:p-6 overflow-auto">
            <h2 className="text-lg font-semibold">Passenger Profiles</h2>
            <table className="mt-3 w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 border-slate-200">
                  <th className="p-2">Name</th>
                  <th className="p-2">National ID</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">History Count</th>
                </tr>
              </thead>
              <tbody>
                {state.passengers.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200 border-slate-100">
                    <td className="p-2">{item.fullName}</td>
                    <td className="p-2">{item.nationalId}</td>
                    <td className="p-2">{item.phone}</td>
                    <td className="p-2">{item.bookingHistory.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === "Reservations" ? (
          <section className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
            <article className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Process Reservation</h2>
              <form className="mt-3 space-y-2" onSubmit={handleReservation}>
                <fieldset disabled={!canWrite} className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                    placeholder="Origin"
                    value={reservationForm.origin}
                    onChange={(e) => setReservationForm((s) => ({ ...s, origin: e.target.value }))}
                    required
                  />
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                    placeholder="Destination"
                    value={reservationForm.destination}
                    onChange={(e) =>
                      setReservationForm((s) => ({ ...s, destination: e.target.value }))
                    }
                    required
                  />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="DD/MM/YYYY"
                  title="Travel date (day/month/year)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  value={reservationForm.dateDisplay}
                  onChange={(e) => setReservationForm((s) => ({ ...s, dateDisplay: e.target.value }))}
                  required
                />
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  value={reservationForm.scheduleId}
                  onChange={(e) =>
                    setReservationForm((s) => ({ ...s, scheduleId: e.target.value }))
                  }
                  required
                >
                  <option value="">Select matched schedule</option>
                  {routeMatches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.trainName} - {formatISODateToDMY(item.departureDate)} {item.departureTime}{" "}
                      ({item.availableSeats} seats)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  placeholder="Seats"
                  value={reservationForm.seats}
                  onChange={(e) => setReservationForm((s) => ({ ...s, seats: e.target.value }))}
                  required
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                    placeholder="National ID"
                    value={reservationForm.nationalId}
                    onChange={(e) =>
                      setReservationForm((s) => ({ ...s, nationalId: e.target.value }))
                    }
                    required
                  />
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                    placeholder="Full Name"
                    value={reservationForm.fullName}
                    onChange={(e) => setReservationForm((s) => ({ ...s, fullName: e.target.value }))}
                    required
                  />
                </div>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  placeholder="Phone Number"
                  value={reservationForm.phone}
                  onChange={(e) => setReservationForm((s) => ({ ...s, phone: e.target.value }))}
                  required
                />
                <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Confirm Reservation
                </button>
                </fieldset>
              </form>
            </article>
            <article className="card p-5 sm:p-6 overflow-auto">
              <h2 className="text-lg font-semibold">Bookings</h2>
              <table className="mt-3 w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100">
                    <th className="p-2">Code</th>
                    <th className="p-2">Passenger</th>
                    <th className="p-2">Schedule</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bookings.map((item) => {
                    const passenger = state.passengers.find((p) => p.id === item.passengerId);
                    const schedule = state.schedules.find((s) => s.id === item.scheduleId);
                    const displayName =
                      item.passengerFullName || passenger?.fullName || "Unknown";
                    return (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="p-2">{item.confirmationCode}</td>
                        <td className="p-2">{displayName}</td>
                        <td className="p-2">
                          {schedule?.origin} → {schedule?.destination}
                        </td>
                        <td className="p-2">{item.status}</td>
                        <td className="p-2">SAR {item.totalPrice}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          </section>
        ) : null}

        {activeTab === "Cancellations" ? (
          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <article className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Cancel Ticket</h2>
              <form className="mt-3 space-y-2" onSubmit={handleCancellation}>
                <fieldset disabled={!canWrite} className="space-y-2">
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  placeholder="Confirmation Code"
                  value={cancelForm.confirmationCode}
                  onChange={(e) => setCancelForm((s) => ({ ...s, confirmationCode: e.target.value }))}
                  required
                />
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm border-slate-200 bg-white"
                  placeholder="Cancellation reason (optional)"
                  value={cancelForm.reason}
                  onChange={(e) => setCancelForm((s) => ({ ...s, reason: e.target.value }))}
                  rows={3}
                />
                <button className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                  Cancel Booking
                </button>
                </fieldset>
              </form>
            </article>
            <article className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Train Seat Status</h2>
              <div className="mt-3 space-y-2">
                {state.schedules.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm border-slate-200"
                  >
                    <span>
                      {item.trainName} ({item.origin} → {item.destination})
                    </span>
                    <span className="badge">
                      {item.availableSeats}/{item.totalSeats} seats
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "Reports" && isAdmin ? (
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Administrative Reports</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p>Total trains (schedules): {stats.totalSchedules}</p>
              <p>Total bookings: {stats.totalBookings}</p>
              <p>Total revenue: SAR {stats.totalRevenue}</p>
              <p>Seat occupancy rate: {stats.seatOccupancyRate}%</p>
            </div>
          </section>
        ) : null}
        </>}
      </section>
    </main>
  );
}
