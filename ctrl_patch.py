path = "/var/www/mosa/backend/app/Http/Controllers/Api/ShippingDocumentController.php"
with open(path, "r") as f:
    c = f.read()

# 1. complete(): hapus cek assignment qty per item, ganti dengan cek item exists saja
old_complete_check = (
    "            $items = $doc->items()->lockForUpdate()->get();\n"
    "            if ($items->isEmpty()) {\n"
    "                throw new \\Symfony\\Component\\HttpKernel\\Exception\\HttpException(422, 'Dokumen tidak memiliki item.');\n"
    "            }\n"
    "            foreach ($items as $item) {\n"
    "                $assignedQty = ShippingDocumentTag::where('shipping_document_item_id', $item->id)->count();\n"
    "                if ($assignedQty !== (int) $item->expected_qty) {\n"
    "                    throw new \\Symfony\\Component\\HttpKernel\\Exception\\HttpException(422, \"Assignment item {$item->item_id} belum lengkap ({$assignedQty}/{$item->expected_qty} tag).\");\n"
    "                }\n"
    "            }\n"
)
new_complete_check = (
    "            $items = $doc->items()->lockForUpdate()->get();\n"
    "            if ($items->isEmpty()) {\n"
    "                throw new \\Symfony\\Component\\HttpKernel\\Exception\\HttpException(422, 'Dokumen tidak memiliki item.');\n"
    "            }\n"
    "            // v2: tag di-assign otomatis oleh gate — skip cek pre-assignment manual\n"
)

if old_complete_check in c:
    c = c.replace(old_complete_check, new_complete_check)
    print("patch ctrl-1 OK")
else:
    print("patch ctrl-1 NOT FOUND")
    idx = c.find("$items = $doc->items()->lockForUpdate()->get()")
    print(repr(c[idx:idx+500]))

# 2. ubah pesan complete -> Approve
c = c.replace(
    "'message' => 'Dokumen berhasil diselesaikan.",
    "'message' => 'Dokumen berhasil di-approve.",
)
# fallback: cari berbagai variasi
c = c.replace("Dokumen berhasil diselesaikan", "Dokumen berhasil di-approve")

# 3. complete() hanya perlu status in_progress (ok, sudah benar) tapi perlu juga accept 'draft' untuk edge case
# Tidak ubah ini — flow baru: draft -> (gate scan) -> in_progress -> (tombol Approve) -> completed

with open(path, "w") as f:
    f.write(c)

print("ShippingDocumentController patch OK")
