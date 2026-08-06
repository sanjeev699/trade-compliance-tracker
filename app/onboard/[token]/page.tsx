import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { OnboardingPortalForm } from '@/components/onboarding-portal-form'
import { AlertCircle, CheckCircle2, ShieldCheck, Building2 } from 'lucide-react'

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params
  const token = resolvedParams.token
  console.log("Fetching onboarding token:", token)

  const supabase = createSupabaseAdminClient()

  const { data: invite, error: inviteError } = await supabase
    .from('vendor_invites')
    .select('id, vendor_id, status, expires_at, required_docs, organization_id, organizations(name, logo_url)')
    .eq('token', token)
    .maybeSingle()

  if (inviteError || !invite) {
    return <ErrorState message="This onboarding link is invalid or does not exist." />
  }

  if (invite.status === 'USED') {
    return <SuccessState message="You have already completed this onboarding process. Thank you!" />
  }

  if (invite.status === 'EXPIRED' || new Date(invite.expires_at) < new Date()) {
    return <ErrorState message="This onboarding link is no longer active. Please contact your General Contractor." />
  }

  // Fetch Vendor
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('*')
    .eq('vendor_id', invite.vendor_id)
    .single()

  if (vendorError || !vendor) {
    return <ErrorState message="Vendor profile not found." />
  }

  if (vendor.onboarding_status !== 'INVITED') {
    return <SuccessState message="Your onboarding is already underway! Your risk management team has started processing your profile. If additional paperwork is required, you will receive a direct notification." />
  }

  const org = Array.isArray(invite.organizations) ? invite.organizations[0] : invite.organizations;
  const gcName = org?.name || 'Meridian Construction Group'
  const gcLogo = org?.logo_url

  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'Riskopic'
  const productLogo = process.env.NEXT_PUBLIC_PRODUCT_LOGO

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex justify-center">
      <div className="max-w-4xl w-full">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="flex items-center gap-3 mb-2">
            {gcLogo ? (
              <img src={gcLogo} alt={`${gcName} Logo`} className="size-10 object-contain rounded-xl" />
            ) : (
              <div className="size-10 bg-slate-900 text-white flex items-center justify-center rounded-xl shadow-md">
                <Building2 className="size-6" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{gcName}</h1>
          </div>
          <h2 className="text-base font-medium text-slate-600">Subcontractor Onboarding Portal</h2>
          
          <p className="mt-4 text-sm text-slate-500">
            Please complete your profile and upload the required compliance documents.
          </p>
        </div>
        
        <OnboardingPortalForm 
          token={token}
          vendor={vendor as any} 
          requiredDocs={invite.required_docs} 
        />

        <div className="mt-12 mb-8 flex flex-col items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium text-slate-400 mb-1">Powered by</span>
          <div className="flex items-center gap-1.5">
            {productLogo ? (
              <img src={productLogo} alt={`${productName} Logo`} className="size-5 object-contain" />
            ) : (
              <ShieldCheck className="size-5 text-indigo-600" />
            )}
            <span className="text-lg font-bold text-slate-800 tracking-tight">{productName}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border max-w-md w-full text-center">
        <AlertCircle className="size-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  )
}

function SuccessState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border max-w-md w-full text-center">
        <CheckCircle2 className="size-12 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">All Set!</h2>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  )
}
