"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatUpdatedTime } from "@/lib/i18n/format";
import { isProviderUsageId, normalizeProviderId } from "@/lib/provider-usage-ids";
import { useIsMobile } from "@/hooks/useIsMobile";

type UsageBucket = {
  id: string;
  label: string;
  groupLabel?: string;
  used?: number;
  remaining?: number;
  limit?: number;
  unit: "percent" | "currency" | "count";
  currency?: string;
  windowMinutes?: number;
  resetsAt?: number;
  period?: string;
};

type UsageMetric = { id: string; label: string; value: number | string; unit?: string; currency?: string };
type UsageReport = { providerId: string; providerName: string; capturedAt: number; buckets: UsageBucket[]; metrics: UsageMetric[]; notes?: string[] };
type UsageResponse = { providerId: string; status: "ready" | "auth-unavailable" | "query-failed"; report?: UsageReport; message?: string };

export type ConnectedProviderInfo = {
  id: string;
  name: string;
};

const STORAGE_PREFIX = "pi-web:provider-usage:";

function formatCountdown(resetsAtSeconds: number): string {
  const resetMs = resetsAtSeconds > 1e11 ? resetsAtSeconds : resetsAtSeconds * 1_000;
  const delta = resetMs - Date.now();
  if (delta <= 0) return "now";
  const totalMin = Math.round(delta / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function CircularProgressRing({ remaining }: { remaining: number }) {
  const size = 18;
  const strokeWidth = 2.2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(100, remaining)) / 100;
  const dashoffset = circumference * (1 - fraction);

  let strokeColor = "#4ade80"; // green
  if (remaining <= 0) {
    strokeColor = "rgba(255, 255, 255, 0.2)";
  } else if (remaining <= 20) {
    strokeColor = "#f59e0b"; // amber
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, transform: "rotate(-90deg)" }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={strokeWidth}
      />
      {remaining > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function SubscriptionUsageButton({
  providerId: preferredProviderId,
  disabled = false,
}: {
  providerId?: string | null;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ top: number; right: number; bottom: number; left: number; width: number } | null>(null);

  // List of connected providers
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>("");
  const [snapshots, setSnapshots] = useState<Record<string, UsageResponse>>({});
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load connected providers on mount
  useEffect(() => {
    let cancelled = false;
    async function loadConnected() {
      try {
        const res = await fetch("/api/provider-usage/query");
        if (!res.ok) return;
        const data = (await res.json()) as { connectedProviders?: ConnectedProviderInfo[] };
        if (cancelled || !Array.isArray(data.connectedProviders)) return;

        setConnectedProviders(data.connectedProviders);
      } catch {}
    }
    loadConnected();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync activeProviderId with preferredProviderId or default to first connected provider
  useEffect(() => {
    const normalized = preferredProviderId ? normalizeProviderId(preferredProviderId) : "";
    if (normalized && (connectedProviders.some((p) => p.id === normalized) || isProviderUsageId(normalized))) {
      setActiveProviderId(normalized);
    } else if (connectedProviders.length > 0 && !connectedProviders.some((p) => p.id === activeProviderId)) {
      setActiveProviderId(connectedProviders[0].id);
    } else if (!activeProviderId && preferredProviderId && isProviderUsageId(preferredProviderId)) {
      setActiveProviderId(preferredProviderId);
    }
  }, [preferredProviderId, connectedProviders, activeProviderId]);

  // Load cached usage from localStorage for activeProviderId
  useEffect(() => {
    if (!activeProviderId) return;
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${activeProviderId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as UsageResponse;
        if (parsed?.status === "ready" && parsed.report && Array.isArray(parsed.report.buckets)) {
          setSnapshots((prev) => ({ ...prev, [activeProviderId]: parsed }));
        }
      }
    } catch {
      try { localStorage.removeItem(`${STORAGE_PREFIX}${activeProviderId}`); } catch {}
    }
    setError(null);
  }, [activeProviderId]);

  const query = useCallback(async (targetProviderId = activeProviderId) => {
    if (!targetProviderId) return;
    setQuerying(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-usage/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: targetProviderId }),
      });
      const result = (await response.json()) as UsageResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      if (result.status === "ready") {
        setSnapshots((prev) => ({ ...prev, [targetProviderId]: result }));
        try { localStorage.setItem(`${STORAGE_PREFIX}${targetProviderId}`, JSON.stringify(result)); } catch {}
      } else {
        setError(result.message ?? t("providerUsage.queryFailed"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("providerUsage.queryFailed"));
    } finally {
      setQuerying(false);
    }
  }, [activeProviderId, t]);

  // When opening, if there is no snapshot or if older than 60s, query fresh usage
  const handleToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchorRect({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width });
    setOpen((prev) => {
      const next = !prev;
      if (next && activeProviderId) {
        const captured = snapshots[activeProviderId]?.report?.capturedAt;
        if (!captured || Date.now() - captured > 60_000) {
          query(activeProviderId);
        }
      }
      return next;
    });
  }, [disabled, activeProviderId, snapshots, query]);

  // Handle tab switch
  const handleSelectProvider = useCallback((id: string) => {
    setActiveProviderId(id);
    const captured = snapshots[id]?.report?.capturedAt;
    if (!captured || Date.now() - captured > 60_000) {
      query(id);
    }
  }, [snapshots, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        rootRef.current && !rootRef.current.contains(event.target as Node) &&
        panelRef.current && !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Keep anchor aligned if viewport resizes
  useEffect(() => {
    if (!open) return;
    const remeasure = () => {
      const rect = rootRef.current?.querySelector("button")?.getBoundingClientRect();
      if (rect?.height) {
        setAnchorRect({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width });
      }
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [open]);

  // If no connected providers and preferred provider isn't a known usage provider, hide button
  const hasSupportedProvider = connectedProviders.length > 0 || (preferredProviderId && isProviderUsageId(preferredProviderId));
  if (!hasSupportedProvider) return null;

  const currentSnapshot = activeProviderId ? snapshots[activeProviderId] : null;
  const report = currentSnapshot?.status === "ready" ? currentSnapshot.report : undefined;

  // Group buckets by groupLabel or providerName
  const groupedBuckets = (() => {
    if (!report?.buckets) return [];
    const map = new Map<string, UsageBucket[]>();
    for (const bucket of report.buckets) {
      const groupName = bucket.groupLabel || report.providerName;
      const list = map.get(groupName);
      if (list) list.push(bucket);
      else map.set(groupName, [bucket]);
    }
    return Array.from(map.entries()).map(([name, buckets]) => ({ name, buckets }));
  })();

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={t("providerUsage.usage")}
        aria-label={t("providerUsage.usage")}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: isMobile ? 36 : 28,
          height: isMobile ? 36 : 28,
          borderRadius: 5,
          border: "none",
          background: open ? "var(--bg-hover)" : "none",
          color: open ? "var(--text)" : "var(--text-muted)",
          cursor: disabled ? "default" : "pointer",
          padding: 0,
          flexShrink: 0,
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open && !disabled) {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--text-muted)";
          }
        }}
      >
        <svg
          width={isMobile ? 18 : 15}
          height={isMobile ? 18 : 15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 14l4-4" />
          <path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </svg>
      </button>

      {open && anchorRect && (() => {
        const viewportTop = window.visualViewport?.offsetTop ?? 0;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const aboveEnd = Math.min(anchorRect.top - 6, viewportTop + viewportHeight - 8);
        const verticalPosition: CSSProperties = {
          top: aboveEnd,
          transform: "translateY(-100%)",
        };
        const panelWidth = Math.min(360, viewportWidth - 24);
        const horizontalPosition: CSSProperties = isMobile
          ? { left: 12, right: 12, maxWidth: "calc(100vw - 24px)" }
          : {
              left: Math.max(8, Math.min(anchorRect.left, viewportWidth - panelWidth - 12)),
              width: panelWidth,
            };

        return (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("providerUsage.usage")}
            style={{
              position: "fixed",
              ...verticalPosition,
              ...horizontalPosition,
              zIndex: 500,
              display: "flex",
              flexDirection: "column",
              maxHeight: "min(480px, 70vh)",
              overflowY: "auto",
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg-panel, var(--bg))",
              boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.22)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: connectedProviders.length > 1 ? 10 : 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "-0.01em" }}>
                {t("providerUsage.usage")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {report && (
                  <span title={new Date(report.capturedAt).toLocaleString(locale)} style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                    {formatUpdatedTime(report.capturedAt, locale)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => query(activeProviderId)}
                  disabled={querying}
                  title={t(querying ? "providerUsage.refreshing" : "providerUsage.refresh")}
                  aria-label={t(querying ? "providerUsage.refreshing" : "providerUsage.refresh")}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    padding: 0,
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: querying ? "default" : "pointer",
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={querying ? { animation: "spin 0.8s linear infinite" } : undefined}
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Provider Tabs based on connected model providers */}
            {connectedProviders.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: 3,
                  padding: "2px",
                  background: "var(--bg-subtle, rgba(255, 255, 255, 0.04))",
                  border: "1px solid var(--border)",
                  borderRadius: 7,
                  marginBottom: 10,
                  overflowX: "auto",
                }}
              >
                {connectedProviders.map((provider) => {
                  const isSelected = activeProviderId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleSelectProvider(provider.id)}
                      style={{
                        flex: "1 1 auto",
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: isSelected ? 600 : 400,
                        border: "none",
                        borderRadius: 5,
                        background: isSelected ? "var(--bg-hover, rgba(255, 255, 255, 0.08))" : "transparent",
                        color: isSelected ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                        transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      {provider.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => query(activeProviderId)}
                  style={{ fontSize: 11, background: "none", border: "underline", color: "var(--accent)", cursor: "pointer", padding: "2px 4px" }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading state if no snapshot */}
            {!report && querying && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0", gap: 8, color: "var(--text-dim)", fontSize: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>{t("providerUsage.refreshing")}</span>
              </div>
            )}

            {!report && !querying && !error && (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
                {t("providerUsage.notQueried")}
              </div>
            )}

            {/* Grouped Buckets */}
            {groupedBuckets.map((group, groupIdx) => (
              <div key={group.name} style={{ marginTop: groupIdx === 0 ? 4 : 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.01em" }}>
                  {group.name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.buckets.map((bucket) => {
                    const isSingleBucketInGroup = group.buckets.length === 1;
                    const hasReset = bucket.resetsAt !== undefined && (bucket.remaining === undefined || bucket.remaining < 100);
                    const resetCountdown = bucket.resetsAt ? formatCountdown(bucket.resetsAt) : null;

                    return (
                      <div
                        key={bucket.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "2px 0",
                        }}
                      >
                        {isSingleBucketInGroup && hasReset && resetCountdown ? (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                            {bucket.label}, resets in {resetCountdown}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                              {bucket.label}
                            </div>
                            {hasReset && resetCountdown && (
                              <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                                Resets in {resetCountdown}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 1 }}>
                          {bucket.remaining !== undefined && (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: bucket.remaining === 0 ? "var(--text-muted)" : "var(--text)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {Math.round(bucket.remaining)}% left
                            </span>
                          )}
                          <CircularProgressRing remaining={bucket.remaining ?? 0} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Metrics if any (e.g. tier, status, balance) */}
            {report?.metrics && report.metrics.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                {report.metrics.map((metric) => (
                  <div key={metric.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-muted)" }}>{metric.label}</span>
                    <span style={{ color: "var(--text)", fontWeight: 500 }}>
                      {metric.unit === "currency" ? `${metric.currency === "CNY" ? "CNY " : "$"}${metric.value}` : String(metric.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
