'use client'


export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 bg-white border-b border-slate-200/80 shadow-sm px-4 md:px-8">
      <div className="flex items-center gap-4">
        <div className="flex items-center shrink-0">
          <div className="flex size-9 items-center justify-center rounded bg-slate-100 text-slate-700 font-bold text-lg shadow-sm border border-slate-200">
            M
          </div>
        </div>
        
        <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true"></div>
        
        <div className="flex flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold leading-none text-foreground md:text-base">
              Meridian Construction Group
            </h1>
          </div>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-2.5 text-xs text-slate-500">
        <span className="leading-none">Powered by</span>
        <img src="/logo.png" className="h-8 w-auto object-contain" alt="Riskopic" />
      </div>
    </header>
  )
}
