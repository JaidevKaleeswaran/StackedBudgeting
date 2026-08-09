/**
 * Receipt Scanner Agent — Calls Gemini Vision directly from the browser
 *
 * Works on both localhost AND Vercel (no Express backend required).
 * Reads the image as base64 using FileReader and sends it as inlineData
 * to Gemini's vision model.
 */

import { GoogleGenAI } from '@google/genai';

const RECEIPT_PROMPT = `You are a receipt-parsing assistant. Analyze the provided receipt image and extract the data into JSON.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "merchant": string,
  "date": string (ISO 8601, e.g. "2025-03-15"),
  "total": number,
  "subtotal": number | null,
  "tax": number | null,
  "line_items": [ { "name": string, "price": number, "quantity": number } ],
  "suggested_category": string
}

Rules:
- "merchant" is the store/restaurant name.
- "date" must be ISO 8601. If the year is ambiguous, assume the current year.
- "total" is the final amount paid.
- "subtotal" and "tax" may be null if not clearly shown.
- Each line item must have a name, unit price, and quantity (default 1 if not shown).
- "suggested_category" should be one of: Groceries, Dining, Entertainment, Bills, Shopping, Transport, Health, Education, Other.
- Do NOT guess values. If a field is unreadable, set it to null (for nullable fields) or omit the line item.
- Return ONLY the JSON object. Do not wrap in markdown or add commentary.`;

/**
 * Convert a File object to a base64 string using the browser FileReader API
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is a data URL like "data:image/jpeg;base64,/9j/..."
      // We only need the base64 part after the comma
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Scan a receipt image using Gemini Vision directly from the browser
 * @param {File} imageFile - The receipt image file
 * @returns {Object} Structured receipt data
 */
export async function scanReceipt(imageFile) {
  if (!imageFile) {
    throw new Error('No image file provided');
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(imageFile.type)) {
    throw new Error('Unsupported image type. Please use JPEG, PNG, or WebP.');
  }

  // Validate file size (10MB max)
  if (imageFile.size > 10 * 1024 * 1024) {
    throw new Error('Image file is too large. Maximum size is 10MB.');
  }

  const apiKey = import.meta.env.VITE_RECEIPT_SCANNER_API_KEY
    || import.meta.env.VITE_MANAGER_API_KEY
    || import.meta.env.VITE_ASSISTANT_API_KEY;

  if (!apiKey) {
    throw new Error('No Gemini API key configured. Set VITE_RECEIPT_SCANNER_API_KEY in .env');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Convert file to base64 in the browser
  const base64Image = await fileToBase64(imageFile);
  const mimeType = imageFile.type;

  const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: RECEIPT_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
      });

      const rawText = (response.text || '').trim();
      if (!rawText) continue;

      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const parsedData = JSON.parse(cleaned);

      // Auto-fill missing date with today
      if (!parsedData.date || typeof parsedData.date !== 'string' || !parsedData.date.trim()) {
        parsedData.date = new Date().toISOString().split('T')[0];
      }

      // Return structured data matching the shape the modal expects
      return {
        merchant: parsedData.merchant || 'Unknown Store',
        date: parsedData.date || new Date().toISOString().split('T')[0],
        amount: parsedData.total || 0,
        subtotal: parsedData.subtotal ?? null,
        tax: parsedData.tax ?? null,
        tip: parsedData.tip ?? null,
        paymentMethod: parsedData.payment_method ?? null,
        lineItems: parsedData.line_items || [],
        suggestedCategory: parsedData.suggested_category || 'Other',
        receiptImageUrl: null, // No server-side storage on Vercel
        validation: 'Gemini Vision (client-side)',
        engine: model,
        // Also expose the raw shape that ReceiptScannerModal expects under `data`
        data: {
          merchant: parsedData.merchant || 'Unknown Store',
          date: parsedData.date || new Date().toISOString().split('T')[0],
          total: parsedData.total || 0,
          subtotal: parsedData.subtotal ?? null,
          tax: parsedData.tax ?? null,
          tip: parsedData.tip ?? null,
          payment_method: parsedData.payment_method ?? null,
          line_items: parsedData.line_items || [],
          suggested_category: parsedData.suggested_category || 'Other',
        },
        raw: parsedData,
      };
    } catch (err) {
      console.warn(`[Receipt Scanner] Model ${model} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini vision models failed to process the receipt image.');
}

/**
 * Process a scanned receipt through the Manager Agent pipeline
 * High-level function that components should call
 */
export async function processScannedReceipt(imageFile, managerProcessFn, budgetState, dispatch) {
  // Step 1: Scan the receipt
  const scanResult = await scanReceipt(imageFile);

  // Step 2: Pass to Manager Agent for categorization and dispatch
  const managerResult = await managerProcessFn(
    {
      description: scanResult.merchant ? `Receipt: ${scanResult.merchant}` : 'Scanned Receipt',
      amount: scanResult.amount,
      date: scanResult.date,
      merchant: scanResult.merchant,
      lineItems: scanResult.lineItems,
    },
    budgetState,
    dispatch
  );

  return {
    ...managerResult,
    scanData: scanResult,
  };
}
