import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '30mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', geminiEnabled: !!process.env.GEMINI_API_KEY });
  });

  // AI Multimodal Packaging Inspection Endpoint
  app.post('/api/analyze', async (req, res) => {
    try {
      const { image, fileName } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY not configured',
          useFallback: true,
        });
      }

      // Parse base64 data and mime type
      let mimeType = 'image/jpeg';
      let base64Data = image;

      const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt = `You are a Senior Legal Metrology Officer conducting an official statutory inspection of pre-packaged commodities under the Legal Metrology Act, 2009 and Legal Metrology (Packaged Commodities) Rules, 2011 (PCR 2011).

Analyze the provided packaging image with rigorous precision. Examine every visible label, surface, text line, print, and sticker.

ABSOLUTE MANDATE - NO GUESSING OR FABRICATING VALUES:
- Only detect and report text that is visibly and legibly printed on the packaging in this image.
- DO NOT invent, assume, estimate, or hallucinate any numbers or text (e.g. do NOT output placeholder numbers like ₹ 45.00, 100 g, or fake dates).
- If any detail is not clearly visible, not written on the packet, blurry, or omitted from this package side, you MUST mark:
  "found": false
  "status": "missing"
  "value": "NOT WRITTEN ON PACKET / NOT FOUND"

Check every mandatory statutory declaration:
1. Product identification:
   - Product Name (exact product title on packet)
   - Brand / Manufacturer Name
   - Category (e.g. Snacks, Dairy, Spices, Bakery, Personal Care)

2. Maximum Retail Price (MRP) [Rule 6(1)(e)]:
   - Is the Maximum Retail Price printed on the packet?
   - Look for "MRP", "M.R.P.", "₹", "Rs.", "Incl. of all taxes".
   - If written: mrp.found = true, mrp.status = "detected", mrp.value = exact text printed (e.g. "MRP ₹ 20.00 (Incl. of all taxes)")
   - If NOT printed or missing: mrp.found = false, mrp.status = "missing", mrp.value = "NOT WRITTEN ON PACKET / NOT FOUND"

3. Unit Sale Price (USP) [Rule 6(11)]:
   - Is the Unit Sale Price declared on the packaging (e.g. "₹ 0.25 / g", "₹ 1.50 / unit", "₹ 40.00 / kg", "₹ 0.50 / ml")?
   - If written: usp.found = true, usp.status = "detected", usp.value = exact text printed
   - If NOT printed: usp.found = false, usp.status = "missing", usp.value = "NOT WRITTEN ON PACKET / NOT FOUND"

4. Net Quantity / Weight [Rule 12]:
   - Is net weight/volume/units printed with standard metric units (g, kg, ml, l, pcs)?
   - If written: netQuantity.found = true, netQuantity.status = "detected", netQuantity.value = exact text printed (e.g. "Net Wt: 85 g")
   - If NOT printed: netQuantity.found = false, netQuantity.status = "missing", netQuantity.value = "NOT WRITTEN ON PACKET / NOT FOUND"

5. Manufacturing / Packing Date (MFG / PKD) [Rule 6(1)(d)]:
   - Is month and year of packaging or date printed (e.g. "PKD 04/2026", "MFG: 15/08/2026")?
   - If written: mfgDate.found = true, mfgDate.status = "detected", mfgDate.value = exact text printed
   - If NOT printed: mfgDate.found = false, mfgDate.status = "missing", mfgDate.value = "NOT WRITTEN ON PACKET / NOT FOUND"

6. Expiry Date / Best Before:
   - Is expiry date, use-by date, or best-before duration declared?
   - If written: expiryDate.found = true, expiryDate.status = "detected", expiryDate.value = exact text printed
   - If NOT printed: expiryDate.found = false, expiryDate.status = "missing", expiryDate.value = "NOT WRITTEN ON PACKET / NOT FOUND"

7. Consumer Helpline / Customer Care [Rule 6(1)(f)]:
   - Is telephone helpline or email address declared for consumer grievance redressal?
   - If written: customerCare.found = true, customerCare.status = "detected", customerCare.value = exact text printed
   - If NOT printed: customerCare.found = false, customerCare.status = "missing", customerCare.value = "NOT WRITTEN ON PACKET / NOT FOUND"

8. Manufacturer / Packer Address [Rule 6(1)(a)]:
   - Is the complete name and registered address with PIN code declared?
   - If written: manufacturer.found = true, manufacturer.status = "detected", manufacturer.value = exact text printed
   - If NOT printed: manufacturer.found = false, manufacturer.status = "missing", manufacturer.value = "NOT WRITTEN ON PACKET / NOT FOUND"

9. Country of Origin [Rule 6(10)]:
   - Is country of origin declared (e.g. "Country of Origin: India", "Made in India")?
   - If written: countryOfOrigin.found = true, countryOfOrigin.status = "detected", countryOfOrigin.value = exact text printed
   - If NOT printed: countryOfOrigin.found = false, countryOfOrigin.status = "missing", countryOfOrigin.value = "NOT WRITTEN ON PACKET / NOT FOUND"

10. Label Tampering / Dual Pricing [Rule 18(2)]:
    - Is there any secondary adhesive sticker, overlay, scratch-off, or alteration pasted over the pre-printed MRP?
    - If sticker or alteration present: isTampered = true, tamperingDetails = description.

CRITICAL STATUTORY DETERMINATION:
- Detect all details visibly printed on the packaging.
- If ALL mandatory statutory declarations (MRP, Net Quantity, Mfg/PKD Date, Expiry/Best Before Date, Customer Care, Manufacturer Address, Country of Origin) are genuinely visible, legible, authentic, and untampered:
  * overallStatus MUST BE "Compliant" (Valid Product)!
  * missingDeclarations array MUST BE empty []!
  * statusReason MUST state that all mandatory statutory labels are verified and compliant.
- If 1, 2, or more mandatory declarations are missing or not printed on the packet:
  * overallStatus MUST BE "Non-Compliant" (Invalid Product)!
  * missingDeclarations array MUST list each missing item clearly!
  * statusReason MUST state which 1-2 items are missing.
- If adhesive sticker or price tampering is detected:
  * overallStatus MUST BE "Suspicious" (Label Tampered)!

Respond ONLY with a valid JSON object adhering to this schema:
{
  "productName": string,
  "brand": string,
  "category": string,
  "overallStatus": "Compliant" | "Non-Compliant" | "Suspicious",
  "statusReason": string,
  "mrp": {
    "found": boolean,
    "status": "detected" | "missing" | "tampered",
    "value": string,
    "statutoryRequirement": string
  },
  "usp": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string,
    "statutoryRequirement": string
  },
  "isTampered": boolean,
  "tamperingDetails": string | null,
  "netQuantity": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "mfgDate": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "expiryDate": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "customerCare": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "manufacturer": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "countryOfOrigin": {
    "found": boolean,
    "status": "detected" | "missing",
    "value": string
  },
  "missingDeclarations": string[],
  "violations": string[],
  "inspectorRemarks": string,
  "riskScore": number
}`;

      // Multi-model resilience: handle transient spikes or 503 high demand
      const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      let lastError: any = null;
      let parsed: any = null;
      let usedModel = '';

      for (const modelName of candidateModels) {
        // Try up to 2 attempts per model for transient errors like 503 or 429
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        data: base64Data,
                        mimeType: mimeType,
                      },
                    },
                    {
                      text: prompt,
                    },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });

            const responseText = response.text?.trim() || '{}';
            parsed = JSON.parse(responseText);
            usedModel = modelName;
            break;
          } catch (modelErr: any) {
            lastError = modelErr;
            const errMsg = String(modelErr?.message || '');
            const isTransient =
              errMsg.includes('503') ||
              errMsg.includes('high demand') ||
              errMsg.includes('429') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('RESOURCE_EXHAUSTED');

            if (isTransient && attempt === 0) {
              // Wait 500ms before retrying the same model once
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            // Switch to next fallback model
            break;
          }
        }
        if (parsed) {
          break;
        }
      }

      if (parsed) {
        return res.json({
          success: true,
          source: usedModel,
          analysis: parsed,
        });
      }

      console.warn('Gemini models temporarily at high capacity, switching to local statutory inspection engine:', lastError?.message || lastError);
      return res.json({
        success: false,
        useFallback: true,
        message: 'AI models currently experiencing high demand; local statutory verification engine engaged.',
      });
    } catch (err: any) {
      console.warn('Vision analysis fallback applied:', err?.message || err);
      return res.json({
        success: false,
        useFallback: true,
        error: err.message || 'Vision analysis fallback applied',
      });
    }
  });

  // AI Multimodal Multi-Product Batch Image Inspection Endpoint
  // Detects the number of products given in ONE single image, and checks which product is valid or not
  app.post('/api/analyze-multi-product', async (req, res) => {
    try {
      const { image, fileName } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY not configured',
          useFallback: true,
        });
      }

      let mimeType = 'image/jpeg';
      let base64Data = image;
      const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const multiPrompt = `You are an expert Legal Metrology Inspector conducting batch statutory screening on pre-packaged commodities.
The user has provided ONE image that contains MULTIPLE products (e.g. shelf, counter, table, retail display, or side-by-side commodities).

YOUR OBJECTIVES:
1. DETECT THE EXACT NUMBER OF PRODUCTS given in this single image.
2. For EVERY individual product detected:
   - Provide its bounding box coordinates: ymin, xmin, ymax, xmax (normalized 0 to 1000).
   - Identify: Product Title, Brand, Category.
   - Screen every mandatory statutory label on that product:
     * Maximum Retail Price (MRP)
     * Net Quantity / Weight
     * Date of Packaging / Manufacturing (MFG / PKD)
     * Expiry Date / Best Before
     * Consumer Care Helpline & Email
     * Manufacturer & Packer Address
     * Country of Origin
     * Unit Sale Price (USP)
   - STATUTORY COMPLIANCE CHECK FOR THIS PRODUCT:
     * If ALL labels are detected and present on the product package:
       - "isValid": true
       - "status": "Compliant"
       - "missingItems": []
       - "verdict": "All statutory labels verified and compliant."
     * If 1, 2, or more items are missing or not printed on this product:
       - "isValid": false
       - "status": "Non-Compliant"
       - "missingItems": list the exact 1-2 missing items (e.g. ["Expiry Date", "Unit Sale Price"])
       - "verdict": "Invalid Product: Missing mandatory declarations on package."
     * If sticker overlay or price alteration detected:
       - "isValid": false
       - "status": "Suspicious"
       - "missingItems": ["Adhesive Price Sticker Tampering"]
       - "verdict": "Label Tampered: Secondary sticker over MRP."

Respond strictly with a JSON object conforming to this schema:
{
  "totalProductsDetected": number,
  "validProductsCount": number,
  "invalidProductsCount": number,
  "summary": string,
  "products": [
    {
      "index": number,
      "productName": string,
      "brand": string,
      "category": string,
      "box": {
        "ymin": number,
        "xmin": number,
        "ymax": number,
        "xmax": number
      },
      "status": "Compliant" | "Non-Compliant" | "Suspicious",
      "isValid": boolean,
      "missingItems": string[],
      "verdict": string,
      "declarations": {
        "mrp": { "found": boolean, "value": string, "status": "detected" | "missing" | "tampered" },
        "usp": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "netQuantity": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "mfgDate": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "expiryDate": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "customerCare": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "manufacturer": { "found": boolean, "value": string, "status": "detected" | "missing" },
        "countryOfOrigin": { "found": boolean, "value": string, "status": "detected" | "missing" }
      },
      "riskScore": number
    }
  ]
}`;

      const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      let parsed: any = null;
      let usedModel = '';
      let lastError: any = null;

      for (const modelName of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    { text: multiPrompt },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });

            const responseText = response.text?.trim() || '{}';
            parsed = JSON.parse(responseText);
            usedModel = modelName;
            break;
          } catch (modelErr: any) {
            lastError = modelErr;
            const errMsg = String(modelErr?.message || '');
            const isTransient =
              errMsg.includes('503') ||
              errMsg.includes('high demand') ||
              errMsg.includes('429') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('RESOURCE_EXHAUSTED');

            if (isTransient && attempt === 0) {
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            break;
          }
        }
        if (parsed) break;
      }

      if (parsed) {
        // Enforce math consistency between products array and counts
        if (Array.isArray(parsed.products)) {
          parsed.totalProductsDetected = parsed.products.length;
          parsed.validProductsCount = parsed.products.filter((p: any) => p.isValid === true && p.status === 'Compliant').length;
          parsed.invalidProductsCount = parsed.products.length - parsed.validProductsCount;
        }

        return res.json({
          success: true,
          source: usedModel,
          analysis: parsed,
        });
      }

      return res.json({
        success: false,
        useFallback: true,
        message: 'Multimodal AI temporarily at peak load; local multi-product detection engine active.',
      });
    } catch (err: any) {
      return res.json({
        success: false,
        useFallback: true,
        error: err.message || 'Multi-product inspection fallback applied',
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LABELGUARD Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
