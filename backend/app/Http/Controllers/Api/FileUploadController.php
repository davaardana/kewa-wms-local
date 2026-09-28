<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FileUploadController extends Controller
{
    /**
     * Upload physical proof photo or document (PDF/Image) for SPK, Deliveries, and Custody.
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:jpg,jpeg,png,webp,pdf,doc,docx|max:10240', // max 10MB
            'folder' => 'nullable|string|in:spk_documents,delivery_proofs,custody_photos,general',
        ]);

        $file = $request->file('file');
        $folder = $request->input('folder', 'delivery_proofs');
        
        $filename = Str::uuid() . '.' . strtolower($file->getClientOriginalExtension());
        $path = $file->storeAs("uploads/{$folder}", $filename, 'public');

        if ($path === false) {
            return response()->json(['message' => 'Penyimpanan file gagal.'], 500);
        }

        return response()->json([
            'message' => 'Dokumen / foto bukti berhasil diunggah.',
            'url' => '/storage/' . $path,
            'filename' => $filename,
            'original_name' => $file->getClientOriginalName(),
            'size' => $file->getSize(),
            'mime_type' => $file->getClientMimeType(),
        ], 201);
    }
}
