import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

const IdentitySchema = z.object({
  vendor_name: z.string().describe('The primary entity, business, or Insured name found in the document. Do not extract the Producer or Agency name.'),
  address_street: z.string().nullable().describe('The primary street address of the entity, without city/state/zip if possible.'),
})

export async function POST(req: Request) {
  try {
    const { fileUrl, originalFilename, mimeType } = await req.json()
    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 })
    }

    const openai = new OpenAI()
    const isPdf = mimeType === 'application/pdf' || originalFilename?.toLowerCase().endsWith('.pdf') || fileUrl.toLowerCase().includes('.pdf')
    
    const fileRes = await fetch(fileUrl)
    if (!fileRes.ok) throw new Error(`Failed to fetch file for OCR: ${fileRes.statusText}`)
    
    const arrayBuffer = await fileRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const actualMime = mimeType || (isPdf ? 'application/pdf' : 'image/jpeg')
    const dataUrl = `data:${actualMime};base64,${buffer.toString('base64')}`

    const response = await openai.responses.parse({
      model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
      instructions: 'You extract business identity details from compliance documents (e.g. W-9, MSA, COI). Return only factual values visible in the supplied document. Do not invent details.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Extract the business identity (Company Name and Street Address) into the required JSON schema.
Use the primary business entity (e.g. the Insured for a COI, the Business Name for a W-9, or the Contractor/Subcontractor for an MSA).
Return null for the address if it cannot be found.`,
            },
            isPdf
              ? {
                  type: 'input_file',
                  file_url: dataUrl,
                  filename: originalFilename ?? 'document.pdf',
                  detail: 'low',
                }
              : { type: 'input_image', image_url: dataUrl, detail: 'low' },
          ],
        },
      ],
      text: { format: zodTextFormat(IdentitySchema, 'identity_extraction') },
    })

    const parsed = response.output_parsed
    if (!parsed) throw new Error('Failed to parse data from OpenAI.')

    return NextResponse.json(parsed)
  } catch (error: any) {
    console.error('Extract Identity Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract identity' },
      { status: 500 }
    )
  }
}
