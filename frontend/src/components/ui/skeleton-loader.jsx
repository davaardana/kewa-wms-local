/**
 * SkeletonLoader — Rekomendasi #4
 * Koleksi skeleton loading components untuk Dashboard, tabel, dan card.
 * Pakai Tailwind animate-pulse yang sudah ada.
 */
import React from 'react';

/** Skeleton untuk satu KPI card */
export function SkeletonKpiCard() {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-slate-200" />
      </div>
      <div className="h-7 w-16 bg-slate-200 rounded-lg mb-1.5" />
      <div className="h-3 w-24 bg-slate-100 rounded" />
    </div>
  );
}

/** Skeleton untuk grid 4 KPI card */
export function SkeletonKpiGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => <SkeletonKpiCard key={i} />)}
    </div>
  );
}

/** Skeleton untuk baris tabel */
export function SkeletonTableRow({ cols = 5 }) {
  return (
    <tr className="animate-pulse">
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="p-3.5">
          <div className={`h-3 bg-slate-100 rounded ${i === 0 ? 'w-32' : i === cols - 1 ? 'w-16' : 'w-24'}`} />
          {i === 0 && <div className="h-2.5 w-20 bg-slate-100 rounded mt-1.5" />}
        </td>
      ))}
    </tr>
  );
}

/** Skeleton untuk tabel lengkap */
export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* fake header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-6 animate-pulse">
        {[...Array(cols)].map((_, i) => (
          <div key={i} className="h-3 bg-slate-200 rounded w-16" />
        ))}
      </div>
      <table className="w-full">
        <tbody>
          {[...Array(rows)].map((_, i) => <SkeletonTableRow key={i} cols={cols} />)}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton untuk list item (dokumen terbaru di dashboard) */
export function SkeletonListItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-slate-200 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-3 bg-slate-200 rounded w-32 mb-1.5" />
        <div className="h-2.5 bg-slate-100 rounded w-44" />
      </div>
      <div className="h-5 w-14 bg-slate-100 rounded-md" />
    </div>
  );
}

/** Skeleton untuk card + list (dashboard recent docs section) */
export function SkeletonRecentDocs({ rows = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between animate-pulse">
        <div className="h-3.5 w-28 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-100 rounded" />
      </div>
      {[...Array(rows)].map((_, i) => <SkeletonListItem key={i} />)}
    </div>
  );
}

/** Skeleton untuk satu action button card */
export function SkeletonActionCard() {
  return (
    <div className="rounded-xl p-4 bg-slate-200 animate-pulse h-20" />
  );
}

/** Full dashboard skeleton */
export function SkeletonDashboard() {
  return (
    <div className="space-y-5">
      {/* header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-5 animate-pulse">
        <div className="h-6 w-36 bg-white/20 rounded-lg mb-2" />
        <div className="h-3.5 w-52 bg-white/10 rounded" />
      </div>
      <SkeletonKpiGrid />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <SkeletonActionCard key={i} />)}
      </div>
      <SkeletonRecentDocs />
    </div>
  );
}
