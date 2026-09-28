<?php

namespace App\Services;

use App\Models\GatePassEvent;
use App\Models\GateTransaction;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppNotificationService
{
    /**
     * Send notification message to a recipient via WhatsApp service driver.
     */
    public function sendMessage(string $phone, string $message): bool
    {
        Log::info("WhatsApp Notification -> [{$phone}]: {$message}");

        $enabled = config('services.whatsapp.enabled', env('WA_ENABLED', false));
        if (!$enabled) {
            return false;
        }

        $endpoint = config('services.whatsapp.endpoint', env('WA_API_ENDPOINT', 'http://127.0.0.1:3001/send'));
        $apiKey = config('services.whatsapp.api_key', env('WA_API_KEY', 'mosa-secret-key'));

        try {
            // Non-blocking dispatch to Baileys / WA service
            Http::timeout(1)->withHeaders([
                'Authorization' => "Bearer {$apiKey}",
                'Content-Type' => 'application/json',
            ])->post($endpoint, [
                'recipient' => $phone,
                'message' => $message,
            ]);
            return true;
        } catch (\Throwable $e) {
            Log::warning("WhatsApp send failed (will not block operation): " . $e->getMessage());
            return false;
        }
    }

    /**
     * Notify PM when a new gate withdrawal approval is requested.
     */
    public function notifyPmApprovalRequest(GateTransaction $transaction, User $pm): void
    {
        if (!$pm->phone) return;

        $msg = "🔔 *[MOSA WMS] PERMINTAAN APPROVAL GERBANG*\n"
             . "----------------------------------------\n"
             . "No. Transaksi: {$transaction->transaction_number}\n"
             . "Work Order: {$transaction->workOrder->wo_number}\n"
             . "Gudang: {$transaction->warehouse->name}\n"
             . "PIC Lapangan: {$transaction->pic->name}\n"
             . "Tipe: {$transaction->type}\n"
             . "Item: " . $transaction->items->count() . " jenis barang\n\n"
             . "Silakan buka Dashboard MOSA untuk menyetujui.";

        $this->sendMessage($pm->phone, $msg);
    }

    /**
     * Urgent alert to PM when gate detects unauthorized breach or tag mismatch.
     */
    public function notifySecurityMismatch(GatePassEvent $event, ?User $pm = null): void
    {
        $targetPhone = $pm?->phone ?? env('SECURITY_ALERT_PHONE', '081234567890');

        $msg = "🚨 *[MOSA WMS ALERT] ANOMALI DI GERBANG!*\n"
             . "----------------------------------------\n"
             . "Gerbang: {$event->gate_id} ({$event->warehouse->name})\n"
             . "Arah: {$event->direction} ({$event->antenna_sequence})\n"
             . "Total Tag: {$event->total_tags_detected}\n"
             . "Detail: {$event->mismatch_details}\n"
             . "Waktu: " . $event->created_at->format('Y-m-d H:i:s') . "\n\n"
             . "Status: Gerbang TETAP TERKUNCI. Mohon periksa CCTV!";

        $this->sendMessage($targetPhone, $msg);
    }
}
