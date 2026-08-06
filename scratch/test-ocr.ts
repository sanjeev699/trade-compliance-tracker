import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import * as fs from 'fs'

const CoverageSchema = z.object({
  coverage_type: z.string().describe('Coverage type (e.g. WORKERS_COMP, UMBRELLA, GL, AUTO or the literal text from the certificate)'),
  policy_number: z.string().nullable(),
  naic_code: z.string().nullable(),
  limit_amount: z.number().nonnegative().nullable(),
  addl_insr: z.boolean().default(false).describe('Whether Additional Insured is checked for this policy'),
  subr_wvd: z.boolean().default(false).describe('Whether Subrogation Waived is checked for this policy'),
  employers_liability_ea_acc: z.number().nullable().optional().describe('Each Accident limit, if Workers Comp'),
  employers_liability_disease_ea_emp: z.number().nullable().optional().describe('Disease-EA Employee limit, if Workers Comp'),
  employers_liability_disease_policy_limit: z.number().nullable().optional().describe('Disease-Policy Limit, if Workers Comp'),
  effective_date: z.string().nullable().describe('YYYY-MM-DD format when present'),
  expiration_date: z.string().describe('YYYY-MM-DD format'),
})

const DocSchema = z.object({
  is_acord_25: z.boolean().describe('True if this document is structurally an ACORD 25 Certificate of Liability Insurance form.'),
  vendor_name: z.string().describe('The Insured name.'),
  address_street: z.string().nullable(),
  address_zip: z.string().nullable(),
  primary_email: z.string().nullable(),
  description_of_operations: z.string().nullable(),
  coverages: z.array(CoverageSchema),
})

async function run() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const pdfPath = 'C:/Users/Sanju/.gemini/antigravity/brain/ead8f6bf-85a6-430b-b9a7-2e3ff7a25dc8/.user_uploaded/media__1785838309675.pdf'
  const buffer = fs.readFileSync(pdfPath)
  const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`

  console.log("Calling OpenAI...")
  const response = await openai.responses.parse({
    model: 'gpt-4o-mini', // or whatever model
    instructions: 'You extract insurance certificate data. Return only factual values visible in the supplied document. Never invent a policy number, NAIC code, amount, or date.',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Extract the ACORD 25 certificate into the required JSON schema.
Use the INSURED party as vendor_name, never the producer or agency. Extract only
GL, AUTO, WORKERS_COMP, and UMBRELLA coverages. Normalize coverage_type to the
schema enum. STRICT MAPPING REQUIRED: Map any variation of Workers' Compensation (e.g., 'WORKERS_COMPENSATION', 'WORKERS COMP') to 'WORKERS_COMP'. Map any variation of Umbrella or Excess Liability (e.g., 'UMBRELLA_LIABILITY', 'EXCESS_LIABILITY') to 'UMBRELLA'.
limit_amount must be a number in US dollars with no symbols or commas. Read exact numerical values from the LIMITS column. Do NOT sum or aggregate values across separate rows (e.g. do not add D&O limits to Commercial General Liability Each Occurrence, and do not combine policy numbers/limits).
Ensure General Liability limit_amount extracts the 'EACH OCCURRENCE' limit strictly from the top line under COMMERCIAL GENERAL LIABILITY.
Ensure Automobile Liability limit_amount extracts the 'COMBINED SINGLE LIMIT' strictly from the top row under AUTOMOBILE LIABILITY.
Use YYYY-MM-DD dates. Return null, never a guess, for an unreadable policy_number, NAIC code, effective date, or Insured email.
CRITICAL: To find the NAIC code for a coverage, look at the "INSR LTR" column (e.g. A, B, C) on the left side of that coverage's row. Then, match that letter to the "INSURERS AFFORDING COVERAGE" box at the top right to find the corresponding NAIC #. Do not leave the NAIC code null if it can be found this way.
CRITICAL: Extract the exact POLICY NUMBER for each coverage row. Do not truncate it or leave it null if it is visible.`,
          },
          {
            type: 'input_file',
            file_url: dataUrl,
            filename: 'certificate.pdf',
            detail: 'high',
          }
        ],
      },
    ],
    text: { format: zodTextFormat(DocSchema, 'acord_certificate_extraction') },
  })

  console.log("LLM PARSED OUTPUT:")
  console.log(JSON.stringify(response.output_parsed, null, 2))
}

run().catch(console.error)
