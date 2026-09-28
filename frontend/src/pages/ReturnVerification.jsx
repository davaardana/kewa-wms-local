import React, { useState, useEffect } from 'react';
import { gateApi, returnApi } from '../services/api';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import { 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  ShieldCheck, 
  Box, 
  Search, 
  Eye, 
  X,
  User,
  CheckCircle2,
  History
} from 'lucide-react';

export default function ReturnVerification({ currentUser = null }) {
  const [returnTxs, setReturnTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [physicalCounts, setPhysicalCounts] = useState({});
  const [verifyStep, setVerifyStep] = useState('input'); // 'input' | 'preview'
  const [returnReconcileData, setReturnReconcileData] = useState(null);
  const [bapNotes, setBapNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadReturns = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await gateApi.getTransactions({ type: 'IN_RETURN' });
      setReturnTxs(res.data);
    } catch (err) {
      console.error('Error loading returns:', err);
      showToast('Gagal memuat antrian verifikasi retur', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadReturns();
  }, []);

  const openVerifyModal = (tx) => {
    setSelectedTx(tx);
    const initialCounts = {};
    tx.items?.forEach((i) => {
      initialCounts[i.item_id] = i.physical_qty ?? i.requested_qty;
    });
    setPhysicalCounts(initialCounts);
    setVerifyStep('input');
    setReturnReconcileData(null);
    setBapNotes('');
    setShowVerifyModal(true);
  };

  const handleCalculatePreview = () => {
    if (!selectedTx || !selectedTx.items) return;

    let totalRequested = 0;
    let totalPhysical = 0;
    let isAllMatch = true;

    const itemComparisons = selectedTx.items.map((item) => {
      const requested = Number(item.requested_qty || 0);
      const physical = parseInt(physicalCounts[item.item_id] ?? requested, 10);
      const diff = physical - requested;
      if (diff !== 0) {
        isAllMatch = false;
      }
      totalRequested += requested;
      totalPhysical += physical;

      return {
        item,
        requested,
        physical,
        diff,
        status: diff === 0 ? 'MATCH' : diff < 0 ? 'SHORTAGE' : 'SURPLUS',
      };
    });

    setReturnReconcileData({
      items: itemComparisons,
      totalRequested,
      totalPhysical,
      isAllMatch,
    });
    setVerifyStep('preview');
  };

  const handleFinalVerify = async (isMatch) => {
    if (!selectedTx) return;

    if (!isMatch && !bapNotes.trim()) {
      showToast('Wajib mengisi Catatan Kronologi Berita Acara untuk selisih fisik retur.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const verifiedItems = selectedTx.items.map((i) => ({
        item_id: i.item_id,
        physical_qty: parseInt(physicalCounts[i.item_id] ?? i.requested_qty, 10),
      }));

      const res = await returnApi.verifyReturn(selectedTx.id, {
        verified_items: verifiedItems,
        is_matched: isMatch,
        notes: isMatch
          ? 'Hasil verifikasi fisik 100% Cocok dan lengkap'
          : `Berita Acara Selisih Fisik: ${bapNotes.trim()}`,
      });

      showToast(res.data.message, isMatch ? 'success' : 'warning');
      const targetTxId = selectedTx.id;
      setReturnTxs((prev) =>
        prev.map((tx) =>
          tx.id === targetTxId
            ? {
                ...tx,
                status: isMatch ? 'verified' : 'pending_investigation',
              }
            : tx
        )
      );
      setShowVerifyModal(false);
      loadReturns(false);
    } catch (err) {
      showToast('Gagal verifikasi retur: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReturns = returnTxs.filter((tx) => {
    const matchSearch =
      tx.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.pic?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.work_order?.wo_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.warehouse?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || tx.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Verifikasi Retur Sisa</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pemeriksaan fisik material sisa proyek yang masuk melalui pembacaan inbound (B→A) sebelum kuota WO dipulihkan.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari No. Transaksi, PIC, WO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="pending">Menunggu Verifikasi</option>
            <option value="completed">Sudah Diverifikasi (Completed)</option>
          </select>
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Total: <strong className="text-slate-800">{filteredReturns.length}</strong> Sesi Retur
        </div>
      </div>

      {/* Full-Width High-Density Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">No. Transaksi Retur</th>
                <th className="py-3 px-3.5">Work Order Terkait</th>
                <th className="py-3 px-3.5">PIC Pengembali</th>
                <th className="py-3 px-3.5">Gudang Penerima</th>
                <th className="py-3 px-3.5 text-center">Barang Diretur</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5">Waktu Pembacaan Masuk</th>
                <th className="py-3 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="font-bold text-slate-700">Tidak ada sesi retur yang ditemukan.</p>
                      <p className="text-xs text-slate-500">Semua pengembalian telah diverifikasi atau tidak sesuai filter.</p>
                      {(searchTerm || statusFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setStatusFilter('ALL');
                          }}
                          className="mt-1 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset Filter</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-blue-700">
                      <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded">
                        {tx.transaction_number}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-semibold text-slate-800 block">{tx.work_order?.wo_number}</span>
                      <span className="text-[10px] text-slate-500 truncate max-w-xs block">{tx.work_order?.title}</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="font-semibold text-slate-800 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{tx.pic?.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{tx.pic?.phone || '-'}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 font-medium">{tx.warehouse?.name}</td>
                    <td className="py-2.5 px-3.5 text-center font-mono">
                      <span className="font-bold text-slate-800">{tx.items?.length || 0} Material</span>
                      <span className="block text-[10px] text-slate-500">
                        ({tx.items?.reduce((s, it) => s + Number(it.requested_qty || 0), 0)} Pcs)
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        tx.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {tx.status === 'completed' ? 'TERVERIFIKASI' : 'PENDING CEK'}
                      </span>
                      {tx.status === 'completed' && (
                        <span className="block text-[10px] text-emerald-700 font-medium mt-0.5">
                          ✓ {tx.approved_by?.name || tx.approvedBy?.name || 'Storeroom / Admin'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-500 text-[11px]">
                      {new Date(tx.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        onClick={() => openVerifyModal(tx)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs ml-auto cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{tx.status === 'completed' ? 'Lihat Cek' : 'Periksa & Rekonsiliasi'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog: Verifikasi & Rekonsiliasi Retur Storeroom */}
      {showVerifyModal && selectedTx && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-5xl w-full space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    RFID INBOUND (B → A)
                  </span>
                  {selectedTx.status !== 'completed' && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      verifyStep === 'preview'
                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}>
                      {verifyStep === 'preview' ? 'LANGKAH 2: PRATINJAU REKONSILIASI' : 'LANGKAH 1: INPUT HITUNGAN FISIK'}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-lg text-slate-900 mt-1">{selectedTx.transaction_number}</h3>
                <p className="text-xs text-slate-600">
                  PIC Pengembali: <strong>{selectedTx.pic?.name}</strong> · Gudang: <strong>{selectedTx.warehouse?.name}</strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">WO: {selectedTx.work_order?.wo_number}</p>
              </div>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Wizard Nav for Incomplete Returns */}
            {selectedTx.status !== 'completed' && (
              <div className="flex border border-slate-200 rounded-xl overflow-hidden text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setVerifyStep('input')}
                  className={`flex-1 py-2 text-center transition cursor-pointer ${
                    verifyStep === 'input'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  1. Cek & Hitung Fisik Barang
                </button>
                <button
                  type="button"
                  onClick={handleCalculatePreview}
                  className={`flex-1 py-2 text-center transition cursor-pointer ${
                    verifyStep === 'preview'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  2. Pratinjau Rekonsiliasi & Aksi
                </button>
              </div>
            )}

            {/* VIEW 1: Input Hitungan Fisik & Status Completed */}
            {(verifyStep === 'input' || selectedTx.status === 'completed') && (
              <div className="space-y-4">
                {/* Items Verification Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-blue-600" />
                    Cek Fisik Barang Nyata vs Laporan Retur PIC:
                  </h4>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                        <tr>
                          <th className="p-3">Nama Material</th>
                          <th className="p-3 text-right">Laporan PIC</th>
                          <th className="p-3 text-center">Kondisi Fisik</th>
                          <th className="p-3 text-right">Hitungan Nyata Storeroom</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedTx.items?.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-3">
                              <div className="font-semibold text-slate-800">{item.item?.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{item.item?.code}</div>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                              {item.requested_qty} {item.item?.unit}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                item.returned_condition === 'good' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {item.returned_condition === 'good' ? 'Bagus' : 'Rusak'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                min="0"
                                disabled={selectedTx.status === 'completed'}
                                value={physicalCounts[item.item_id] ?? item.requested_qty}
                                onChange={(e) => {
                                  setPhysicalCounts({
                                    ...physicalCounts,
                                    [item.item_id]: e.target.value,
                                  });
                                }}
                                className="w-24 p-1.5 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-800 disabled:bg-slate-100"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Timeline & Audit Log */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-600" />
                    Timeline Riwayat Transaksi Retur & Audit Fisik:
                  </h4>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {/* Event 1: Inisiasi Retur */}
                      <div className="relative">
                        <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                        <div className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">Pengajuan Retur Lapangan (PWA PIC)</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(selectedTx.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Diajukan oleh mandor <strong className="text-slate-800">{selectedTx.pic?.name || 'PIC Lapangan'}</strong> untuk Work Order <strong>{selectedTx.work_order?.wo_number}</strong> ({selectedTx.items?.length || 0} item material).
                          </p>
                        </div>
                      </div>

                      {/* Event 2: Lewat Reader RFID */}
                      <div className="relative">
                        <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                        <div className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">Titik Pemeriksaan RFID Masuk (IN_RETURN)</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(selectedTx.timestamp || selectedTx.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Reader RFID <strong>{selectedTx.warehouse?.name}</strong> mendeteksi arah masuk B → A.
                          </p>
                        </div>
                      </div>

                      {/* Event 3: Verifikasi Storeroom */}
                      <div className="relative">
                        <span className={`absolute -left-6 top-0.5 w-3 h-3 rounded-full ring-4 ring-white ${
                          selectedTx.status === 'completed' ? 'bg-emerald-600' : 'bg-amber-400'
                        }`} />
                        <div className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">
                              {selectedTx.status === 'completed' ? 'Pemeriksaan Fisik Gudang Selesai' : 'Menunggu Pemeriksaan Fisik Storeroom'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {selectedTx.status === 'completed'
                              ? 'Fisik material telah diverifikasi dan stok gudang telah diperbarui.'
                              : 'Staf gudang perlu memeriksa kondisi fisik dan menghitung jumlah nyata barang.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons Step 1 */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowVerifyModal(false)}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Tutup
                  </button>

                  {selectedTx.status !== 'completed' && (!currentUser || ['superadmin', 'storeroom'].includes(currentUser.role)) && (
                    <button
                      type="button"
                      onClick={handleCalculatePreview}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      <span>Jalankan Rekonsiliasi & Pratinjau Selisih</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 2: Pratinjau Rekonsiliasi Retur & Aksi Lanjutan */}
            {verifyStep === 'preview' && returnReconcileData && selectedTx.status !== 'completed' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Verdict Banner */}
                <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
                  returnReconcileData.isAllMatch
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50/80 border-rose-300 text-rose-950'
                }`}>
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm flex items-center gap-2">
                      {returnReconcileData.isAllMatch ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          <span>✅ 100% MATCH: Hitungan Fisik Lengkap Sesuai Dokumen</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5 text-rose-600" />
                          <span>⚠️ MISMATCH: Terdeteksi Selisih Antara Fisik vs Dokumen Retur</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] opacity-85">
                      {returnReconcileData.isAllMatch
                        ? 'Semua jumlah fisik barang sama persis dengan yang dilaporkan oleh PIC. Kuota WO siap dipulihkan.'
                        : 'Terdapat ketidaksesuaian jumlah fisik barang nyata dengan data pengajuan retur lapangan.'}
                    </p>
                  </div>
                  <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-lg ${
                    returnReconcileData.isAllMatch
                      ? 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                      : 'bg-rose-200 text-rose-900 border border-rose-300'
                  }`}>
                    {returnReconcileData.isAllMatch ? '100% MATCH' : 'MISMATCH'}
                  </span>
                </div>

                {/* Summary Metrics */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Laporan PIC</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                      {returnReconcileData.totalRequested} Unit
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                    <div className="text-[10px] font-bold text-blue-700 uppercase">Hitungan Storeroom</div>
                    <div className="text-lg font-black text-blue-800 mt-0.5 font-mono">
                      {returnReconcileData.totalPhysical} Unit
                    </div>
                  </div>
                  <div className={`p-3 border rounded-xl text-center ${
                    returnReconcileData.isAllMatch
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className={`text-[10px] font-bold uppercase ${
                      returnReconcileData.isAllMatch ? 'text-emerald-700' : 'text-rose-700'
                    }`}>Hasil Selisih</div>
                    <div className={`text-lg font-black mt-0.5 font-mono ${
                      returnReconcileData.isAllMatch ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {returnReconcileData.isAllMatch ? '0 Unit' : `${returnReconcileData.totalPhysical - returnReconcileData.totalRequested} Unit`}
                    </div>
                  </div>
                </div>

                {/* Item by Item Comparison Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="p-3">Nama Material</th>
                        <th className="p-3 text-right">Diajukan</th>
                        <th className="p-3 text-right">Dihitung</th>
                        <th className="p-3 text-center">Selisih</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {returnReconcileData.items.map((row) => (
                        <tr key={row.item.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-semibold text-slate-800">{row.item.item?.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.item.item?.code}</div>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-700">
                            {row.requested} {row.item.item?.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-blue-700">
                            {row.physical} {row.item.item?.unit}
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            {row.diff === 0 ? (
                              <span className="text-slate-400">±0</span>
                            ) : row.diff < 0 ? (
                              <span className="text-rose-600">{row.diff}</span>
                            ) : (
                              <span className="text-amber-600">+{row.diff}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.status === 'MATCH'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'SHORTAGE'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {row.status === 'MATCH' ? 'Cocok' : row.status === 'SHORTAGE' ? 'Kurang' : 'Lebih'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Form Input Berita Acara jika Selisih */}
                {!returnReconcileData.isAllMatch && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 space-y-2 text-xs">
                    <label className="font-bold text-amber-950 flex items-center justify-between">
                      <span>Catatan Kronologi / Berita Acara Selisih <span className="text-rose-600">*Wajib</span></span>
                      <span className="text-[10px] text-slate-400 font-normal">Diteruskan ke PM Alert</span>
                    </label>
                    <textarea
                      rows={2}
                      value={bapNotes}
                      onChange={(e) => setBapNotes(e.target.value)}
                      placeholder="Contoh: Fisik material kabel drop kurang 50m dari laporan PIC. Sisa kemungkinan tertinggal di tiang pelanggan."
                      className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                  </div>
                )}

                {/* Footer Buttons Step 2 */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setVerifyStep('input')}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    ↺ Kembali & Koreksi Hitungan
                  </button>

                  <div className="flex gap-2">
                    {returnReconcileData.isAllMatch ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleFinalVerify(true)}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>{submitting ? 'Menyimpan...' : 'Konfirmasi Cocok & Pulihkan Kuota WO'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={submitting || !bapNotes.trim()}
                        onClick={() => handleFinalVerify(false)}
                        className={`flex items-center gap-1.5 px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer ${
                          submitting || !bapNotes.trim()
                            ? 'bg-rose-400 opacity-60 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>{submitting ? 'Mengirim...' : 'Kirim Berita Acara Selisih ke PM'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
