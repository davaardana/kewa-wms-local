# Proposal Keamanan RFID Anti-Clone

> **Status: BELUM DIIMPLEMENTASIKAN / BELUM DI-COMMISSIONING**
>
> Implementasi saat ini mengenali tag berdasarkan EPC. Backend, frontend, Edge Bridge, dan skema database belum menyimpan atau memvalidasi TID, mengelola access/kill password, maupun menjalankan lock/permalock. Dokumen ini adalah threat model dan rancangan peningkatan, bukan SOP operasional atau klaim keamanan produk.

## Tujuan

Mengurangi risiko penulisan ulang EPC, kloning identitas, pemindahan tag fisik, dan penyalahgunaan perintah kill. Tidak ada kontrol tunggal yang menjamin tag tidak dapat dipalsukan; efektivitas harus dibuktikan pada kombinasi chip, reader, firmware, pemasangan, dan alur operasional yang digunakan.

## Ancaman

1. **EPC rewrite:** EPC pada tag yang tidak dikunci ditulis ulang.
2. **EPC cloning:** EPC sah disalin ke tag lain.
3. **Tag swapping:** tag sah dipindahkan ke aset lain.
4. **Unauthorized kill/write:** password default atau bocor dipakai untuk mengubah keadaan tag.
5. **Reader spoofing/replay:** data EPC/TID palsu dikirim langsung ke aplikasi tanpa pembacaan RF sah.

## Kontrol yang Diusulkan

### Validasi EPC dan TID

- Pastikan chip dan reader mendukung pembacaan TID yang dibutuhkan.
- Rekam pasangan EPC–TID saat enrollment melalui jalur tepercaya.
- Validasi pasangan tersebut pada pembacaan yang memerlukan assurance tinggi.
- Perlakukan TID sebagai faktor penguat, bukan bukti tunggal keaslian aset.

Kebutuhan minimum: model data TID, dukungan reader/Edge, validasi server-side, audit event, serta kebijakan akses dan retensi.

### Lock atau Permalock EPC

- Gunakan lock hanya setelah kompatibilitas chip/reader diuji.
- Gunakan password acak unik; jangan simpan plaintext atau memakai nilai default.
- Permalock irreversible. Terapkan setelah verifikasi EPC, TID, material, dan persetujuan operator kedua.
- Sediakan prosedur tag rusak, salah encoding, decommission, dan penggantian sebelum permalock.

### Pengamanan Fisik

- Pilih tag dan pemasangan sesuai permukaan material.
- Gunakan segel tamper-evident, rivet, atau pengikat yang meninggalkan bukti saat dilepas.
- Dokumentasikan pemasangan bila risiko aset membenarkan biaya.
- Uji RF setelah pemasangan.

### Keamanan Jalur Reader

- Autentikasi Edge Bridge; batasi reader ke jaringan gudang.
- Tolak replay, perangkat tidak dikenal, dan simulasi pada production.
- Catat perangkat, gudang, waktu, dan hasil verifikasi.
- Jangan menganggap EPC/TID dari browser atau request API sebagai pembacaan hardware tepercaya.

## Kriteria Implementasi

Fitur boleh dinyatakan aktif setelah:

1. Model data dan migration EPC–TID tersedia.
2. Enrollment membaca TID dari reader nyata dan memverifikasi tulis/lock.
3. Gate membaca EPC–TID pada throughput target.
4. Backend menghitung match dan menolak pasangan salah.
5. Password memiliki penyimpanan, rotasi, recovery, dan pembatasan akses.
6. Tag rusak/salah encoding dapat ditangani tanpa mengubah histori custody.
7. Test otomatis, uji replay/spoof, dan commissioning hardware lulus.
8. SOP operator dan bukti acceptance disetujui.

## Status Kemampuan

| Kemampuan | Status saat ini |
|---|---|
| Registrasi dan validasi EPC | Tersedia |
| Penyimpanan TID | Belum tersedia |
| Validasi EPC–TID | Belum tersedia |
| Penulisan access/kill password | Belum tersedia |
| Lock/permalock dari aplikasi | Belum tersedia |
| Deteksi pemindahan tag fisik | Belum tersedia |
| Commissioning anti-clone hardware | Belum dilakukan |

Rujukan: [`prd.md`](prd.md), [`rules.md`](rules.md), dan [`../RENCANA_HARDENING_FASE_2.md`](../RENCANA_HARDENING_FASE_2.md).
