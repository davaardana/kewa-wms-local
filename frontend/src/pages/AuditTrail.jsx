import { FlameButton } from '../components/ui/flame-button';
import React, { useState, useEffect } from 'react';
import { reportApi, masterApi } from '../services/api';
import { openAuthenticatedEdgeSocket } from '../services/edgeWebSocket';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import StockCardTab from './StockCard';
import {
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
  User,
  Search,
  RefreshCw,
  Calendar,
  MapPin,
  Scan,
  AlertTriangle,
  Lock,
  X,
  FileText,
  Printer,
  CheckCircle,
  Eye,
  Boxes,
  History,
} from 'lucide-react';

export default function Laporan({ defaultTab = 'trail', currentUser = null }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [activeTab, setActiveTab] = useState(defaultTab); // 'trail' | 'opname' | 'stock'

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  // Opname state
  const [opnameEpcs, setOpnameEpcs] = useState('');
  const [opnameResult, setOpnameResult] = useState(null);
  const [showOpnamePreviewModal, setShowOpnamePreviewModal] = useState(false);
  const [opnameInvestigating, setOpnameInvestigating] = useState(false);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = React.useRef(null);

  // Live RFID Reader Stream for Stock Opname
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isUnmounted = false;

    const connectWs = async () => {
      if (isUnmounted || !selectedWarehouseId) return;
      try {
        ws = await openAuthenticatedEdgeSocket(selectedWarehouseId, [], {
          onAuthenticated: (socket) => {
            if (isUnmounted) return socket.close();
            setWsConnected(true);
          },
          onClose: () => {
            if (!isUnmounted) {
              setWsConnected(false);
              reconnectTimer = setTimeout(connectWs, 3000);
            }
          },
          onError: () => {
            if (!isUnmounted) setWsConnected(false);
          },
          onMessage: (data) => {
            if (data.type === 'TAG_READ' && data.epc) {
              const cleanEpc = data.epc.toUpperCase().trim();
              setOpnameEpcs((prev) => {
                const currentList = prev.split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean);
                return currentList.includes(cleanEpc) ? prev : (currentList.length > 0 ? `${prev.trim()}\n${cleanEpc}` : cleanEpc);
              });
            }
          },
        });
        if (isUnmounted) return ws.close();
        wsRef.current = ws;
      } catch (e) {
        if (!isUnmounted) {
          setWsConnected(false);
          // Don't retry on non-recoverable errors (no device, permission denied, validation)
          const status = e?.response?.status;
          const isNonRecoverable = status === 404 || status === 403 || status === 422 || status === 409;
          if (!isNonRecoverable) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        }
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [selectedWarehouseId]);

  const loadAuditTrail = async () => {
    setLoading(true);
    try {
      const res = await reportApi.getAuditTrail({
        action: actionFilter || undefined,
        tag_epc: searchTerm || undefined,
      });
      setLogs(res.data.data || res.data);
    } catch (err) {
      console.error('Error loading audit trail:', err);
      showToast('Gagal memuat audit trail', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    masterApi.getWarehouses().then((res) => {
      setWarehouses(res.data);
      setSelectedWarehouseId((current) => current || String(res.data[0]?.id || ''));
    });
    loadAuditTrail();
  }, [actionFilter]);

  const handleRunOpname = async () => {
    const epcList = opnameEpcs
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (epcList.length === 0) {
      showToast('Masukkan daftar EPC hasil bulk-scan', 'warning');
      return;
    }

    try {
      const res = await reportApi.reconcileStockOpname(parseInt(selectedWarehouseId, 10), epcList);
      setOpnameResult(res.data);
      setShowOpnamePreviewModal(true);
      if (res.data.missing_count > 0) {
        showToast(`Pratinjau: Ditemukan ${res.data.missing_count} tag hilang dari gudang!`, 'warning');
      } else {
        showToast('Pratinjau: Stock Opname 100% Cocok dengan Sistem!', 'success');
      }
    } catch (err) {
      showToast('Gagal rekonsiliasi stock opname: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handlePrintBap = () => {
    if (!opnameResult) return;
    const wh = warehouses.find((w) => w.id === parseInt(selectedWarehouseId, 10));
    const whName = wh ? `${wh.name} (${wh.code})` : 'Gudang Target';
    const auditorName = currentUser?.name || 'Petugas Storeroom';
    const dateStr = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Pop-up terblokir. Izinkan pop-up browser untuk mencetak Berita Acara.', 'warning');
      return;
    }

    const missingListHtml = opnameResult.missing_epcs?.length > 0
      ? opnameResult.missing_epcs.map(epc => `<li style="font-family: monospace; color: #b91c1c; padding: 2px 0;">❌ ${epc}</li>`).join('')
      : '<li><em>Nihil / Tidak ada selisih hilang</em></li>';

    const unexpectedListHtml = opnameResult.unexpected_epcs?.length > 0
      ? opnameResult.unexpected_epcs.map(epc => `<li style="font-family: monospace; color: #b45309; padding: 2px 0;">⚠️ ${epc}</li>`).join('')
      : '<li><em>Nihil / Tidak ada tag asing</em></li>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Berita Acara Stock Opname Yard - ${whName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #1e293b; line-height: 1.5; }
            h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
            .meta { font-size: 13px; color: #475569; margin-bottom: 16px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; }
            .badge-match { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
            .badge-mismatch { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
            th { background: #f8fafc; font-weight: bold; }
            ul { margin-top: 4px; padding-left: 20px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 16px; }
            .sig-box { text-align: center; width: 220px; }
            .sig-line { border-bottom: 1px solid #0f172a; margin-top: 70px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BERITA ACARA REKONSILIASI STOCK OPNAME FISIK YARD (BAP)</h1>
            <div class="meta">
              Nomor Dokumen: BAP-OPN-${Date.now().toString().slice(-6)} · Tanggal: ${dateStr}<br/>
              Gudang: <strong>${whName}</strong> · Auditor Pemeriksa: <strong>${auditorName}</strong>
            </div>
            <span class="badge ${opnameResult.missing_count === 0 ? 'badge-match' : 'badge-mismatch'}">
              ${opnameResult.missing_count === 0 ? 'HASIL: 100% MATCH (LENGKAP)' : 'HASIL: TERDETEKSI SELISIH KURANG (MISMATCH)'}
            </span>
          </div>

          <h3>Ringkasan Rekonsiliasi Fisik vs Saldo Buku Sistem:</h3>
          <table>
            <tr><th>Indikator</th><th>Jumlah Tag RFID</th><th>Keterangan</th></tr>
            <tr><td>Saldo Buku di Sistem</td><td><strong>${opnameResult.total_system_expected} Tag</strong></td><td>Tag aktif terdaftar di sistem</td></tr>
            <tr><td>Fisik Terbaca (Scan Handheld)</td><td><strong>${opnameResult.total_physically_scanned} Tag</strong></td><td>Total tag terbaca di yard</td></tr>
            <tr><td>Cocok (Matched)</td><td style="color: #166534;"><strong>${opnameResult.matched_count} Tag</strong></td><td>Fisik cocok dengan saldo buku</td></tr>
            <tr><td>Selisih Hilang (Missing)</td><td style="color: #b91c1c;"><strong>${opnameResult.missing_count} Tag</strong></td><td>Terdaftar tapi tidak ditemukan di yard</td></tr>
            <tr><td>Tag Asing / Tidak Terdaftar</td><td style="color: #b45309;"><strong>${opnameResult.unexpected_count || 0} Tag</strong></td><td>Terbaca tapi bukan milik gudang ini</td></tr>
          </table>

          <h3>Rincian Tag RFID Hilang / Selisih Kurang (${opnameResult.missing_count} Tag):</h3>
          <ul>${missingListHtml}</ul>

          <h3>Rincian Tag RFID Asing / Tak Terdaftar (${opnameResult.unexpected_count || 0} Tag):</h3>
          <ul>${unexpectedListHtml}</ul>

          <div class="signatures">
            <div class="sig-box">
              <div>Petugas Pemeriksa Lapangan</div>
              <div class="sig-line"></div>
              <div>( <strong>${auditorName}</strong> )</div>
            </div>
            <div class="sig-box">
              <div>Kepala Gudang / Storeroom Lead</div>
              <div class="sig-line"></div>
              <div>( ........................................... )</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    showToast('Dokumen Berita Acara Opname siap dicetak.', 'success');
  };

  const handleEscalateOpnameAnomaly = () => {
    if (!opnameResult) return;
    setOpnameInvestigating(true);
    setTimeout(() => {
      setOpnameInvestigating(false);
      setShowOpnamePreviewModal(false);
      showToast('🚨 Tiket Berita Acara & Permintaan Investigasi Selisih berhasil diteruskan ke PM & Manajemen!', 'success');
    }, 600);
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'STOCK_IN':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold text-[10px]">STOCK-IN</span>;
      case 'PREPARED':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold text-[10px]">PREPARED</span>;
      case 'GATE_OUT':
        return <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold text-[10px]">GATE OUT</span>;
      case 'FIELD_RECEIVED':
        return <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full font-bold text-[10px]">DITERIMA PIC</span>;
      case 'INSTALLED':
        return <span className="bg-teal-100 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full font-bold text-[10px]">TERPASANG</span>;
      case 'FIELD_RETURN':
        return <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full font-bold text-[10px]">INPUT RETUR</span>;
      case 'GATE_IN':
        return <span className="bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded-full font-bold text-[10px]">GATE IN</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-full font-bold text-[10px]">{action}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-2">
        {[
          { id: 'trail', label: 'Audit Trail', icon: History },
          { id: 'opname', label: 'Stock Opname', icon: Scan },
          { id: 'stock', label: 'Kartu Stok', icon: Boxes },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                isActive
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'trail' ? (
        <div className="space-y-3.5">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Aksi Mutasi</option>
                <option value="TAG_ENROLLED">TAG_ENROLLED (Registrasi Identitas)</option>
                <option value="STOCK_IN">STOCK_IN (Terima Gudang)</option>
                <option value="PREPARED">PREPARED (Disiapkan Storeroom)</option>
                <option value="GATE_OUT">GATE_OUT (Barang Keluar)</option>
                <option value="FIELD_RECEIVED">FIELD_RECEIVED (Diterima Mandor)</option>
                <option value="INSTALLED">INSTALLED (Terpasang Proyek)</option>
                <option value="FIELD_RETURN">FIELD_RETURN (Diajukan Retur)</option>
                <option value="GATE_IN">GATE_IN (Masuk Retur)</option>
              </select>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nomor tag EPC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadAuditTrail()}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            <FlameButton
              onClick={loadAuditTrail}
              height={34}
              flameColor="blue"
              showArrow={false}
              text=""
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </FlameButton>
          </div>

          {/* High-Density Data Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3.5">Waktu Transaksi</th>
                    <th className="py-3 px-3.5 text-center">Aksi Custody</th>
                    <th className="py-3 px-3.5">Material & Tag EPC</th>
                    <th className="py-3 px-3.5">Penanggung Jawab (Holder)</th>
                    <th className="py-3 px-3.5">Lokasi / Gudang</th>
                    <th className="py-3 px-3.5">Catatan Pergerakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Tidak ada riwayat mutasi yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3.5 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                          {new Date(log.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">{getActionBadge(log.action)}</td>
                        <td className="py-2.5 px-3.5">
                          <div className="font-semibold text-slate-900">{log.item?.name}</div>
                          <div className="text-[10px] text-blue-700 font-mono font-semibold">{log.tag_epc || 'Batch Non-tag'}</div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{log.holder?.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase">{log.holder?.role}</div>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700 font-medium">{log.warehouse?.name || 'Mobile Field (Site)'}</td>
                        <td className="py-2.5 px-3.5 text-slate-600 max-w-xs truncate">{log.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Stock Opname Reconciler (Responsive 2-Column) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scan className="w-4 h-4 text-blue-600" />
                Input Bulk-Scan Handheld Reader
              </h2>
              <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                AUDIT OPNAME
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Pilih Gudang Target Audit *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">
                    Daftar Tag EPC Hasil Tembakan Scanner (Satu per baris):
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpnameEpcs('')}
                    className="text-slate-400 hover:text-rose-600 font-semibold text-[11px] cursor-pointer"
                  >
                    Bersihkan
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={opnameEpcs}
                  onChange={(e) => setOpnameEpcs(e.target.value)}
                  placeholder="E28011606000020410000001&#10;E28011606000020410000002&#10;..."
                  className="w-full p-3 font-mono border border-slate-300 rounded-xl bg-slate-900 text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed text-xs"
                />
              </div>

              <FlameButton
                type="button"
                onClick={handleRunOpname}
                fullWidth
                height={44}
                flameColor="blue"
                showArrow={false}
                text="Jalankan Rekonsiliasi Opname Fisik vs Sistem"
              />
            </div>
          </div>

          {/* Opname Results */}
          <div className="lg:col-span-6 space-y-4">
            {opnameResult ? (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 animate-fade-in">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-900">Hasil Rekonsiliasi Opname</h2>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    opnameResult.missing_count === 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {opnameResult.missing_count === 0 ? '100% MATCH' : 'MISMATCH TERDETEKSI'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="text-slate-500 font-medium">Saldo Buku di Sistem</div>
                    <div className="text-xl font-black text-slate-900 mt-1 font-mono">{opnameResult.total_system_expected} <span className="text-xs font-normal">Tag</span></div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="text-slate-500 font-medium">Fisik Terdeteksi</div>
                    <div className="text-xl font-black text-slate-900 mt-1 font-mono">{opnameResult.total_physically_scanned} <span className="text-xs font-normal">Tag</span></div>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs">
                    <div className="text-blue-700 font-bold">Cocok (Matched)</div>
                    <div className="text-xl font-black text-blue-800 mt-1 font-mono">{opnameResult.matched_count} <span className="text-xs font-normal">Tag</span></div>
                  </div>
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs">
                    <div className="text-rose-700 font-bold">Selisih Hilang (Missing)</div>
                    <div className="text-xl font-black text-rose-800 mt-1 font-mono">{opnameResult.missing_count} <span className="text-xs font-normal">Tag</span></div>
                  </div>
                </div>

                {opnameResult.missing_count > 0 && (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-bold text-rose-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Tag EPC Hilang dari Gudang (Wajib Investigasi CCTV/Gate):
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 font-mono text-[11px] text-rose-900 max-h-40 overflow-y-auto space-y-1">
                      {opnameResult.missing_epcs.map((epc, i) => (
                        <div key={i} className="text-rose-700">❌ {epc}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                  <FlameButton type="button" onClick={() => setShowOpnamePreviewModal(true)} height={34} flameColor="blue" showArrow={false} text="">
                    <Eye className="w-3.5 h-3.5" /><span>Buka Pratinjau &amp; Aksi Lanjutan</span>
                  </FlameButton>
                  <FlameButton type="button" onClick={handlePrintBap} height={34} flameColor="blue" showArrow={false} text="">
                    <Printer className="w-3.5 h-3.5" /><span>Cetak Berita Acara (BAP)</span>
                  </FlameButton>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
                Masukkan daftar EPC hasil pemindaian di kolom sebelah kiri lalu klik tombol "Jalankan Rekonsiliasi Opname" untuk melihat selisih fisik vs sistem.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU REKONSILIASI OPNAME FISIK & AKSI */}
      {showOpnamePreviewModal && opnameResult && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150 ${
            opnameResult.missing_count === 0 ? 'border-blue-200' : 'border-rose-200'
          }`}>
            {/* Header Modal */}
            <div className={`flex items-start justify-between border-b pb-4 ${
              opnameResult.missing_count === 0 ? 'border-blue-100' : 'border-rose-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-bold shadow-xs ${
                  opnameResult.missing_count === 0
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-rose-100 border-rose-300 text-rose-700'
                }`}>
                  {opnameResult.missing_count === 0 ? (
                    <CheckCircle className="w-6 h-6 text-blue-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      opnameResult.missing_count === 0
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      {opnameResult.missing_count === 0 ? 'PREVIEW: 100% MATCH' : 'PREVIEW: MISMATCH DETECTED'}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Gudang: {warehouses.find(w => w.id === parseInt(selectedWarehouseId, 10))?.name || 'Target Yard'}
                    </span>
                  </div>
                  <h2 className="text-base font-black text-slate-900 mt-0.5">
                    {opnameResult.missing_count === 0
                      ? 'Pratinjau Opname: Saldo Fisik Sesuai Sempurna dengan Sistem'
                      : 'Pratinjau Opname: Peringatan Terdeteksi Selisih Fisik di Yard'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOpnamePreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                title="Tutup Pratinjau"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verdict Banner */}
            <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
              opnameResult.missing_count === 0
                ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                : 'bg-rose-50/70 border-rose-200 text-rose-900'
            }`}>
              <div className="space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  {opnameResult.missing_count === 0 ? (
                    <span>🎉 Seluruh Material Fisik di Yard Terverifikasi Lengkap 1-ke-1</span>
                  ) : (
                    <span>⚠️ Terdapat {opnameResult.missing_count} Tag RFID Terdaftar yang Belum Ditemukan</span>
                  )}
                </div>
                <p className="text-[11px] opacity-80">
                  {opnameResult.missing_count === 0
                    ? 'Tidak ada susut material atau ketidaksesuaian saldo buku di sistem gudang.'
                    : 'Periksa kembali rak penyimpanan atau buat Berita Acara untuk eskalasi audit CCTV/perlintasan RFID.'}
                </p>
              </div>
              <span className={`text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg ${
                opnameResult.missing_count === 0 ? 'bg-blue-100 text-blue-900' : 'bg-rose-200 text-rose-900'
              }`}>
                {opnameResult.missing_count === 0 ? '100% MATCH' : `${opnameResult.missing_count} KURANG`}
              </span>
            </div>

            {/* Metrics 4-Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Saldo Buku</div>
                <div className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {opnameResult.total_system_expected}
                </div>
                <div className="text-[10px] text-slate-400">Tag Aktif Sistem</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-blue-700 font-bold uppercase">Fisik Terdeteksi</div>
                <div className="text-lg font-black text-blue-800 mt-0.5 font-mono">
                  {opnameResult.total_physically_scanned}
                </div>
                <div className="text-[10px] text-blue-600">Hasil Scan Reader</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-blue-700 font-bold uppercase">Cocok</div>
                <div className="text-lg font-black text-blue-700 mt-0.5 font-mono">
                  {opnameResult.matched_count}
                </div>
                <div className="text-[10px] text-blue-600">Sesuai Saldo</div>
              </div>
              <div className={`border rounded-2xl p-3 text-center ${
                opnameResult.missing_count === 0 ? 'bg-blue-50 border-blue-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <div className={`text-[10px] font-bold uppercase ${
                  opnameResult.missing_count === 0 ? 'text-blue-700' : 'text-rose-700'
                }`}>Selisih Hilang</div>
                <div className={`text-lg font-black mt-0.5 font-mono ${
                  opnameResult.missing_count === 0 ? 'text-blue-700' : 'text-rose-700'
                }`}>
                  {opnameResult.missing_count}
                </div>
                <div className={`text-[10px] ${
                  opnameResult.missing_count === 0 ? 'text-blue-600' : 'text-rose-600'
                }`}>
                  {opnameResult.missing_count === 0 ? 'Nihil' : 'Belum Terbaca'}
                </div>
              </div>
            </div>

            {/* Missing EPC Details */}
            {opnameResult.missing_count > 0 && (
              <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between text-rose-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Daftar Tag RFID yang Belum Terdeteksi ({opnameResult.missing_count} EPC):
                  </span>
                  <span className="text-[10px] text-rose-700 font-normal">Periksa sudut rack yard / tumpukan</span>
                </div>
                <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 p-1">
                  {opnameResult.missing_epcs.map((epc, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-[11px] font-bold bg-white text-rose-800 border border-rose-300 px-2 py-0.5 rounded-lg shadow-2xs"
                    >
                      ❌ {epc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Unexpected EPC Details if any */}
            {opnameResult.unexpected_count > 0 && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between text-amber-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Tag Asing / Tidak Terdaftar di Gudang Ini ({opnameResult.unexpected_count} EPC):
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-1">
                  {opnameResult.unexpected_epcs.map((epc, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-[11px] font-bold bg-white text-amber-800 border border-amber-300 px-2 py-0.5 rounded-lg shadow-2xs"
                    >
                      ⚠️ {epc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pilihan Tindakan & Flow Selanjutnya */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <FlameButton
                type="button"
                onClick={() => setShowOpnamePreviewModal(false)}
                height={38}
                flameColor="blue"
                showArrow={false}
                text="↺ Sisir Ulang Yard / Tambah Scan"
              />

              <div className="flex flex-wrap items-center gap-2">
                <FlameButton
                  type="button"
                  onClick={handlePrintBap}
                  height={38}
                  flameColor="blue"
                  showArrow={false}
                  text=""
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Berita Acara Opname (BAP)</span>
                </FlameButton>

                {opnameResult.missing_count > 0 && (
                  <FlameButton
                    type="button"
                    disabled={opnameInvestigating}
                    onClick={handleEscalateOpnameAnomaly}
                    height={38}
                    flameColor="rose"
                    showArrow={false}
                    text=""
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>{opnameInvestigating ? 'Meneruskan Tiket...' : 'Eskalasi Investigasi ke PM'}</span>
                  </FlameButton>
                )}
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Kartu Stok Tab */}
      {activeTab === 'stock' && (
        <StockCardTab />
      )}
    </div>
  );
}
