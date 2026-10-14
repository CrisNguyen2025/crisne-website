"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpsOrder {
  orderCode: string; // match key → WMS partnerORCode / originalPartnerOrCode
  upsStatus: string;
  carrier: string;
}

interface WmsOrder {
  partnerORCode: string;
  originalPartnerOrCode: string;
  orStatusName: string;
  packedDate: string | null; // Thời gian đóng xong sample
  tplName: string;
}

// ─── UPS data — 49 đơn từ Excel ──────────────────────────────────────────────

const UPS_ORDERS: UpsOrder[] = [
  { orderCode: "583930655470028191",  upsStatus: "Chờ lấy hàng", carrier: "J&T Express" },
  { orderCode: "260509UU9HE05H",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090695J38Y",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "260509075UWMG3",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "26050907REYQEY",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "26050907VT7BH9",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583941940059407799",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583942032177530739",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "26050909QY9W0D",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090AH567R3",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090BD0UF3P",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090C4ED47P",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090C4K51M6",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090CQQFRGQ",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "OR19771778314535",    upsStatus: "Chờ lấy hàng", carrier: "ViettelPost CP tiết kiệm thỏa thuận" },
  { orderCode: "583943152619259373",  upsStatus: "Chờ lấy hàng", carrier: "J&T Express" },
  { orderCode: "2605090DY730C5",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583943538336302973",  upsStatus: "Chờ lấy hàng", carrier: "Viettel Post VTP" },
  { orderCode: "2605090F4NSM5V",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "2605090FXYWU74",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583943862534637327",  upsStatus: "Chờ lấy hàng", carrier: "GHN" },
  { orderCode: "583943812421420501",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583943945353070580",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090GV5K5HG",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583944018005689615",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090H6VXE3R",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583944188034582471",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944224777275360",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090J8483DG",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583944406152611026",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944313439291193",  upsStatus: "Chờ lấy hàng", carrier: "J&T Express" },
  { orderCode: "583944350258398331",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090JKMBSP0",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583944409765151839",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944433453401332",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090K6QMX11",      upsStatus: "Chờ lấy hàng", carrier: "SPX Express" },
  { orderCode: "583944536948769812",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944537822824442",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944550029165858",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944620859229878",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "528470749554675",     upsStatus: "Chờ lấy hàng", carrier: "BEST VN" },
  { orderCode: "525129851154675",     upsStatus: "Chờ lấy hàng", carrier: "BEST VN" },
  { orderCode: "2605090KPNU4NF",      upsStatus: "Chờ lấy hàng", carrier: "Giao Hàng Nhanh" },
  { orderCode: "583944686711112766",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944654698349954",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944753054779269",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "2605090M19DBGD",      upsStatus: "Chờ lấy hàng", carrier: "Giao Hàng Nhanh" },
  { orderCode: "583940902419203879",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
  { orderCode: "583944798035609509",  upsStatus: "Chờ lấy hàng", carrier: "BEST Express" },
];

// ─── WMS sample data — 10 items từ API VF ────────────────────────────────────

const WMS_ORDERS_INITIAL: WmsOrder[] = [
  { partnerORCode: "583944798035609509", originalPartnerOrCode: "583944798035609509", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:51:57.677", tplName: "BEST Express" },
  { partnerORCode: "583940902419203879", originalPartnerOrCode: "583940902419203879", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:38:27.177", tplName: "BEST Express" },
  { partnerORCode: "2605090M19DBGD",     originalPartnerOrCode: "2605090M19DBGD",     orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:54:24.077", tplName: "Giao Hàng Nhanh" },
  { partnerORCode: "583944753054779269", originalPartnerOrCode: "583944753054779269", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:57:51.52",  tplName: "BEST Express" },
  { partnerORCode: "583944654698349954", originalPartnerOrCode: "583944654698349954", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:55:59.92",  tplName: "BEST Express" },
  { partnerORCode: "583944686711112766", originalPartnerOrCode: "583944686711112766", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:55:39.043", tplName: "BEST Express" },
  { partnerORCode: "2605090KPNU4NF",     originalPartnerOrCode: "2605090KPNU4NF",     orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:52:55.1",   tplName: "Giao Hàng Nhanh" },
  { partnerORCode: "525129851154675",    originalPartnerOrCode: "525129851154675",    orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:57:38.097", tplName: "BEST Express" },
  { partnerORCode: "528470749554675",    originalPartnerOrCode: "528470749554675",    orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:52:37.997", tplName: "BEST Express" },
  { partnerORCode: "583944620859229878", originalPartnerOrCode: "583944620859229878", orStatusName: "Sẵn sàng bàn giao", packedDate: "2026-05-09T17:58:43.75",  tplName: "BEST Express" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Row type ─────────────────────────────────────────────────────────────────

interface Row {
  orderCode: string;
  upsStatus: string;
  upsCarrier: string;
  vfStatus: string | null;
  packedDate: string | null;
  vfCarrier: string | null;
  matched: boolean;
}

function buildRows(upsList: UpsOrder[], wmsList: WmsOrder[]): Row[] {
  const wmsMap = new Map<string, WmsOrder>();
  wmsList.forEach((w) => {
    wmsMap.set(w.partnerORCode, w);
    if (w.originalPartnerOrCode !== w.partnerORCode) {
      wmsMap.set(w.originalPartnerOrCode, w);
    }
  });

  return upsList.map((u) => {
    const wms = wmsMap.get(u.orderCode) ?? null;
    return {
      orderCode: u.orderCode,
      upsStatus: u.upsStatus,
      upsCarrier: u.carrier,
      vfStatus: wms?.orStatusName ?? null,
      packedDate: wms?.packedDate ?? null,
      vfCarrier: wms?.tplName ?? null,
      matched: wms !== null,
    };
  });
}

// ─── Extension token helper ───────────────────────────────────────────────────
// Giao tiếp với VNFai Token Sync extension qua window.postMessage

declare global {
  interface Window {
    __vnfaiExtId?: string;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

const VF_API = "https://ops-api.vnfai.com/OutboundRequests/search";
const VF_PARAMS = "PageIndex=0&PageSize=200&ORStatuses=60&ORStatuses=61&SearchMode=512&DateSearchMode=128&FromDate=1778259600&ToDate=1778432399";

// Extension ID — sau khi load extension vào Chrome, copy ID từ chrome://extensions
// và paste vào đây. Hoặc để trống "" để dùng manual token input làm fallback.
const EXTENSION_ID = "";

async function getTokenFromExtension(): Promise<string | null> {
  if (
    !EXTENSION_ID ||
    typeof window === "undefined" ||
    !(window as unknown as { chrome?: { runtime?: unknown } }).chrome
  ) return null;

  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = (window as any).chrome;
      cr.runtime.sendMessage(EXTENSION_ID, { type: "GET_TOKEN" }, (res: { ok: boolean; token?: string } | undefined) => {
        if (cr.runtime.lastError || !res?.ok || !res?.token) {
          resolve(null);
        } else {
          resolve(res.token);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

export default function TestRobotPage() {
  const [search, setSearch] = useState("");
  const [filterMatch, setFilterMatch] = useState<"all" | "matched" | "unmatched">("all");
  const [wmsOrders, setWmsOrders] = useState<WmsOrder[]>(WMS_ORDERS_INITIAL);
  const [token, setToken] = useState("");
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fetchMsg, setFetchMsg] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const fetchVF = useCallback(async () => {
    setFetchState("loading");
    setFetchMsg("");

    // 1. Thử lấy token từ extension trước
    let resolvedToken = await getTokenFromExtension();

    // 2. Fallback: dùng manual token nếu extension không có
    if (!resolvedToken) {
      resolvedToken = token.trim() || null;
    }

    if (!resolvedToken) {
      setFetchState("error");
      setFetchMsg("Không tìm thấy token — cài extension hoặc nhập thủ công");
      return;
    }

    try {
      const res = await fetch(`${VF_API}?${VF_PARAMS}`, {
        headers: {
          "accept": "application/json, text/plain, */*",
          "authorization": `Bearer ${resolvedToken}`,
          "x-tenant": "287",
        },
      });
      if (!res.ok) {
        setFetchState("error");
        setFetchMsg(`Lỗi ${res.status} — token có thể đã hết hạn`);
        return;
      }
      const data = await res.json() as { items: WmsOrder[]; totalCount: number };
      setWmsOrders(data.items ?? []);
      setFetchState("ok");
      setFetchMsg(`Đã tải ${data.items?.length ?? 0} / ${data.totalCount} đơn VF`);
      setShowTokenInput(false);
    } catch {
      setFetchState("error");
      setFetchMsg("Không thể kết nối — kiểm tra CORS hoặc token");
    }
  }, [token]);

  const allRows = buildRows(UPS_ORDERS, wmsOrders);

  const filtered = allRows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.orderCode.toLowerCase().includes(q) ||
      r.upsCarrier.toLowerCase().includes(q) ||
      (r.vfCarrier ?? "").toLowerCase().includes(q) ||
      (r.vfStatus ?? "").toLowerCase().includes(q);
    const matchFilter =
      filterMatch === "all" ||
      (filterMatch === "matched" && r.matched) ||
      (filterMatch === "unmatched" && !r.matched);
    return matchSearch && matchFilter;
  });

  const matchedCount = allRows.filter((r) => r.matched).length;
  const unmatchedCount = allRows.length - matchedCount;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">So sánh UPS ↔ WMS (VF)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Follow 49 đơn UPS · match qua{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">partnerORCode</code>
            </p>
          </div>
          {/* Fetch VF button */}
          <button
            onClick={() => setShowTokenInput((v) => !v)}
            className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {fetchState === "ok" ? "🔄 Refresh VF" : "🔑 Fetch VF"}
          </button>
        </div>

        {/* Token input panel */}
        {showTokenInput && (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Nếu đã cài extension:</strong> nhấn <strong>Fetch VF</strong> — token tự động lấy từ extension.
              <br />
              <strong>Chưa cài extension:</strong> paste token thủ công bên dưới (lấy từ DevTools → Network → header <code className="bg-muted px-1 rounded">authorization</code>).
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste Bearer token (fallback nếu chưa cài extension)..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 font-mono placeholder:font-sans placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && fetchVF()}
              />
              <button
                onClick={fetchVF}
                disabled={fetchState === "loading"}
                className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
              >
                {fetchState === "loading" ? "Đang tải..." : "Fetch VF"}
              </button>
            </div>
            {fetchMsg && (
              <p className={`text-xs font-medium ${fetchState === "error" ? "text-red-600" : "text-green-600"}`}>
                {fetchMsg}
              </p>
            )}
          </div>
        )}

        {/* Status bar khi đã fetch */}
        {fetchState === "ok" && !showTokenInput && (
          <p className="text-xs text-green-600 font-medium">{fetchMsg}</p>
        )}

        {/* Summary */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-full bg-muted border border-border font-medium text-muted-foreground">
            Tổng UPS: {allRows.length}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
            ✓ Khớp VF: {matchedCount}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">
            Chưa có VF: {unmatchedCount}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Tìm theo mã đơn, đơn vị vận chuyển, trạng thái..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
          />
          <select
            value={filterMatch}
            onChange={(e) => setFilterMatch(e.target.value as typeof filterMatch)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 text-foreground"
          >
            <option value="all">Tất cả</option>
            <option value="matched">✓ Khớp VF</option>
            <option value="unmatched">Chưa có VF</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Mã đơn hàng[Ups]/Xuất kho đối tác[VF]</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">UPS Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">VF Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Thời gian đóng xong (VF)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Đơn vị vận chuyển</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      {wmsOrders.length === 0
                        ? "Nhấn 'Nhập token VF' để tải data từ WMS"
                        : "Không tìm thấy đơn hàng nào"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, idx) => (
                    <tr
                      key={row.orderCode}
                      className={`border-b border-border/40 last:border-0 transition-colors hover:bg-muted/20 ${
                        row.matched ? "" : "bg-orange-50/30"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground/50 tabular-nums">{idx + 1}</td>

                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs">{row.orderCode}</span>
                      </td>

                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                          {row.upsStatus}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.vfStatus ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            {row.vfStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">Chưa có</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {row.packedDate
                          ? fmtDateTime(row.packedDate)
                          : <span className="text-muted-foreground/40 italic">—</span>}
                      </td>

                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs">{row.upsCarrier}</span>
                          {row.vfCarrier && row.vfCarrier !== row.upsCarrier && (
                            <span className="text-xs text-blue-600">VF: {row.vfCarrier}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-muted/20 border-t border-border/50 text-xs text-muted-foreground">
            Hiển thị {filtered.length} / {allRows.length} đơn
          </div>
        </div>
      </div>
    </div>
  );
}

