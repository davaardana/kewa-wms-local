import React, { useEffect, useState } from 'react';
import { Boxes, Calendar, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { masterApi, reportApi } from '../services/api';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';

const isoDate = (date) => date.toISOString().slice(0, 10);

export default function StockCard() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dateFrom, setDateFrom] = useState(isoDate(monthStart));
  const [dateTo, setDateTo] = useState(isoDate(today));
  const [card, setCard] = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadStocks = async () => {
    setLoading(true);
    try {
      const res = await reportApi.getStocks({
        warehouse_id: warehouseId || undefined,
        item_id: itemId || undefined,
      });
      setStocks(res.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal memuat stok gudang', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([masterApi.getWarehouses(), masterApi.getItems()])
      .then(([warehouseRes, itemRes]) => {
        setWarehouses(warehouseRes.data);
        setItems(itemRes.data);
      })
      .catch(() => showToast('Gagal memuat filter persediaan', 'error'));
  }, []);

  useEffect(() => { loadStocks(); }, [warehouseId, itemId]);

  const loadCard = async (target = selected, targetPage = page) => {
    if (!target) return;
    setCardLoading(true);
    try {
      const res = await reportApi.getStockCard({
        warehouse_id: target.warehouse.id,
        item_id: target.item.id,
        date_from: dateFrom,
        date_to: dateTo,
        page: targetPage,
        per_page: 25,
      });
      setCard(res.data);
      setPage(targetPage);
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal memuat kartu stok', 'error');
    } finally {
      setCardLoading(false);
    }
  };

  const openCard = (stock) => {
    if (!stock.item.is_serialized_tag) {
      showToast('Kuantitas material batch belum dapat dihitung dari jumlah tag', 'warning');
      return;
    }
    setSelected(stock);
    setCard(null);
    setPage(1);
    loadCard(stock, 1);
  };

  const movements = card?.movements;

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold text-slate-900">Stok & Kartu Stok</h1>
        <p className="text-xs text-slate-500 mt-0.5">Saldo material per gudang dan riwayat mutasi barang serialized.</p>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-2">
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
          <option value="">Semua Gudang</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold flex-1">
          <option value="">Semua Material</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
        </select>
        <button onClick={loadStocks} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600">
              <tr><th className="p-3.5">Gudang</th><th className="p-3.5">Material</th><th className="p-3.5">Satuan</th><th className="p-3.5 text-right">Tag Aktif</th><th className="p-3.5 text-right">Stok Tercatat</th><th className="p-3.5 text-center">Status</th><th className="p-3.5"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && stocks.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-slate-400">Tidak ada stok aktif sesuai filter.</td></tr> : stocks.map((stock) => {
                const low = stock.stock_qty !== null && stock.stock_qty <= stock.item.min_stock;
                return <tr key={`${stock.warehouse.id}-${stock.item.id}`} className="hover:bg-slate-50">
                  <td className="p-3.5 font-semibold">{stock.warehouse.name}<div className="font-mono text-[10px] text-slate-400">{stock.warehouse.code}</div></td>
                  <td className="p-3.5"><div className="font-semibold text-slate-900">{stock.item.name}</div><div className="font-mono text-[10px] text-emerald-700">{stock.item.code}</div></td>
                  <td className="p-3.5">{stock.item.unit}</td>
                  <td className="p-3.5 text-right font-mono font-bold">{stock.active_tag_count}</td>
                  <td className="p-3.5 text-right font-mono font-bold">{stock.stock_qty ?? '—'}</td>
                  <td className="p-3.5 text-center">{stock.stock_qty === null ? <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">QTY BELUM TERSEDIA</span> : <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${low ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{low ? 'STOK MINIMUM' : 'AMAN'}</span>}</td>
                  <td className="p-3.5 text-right"><button disabled={!stock.item.is_serialized_tag} onClick={() => openCard(stock)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold disabled:bg-slate-200 disabled:text-slate-400">Buka Kartu</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex gap-2 items-start"><Boxes className="w-4 h-4 shrink-0" /><span>Stok tercatat hanya ditampilkan bila 1 tag RFID mewakili 1 unit. Material batch/kabel tidak disamakan dengan jumlah tag.</span></div>

      {selected && <Portal>
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-3 sm:p-6 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between gap-4">
              <div><h2 className="font-bold text-slate-900">Kartu Stok — {selected.item.name}</h2><p className="text-xs text-slate-500">{selected.warehouse.name} · {selected.item.code}</p></div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-end gap-2">
              <label className="text-[10px] font-bold text-slate-600">DARI<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block mt-1 p-2 border rounded-lg text-xs" /></label>
              <label className="text-[10px] font-bold text-slate-600">SAMPAI<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block mt-1 p-2 border rounded-lg text-xs" /></label>
              <button onClick={() => loadCard(selected, 1)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex gap-1.5"><Calendar className="w-3.5 h-3.5" /> Terapkan</button>
              <div className="sm:ml-auto text-xs bg-slate-100 rounded-xl px-3 py-2">Saldo awal: <strong className="font-mono">{card?.opening_balance ?? '—'} {selected.item.unit}</strong></div>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b text-[10px] uppercase text-slate-600"><tr><th className="p-3">Waktu</th><th className="p-3">Aksi</th><th className="p-3">EPC</th><th className="p-3 text-right">Masuk</th><th className="p-3 text-right">Keluar</th><th className="p-3 text-right">Saldo</th><th className="p-3">Holder</th><th className="p-3">Catatan</th></tr></thead>
                <tbody className="divide-y">{!cardLoading && (!movements?.data?.length) ? <tr><td colSpan={8} className="p-10 text-center text-slate-400">Tidak ada mutasi pada periode ini.</td></tr> : movements?.data?.map((row) => <tr key={row.id}><td className="p-3 whitespace-nowrap font-mono text-[11px]">{new Date(row.created_at).toLocaleString('id-ID')}</td><td className="p-3 font-bold">{row.action}</td><td className="p-3 font-mono text-[10px]">{row.tag_epc}</td><td className="p-3 text-right text-emerald-700 font-bold">{row.qty_in || '—'}</td><td className="p-3 text-right text-rose-700 font-bold">{row.qty_out || '—'}</td><td className="p-3 text-right font-mono font-bold">{row.running_balance}</td><td className="p-3">{row.holder?.name || '—'}</td><td className="p-3 max-w-52 truncate">{row.notes || '—'}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="p-3 border-t flex justify-between items-center text-xs"><span>Halaman {movements?.current_page || 1} dari {movements?.last_page || 1}</span><div className="flex gap-1"><button disabled={!movements?.prev_page_url} onClick={() => loadCard(selected, page - 1)} className="p-2 border rounded-lg disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button><button disabled={!movements?.next_page_url} onClick={() => loadCard(selected, page + 1)} className="p-2 border rounded-lg disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button></div></div>
          </div>
        </div>
      </Portal>}
    </div>
  );
}
