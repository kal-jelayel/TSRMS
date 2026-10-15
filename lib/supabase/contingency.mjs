export function classifyFailure(error) {
  const code = String(error?.code ?? "");
  const status = Number(error?.status);
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if ([401, 403].includes(status) || /^(42501|28|PGRST30)/.test(code) ||
      /permission denied|row.level security|jwt|unauthorized|forbidden|invalid.*token/i.test(message)) return "authorization";
  if (status >= 400 && status < 500 && status !== 408) return "other";
  // SQL/PostgREST errors are not evidence of a network outage.
  if (code && !/^(08|PGRST000|PGRST001|PGRST002|PGRST003)/.test(code)) return "other";
  if ([408, 502, 503, 504].includes(status) || /^(08|PGRST00[0-3])/.test(code) ||
      /failed to fetch|fetch failed|networkerror|network request failed|load failed|network.*lost|offline|timed? ?out|aborterror/i.test(message) ||
      error?.name === "AbortError") return "connectivity";
  return "other";
}

const empty = () => ({ status: "unavailable", snapshot: null, refreshedAt: null, error: "", busy: false });

export function createContingency(now = () => new Date().toISOString()) {
  let scope = null;
  let generation = 0;
  let request = 0;
  let offline = false;
  let state = empty();
  const listeners = new Set();
  const emit = (next) => { state = next; listeners.forEach((fn) => fn()); };
  const clear = () => { generation++; request++; scope = null; emit(empty()); };
  const setUser = (user) => {
    const next = user ? JSON.stringify([user.id, user.username, user.role]) : null;
    if (scope !== next) { clear(); scope = next; }
    return scope;
  };
  const fail = (error) => {
    const kind = classifyFailure(error);
    if (kind === "authorization") { generation++; request++; }
    if (kind === "connectivity") emit({ ...state, status: state.snapshot ? "stale" : "unavailable", busy: false, error: "Connection unavailable. Refresh before making changes." });
    else emit({ ...empty(), error: kind === "authorization" ? "Access could not be verified. Sign in again or contact an administrator." : "Data unavailable. The live request failed; check configuration or contact an administrator." });
  };
  const assertReady = (expectedScope = scope) => {
    if (!scope || scope !== expectedScope || offline || state.busy || state.status !== "ready") throw new Error("Live data is not ready. Refresh before making changes.");
  };
  async function loadWithContingency(user, readSnapshot) {
    const owner = setUser(user);
    if (!owner || state.busy) return;
    const epoch = generation;
    const id = ++request;
    emit({ ...state, status: "loading", error: "" });
    try {
      const snapshot = await readSnapshot();
      if (epoch !== generation || id !== request) return;
      if (offline) throw new Error("offline");
      if (!snapshot || ![snapshot.schedules, snapshot.passengers, snapshot.bookings].every(Array.isArray)) throw new Error("Incomplete snapshot");
      emit({ status: "ready", snapshot: structuredClone(snapshot), refreshedAt: now(), error: "", busy: false });
    } catch (error) {
      // A same-account access denial must also invalidate newer pending work.
      if (epoch === generation && (id === request || classifyFailure(error) === "authorization")) fail(error);
    }
  }
  async function runWrite(operation) {
    assertReady();
    const epoch = generation;
    request++; // Discard older reads; only a subsequent full read restores readiness.
    let attempted = false;
    emit({ ...state, status: "loading", busy: true });
    const beforeMutation = () => {
      if (epoch !== generation || !scope || offline) throw new Error("Live data is not ready. Refresh before making changes.");
      attempted = true;
    };
    try {
      const result = await operation(beforeMutation);
      if (epoch !== generation) throw new Error("Account changed during request.");
      emit({ ...state, status: state.snapshot ? "stale" : "unavailable", busy: false });
      return result;
    } catch (error) {
      if (epoch === generation) fail(error);
      const reported = new Error(attempted
        ? "Operation outcome uncertain; changes may have been saved or partially applied. Refresh and verify records before trying again."
        : (classifyFailure(error) === "connectivity" ? "Connection unavailable. No write was started." : error.message));
      reported.uncertain = attempted;
      throw reported;
    }
  }
  return {
    getState: () => state, getScope: () => scope,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    setUser, clear, assertReady, loadWithContingency, runWrite,
    setOffline(value) {
      offline = value;
      if (value) {
        request++;
        const busy = state.busy;
        fail(new Error("offline"));
        if (busy) emit({ ...state, busy: true });
      }
      // An online event never restores readiness.
    },
  };
}

export const contingency = createContingency();
