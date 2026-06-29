/* Subscription model (manual billing — no payment processor yet).
 *
 * On sign-up an org gets a 1-week free trial (set by DB defaults). After that a
 * super-admin manually moves them onto a paid tier (Monthly / Annual). Tiers are
 * named only — no prices are shown in-app. By default an expired org just sees a
 * banner; a super-admin can additionally enable a read-only lock per org
 * (resolveSubscription → readOnlyLock).
 */

export const PLAN_LABELS = {
  free_week: "Free trial",
  monthly: "Monthly",
  yearly: "Annual",
};

export const STATUS_LABELS = {
  trial: "Free trial",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

/**
 * Resolve an org's effective subscription state from its raw DB fields.
 * Trial status is derived live from trial_expires_at so it expires without a job.
 * @returns { plan, status, expired, readOnlyLock, daysLeft, trialEndsAt, paid }
 */
export function resolveSubscription(org) {
  if (!org) {
    return { plan: "free_week", status: "trial", expired: false, readOnlyLock: false, daysLeft: null, trialEndsAt: null, paid: false };
  }
  const plan = org.subscription_plan || "free_week";
  const rawStatus = org.subscription_status || "trial";
  const lockFlag = !!org.readonly_lock;
  const paid = plan === "monthly" || plan === "yearly";
  const trialEndsAt = org.trial_expires_at ? new Date(org.trial_expires_at) : null;
  const now = Date.now();
  const trialMs = trialEndsAt ? trialEndsAt.getTime() : null;

  let status = rawStatus;
  let expired = false;
  if (rawStatus === "cancelled") {
    status = "cancelled";
    expired = true;
  } else if (paid && rawStatus === "active") {
    status = "active";
    expired = false;
  } else {
    // trial / free_week — derive from the trial end date
    if (trialMs != null && now > trialMs) { status = "expired"; expired = true; }
    else { status = "trial"; expired = false; }
  }

  const daysLeft = trialMs != null ? Math.ceil((trialMs - now) / 86400000) : null;
  return { plan, status, expired, readOnlyLock: expired && lockFlag, daysLeft, trialEndsAt, paid };
}
